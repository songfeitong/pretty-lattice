import ast
import tomllib
import warnings
from concurrent.futures import ThreadPoolExecutor
from math import dist
from pathlib import Path

import numpy as np
import pytest
from pymatgen.core import Lattice, Structure
from pymatgen.core.local_env import CrystalNN, CutOffDictNN, MinimumDistanceNN

import pretty_lattice.structures.connectivity as connectivity_module
import pretty_lattice.structures.polyhedra as polyhedra_module
import pretty_lattice.structures.summary as summary_module
from pretty_lattice.structures.normalization import normalize_structure_for_preview
from pretty_lattice.structures.preview_limits import PreviewLimitExceeded
from pretty_lattice.structures.readers import (
    StructureReadError,
    read_structure,
    read_structure_bytes,
)
from pretty_lattice.structures.scene import (
    build_scene_response,
)
from pretty_lattice.structures.schema import (
    LARGE_STRUCTURE_ATOM_COUNT,
    MEDIUM_STRUCTURE_ATOM_COUNT,
    CustomBondRecalculationError,
    InvalidBondCutoffOverridesError,
    UnsupportedBondAlgorithmError,
    classify_structure_size,
    default_bond_algorithm_for_atom_count,
)
from pretty_lattice.structures.symmetry import (
    POINT_GROUP_SCHOENFLIES,
    point_group_schoenflies_symbol,
)
from pretty_lattice.structures.warning_policy import THIRD_PARTY_STRUCTURE_WARNING_PACKAGE_NAMES

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
    assert scene.keys() == {
        "cell",
        "atoms",
        "bonds",
        "bondFamilies",
        "polyhedra",
        "summary",
        "connectivity",
        "bondAlgorithm",
    }
    assert scene["bondFamilies"] == [
        {
            "key": "Sr|O",
            "elements": ["Sr", "O"],
            "minLength": pytest.approx(2.7666976290584877),
            "maxLength": pytest.approx(2.7666976290584886),
        },
        {
            "key": "Ti|O",
            "elements": ["Ti", "O"],
            "minLength": pytest.approx(1.956350655),
            "maxLength": pytest.approx(1.9563506550000005),
        },
    ]
    first_bond = scene["bonds"][0]
    assert first_bond["id"].startswith("bond:")
    assert first_bond["relationId"].startswith("bond-relation:")
    assert first_bond["familyKey"] == "Sr|O"
    assert first_bond["relativeImageOffset"] == [
        end - start
        for start, end in zip(
            first_bond["startImageOffset"],
            first_bond["endImageOffset"],
            strict=True,
        )
    ]
    assert first_bond["length"] == pytest.approx(2.7666976290584877)


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


def test_preview_normalization_folds_periodic_sites_without_sanitizing() -> None:
    structure = Structure(
        Lattice.from_parameters(2.0, 3.0, 4.0, 80.0, 90.0, 100.0),
        ["O", "C"],
        [[1.2, -0.1, 0.5], [0.25, 0.25, 0.25]],
        charge=1,
        site_properties={"magmom": [2.0, 1.0]},
        labels=["O-outside", "C-inside"],
        properties={"source": "normalization-test"},
        to_unit_cell=False,
    )

    normalized = normalize_structure_for_preview(structure)

    assert [[float(value) for value in site.frac_coords] for site in structure] == [
        [1.2, -0.1, 0.5],
        [0.25, 0.25, 0.25],
    ]
    assert [[float(value) for value in site.frac_coords] for site in normalized] == [
        [pytest.approx(0.2), pytest.approx(0.9), 0.5],
        [0.25, 0.25, 0.25],
    ]
    assert [site.species_string for site in normalized] == ["O", "C"]
    assert normalized.lattice == structure.lattice
    assert normalized.site_properties == {"magmom": [2.0, 1.0]}
    assert normalized.labels == ["O-outside", "C-inside"]
    assert normalized.properties == {"source": "normalization-test"}
    assert normalized._charge == 1


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


