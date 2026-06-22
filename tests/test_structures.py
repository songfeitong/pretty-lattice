from pathlib import Path

import pytest

from pretty_lattice.structures.colormaps import load_colormap
from pretty_lattice.structures.elements import load_element_registry
from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene import build_scene_response

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "structures"


def test_read_cif_fixture() -> None:
    atoms = read_structure(FIXTURE_DIR / "trigonal_rhombohedral_al2o3.cif")

    assert len(atoms) == 5
    assert atoms.get_chemical_symbols() == ["Al", "Al", "O", "O", "O"]


def test_read_poscar_fixture_from_bytes() -> None:
    payload = (FIXTURE_DIR / "binary_nacl.poscar").read_bytes()

    atoms = read_structure_bytes(payload, filename="binary_nacl.poscar")

    assert len(atoms) == 2
    assert atoms.get_chemical_symbols() == ["Na", "Cl"]


def test_read_non_whitelisted_ase_format_from_bytes() -> None:
    atoms = read_structure_bytes(
        b"2\nwater\nH 0 0 0\nO 0 0 1\n",
        filename="water.xyz",
    )

    assert len(atoms) == 2
    assert atoms.get_chemical_symbols() == ["H", "O"]


def test_invalid_structure_bytes_raise_project_error() -> None:
    with pytest.raises(StructureReadError, match="Could not parse invalid.cif"):
        read_structure_bytes(b"not a structure", filename="invalid.cif")


def test_element_radius_and_colormap_resolution() -> None:
    element_registry = load_element_registry()
    colormap = load_colormap()

    oxygen = element_registry.resolve("O")

    assert oxygen.atomic_radius == pytest.approx(0.74)
    assert oxygen.vdw_radius == pytest.approx(1.52)
    assert colormap.resolve("O") == "#ff0300"


def test_scene_response_shape_uses_radius_and_color_defaults() -> None:
    atoms = read_structure(FIXTURE_DIR / "binary_nacl.poscar")

    scene = build_scene_response(atoms)

    assert scene["cell"]["vectors"][0] == [5.64, 0.0, 0.0]
    assert scene["atoms"][0] == {
        "id": "Na-0",
        "element": "Na",
        "position": [0.0, 0.0, 0.0],
        "radius": pytest.approx(1.91),
        "color": "#fadd3d",
    }
    assert scene["atoms"][1]["element"] == "Cl"
    assert scene["summary"] == {
        "formula": "NaCl",
        "atomCount": 2,
        "cell": {
            "a": "5.64",
            "b": "5.64",
            "c": "5.64",
            "alpha": "90.0",
            "beta": "90.0",
            "gamma": "90.0",
        },
        "symmetry": {
            "available": True,
            "spaceGroup": "Pm-3m",
            "spaceGroupNumber": 221,
            "pointGroup": "m-3m",
            "pointGroupSchoenflies": "Oh",
            "crystalSystem": "cubic",
            "latticeSystem": "cubic",
        },
    }
    assert scene.keys() == {"cell", "atoms", "summary"}


def test_scene_summary_marks_non_periodic_symmetry_unavailable() -> None:
    atoms = read_structure_bytes(
        b"2\nwater\nH 0 0 0\nO 0 0 1\n",
        filename="water.xyz",
    )

    scene = build_scene_response(atoms)

    assert scene["summary"]["symmetry"] == {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }
