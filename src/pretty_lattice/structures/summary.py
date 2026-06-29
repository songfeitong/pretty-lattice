from __future__ import annotations

import math

from pymatgen.core import Structure
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer

from pretty_lattice.structures.schema import StructureSummarySpec, SymmetrySummarySpec
from pretty_lattice.structures.symmetry import point_group_schoenflies_symbol

MAX_SYMMETRY_ANALYSIS_ATOMS = 1000


def build_structure_summary(structure: Structure) -> StructureSummarySpec:
    a, b, c = (float(value) for value in structure.lattice.abc)
    alpha, beta, gamma = (float(value) for value in structure.lattice.angles)

    return {
        "formula": structure.composition.reduced_formula or "-",
        "atomCount": len(structure),
        "cell": {
            "a": _format_length(a),
            "b": _format_length(b),
            "c": _format_length(c),
            "alpha": _format_angle(alpha),
            "beta": _format_angle(beta),
            "gamma": _format_angle(gamma),
        },
        "symmetry": build_symmetry_summary(structure),
    }


def build_symmetry_summary(structure: Structure) -> SymmetrySummarySpec:
    if not has_valid_3d_periodic_cell(structure):
        return _unavailable_symmetry_summary()
    if len(structure) > MAX_SYMMETRY_ANALYSIS_ATOMS:
        return _unavailable_symmetry_summary()

    try:
        analyzer = SpacegroupAnalyzer(structure, symprec=1e-5)
        number = int(analyzer.get_space_group_number())
        space_group = analyzer.get_space_group_symbol()
        point_group = analyzer.get_point_group_symbol()
        crystal_system = analyzer.get_crystal_system()
        lattice_system = analyzer.get_lattice_type()
    except Exception:
        return _unavailable_symmetry_summary()

    if not space_group:
        return _unavailable_symmetry_summary()

    return {
        "available": True,
        "spaceGroup": space_group,
        "spaceGroupNumber": number,
        "pointGroup": point_group or None,
        "pointGroupSchoenflies": point_group_schoenflies_symbol(point_group),
        "crystalSystem": crystal_system,
        "latticeSystem": lattice_system,
    }


def has_valid_3d_periodic_cell(structure: Structure) -> bool:
    return _has_valid_3d_cell(structure) and all(bool(periodic) for periodic in structure.pbc)


def _has_valid_3d_cell(structure: Structure) -> bool:
    return (
        len(structure) > 0
        and math.isfinite(float(structure.lattice.volume))
        and not math.isclose(float(structure.lattice.volume), 0.0, abs_tol=1e-12)
    )


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
