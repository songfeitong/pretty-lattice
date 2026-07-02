import ast
import tomllib
from math import dist
from pathlib import Path

import pytest
from pymatgen.core import Lattice, Structure

import pretty_lattice.structures.connectivity as connectivity_module
import pretty_lattice.structures.polyhedra as polyhedra_module
import pretty_lattice.structures.summary as summary_module
from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene import (
    build_scene_response,
)
from pretty_lattice.structures.schema import (
    STRUCTURE_ATOM_COUNT_THRESHOLD,
    UnsupportedBondAlgorithmError,
)
from pretty_lattice.structures.symmetry import (
    POINT_GROUP_SCHOENFLIES,
    point_group_schoenflies_symbol,
)

PROJECT_ROOT = Path(__file__).parents[1]
FIXTURE_DIR = Path(__file__).parent / "fixtures" / "structures"
BACKEND_STRUCTURE_MODULES = sorted(
    (PROJECT_ROOT / "src" / "pretty_lattice" / "structures").glob("*.py")
)

CIF_FIXTURES = [
    ("Al2O3.cif", 30, {"Al", "O"}, "Al2O3", 167, "trigonal", "D3d"),
    (
        "Ba2Ca2Cu3HgO8.cif",
        16,
        {"Ba", "Ca", "Cu", "Hg", "O"},
        "Ba2Ca2Cu3HgO8",
        123,
        "tetragonal",
        "D4h",
    ),
    ("Hg3Cl4O.cif", 32, {"Hg", "Cl", "O"}, "Hg3Cl4O", 198, "cubic", "T"),
    ("LiFePO4.cif", 28, {"Li", "Fe", "P", "O"}, "LiFePO4", 62, "orthorhombic", "D2h"),
    ("MoS2.cif", 6, {"Mo", "S"}, "MoS2", 194, "hexagonal", "D6h"),
    ("NaCl.cif", 8, {"Na", "Cl"}, "NaCl", 225, "cubic", "Oh"),
    ("Si.cif", 8, {"Si"}, "Si", 227, "cubic", "Oh"),
    ("Sm(Mo3S4)2.cif", 45, {"Sm", "Mo", "S"}, "Sm(Mo3S4)2", 148, "trigonal", "C3i"),
    ("SrTiO3.cif", 5, {"Sr", "Ti", "O"}, "SrTiO3", 221, "cubic", "Oh"),
    ("TiO2.cif", 6, {"Ti", "O"}, "TiO2", 136, "tetragonal", "D4h"),
]

ABACUS_STRU_FIXTURE = """ATOMIC_SPECIES
Bi  208.980  Bi_ONCV_PBE-1.0.upf
Sb  121.760  Sb_ONCV_PBE-1.0.upf
Te  127.603  Te_ONCV_PBE-1.0.upf

NUMERICAL_ORBITAL
Bi_gga_7au_100Ry_2s2p2d1f.orb
Sb_gga_7au_100Ry_2s2p2d1f.orb
Te_gga_7au_100Ry_2s2p2d1f.orb

LATTICE_CONSTANT
1.889726

LATTICE_VECTORS
3.789814801346  -2.18787053891  0.000000000000
3.789814801346  2.187870538915  0.000000000000
-0.01407170391  0.000000000000  21.35281801402

ATOMIC_POSITIONS
Direct

Bi
0.000
2
0.636368774126  0.636368774126  0.606777619761  1  1  1  mag  0.0
0.304071477621  0.304071477621  0.106685191760  1  1  1  mag  0.0

Sb
0.000
2
0.971158049397  0.971158049397  0.296486368704  1  1  1  mag  0.0
0.970279058894  0.970279058894  0.796578538168  1  1  1  mag  0.0

Te
0.000
6
0.637637822126  0.637637822126  0.204628906668  1  1  1  mag  0.0
0.303460363630  0.303460363630  0.704724802478  1  1  1  mag  0.0
0.304623701217  0.304623701217  0.375032917975  1  1  1  mag  0.0
0.970613056701  0.970613056701  0.024481601751  1  1  1  mag  0.0
0.637180500556  0.637180500557  0.875125927137  1  1  1  mag  0.0
0.969618934887  0.969618934887  0.524576885598  1  1  1  mag  0.0
"""