def test_custom_family_cutoff_replaces_only_that_family_and_keeps_stable_ids() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    base_scene = build_scene_response(structure, bond_algorithm="crystal-nn")
    custom_scene = build_scene_response(
        structure,
        bond_algorithm="crystal-nn",
        bond_cutoff_overrides={"Sr|O": {"min": 0.0, "max": 2.0}},
    )
    repeated_scene = build_scene_response(structure, bond_algorithm="crystal-nn")

    assert [bond["id"] for bond in repeated_scene["bonds"]] == [
        bond["id"] for bond in base_scene["bonds"]
    ]
    assert [bond["relationId"] for bond in repeated_scene["bonds"]] == [
        bond["relationId"] for bond in base_scene["bonds"]
    ]
    assert not any(bond["familyKey"] == "Sr|O" for bond in custom_scene["bonds"])
    assert {bond["id"] for bond in custom_scene["bonds"] if bond["familyKey"] == "Ti|O"} == {
        bond["id"] for bond in base_scene["bonds"] if bond["familyKey"] == "Ti|O"
    }
    assert custom_scene["bondFamilies"][0] == {
        "key": "Sr|O",
        "elements": ["Sr", "O"],
        "minLength": None,
        "maxLength": None,
    }
    assert len(custom_scene["atoms"]) < len(base_scene["atoms"])
    assert len(custom_scene["polyhedra"]) < len(base_scene["polyhedra"])


def test_custom_family_cutoff_rejects_expensive_periodic_neighbor_search() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    with pytest.raises(PreviewLimitExceeded, match="overly expensive") as exc_info:
        build_scene_response(
            structure,
            bond_algorithm="crystal-nn",
            bond_cutoff_overrides={"Sr|O": {"min": 0.0, "max": 1_000.0}},
        )

    assert exc_info.value.code == "bond-cutoff-search-too-expensive"


def test_custom_family_cutoff_rejects_clustered_search_before_neighbor_allocation(
    monkeypatch,
) -> None:
    atom_count = 1_100
    structure = Structure(
        Lattice.cubic(1_000),
        ["H"] * atom_count,
        [[index / (atom_count - 1) * 0.0002, 0, 0] for index in range(atom_count)],
    )

    def unexpected_neighbor_list(*_args: object, **_kwargs: object):
        pytest.fail("The bounded preflight must reject before get_neighbor_list.")

    monkeypatch.setattr(structure, "get_neighbor_list", unexpected_neighbor_list)

    with pytest.raises(PreviewLimitExceeded, match="overly expensive") as exc_info:
        connectivity_module._enforce_custom_neighbor_search_cost(structure, 1.0)

    assert exc_info.value.code == "bond-cutoff-search-too-expensive"


@pytest.mark.parametrize(
    ("filename", "cutoff"),
    [
        ("SrTiO3.cif", 3.0),
        ("LiFePO4.cif", 2.5),
        ("Al2O3.cif", 2.0),
    ],
)
def test_custom_neighbor_preflight_matches_periodic_neighbor_count(
    filename: str,
    cutoff: float,
) -> None:
    structure = normalize_structure_for_preview(read_structure(FIXTURE_DIR / filename))
    center_indices, *_ = structure.get_neighbor_list(cutoff)

    assert connectivity_module._custom_neighbor_candidate_count(
        structure,
        cutoff,
    ) == len(center_indices)


def test_custom_family_cutoff_range_is_inclusive_and_cannot_add_a_new_family() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")
    base_scene = build_scene_response(structure, bond_algorithm="crystal-nn")
    sr_o_maximum = next(
        family["maxLength"] for family in base_scene["bondFamilies"] if family["key"] == "Sr|O"
    )
    sr_o_minimum = next(
        family["minLength"] for family in base_scene["bondFamilies"] if family["key"] == "Sr|O"
    )
    assert sr_o_minimum is not None and sr_o_maximum is not None

    inclusive_scene = build_scene_response(
        structure,
        bond_algorithm="crystal-nn",
        bond_cutoff_overrides={
            "O|Sr": {"min": sr_o_minimum, "max": sr_o_maximum + 1e-3}
        },
    )
    exclude_short_scene = build_scene_response(
        structure,
        bond_algorithm="crystal-nn",
        bond_cutoff_overrides={
            "Sr|O": {"min": sr_o_minimum + 1e-6, "max": sr_o_maximum + 1e-3}
        },
    )

    assert sum(bond["familyKey"] == "Sr|O" for bond in inclusive_scene["bonds"]) == sum(
        bond["familyKey"] == "Sr|O" for bond in base_scene["bonds"]
    )
    assert sum(bond["familyKey"] == "Sr|O" for bond in exclude_short_scene["bonds"]) < sum(
        bond["familyKey"] == "Sr|O" for bond in base_scene["bonds"]
    )
    with pytest.raises(
        InvalidBondCutoffOverridesError,
        match="does not exist in the base connectivity",
    ):
        build_scene_response(
            structure,
            bond_algorithm="crystal-nn",
            bond_cutoff_overrides={"Sr|Ti": {"min": 0.0, "max": 3.0}},
        )


def test_third_party_structure_warnings_are_suppressed() -> None:
    structure_path = FIXTURE_DIR / "MoS2.cif"

    with warnings.catch_warnings(record=True) as captured_warnings:
        warnings.simplefilter("always")
        structure = read_structure(structure_path)
        scene = build_scene_response(structure, bond_algorithm="crystal-nn")

    leaked_third_party_warnings = [
        warning
        for warning in captured_warnings
        if _is_third_party_structure_warning(warning.filename)
    ]

    assert scene["bonds"]
    assert leaked_third_party_warnings == []


@pytest.mark.parametrize(
    ("atom_count", "expected_algorithm"),
    [
        (5, "crystal-nn"),
        (MEDIUM_STRUCTURE_ATOM_COUNT - 1, "crystal-nn"),
        (MEDIUM_STRUCTURE_ATOM_COUNT, "cut-off-dict"),
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


@pytest.mark.parametrize(
    ("atom_count", "size", "algorithm"),
    [
        (255, "small", "crystal-nn"),
        (256, "medium", "cut-off-dict"),
        (1023, "medium", "cut-off-dict"),
        (1024, "large", "cut-off-dict"),
    ],
)
def test_structure_size_boundaries(atom_count: int, size: str, algorithm: str) -> None:
    assert classify_structure_size(atom_count) == size
    assert default_bond_algorithm_for_atom_count(atom_count) == algorithm


def test_large_scene_defers_connectivity(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_connectivity(**_kwargs: object) -> connectivity_module.ConnectivityResult:
        raise AssertionError("connectivity must be deferred")

    monkeypatch.setattr(connectivity_module, "build_connectivity", fail_connectivity)
    structure = _structure_from_fractional_positions(
        ["C"] * LARGE_STRUCTURE_ATOM_COUNT,
        [
            [index / LARGE_STRUCTURE_ATOM_COUNT, 0.25, 0.25]
            for index in range(LARGE_STRUCTURE_ATOM_COUNT)
        ],
    )

    scene = build_scene_response(structure)

    assert scene["connectivity"] == "deferred"
    assert scene["bondAlgorithm"] == "cut-off-dict"
    assert scene["bonds"] == []
    assert scene["bondFamilies"] == []
    assert scene["polyhedra"] == []
    assert all("bonded" not in atom["imageReasons"] for atom in scene["atoms"])


def test_cutoff_dict_bonding_uses_batched_neighbor_table(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")
    captured_calls: list[tuple[int, float]] = []
    original_get_neighbor_list = Structure.get_neighbor_list

    def capture_get_neighbor_list(
        self: Structure,
        radius: float,
        *args: object,
        **kwargs: object,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        captured_calls.append((len(self), radius))
        return original_get_neighbor_list(self, radius, *args, **kwargs)

    def fail_get_all_neighbors(*_args: object, **_kwargs: object) -> None:
        pytest.fail("Cutoff connectivity should not create PeriodicNeighbor tables.")

    monkeypatch.setattr(Structure, "get_neighbor_list", capture_get_neighbor_list)
    monkeypatch.setattr(Structure, "get_all_neighbors", fail_get_all_neighbors)

    scene = build_scene_response(structure, bond_algorithm="cut-off-dict")

    assert captured_calls == [
        (len(structure), connectivity_module._VESTA_CUTOFF_CONFIG.max_distance)
    ]
    assert scene["bonds"]
    assert "warnings" not in scene


def test_vesta_cutoff_config_is_immutable_and_reused_between_requests(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    def fail_reload(*_args: object, **_kwargs: object) -> None:
        pytest.fail("VESTA cutoffs should not be parsed during a request.")

    monkeypatch.setattr(CutOffDictNN, "from_preset", fail_reload)

    first_scene = build_scene_response(structure, bond_algorithm="cut-off-dict")
    second_scene = build_scene_response(structure, bond_algorithm="cut-off-dict")

    assert first_scene == second_scene
    with pytest.raises(TypeError):
        connectivity_module._VESTA_CUTOFF_CONFIG.symbol_codes["X"] = 0  # type: ignore[index]
    with pytest.raises(ValueError):
        connectivity_module._VESTA_CUTOFF_CONFIG.cutoff_matrix[0, 0] = 0.0
    with pytest.raises(ValueError):
        connectivity_module._VESTA_CUTOFF_CONFIG.cutoff_matrix.setflags(write=True)


def test_vesta_cutoff_config_is_safe_for_concurrent_neighbor_tables() -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    with ThreadPoolExecutor(max_workers=4) as executor:
        neighbor_tables = list(
            executor.map(
                lambda _index: connectivity_module._vesta_neighbor_records_by_site(structure),
                range(8),
            )
        )

    assert all(table == neighbor_tables[0] for table in neighbor_tables)


@pytest.mark.parametrize(
    ("bond_algorithm", "analyzer_type"),
    [
        ("crystal-nn", CrystalNN),
        ("minimum-distance", MinimumDistanceNN),
    ],
)
def test_site_neighbor_analysis_is_reused_for_boundary_images(
    monkeypatch: pytest.MonkeyPatch,
    bond_algorithm: str,
    analyzer_type: type[CrystalNN] | type[MinimumDistanceNN],
) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")
    analyzed_site_indices: list[int] = []
    original_get_nn_info = analyzer_type.get_nn_info

    def capture_get_nn_info(
        self: object,
        structure_arg: Structure,
        site_index: int,
    ) -> list[dict[str, object]]:
        analyzed_site_indices.append(site_index)
        return original_get_nn_info(self, structure_arg, site_index)

    monkeypatch.setattr(analyzer_type, "get_nn_info", capture_get_nn_info)

    scene = build_scene_response(structure, bond_algorithm=bond_algorithm)

    assert analyzed_site_indices == list(range(len(structure)))
    assert scene["bonds"]
    assert "warnings" not in scene


def test_vesta_cutoff_filter_is_strict_and_keeps_neighbor_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    structure = Structure(
        Lattice.cubic(10.0),
        ["C", "H"],
        [[0.0, 0.0, 0.0], [0.1, 0.0, 0.0]],
    )
    config = connectivity_module._VESTA_CUTOFF_CONFIG
    cutoff = config.cutoff_matrix[config.symbol_codes["C"], config.symbol_codes["H"]]

    def cutoff_boundary_neighbor_list(
        *_args: object,
        **_kwargs: object,
    ) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        return (
            np.array([0, 0, 0]),
            np.array([1, 1, 1]),
            np.array([[2, 0, 0], [3, 0, 0], [4, 0, 0]]),
            np.array([np.nextafter(cutoff, -np.inf), cutoff, np.nextafter(cutoff, np.inf)]),
        )

    monkeypatch.setattr(Structure, "get_neighbor_list", cutoff_boundary_neighbor_list)

    neighbors = connectivity_module._vesta_neighbor_records_by_site(structure)

    assert neighbors == [
        [connectivity_module.NeighborRecord(site_index=1, image=(2, 0, 0))],
        [],
    ]


def test_vesta_cutoff_records_match_legacy_order_for_all_fixtures() -> None:
    analyzer = CutOffDictNN.from_preset("vesta_2019")

    for filename, *_fixture_metadata in CIF_FIXTURES:
        structure = read_structure(FIXTURE_DIR / filename)
        expected: list[list[tuple[int, tuple[int, int, int]]]] = []
        for site, neighbors in zip(
            structure,
            structure.get_all_neighbors(analyzer._max_dist),
            strict=True,
        ):
            site_symbol = connectivity_module.site_element_symbol(site)
            expected.append(
                [
                    (
                        int(neighbor.index),
                        connectivity_module.normalize_image_offset(neighbor.image),
                    )
                    for neighbor in neighbors
                    if neighbor.nn_distance
                    < analyzer._lookup_dict.get(site_symbol, {}).get(
                        connectivity_module.site_element_symbol(neighbor), 0.0
                    )
                ]
            )

        actual = [
            [(neighbor.site_index, neighbor.image) for neighbor in site_neighbors]
            for site_neighbors in connectivity_module._vesta_neighbor_records_by_site(structure)
        ]

        assert actual == expected, filename


def test_vesta_cutoff_uses_dominant_element_for_disordered_sites() -> None:
    structure = Structure(
        Lattice.cubic(10.0),
        [{"Na": 0.6, "K": 0.4}, "Cl"],
        [[0.0, 0.0, 0.0], [0.35, 0.0, 0.0]],
    )

    neighbors = connectivity_module._vesta_neighbor_records_by_site(structure)

    assert connectivity_module.site_element_symbol(structure[0]) == "Na"
    assert neighbors == [[], []]


def test_vesta_cutoff_uses_element_symbols_for_oxidized_sites() -> None:
    structure = Structure(
        Lattice.cubic(4.0),
        ["Na", "Cl"],
        [[0.0, 0.0, 0.0], [0.5, 0.0, 0.0]],
    )
    structure.add_oxidation_state_by_element({"Na": 1, "Cl": -1})

    neighbors = connectivity_module._vesta_neighbor_records_by_site(structure)

    assert [[neighbor.site_index for neighbor in row] for row in neighbors] == [
        [1, 1],
        [0, 0],
    ]


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


@pytest.mark.parametrize("bond_algorithm", ["crystal-nn", "minimum-distance", "cut-off-dict"])
def test_scene_response_normalizes_out_of_cell_sites_before_bonding(
    bond_algorithm: str,
) -> None:
    structure = Structure(
        Lattice.cubic(10.0),
        ["C", "C"],
        [[-0.1, 0.5, 0.5], [0.0, 0.5, 0.5]],
        coords_are_cartesian=False,
        to_unit_cell=False,
    )

    scene = build_scene_response(structure, bond_algorithm=bond_algorithm)
    atoms = scene["atoms"]
    bond_lengths = [
        dist(
            atoms[bond["startAtomIndex"]]["position"],
            atoms[bond["endAtomIndex"]]["position"],
        )
        for bond in scene["bonds"]
    ]

    assert [[float(value) for value in site.frac_coords] for site in structure] == [
        [-0.1, 0.5, 0.5],
        [0.0, 0.5, 0.5],
    ]
    assert bond_lengths
    assert max(bond_lengths) == pytest.approx(1.0)
    assert all(length < 2.0 for length in bond_lengths)


def test_normalized_boundary_bonded_images_keep_independent_visibility_groups() -> None:
    structure = Structure(
        Lattice.cubic(10.0),
        ["C", "C"],
        [[-0.1, 0.5, 0.5], [0.0, 0.5, 0.5]],
        coords_are_cartesian=False,
        to_unit_cell=False,
    )

    scene = build_scene_response(structure, bond_algorithm="cut-off-dict")
    atoms = scene["atoms"]
    boundary_bonded_atom = next(
        atom for atom in atoms if atom["imageReasons"] == ["boundary", "bonded"]
    )
    boundary_bonded_bond = next(
        bond
        for bond in scene["bonds"]
        if bond["visibilityDependencyGroups"] == [["boundaryAtoms"], ["oneHopBondedAtoms"]]
    )

    assert boundary_bonded_atom["visibilityDependencyGroups"] == [
        ["boundaryAtoms"],
        ["oneHopBondedAtoms"],
    ]
    assert (
        "boundary" in atoms[boundary_bonded_bond["startAtomIndex"]]["imageReasons"]
        or "boundary" in atoms[boundary_bonded_bond["endAtomIndex"]]["imageReasons"]
    )


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
        any(
            scene["atoms"][atom_index]["imageReasons"] != ["bonded"]
            for atom_index in (bond["startAtomIndex"], bond["endAtomIndex"])
        )
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


@pytest.mark.parametrize(
    ("module", "attribute", "failure"),
    [
        (connectivity_module, "build_connectivity", "neighbor graph unavailable"),
        (connectivity_module, "build_bonds", "bond serialization unavailable"),
        (polyhedra_module, "build_polyhedra", "polyhedra hull unavailable"),
    ],
)
def test_custom_recalculation_fails_atomically(
    monkeypatch,
    module: object,
    attribute: str,
    failure: str,
) -> None:
    structure = read_structure(FIXTURE_DIR / "SrTiO3.cif")

    def fail_analysis(**_kwargs: object):
        raise RuntimeError(failure)

    monkeypatch.setattr(module, attribute, fail_analysis)

    with pytest.raises(CustomBondRecalculationError, match=failure):
        build_scene_response(
            structure,
            bond_algorithm="crystal-nn",
            bond_cutoff_overrides={"Sr|O": {"min": 0.0, "max": 2.0}},
        )


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
        ["Na"] * LARGE_STRUCTURE_ATOM_COUNT,
        [
            [index / LARGE_STRUCTURE_ATOM_COUNT, 0.25, 0.25]
            for index in range(LARGE_STRUCTURE_ATOM_COUNT)
        ],
    )

    summary = summary_module.build_structure_summary(structure)

    assert summary["atomCount"] == LARGE_STRUCTURE_ATOM_COUNT
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


def _is_third_party_structure_warning(filename: str) -> bool:
    path_parts = set(Path(filename).parts)
    return any(
        package_name in path_parts for package_name in THIRD_PARTY_STRUCTURE_WARNING_PACKAGE_NAMES
    )
