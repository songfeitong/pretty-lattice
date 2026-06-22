from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any, TypedDict

import spglib
from ase import Atoms

from pretty_lattice.structures.colormaps import Colormap, load_colormap
from pretty_lattice.structures.elements import ElementRegistry, load_element_registry


class CellSpec(TypedDict):
    vectors: list[list[float]]


class CellSummarySpec(TypedDict):
    a: str
    b: str
    c: str
    alpha: str
    beta: str
    gamma: str


class SymmetrySummarySpec(TypedDict):
    available: bool
    spaceGroup: str | None
    spaceGroupNumber: int | None
    pointGroup: str | None
    pointGroupSchoenflies: str | None
    crystalSystem: str | None
    latticeSystem: str | None


class StructureSummarySpec(TypedDict):
    formula: str
    atomCount: int
    cell: CellSummarySpec
    symmetry: SymmetrySummarySpec


class AtomSpec(TypedDict):
    id: str
    element: str
    position: list[float]
    radius: float
    color: str


class SceneSpec(TypedDict):
    cell: CellSpec
    atoms: list[AtomSpec]
    summary: StructureSummarySpec


def build_scene_response(
    atoms: Atoms,
    *,
    element_registry: ElementRegistry | None = None,
    colormap: Colormap | None = None,
) -> SceneSpec:
    elements = element_registry or load_element_registry()
    colors = colormap or load_colormap()

    scene_atoms: list[AtomSpec] = []
    for index, (symbol, position) in enumerate(
        zip(atoms.get_chemical_symbols(), atoms.positions, strict=True)
    ):
        element = elements.resolve(symbol)
        scene_atoms.append(
            {
                "id": f"{element.symbol}-{index}",
                "element": element.symbol,
                "position": _vector3(position),
                "radius": element.atomic_radius,
                "color": colors.resolve(element.symbol),
            }
        )

    return {
        "cell": {"vectors": [_vector3(vector) for vector in atoms.cell.array]},
        "atoms": scene_atoms,
        "summary": _build_structure_summary(atoms),
    }


def _vector3(values: Sequence[float]) -> list[float]:
    return [float(values[0]), float(values[1]), float(values[2])]


def _build_structure_summary(atoms: Atoms) -> StructureSummarySpec:
    a, b, c, alpha, beta, gamma = (float(value) for value in atoms.cell.cellpar())

    return {
        "formula": atoms.get_chemical_formula(mode="metal", empirical=True) or "-",
        "atomCount": len(atoms),
        "cell": {
            "a": _format_length(a),
            "b": _format_length(b),
            "c": _format_length(c),
            "alpha": _format_angle(alpha),
            "beta": _format_angle(beta),
            "gamma": _format_angle(gamma),
        },
        "symmetry": _build_symmetry_summary(atoms),
    }


def _build_symmetry_summary(atoms: Atoms) -> SymmetrySummarySpec:
    if not _has_valid_3d_periodic_cell(atoms):
        return _unavailable_symmetry_summary()

    try:
        dataset = spglib.get_symmetry_dataset(
            (atoms.cell.array, atoms.get_scaled_positions(wrap=True), atoms.numbers),
            symprec=1e-5,
            _throw=True,
        )
    except Exception:
        return _unavailable_symmetry_summary()

    if dataset is None:
        return _unavailable_symmetry_summary()

    number = _symmetry_dataset_value(dataset, "number")
    hall_number = _symmetry_dataset_value(dataset, "hall_number")
    space_group = _symmetry_dataset_value(dataset, "international")
    point_group = _symmetry_dataset_value(dataset, "pointgroup")

    if not isinstance(number, int) or not isinstance(space_group, str) or not space_group:
        return _unavailable_symmetry_summary()

    crystal_system = _crystal_system_from_space_group_number(number)
    if crystal_system is None:
        return _unavailable_symmetry_summary()

    return {
        "available": True,
        "spaceGroup": space_group,
        "spaceGroupNumber": number,
        "pointGroup": point_group if isinstance(point_group, str) and point_group else None,
        "pointGroupSchoenflies": _point_group_schoenflies_from_hall_number(hall_number),
        "crystalSystem": crystal_system,
        "latticeSystem": _lattice_system_from_space_group_number(number),
    }


def _has_valid_3d_periodic_cell(atoms: Atoms) -> bool:
    return (
        len(atoms) > 0
        and all(bool(periodic) for periodic in atoms.pbc)
        and atoms.cell.rank == 3
        and math.isfinite(float(atoms.cell.volume))
        and not math.isclose(float(atoms.cell.volume), 0.0, abs_tol=1e-12)
    )


def _symmetry_dataset_value(dataset: Any, key: str) -> Any:
    value = getattr(dataset, key, None)
    if value is not None:
        return value
    if isinstance(dataset, dict):
        return dataset.get(key)
    return None


def _point_group_schoenflies_from_hall_number(hall_number: Any) -> str | None:
    if not isinstance(hall_number, int):
        return None

    try:
        spacegroup_type = spglib.get_spacegroup_type(hall_number)
    except Exception:
        return None

    value = _symmetry_dataset_value(spacegroup_type, "pointgroup_schoenflies")
    if isinstance(value, str) and value:
        return value
    return None


def _crystal_system_from_space_group_number(number: int) -> str | None:
    if 1 <= number <= 2:
        return "triclinic"
    if 3 <= number <= 15:
        return "monoclinic"
    if 16 <= number <= 74:
        return "orthorhombic"
    if 75 <= number <= 142:
        return "tetragonal"
    if 143 <= number <= 167:
        return "trigonal"
    if 168 <= number <= 194:
        return "hexagonal"
    if 195 <= number <= 230:
        return "cubic"
    return None


def _lattice_system_from_space_group_number(number: int) -> str:
    if number in {146, 148, 155, 160, 161, 166, 167}:
        return "rhombohedral"
    if 143 <= number <= 167:
        return "hexagonal"
    crystal_system = _crystal_system_from_space_group_number(number)
    return crystal_system or "unknown"


def _unavailable_symmetry_summary() -> SymmetrySummarySpec:
    return {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }


def _format_length(value: float) -> str:
    return _format_number(value, precision=2)


def _format_angle(value: float) -> str:
    return _format_number(value, precision=1)


def _format_number(value: float, *, precision: int) -> str:
    if not math.isfinite(value):
        return "-"
    return f"{value:.{precision}f}"