@pytest.mark.parametrize(
    (
        "filename",
        "atom_count",
        "elements",
        "formula",
        "space_group_number",
        "crystal_system",
        "point_group_schoenflies",
    ),
    CIF_FIXTURES,
)
def test_read_cif_fixtures(
    filename: str,
    atom_count: int,
    elements: set[str],
    formula: str,
    space_group_number: int,
    crystal_system: str,
    point_group_schoenflies: str,
) -> None:
    structure = read_structure(FIXTURE_DIR / filename)
    scene = build_scene_response(structure)

    assert isinstance(structure, Structure)
    assert len(structure) == atom_count
    assert {element.symbol for element in structure.composition.elements} == elements
    assert scene["summary"]["formula"] == formula
    assert scene["summary"]["atomCount"] == atom_count
    assert scene["summary"]["symmetry"]["spaceGroupNumber"] == space_group_number
    assert scene["summary"]["symmetry"]["crystalSystem"] == crystal_system
    assert scene["summary"]["symmetry"]["pointGroupSchoenflies"] == point_group_schoenflies


def test_read_cif_fixture_from_bytes() -> None:
    payload = (FIXTURE_DIR / "NaCl.cif").read_bytes()

    structure = read_structure_bytes(payload, filename="NaCl.cif")

    assert isinstance(structure, Structure)
    assert len(structure) == 8
    assert {element.symbol for element in structure.composition.elements} == {"Na", "Cl"}


def test_read_poscar_named_bytes_uses_pymatgen_filename_detection() -> None:
    payload = b"""NaCl
1.0
5.64 0 0
0 5.64 0
0 0 5.64
Na Cl
1 1
Direct
0 0 0
0.5 0.5 0.5
"""

    structure = read_structure_bytes(payload, filename="POSCAR")

    assert len(structure) == 2
    assert structure.composition.reduced_formula == "NaCl"


def test_read_abacus_stru_from_path_and_bytes(tmp_path: Path) -> None:
    payload = ABACUS_STRU_FIXTURE.encode()
    structure_path = tmp_path / "STRU"
    structure_path.write_bytes(payload)

    structure = read_structure(structure_path)
    uploaded_structure = read_structure_bytes(payload, filename="STRU")

    assert len(structure) == 10
    assert len(uploaded_structure) == 10
    assert structure.composition.reduced_formula == "BiSbTe3"
    assert {element.symbol for element in structure.composition.elements} == {"Bi", "Sb", "Te"}
    assert structure.lattice.a == pytest.approx(4.376, abs=0.002)
    assert structure.frac_coords[0].tolist() == pytest.approx([
        0.636368774126,
        0.636368774126,
        0.606777619761,
    ])


def test_invalid_structure_bytes_raise_project_error() -> None:
    with pytest.raises(StructureReadError, match="Could not parse invalid.cif"):
        read_structure_bytes(b"not a structure", filename="invalid.cif")


def test_project_runtime_dependencies_are_pymatgen_core_level() -> None:
    dependencies = tomllib.loads((PROJECT_ROOT / "pyproject.toml").read_text())["project"][
        "dependencies"
    ]
    dependency_names = {_dependency_name(dependency) for dependency in dependencies}

    assert "pymatgen-core" in dependency_names
    assert "pymatgen" not in dependency_names
    assert "ase" not in dependency_names
    assert "spglib" not in dependency_names


@pytest.mark.parametrize("module_path", BACKEND_STRUCTURE_MODULES)
def test_backend_structure_modules_avoid_direct_ase_and_spglib_imports(
    module_path: Path,
) -> None:
    imported_roots = _imported_roots(module_path.read_text())

    assert "ase" not in imported_roots
    assert "spglib" not in imported_roots


def test_point_group_schoenflies_mapping_covers_crystallographic_point_groups() -> None:
    assert len(POINT_GROUP_SCHOENFLIES) == 32
    assert point_group_schoenflies_symbol("m-3m") == "Oh"
    assert point_group_schoenflies_symbol("-3m") == "D3d"
    assert point_group_schoenflies_symbol("-42m") == "D2d"
    assert point_group_schoenflies_symbol("-6m2") == "D3h"
    assert point_group_schoenflies_symbol(None) is None
    assert point_group_schoenflies_symbol("not-a-point-group") is None


def test_scene_response_shape_excludes_renderer_visual_data() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    scene = build_scene_response(structure)
    canonical_atoms = [atom for atom in scene["atoms"] if not atom["isPeriodicImage"]]
    periodic_image_atoms = [atom for atom in scene["atoms"] if atom["isPeriodicImage"]]
    boundary_image_atoms = [atom for atom in scene["atoms"] if "boundary" in atom["imageReasons"]]
    bonded_image_atoms = [atom for atom in scene["atoms"] if "bonded" in atom["imageReasons"]]

    assert scene["cell"]["vectors"][0] == [3.91270131, 0.0, 0.0]
    assert canonical_atoms[0] == {
        "id": "Sr-0",
        "siteId": "Sr-0",
        "siteIndex": 0,
        "element": "Sr",
        "position": [0.0, 0.0, 0.0],
        "fractionalPosition": [0.0, 0.0, 0.0],
        "imageOffset": [0, 0, 0],
        "isPeriodicImage": False,
        "imageReasons": [],
        "visibilityDependencies": [],
        "visibilityDependencyGroups": [],
    }
    assert "color" not in canonical_atoms[0]
    assert "radius" not in canonical_atoms[0]
    assert "radii" not in canonical_atoms[0]
    assert [atom["element"] for atom in canonical_atoms] == [
        "Sr",
        "Ti",
        "O",
        "O",
        "O",
    ]
    assert len(periodic_image_atoms) > 10
    assert len(boundary_image_atoms) == 10
    assert len(bonded_image_atoms) > 0
    assert scene["bonds"]
    assert scene["polyhedra"]
    assert 0 <= scene["bonds"][0]["startAtomIndex"] < len(scene["atoms"])
    assert 0 <= scene["bonds"][0]["endAtomIndex"] < len(scene["atoms"])
    assert scene["summary"] == {
        "formula": "SrTiO3",
        "atomCount": 5,
        "cell": {
            "a": "3.91",
            "b": "3.91",
            "c": "3.91",
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
    assert scene.keys() == {"cell", "atoms", "bonds", "polyhedra", "summary"}


@pytest.mark.parametrize(
    ("fractional_position", "expected_offsets"),
    [
        ([0.0, 0.5, 0.5], {(0, 0, 0), (1, 0, 0)}),
        ([0.0, 0.0, 0.5], {(0, 0, 0), (1, 0, 0), (0, 1, 0), (1, 1, 0)}),
        (
            [0.0, 0.0, 0.0],
            {
                (0, 0, 0),
                (0, 0, 1),
                (0, 1, 0),
                (0, 1, 1),
                (1, 0, 0),
                (1, 0, 1),
                (1, 1, 0),
                (1, 1, 1),
            },
        ),
    ],
)
def test_periodic_boundary_images_close_faces_edges_and_corners(
    fractional_position: list[float],
    expected_offsets: set[tuple[int, int, int]],
) -> None:
    structure = _structure_from_fractional_positions(["C"], [fractional_position])

    scene = build_scene_response(structure)
    boundary_atoms = [atom for atom in scene["atoms"] if "boundary" in atom["imageReasons"]]

    assert {tuple(atom["imageOffset"]) for atom in boundary_atoms} == (
        expected_offsets - {(0, 0, 0)}
    )
    assert {atom["siteId"] for atom in boundary_atoms} <= {"C-0"}
    assert len(boundary_atoms) == len(expected_offsets) - 1
    assert scene["summary"]["atomCount"] == 1


def test_near_upper_boundary_canonicalizes_to_half_open_cell() -> None:
    structure = _structure_from_fractional_positions(["C"], [[1.0 - 1e-8, 0.5, 0.5]])

    scene = build_scene_response(structure)

    canonical_atom = next(atom for atom in scene["atoms"] if not atom["isPeriodicImage"])
    image_atom = next(atom for atom in scene["atoms"] if atom["isPeriodicImage"])

    assert canonical_atom["fractionalPosition"] == [0.0, 0.5, 0.5]
    assert canonical_atom["position"] == [0.0, 0.5, 0.5]
    assert image_atom["imageOffset"] == [1, 0, 0]
    assert image_atom["fractionalPosition"] == [1.0, 0.5, 0.5]
    assert image_atom["position"] == [1.0, 0.5, 0.5]
    assert "boundary" in image_atom["imageReasons"]
    assert "boundaryAtoms" in image_atom["visibilityDependencies"]


def test_non_periodic_structure_keeps_only_canonical_atom_instances() -> None:
    structure = _structure_from_fractional_positions(
        ["C"],
        [[0.25, 0.25, 0.25]],
        pbc=False,
    )

    scene = build_scene_response(structure)

    assert len(scene["atoms"]) == 1
    assert scene["atoms"][0]["siteId"] == "C-0"
    assert scene["atoms"][0]["imageOffset"] == [0, 0, 0]
    assert scene["atoms"][0]["isPeriodicImage"] is False
    assert scene["atoms"][0]["imageReasons"] == []
    assert scene["atoms"][0]["visibilityDependencies"] == []
    assert scene["atoms"][0]["visibilityDependencyGroups"] == []
    assert scene["bonds"] == []
    assert scene["summary"]["atomCount"] == 1


def test_scene_response_supports_selected_bond_algorithms() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    default_scene = build_scene_response(structure)
    crystal_scene = build_scene_response(structure, bond_algorithm="crystal-nn")
    minimum_distance_scene = build_scene_response(structure, bond_algorithm="minimum-distance")
    cutoff_dict_scene = build_scene_response(structure, bond_algorithm="cut-off-dict")

    assert default_scene["bonds"]
    assert crystal_scene["bonds"]
    assert minimum_distance_scene["bonds"]
    assert cutoff_dict_scene["bonds"]
    assert default_scene["bonds"] == crystal_scene["bonds"]
    assert "warnings" not in default_scene
    assert "warnings" not in crystal_scene
    assert "warnings" not in minimum_distance_scene
    assert "warnings" not in cutoff_dict_scene


@pytest.mark.parametrize(
    ("atom_count", "expected_algorithm"),
    [
        (5, "crystal-nn"),
        (STRUCTURE_ATOM_COUNT_THRESHOLD - 1, "crystal-nn"),
        (STRUCTURE_ATOM_COUNT_THRESHOLD, "cut-off-dict"),
    ],
)
def test_scene_response_defaults_bonding_by_structure_size(
    monkeypatch: pytest.MonkeyPatch,
    atom_count: int,
    expected_algorithm: str,
) -> None:
    captured_algorithms: list[str] = []

    def capture_connectivity(**kwargs: object) -> connectivity_module.ConnectivityResult:
        captured_algorithms.append(str(kwargs["bond_algorithm"]))
        return connectivity_module.ConnectivityResult(bonds=[], connections_by_source={})

    monkeypatch.setattr(connectivity_module, "build_connectivity", capture_connectivity)
    structure = _structure_from_fractional_positions(
        ["C"] * atom_count,
        [[index / atom_count, 0.25, 0.25] for index in range(atom_count)],
    )

    build_scene_response(structure)

    assert captured_algorithms == [expected_algorithm]


def test_cutoff_dict_bonding_uses_batched_neighbor_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")
    captured_atom_counts: list[int] = []
    original_get_all_nn_info = connectivity_module._PresetCutOffDictNN.get_all_nn_info

    def capture_get_all_nn_info(
        self: connectivity_module._PresetCutOffDictNN,
        structure_arg: Structure,
    ) -> list[list[dict[str, object]]]:
        captured_atom_counts.append(len(structure_arg))
        return original_get_all_nn_info(self, structure_arg)

    def fail_get_nn_info(*_args: object, **_kwargs: object) -> None:
        pytest.fail("CutOffDictNN connectivity should use the batched neighbor table.")

    monkeypatch.setattr(
        connectivity_module._PresetCutOffDictNN,
        "get_all_nn_info",
        capture_get_all_nn_info,
    )
    monkeypatch.setattr(connectivity_module._PresetCutOffDictNN, "get_nn_info", fail_get_nn_info)

    scene = build_scene_response(structure, bond_algorithm="cut-off-dict")

    assert captured_atom_counts == [len(structure)]
    assert scene["bonds"]


def test_cutoff_dict_bonding_keeps_boundary_bonds_local_after_canonicalizing_sites() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif") * (2, 2, 2)

    scene = build_scene_response(structure, bond_algorithm="cut-off-dict")
    atoms = scene["atoms"]
    bond_lengths = [
        dist(
            atoms[bond["startAtomIndex"]]["position"],
            atoms[bond["endAtomIndex"]]["position"],
        )
        for bond in scene["bonds"]
    ]

    assert bond_lengths
    assert max(bond_lengths) == pytest.approx(2.76669762905849)
    assert all(length < 3.0 for length in bond_lengths)


def test_scene_response_generates_polyhedra_for_complete_coordination_environment() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    scene = build_scene_response(structure)
    atoms = scene["atoms"]
    ti_polyhedron = next(
        polyhedron
        for polyhedron in scene["polyhedra"]
        if atoms[polyhedron["centerAtomIndex"]]["id"] == "Ti-1"
    )

    assert atoms[ti_polyhedron["hullAtomIndices"][0]]["id"] == "Ti-1"
    assert len(ti_polyhedron["hullAtomIndices"]) == 7
    assert len(ti_polyhedron["faces"]) == 8
    assert "color" not in ti_polyhedron
    assert set(ti_polyhedron["hullAtomIndices"]).issubset(range(len(atoms)))
    assert all(len(face) == 3 for face in ti_polyhedron["faces"])
    assert all(
        0 <= vertex_index < len(ti_polyhedron["hullAtomIndices"])
        for face in ti_polyhedron["faces"]
        for vertex_index in face
    )


def test_polyhedron_faces_have_stable_coplanar_triangulation() -> None:
    cube_positions = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [1.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [1.0, 0.0, 1.0],
        [0.0, 1.0, 1.0],
        [1.0, 1.0, 1.0],
    ]
    shuffled_positions = [cube_positions[index] for index in [7, 2, 5, 0, 6, 1, 4, 3]]

    cube_faces = polyhedra_module._polyhedron_faces_from_positions(cube_positions)
    shuffled_faces = polyhedra_module._polyhedron_faces_from_positions(shuffled_positions)

    assert len(cube_faces) == 12
    assert _face_coordinate_keys(cube_positions, cube_faces) == _face_coordinate_keys(
        shuffled_positions,
        shuffled_faces,
    )


def test_polyhedron_faces_ignore_interior_coplanar_hull_points() -> None:
    cube_positions_with_face_center = [
        [0.0, 0.0, 0.0],
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [1.0, 1.0, 0.0],
        [0.5, 0.5, 0.0],
        [0.0, 0.0, 1.0],
        [1.0, 0.0, 1.0],
        [0.0, 1.0, 1.0],
        [1.0, 1.0, 1.0],
    ]

    faces = polyhedra_module._polyhedron_faces_from_positions(cube_positions_with_face_center)

    assert len(faces) == 12
    assert all(4 not in face for face in faces)


def test_scene_response_suppresses_reverse_and_same_species_polyhedron_centers() -> None:
    sr_tio3_scene = build_scene_response(read_structure(FIXTURE_DIR / "SrTiO3.cif"))
    si_scene = build_scene_response(read_structure(FIXTURE_DIR / "Si.cif"))

    sr_tio3_centers = {
        sr_tio3_scene["atoms"][polyhedron["centerAtomIndex"]]["id"]
        for polyhedron in sr_tio3_scene["polyhedra"]
    }

    assert "Ti-1" in sr_tio3_centers
    assert all(not center.startswith("O-") for center in sr_tio3_centers)
    assert si_scene["polyhedra"] == []
    assert "warnings" not in si_scene


def test_scene_response_polyhedra_follow_selected_bond_algorithm() -> None:
    structure = read_structure(FIXTURE_DIR / "Al2O3.cif")

    crystal_scene = build_scene_response(structure, bond_algorithm="crystal-nn")
    minimum_distance_scene = build_scene_response(structure, bond_algorithm="minimum-distance")
    cutoff_dict_scene = build_scene_response(structure, bond_algorithm="cut-off-dict")

    assert len(crystal_scene["polyhedra"]) == 24
    assert minimum_distance_scene["bonds"]
    assert minimum_distance_scene["polyhedra"]
    assert cutoff_dict_scene["bonds"]
    assert cutoff_dict_scene["polyhedra"]
    assert "warnings" not in crystal_scene
    assert "warnings" not in minimum_distance_scene
    assert "warnings" not in cutoff_dict_scene


def test_scene_response_rejects_unsupported_bond_algorithm() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    with pytest.raises(UnsupportedBondAlgorithmError, match="Unsupported bond algorithm"):
        build_scene_response(structure, bond_algorithm="custom-cutoff")

    with pytest.raises(UnsupportedBondAlgorithmError, match="Unsupported bond algorithm"):
        build_scene_response(structure, bond_algorithm="voronoi-nn")


def test_scene_response_marks_one_hop_bonded_images_without_recursive_expansion() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    scene = build_scene_response(structure)
    bonded_image_atoms = [
        atom
        for atom in scene["atoms"]
        if atom["imageReasons"] == ["bonded"]
        and atom["visibilityDependencies"] == ["oneHopBondedAtoms"]
    ]
    boundary_source_bonds = [
        bond
        for bond in scene["bonds"]
        if bond["visibilityDependencies"] == ["boundaryAtoms", "oneHopBondedAtoms"]
    ]

    assert bonded_image_atoms
    assert boundary_source_bonds
    assert all(
        scene["atoms"][bond["startAtomIndex"]]["imageReasons"] != ["bonded"]
        for bond in boundary_source_bonds
    )


def test_scene_response_marks_boundary_bonds_independently_from_one_hop() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    scene = build_scene_response(structure)
    boundary_only_bonds = [
        bond for bond in scene["bonds"] if bond["visibilityDependencyGroups"] == [["boundaryAtoms"]]
    ]

    assert boundary_only_bonds
    assert all(
        (
            "boundary" in scene["atoms"][bond["startAtomIndex"]]["imageReasons"]
            or "boundary" in scene["atoms"][bond["endAtomIndex"]]["imageReasons"]
        )
        for bond in boundary_only_bonds
    )


def test_scene_response_returns_warning_when_bond_analysis_fails(monkeypatch) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    def fail_bonds(**_kwargs: object) -> list[dict[str, object]]:
        raise RuntimeError("neighbor graph unavailable")

    monkeypatch.setattr(connectivity_module, "build_bonds", fail_bonds)

    scene = build_scene_response(structure)

    assert scene["bonds"] == []
    assert scene["warnings"] == [
        {
            "code": "bond-analysis-failed",
            "message": "Bond analysis with CrystalNN failed: neighbor graph unavailable",
        }
    ]


def test_scene_response_returns_warning_when_polyhedra_analysis_fails(monkeypatch) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    def fail_polyhedra(**_kwargs: object) -> list[dict[str, object]]:
        raise RuntimeError("polyhedra hull unavailable")

    monkeypatch.setattr(polyhedra_module, "build_polyhedra", fail_polyhedra)

    scene = build_scene_response(structure)

    assert scene["bonds"]
    assert scene["polyhedra"] == []
    assert scene["warnings"] == [
        {
            "code": "polyhedra-analysis-failed",
            "message": "Polyhedra analysis with CrystalNN failed: polyhedra hull unavailable",
        }
    ]


def test_empty_bond_result_is_not_a_warning(monkeypatch) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    monkeypatch.setattr(connectivity_module, "build_bonds", lambda **_kwargs: [])

    scene = build_scene_response(structure)

    assert scene["bonds"] == []
    assert "warnings" not in scene


def test_empty_polyhedra_result_is_not_a_warning() -> None:
    structure = read_structure(FIXTURE_DIR / "Si.cif")

    scene = build_scene_response(structure)

    assert scene["bonds"]
    assert scene["polyhedra"] == []
    assert "warnings" not in scene


def test_degenerate_polyhedron_centers_are_skipped_without_warning(monkeypatch) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    monkeypatch.setattr(polyhedra_module, "_polyhedron_faces_from_positions", lambda _positions: [])

    scene = build_scene_response(structure)

    assert scene["bonds"]
    assert scene["polyhedra"] == []
    assert "warnings" not in scene


def test_scene_summary_marks_non_periodic_symmetry_unavailable() -> None:
    structure = Structure(
        Lattice.cubic(4.0, pbc=(False, False, False)),
        ["H", "O"],
        [[0.0, 0.0, 0.0], [0.0, 0.0, 1.0]],
        coords_are_cartesian=True,
    )

    scene = build_scene_response(structure)

    assert scene["summary"]["symmetry"] == {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }


def test_large_structure_summary_skips_symmetry_analysis(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_spacegroup_analysis(*_args: object, **_kwargs: object) -> None:
        pytest.fail("Large structure summaries should skip SpacegroupAnalyzer.")

    monkeypatch.setattr(summary_module, "SpacegroupAnalyzer", fail_spacegroup_analysis)
    structure = _structure_from_fractional_positions(
        ["Na"] * STRUCTURE_ATOM_COUNT_THRESHOLD,
        [
            [index / STRUCTURE_ATOM_COUNT_THRESHOLD, 0.25, 0.25]
            for index in range(STRUCTURE_ATOM_COUNT_THRESHOLD)
        ],
    )

    summary = summary_module.build_structure_summary(structure)

    assert summary["atomCount"] == STRUCTURE_ATOM_COUNT_THRESHOLD
    assert summary["symmetry"] == {
        "available": False,
        "spaceGroup": None,
        "spaceGroupNumber": None,
        "pointGroup": None,
        "pointGroupSchoenflies": None,
        "crystalSystem": None,
        "latticeSystem": None,
    }


def _structure_from_fractional_positions(
    species: list[str],
    fractional_positions: list[list[float]],
    *,
    pbc: bool = True,
) -> Structure:
    return Structure(
        Lattice.cubic(1.0, pbc=(pbc, pbc, pbc)),
        species,
        fractional_positions,
        coords_are_cartesian=False,
        to_unit_cell=False,
    )


def _face_coordinate_keys(
    positions: list[list[float]],
    faces: list[list[int]],
) -> set[tuple[tuple[float, float, float], ...]]:
    return {
        tuple(
            sorted(
                (
                    round(positions[index][0], 8),
                    round(positions[index][1], 8),
                    round(positions[index][2], 8),
                )
                for index in face
            )
        )
        for face in faces
    }


def _dependency_name(dependency: str) -> str:
    base_name = dependency.split("[", maxsplit=1)[0]
    for separator in (">", "<", "=", "~", "!"):
        base_name = base_name.split(separator, maxsplit=1)[0]
    return base_name.strip().lower()


def _imported_roots(source: str) -> set[str]:
    roots: set[str] = set()
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            roots.update(alias.name.split(".", maxsplit=1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            roots.add(node.module.split(".", maxsplit=1)[0])
    return roots
