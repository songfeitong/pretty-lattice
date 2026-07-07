from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory

from pymatgen.core import Structure

from pretty_lattice.structures.warning_policy import suppress_third_party_structure_warnings


class StructureReadError(ValueError):
    """Raised when a structure file cannot be parsed for preview."""


def read_structure(path: str | Path) -> Structure:
    """Read a periodic crystal structure with pymatgen."""
    structure_path = Path(path)
    try:
        with suppress_third_party_structure_warnings():
            structure = Structure.from_file(structure_path)
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
            with suppress_third_party_structure_warnings():
                structure = Structure.from_file(structure_path)
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
