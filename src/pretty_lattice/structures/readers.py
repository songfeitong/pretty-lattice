from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

from pymatgen.core import Lattice, Structure
from pymatgen.core.units import bohr_to_angstrom


class StructureReadError(ValueError):
    """Raised when a structure file cannot be parsed for preview."""


def read_structure(path: str | Path) -> Structure:
    """Read a periodic crystal structure with pymatgen."""
    structure_path = Path(path)
    try:
        structure = _read_abacus_stru_bytes(structure_path.read_bytes()) or Structure.from_file(
            structure_path
        )
    except Exception as exc:
        raise StructureReadError(
            f"Could not parse structure file {structure_path.name}: {exc}"
        ) from exc

    return _ensure_structure(structure, structure_path.name)


def read_structure_bytes(payload: bytes, filename: str | None = None) -> Structure:
    if not payload:
        raise StructureReadError("Uploaded structure file is empty.")

    display_name = filename or "uploaded structure"
    safe_name = _safe_upload_name(display_name)
    try:
        with TemporaryDirectory(prefix="pretty-lattice-structure-") as temp_dir:
            structure_path = Path(temp_dir) / safe_name
            structure_path.write_bytes(payload)
            structure = _read_abacus_stru_bytes(payload) or Structure.from_file(structure_path)
    except Exception as exc:
        raise StructureReadError(f"Could not parse {display_name}: {exc}") from exc

    return _ensure_structure(structure, display_name)


def _safe_upload_name(filename: str) -> str:
    name = Path(filename).name.replace("\\", "_").replace("@", "_")
    if name in {"", ".", ".."}:
        return "uploaded-structure"
    return name


def _ensure_structure(structure: Structure, display_name: str) -> Structure:
    if not isinstance(structure, Structure):
        raise StructureReadError(f"Parsed {display_name}, but did not get a pymatgen Structure.")
    if len(structure) == 0:
        raise StructureReadError(f"Parsed {display_name}, but it contains no atoms.")
    return structure


def _read_abacus_stru_bytes(payload: bytes) -> Structure | None:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return _read_abacus_stru_text(text)


def _read_abacus_stru_text(text: str) -> Structure | None:
    lines = [_strip_abacus_comment(line).strip() for line in text.splitlines()]
    nonempty_lines = [line for line in lines if line]
    keyword_indices = _abacus_keyword_indices(nonempty_lines)
    required_keywords = {"ATOMIC_SPECIES", "LATTICE_VECTORS", "ATOMIC_POSITIONS"}
    if not required_keywords.issubset(keyword_indices):
        return None

    lattice_constant = _abacus_lattice_constant(nonempty_lines, keyword_indices) * bohr_to_angstrom
    lattice_vectors = _abacus_lattice_vectors(nonempty_lines, keyword_indices, lattice_constant)
    coordinate_mode, species, coordinates = _abacus_atomic_positions(
        nonempty_lines,
        keyword_indices,
        lattice_constant,
    )

    return Structure(
        Lattice(lattice_vectors),
        species,
        coordinates,
        coords_are_cartesian=coordinate_mode in {"cartesian", "cartesian_bohr"},
    )


_ABACUS_SECTION_KEYWORDS = {
    "ATOMIC_SPECIES",
    "NUMERICAL_ORBITAL",
    "LATTICE_CONSTANT",
    "LATTICE_VECTORS",
    "ATOMIC_POSITIONS",
}


def _strip_abacus_comment(line: str) -> str:
    for marker in ("#", "//"):
        line = line.split(marker, 1)[0]
    return line


def _abacus_keyword_indices(lines: list[str]) -> dict[str, int]:
    keyword_indices: dict[str, int] = {}
    for index, line in enumerate(lines):
        keyword = line.split()[0].upper()
        if keyword in _ABACUS_SECTION_KEYWORDS:
            keyword_indices[keyword] = index
    return keyword_indices


def _abacus_section_end(keyword: str, lines: list[str], keyword_indices: dict[str, int]) -> int:
    start_index = keyword_indices[keyword]
    following_indices = [
        index
        for section_keyword, index in keyword_indices.items()
        if section_keyword != keyword and index > start_index
    ]
    return min(following_indices, default=len(lines))


def _abacus_lattice_constant(lines: list[str], keyword_indices: dict[str, int]) -> float:
    if "LATTICE_CONSTANT" not in keyword_indices:
        return 1.0
    value_index = keyword_indices["LATTICE_CONSTANT"] + 1
    if value_index >= len(lines):
        raise ValueError("ABACUS STRU LATTICE_CONSTANT is missing a value.")
    return float(lines[value_index].split()[0])


def _abacus_lattice_vectors(
    lines: list[str],
    keyword_indices: dict[str, int],
    lattice_constant: float,
) -> list[list[float]]:
    start_index = keyword_indices["LATTICE_VECTORS"] + 1
    vector_lines = lines[start_index : start_index + 3]
    if len(vector_lines) != 3:
        raise ValueError("ABACUS STRU LATTICE_VECTORS must contain three vectors.")

    vectors: list[list[float]] = []
    for line in vector_lines:
        values = [float(value) for value in line.split()[:3]]
        if len(values) != 3:
            raise ValueError("ABACUS STRU lattice vector must contain three numbers.")
        vectors.append([value * lattice_constant for value in values])
    return vectors


def _abacus_atomic_positions(
    lines: list[str],
    keyword_indices: dict[str, int],
    lattice_constant: float,
) -> tuple[str, list[str], list[list[float]]]:
    start_index = keyword_indices["ATOMIC_POSITIONS"] + 1
    end_index = _abacus_section_end("ATOMIC_POSITIONS", lines, keyword_indices)
    if start_index >= end_index:
        raise ValueError("ABACUS STRU ATOMIC_POSITIONS is missing a coordinate type.")

    coordinate_mode = _normalize_abacus_coordinate_mode(lines[start_index])
    species: list[str] = []
    coordinates: list[list[float]] = []
    index = start_index + 1
    while index < end_index:
        element = lines[index].split()[0]
        index += 1
        if index + 1 >= end_index:
            raise ValueError(f"ABACUS STRU element block {element} is incomplete.")

        index += 1  # Skip element magnetization line.
        atom_count = int(float(lines[index].split()[0]))
        index += 1
        for _ in range(atom_count):
            if index >= end_index:
                raise ValueError(f"ABACUS STRU element block {element} has too few atoms.")
            position = [float(value) for value in lines[index].split()[:3]]
            if len(position) != 3:
                raise ValueError(f"ABACUS STRU atom position for {element} is incomplete.")
            if coordinate_mode == "cartesian_bohr":
                position = [value * lattice_constant for value in position]
            species.append(element)
            coordinates.append(position)
            index += 1

    if not species:
        raise ValueError("ABACUS STRU ATOMIC_POSITIONS contains no atoms.")
    return coordinate_mode, species, coordinates


def _normalize_abacus_coordinate_mode(value: str) -> str:
    mode = value.split()[0].lower()
    if mode in {"direct", "crystal", "fractional"}:
        return "direct"
    if mode in {"cartesian", "cartesian_angstrom", "angstrom"}:
        return "cartesian"
    if mode in {"cartesian_au", "bohr"}:
        return "cartesian_bohr"
    raise ValueError(f"Unsupported ABACUS STRU coordinate mode: {value}")
