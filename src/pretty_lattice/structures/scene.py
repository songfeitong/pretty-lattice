from __future__ import annotations

import math
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from itertools import product
from typing import Literal, NotRequired, TypedDict

from pymatgen.core import Structure
from pymatgen.core.local_env import CrystalNN, MinimumDistanceNN, VoronoiNN
from pymatgen.core.sites import PeriodicSite
from pymatgen.symmetry.analyzer import SpacegroupAnalyzer
from scipy.spatial import Delaunay, QhullError

from pretty_lattice.structures.colormaps import Colormap, load_colormap
from pretty_lattice.structures.elements import (
    ElementRecord,
    ElementRegistry,
    load_element_registry,
)
from pretty_lattice.structures.symmetry import point_group_schoenflies_symbol

_BOUNDARY_TOLERANCE = 1e-6
_CANONICAL_IMAGE_OFFSET = (0, 0, 0)
_FLOAT_ZERO_TOLERANCE = 1e-12
DEFAULT_BOND_ALGORITHM = "crystal-nn"

BondAlgorithm = Literal["crystal-nn", "minimum-distance", "voronoi-nn"]
AtomRadiusModel = Literal["uniform", "atomic", "vdw", "ionic"]
ImageReason = Literal["boundary", "bonded"]
VisibilityDependency = Literal["boundaryAtoms", "oneHopBondedAtoms"]
type _AtomKey = tuple[int, tuple[int, int, int]]

_BOND_ALGORITHM_LABELS: dict[BondAlgorithm, str] = {
    "crystal-nn": "CrystalNN",
    "minimum-distance": "MinimumDistanceNN",
    "voronoi-nn": "VoronoiNN",
}
_IMAGE_REASON_ORDER: tuple[ImageReason, ...] = ("boundary", "bonded")
_VISIBILITY_DEPENDENCY_ORDER: tuple[VisibilityDependency, ...] = (
    "boundaryAtoms",
    "oneHopBondedAtoms",
)


class UnsupportedBondAlgorithmError(ValueError):
    """Raised when a requested preview bond algorithm is not allowlisted."""


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
    siteId: str
    element: str
    position: list[float]
    fractionalPosition: list[float]
    imageOffset: list[int]
    isPeriodicImage: bool
    imageReasons: list[ImageReason]
    visibilityDependencies: list[VisibilityDependency]
    visibilityDependencyGroups: list[list[VisibilityDependency]]
    radius: float
    radii: AtomRadiiSpec
    color: str


class AtomRadiiSpec(TypedDict):
    uniform: float
    atomic: float
    vdw: float
    ionic: float


class BondSpec(TypedDict):
    id: str
    startAtomId: str
    endAtomId: str
    visibilityDependencies: list[VisibilityDependency]
    visibilityDependencyGroups: list[list[VisibilityDependency]]


class PolyhedronSpec(TypedDict):
    id: str
    centerAtomId: str
    hullAtomIds: list[str]
    faces: list[list[int]]
    color: str
    visibilityDependencies: list[VisibilityDependency]
    visibilityDependencyGroups: list[list[VisibilityDependency]]


class AnalysisWarningSpec(TypedDict):
    code: str
    message: str


class SceneSpec(TypedDict):
    cell: CellSpec
    atoms: list[AtomSpec]
    bonds: list[BondSpec]
    polyhedra: list[PolyhedronSpec]
    summary: StructureSummarySpec
    warnings: NotRequired[list[AnalysisWarningSpec]]


@dataclass(frozen=True)
class _SiteRenderData:
    index: int
    site_id: str
    element_symbol: str
    fractional_position: list[float]
    radius: float
    radii: AtomRadiiSpec
    color: str


@dataclass
class _AtomRecord:
    site: _SiteRenderData
    image_offset: tuple[int, int, int]
    image_reasons: set[ImageReason] = field(default_factory=set)
    visibility_dependencies: set[VisibilityDependency] = field(default_factory=set)
    visibility_dependency_groups: list[frozenset[VisibilityDependency]] = field(
        default_factory=list
    )


@dataclass
class _BondRecord:
    start_atom_id: str
    end_atom_id: str
    visibility_dependencies: set[VisibilityDependency] = field(default_factory=set)
    visibility_dependency_groups: list[frozenset[VisibilityDependency]] = field(
        default_factory=list
    )


@dataclass(frozen=True)
class _ConnectedAtom:
    source_key: _AtomKey
    target_key: _AtomKey
    source_atom_id: str
    target_atom_id: str


@dataclass(frozen=True)
class _ConnectivityResult:
    bonds: list[BondSpec]
    connections_by_source: dict[_AtomKey, list[_ConnectedAtom]]


def build_scene_response(
    structure: Structure,
    *,
    bond_algorithm: str | None = None,
    element_registry: ElementRegistry | None = None,
    colormap: Colormap | None = None,
) -> SceneSpec:
    normalized_bond_algorithm = normalize_bond_algorithm(bond_algorithm)
    elements = element_registry or load_element_registry()
    colors = colormap or load_colormap()
    cell_vectors = [_vector3(vector) for vector in structure.lattice.matrix]
    can_generate_periodic_images = _has_valid_3d_periodic_cell(structure)

    site_render_data: list[_SiteRenderData] = []
    atom_records: dict[_AtomKey, _AtomRecord] = {}
    canonical_source_keys: list[_AtomKey] = []
    for index, site in enumerate(structure):
        symbol = _site_element_symbol(site)
        fractional_position = _vector3(site.frac_coords)
        element = elements.resolve(symbol)
        site_id = f"{element.symbol}-{index}"
        color = colors.resolve(element.symbol)
        canonical_fractional_position = fractional_position
        boundary_axes: tuple[int, ...] = ()

        if can_generate_periodic_images:
            canonical_fractional_position, boundary_axes = _canonicalize_fractional_position(
                fractional_position
            )

        site_data = _SiteRenderData(
            index=index,
            site_id=site_id,
            element_symbol=element.symbol,
            fractional_position=canonical_fractional_position,
            radius=element.uniform_radius,
            radii=_element_radii(element),
            color=color,
        )
        site_render_data.append(site_data)

        if can_generate_periodic_images:
            for image_offset in _periodic_image_offsets(boundary_axes):
                image_reasons: tuple[ImageReason, ...] = ()
                visibility_dependencies: tuple[VisibilityDependency, ...] = ()
                if image_offset != _CANONICAL_IMAGE_OFFSET:
                    image_reasons = ("boundary",)
                    visibility_dependencies = ("boundaryAtoms",)

                _ensure_atom_record(
                    atom_records,
                    image_offset=image_offset,
                    image_reasons=image_reasons,
                    site=site_data,
                    visibility_dependencies=visibility_dependencies,
                )
                if image_offset == _CANONICAL_IMAGE_OFFSET:
                    canonical_source_keys.append((index, image_offset))
            continue

        _ensure_atom_record(
            atom_records,
            image_offset=_CANONICAL_IMAGE_OFFSET,
            image_reasons=(),
            site=site_data,
            visibility_dependencies=(),
        )
        canonical_source_keys.append((index, _CANONICAL_IMAGE_OFFSET))

    bonds: list[BondSpec] = []
    polyhedra: list[PolyhedronSpec] = []
    warnings: list[AnalysisWarningSpec] = []
    if can_generate_periodic_images:
        boundary_source_keys = [
            key for key, atom in atom_records.items() if "boundary" in atom.image_reasons
        ]
        try:
            connectivity = _build_connectivity(
                atom_records=atom_records,
                bond_algorithm=normalized_bond_algorithm,
                canonical_source_keys=canonical_source_keys,
                boundary_source_keys=boundary_source_keys,
                site_render_data=site_render_data,
                structure=structure,
            )
        except Exception as exc:
            warnings.append(
                {
                    "code": "bond-analysis-failed",
                    "message": (
                        "Bond analysis with "
                        f"{_BOND_ALGORITHM_LABELS[normalized_bond_algorithm]} failed: {exc}"
                    ),
                }
            )
        else:
            try:
                bonds = _build_bonds(connectivity=connectivity)
            except Exception as exc:
                warnings.append(
                    {
                        "code": "bond-analysis-failed",
                        "message": (
                            "Bond analysis with "
                            f"{_BOND_ALGORITHM_LABELS[normalized_bond_algorithm]} failed: {exc}"
                        ),
                    }
                )

            try:
                polyhedra = _build_polyhedra(
                    atom_records=atom_records,
                    cell_vectors=cell_vectors,
                    connectivity=connectivity,
                    structure=structure,
                )
            except Exception as exc:
                warnings.append(
                    {
                        "code": "polyhedra-analysis-failed",
                        "message": (
                            "Polyhedra analysis with "
                            f"{_BOND_ALGORITHM_LABELS[normalized_bond_algorithm]} failed: {exc}"
                        ),
                    }
                )

    scene: SceneSpec = {
        "cell": {"vectors": cell_vectors},
        "atoms": [_atom_record_to_spec(atom, cell_vectors) for atom in atom_records.values()],
        "bonds": bonds,
        "polyhedra": polyhedra,
        "summary": _build_structure_summary(structure),
    }
    if warnings:
        scene["warnings"] = warnings

    return scene


def normalize_bond_algorithm(value: str | None) -> BondAlgorithm:
    if value is None or value == "":
        return DEFAULT_BOND_ALGORITHM

    normalized = value.strip()
    if normalized in _BOND_ALGORITHM_LABELS:
        return normalized  # type: ignore[return-value]

    supported = ", ".join(_BOND_ALGORITHM_LABELS)
    raise UnsupportedBondAlgorithmError(
        f"Unsupported bond algorithm '{value}'. Supported algorithms: {supported}."
    )


def _element_radii(element: ElementRecord) -> AtomRadiiSpec:
    return {
        "uniform": element.uniform_radius,
        "atomic": element.atomic_radius,
        "vdw": element.vdw_radius,
        "ionic": element.ionic_radius,
    }


def _vector3(values: Sequence[float]) -> list[float]:
    return [_clean_float(values[0]), _clean_float(values[1]), _clean_float(values[2])]


def _clean_float(value: float) -> float:
    cleaned = float(value)
    if math.isclose(cleaned, 0.0, abs_tol=_FLOAT_ZERO_TOLERANCE):
        return 0.0
    return cleaned


def _site_element_symbol(site: PeriodicSite) -> str:
    specie = _site_specie(site)
    symbol = getattr(specie, "symbol", str(specie))
    return str(symbol)


def _site_specie(site: PeriodicSite):
    try:
        return site.specie
    except AttributeError:
        return max(site.species.items(), key=lambda item: float(item[1]))[0]


def _ensure_atom_record(
    records: dict[_AtomKey, _AtomRecord],
    *,
    image_offset: tuple[int, int, int],
    image_reasons: Sequence[ImageReason],
    site: _SiteRenderData,
    visibility_dependencies: Sequence[VisibilityDependency],
) -> _AtomRecord:
    key = (site.index, image_offset)
    record = records.get(key)
    if record is None:
        record = _AtomRecord(site=site, image_offset=image_offset)
        records[key] = record

    record.image_reasons.update(image_reasons)
    _merge_visibility_dependencies(record, visibility_dependencies)
    return record


def _merge_visibility_dependencies(
    record: _AtomRecord,
    visibility_dependencies: Sequence[VisibilityDependency],
) -> None:
    new_dependencies = frozenset(visibility_dependencies)
    if not new_dependencies:
        return

    record.visibility_dependencies.update(new_dependencies)
    if new_dependencies not in record.visibility_dependency_groups:
        record.visibility_dependency_groups.append(new_dependencies)


def _atom_record_to_spec(
    atom: _AtomRecord,
    cell_vectors: list[list[float]],
) -> AtomSpec:
    shifted_fractional_position = _atom_record_fractional_position(atom)
    return {
        "id": _atom_instance_id(atom.site.site_id, atom.image_offset),
        "siteId": atom.site.site_id,
        "element": atom.site.element_symbol,
        "position": _atom_record_cartesian_position(atom, cell_vectors),
        "fractionalPosition": shifted_fractional_position,
        "imageOffset": [int(value) for value in atom.image_offset],
        "isPeriodicImage": atom.image_offset != _CANONICAL_IMAGE_OFFSET,
        "imageReasons": _ordered_image_reasons(atom.image_reasons),
        "visibilityDependencies": _ordered_visibility_dependencies(atom.visibility_dependencies),
        "visibilityDependencyGroups": _ordered_visibility_dependency_groups(
            atom.visibility_dependency_groups
        ),
        "radius": atom.site.radius,
        "radii": atom.site.radii,
        "color": atom.site.color,
    }


def _atom_instance_id(site_id: str, image_offset: tuple[int, int, int]) -> str:
    if image_offset == _CANONICAL_IMAGE_OFFSET:
        return site_id
    return f"{site_id}-image-{image_offset[0]}-{image_offset[1]}-{image_offset[2]}"


def _build_connectivity(
    *,
    atom_records: dict[_AtomKey, _AtomRecord],
    bond_algorithm: BondAlgorithm,
    canonical_source_keys: list[_AtomKey],
    boundary_source_keys: list[_AtomKey],
    site_render_data: list[_SiteRenderData],
    structure: Structure,
) -> _ConnectivityResult:
    neighbor_analyzer = _neighbor_analyzer_for_bond_algorithm(bond_algorithm)
    source_keys = [*canonical_source_keys, *boundary_source_keys]
    bond_records: dict[tuple[str, str], _BondRecord] = {}
    connections_by_source: dict[_AtomKey, list[_ConnectedAtom]] = {
        source_key: [] for source_key in source_keys
    }

    for source_site_index, source_image_offset in source_keys:
        source_key = (source_site_index, source_image_offset)
        source_site = site_render_data[source_site_index]
        source_atom_id = _atom_instance_id(source_site.site_id, source_image_offset)
        source_is_boundary_image = source_image_offset != _CANONICAL_IMAGE_OFFSET

        for neighbor in neighbor_analyzer.get_nn_info(structure, source_site_index):
            target_site_index = int(neighbor["site_index"])
            target_site = site_render_data[target_site_index]
            target_image_offset = _add_image_offsets(
                source_image_offset,
                _normalize_image_offset(neighbor.get("image", _CANONICAL_IMAGE_OFFSET)),
            )
            target_atom_id = _atom_instance_id(target_site.site_id, target_image_offset)
            if target_atom_id == source_atom_id:
                continue
            target_key = (target_site_index, target_image_offset)

            if target_image_offset != _CANONICAL_IMAGE_OFFSET:
                visibility_dependencies: tuple[VisibilityDependency, ...] = (
                    ("boundaryAtoms", "oneHopBondedAtoms")
                    if source_is_boundary_image
                    else ("oneHopBondedAtoms",)
                )
                _ensure_atom_record(
                    atom_records,
                    image_offset=target_image_offset,
                    image_reasons=("bonded",),
                    site=target_site,
                    visibility_dependencies=visibility_dependencies,
                )

            connections_by_source[source_key].append(
                _ConnectedAtom(
                    source_key=source_key,
                    target_key=target_key,
                    source_atom_id=source_atom_id,
                    target_atom_id=target_atom_id,
                )
            )

            endpoint_key = tuple(sorted((source_atom_id, target_atom_id)))
            bond_record = bond_records.get(endpoint_key)
            if bond_record is None:
                bond_record = _BondRecord(
                    start_atom_id=source_atom_id,
                    end_atom_id=target_atom_id,
                )
                bond_records[endpoint_key] = bond_record

            source_atom = atom_records[(source_site_index, source_image_offset)]
            target_atom = atom_records[target_key]
            for dependency_group in _combined_visibility_dependency_groups(
                source_atom, target_atom
            ):
                _merge_bond_visibility_dependency_group(bond_record, dependency_group)

    return _ConnectivityResult(
        bonds=[
            {
                "id": f"bond-{bond.start_atom_id}--{bond.end_atom_id}",
                "startAtomId": bond.start_atom_id,
                "endAtomId": bond.end_atom_id,
                "visibilityDependencies": _ordered_visibility_dependencies(
                    bond.visibility_dependencies
                ),
                "visibilityDependencyGroups": _ordered_visibility_dependency_groups(
                    bond.visibility_dependency_groups
                ),
            }
            for bond in bond_records.values()
        ],
        connections_by_source=connections_by_source,
    )


def _build_bonds(*, connectivity: _ConnectivityResult) -> list[BondSpec]:
    return connectivity.bonds


def _build_polyhedra(
    *,
    atom_records: dict[_AtomKey, _AtomRecord],
    cell_vectors: list[list[float]],
    connectivity: _ConnectivityResult,
    structure: Structure,
) -> list[PolyhedronSpec]:
    polyhedra: list[PolyhedronSpec] = []

    for source_key, connected_atoms in connectivity.connections_by_source.items():
        center_atom = atom_records.get(source_key)
        if center_atom is None:
            continue

        drawn_connected_atoms, has_missing_connected_atom = _drawn_connected_atoms(
            atom_records, connected_atoms
        )
        if has_missing_connected_atom or len(drawn_connected_atoms) <= 3:
            continue

        if not _is_crystal_toolkit_polyhedron_center(
            structure,
            center_site_index=source_key[0],
            connected_atoms=drawn_connected_atoms,
        ):
            continue

        hull_atoms = [center_atom, *(atom for _, atom in drawn_connected_atoms)]
        hull_atom_ids = [
            _atom_instance_id(atom.site.site_id, atom.image_offset) for atom in hull_atoms
        ]
        positions = [
            _atom_record_cartesian_position(atom, cell_vectors) for atom in hull_atoms
        ]
        faces = _polyhedron_faces_from_positions(positions)
        if not faces:
            continue

        visibility_dependency_groups = [
            dependency_group
            for dependency_group in _combined_visibility_dependency_groups_for_records(hull_atoms)
            if dependency_group
        ]
        visibility_dependencies = (
            set().union(*visibility_dependency_groups)
            if visibility_dependency_groups
            else set()
        )
        center_atom_id = hull_atom_ids[0]
        polyhedra.append(
            {
                "id": f"polyhedron-{center_atom_id}",
                "centerAtomId": center_atom_id,
                "hullAtomIds": hull_atom_ids,
                "faces": faces,
                "color": center_atom.site.color,
                "visibilityDependencies": _ordered_visibility_dependencies(
                    visibility_dependencies
                ),
                "visibilityDependencyGroups": _ordered_visibility_dependency_groups(
                    visibility_dependency_groups
                ),
            }
        )

    return polyhedra


def _drawn_connected_atoms(
    atom_records: dict[_AtomKey, _AtomRecord],
    connected_atoms: list[_ConnectedAtom],
) -> tuple[list[tuple[_ConnectedAtom, _AtomRecord]], bool]:
    drawn_connected_atoms: list[tuple[_ConnectedAtom, _AtomRecord]] = []
    seen_atom_ids: set[str] = set()
    has_missing_connected_atom = False

    for connected_atom in connected_atoms:
        target_atom = atom_records.get(connected_atom.target_key)
        if target_atom is None:
            has_missing_connected_atom = True
            continue

        if connected_atom.target_atom_id in seen_atom_ids:
            continue

        seen_atom_ids.add(connected_atom.target_atom_id)
        drawn_connected_atoms.append((connected_atom, target_atom))

    return drawn_connected_atoms, has_missing_connected_atom


def _is_crystal_toolkit_polyhedron_center(
    structure: Structure,
    *,
    center_site_index: int,
    connected_atoms: list[tuple[_ConnectedAtom, _AtomRecord]],
) -> bool:
    center_specie = _site_specie(structure[center_site_index])
    for connected_atom, _atom_record in connected_atoms:
        connected_specie = _site_specie(structure[connected_atom.target_key[0]])
        try:
            if connected_specie < center_specie or connected_specie == center_specie:
                return False
        except TypeError:
            return False

    return True


def _polyhedron_faces_from_positions(positions: list[list[float]]) -> list[list[int]]:
    if len(positions) < 4:
        return []

    try:
        hull_faces = Delaunay(positions).convex_hull
    except (QhullError, ValueError):
        return []

    faces: list[list[int]] = []
    seen_faces: set[tuple[int, int, int]] = set()
    for face in hull_faces:
        face_indices = tuple(int(index) for index in face)
        if len(set(face_indices)) != 3:
            continue

        face_key = tuple(sorted(face_indices))
        if face_key in seen_faces:
            continue

        seen_faces.add(face_key)
        faces.append([face_indices[0], face_indices[1], face_indices[2]])

    return faces


def _neighbor_analyzer_for_bond_algorithm(bond_algorithm: BondAlgorithm):
    if bond_algorithm == "crystal-nn":
        return CrystalNN()
    if bond_algorithm == "minimum-distance":
        return MinimumDistanceNN()
    if bond_algorithm == "voronoi-nn":
        return VoronoiNN()

    raise UnsupportedBondAlgorithmError(f"Unsupported bond algorithm '{bond_algorithm}'.")


def _combined_visibility_dependency_groups(
    left: _AtomRecord,
    right: _AtomRecord,
) -> list[frozenset[VisibilityDependency]]:
    left_groups = _record_visibility_dependency_groups(left)
    right_groups = _record_visibility_dependency_groups(right)

    return _minimal_visibility_dependency_groups(
        frozenset(left_group | right_group)
        for left_group, right_group in product(left_groups, right_groups)
    )


def _combined_visibility_dependency_groups_for_records(
    records: list[_AtomRecord],
) -> list[frozenset[VisibilityDependency]]:
    dependency_groups = [frozenset()]
    for record in records:
        dependency_groups = _minimal_visibility_dependency_groups(
            frozenset(left_group | right_group)
            for left_group, right_group in product(
                dependency_groups,
                _record_visibility_dependency_groups(record),
            )
        )

    return dependency_groups


def _record_visibility_dependency_groups(
    record: _AtomRecord,
) -> list[frozenset[VisibilityDependency]]:
    if not record.visibility_dependency_groups:
        return [frozenset()]

    return record.visibility_dependency_groups


def _minimal_visibility_dependency_groups(
    dependency_groups: Iterable[frozenset[VisibilityDependency]],
) -> list[frozenset[VisibilityDependency]]:
    minimal_groups: list[frozenset[VisibilityDependency]] = []
    for dependency_group in dependency_groups:
        if any(group.issubset(dependency_group) for group in minimal_groups):
            continue

        minimal_groups = [group for group in minimal_groups if not dependency_group.issubset(group)]
        minimal_groups.append(dependency_group)

    return minimal_groups


def _merge_bond_visibility_dependency_group(
    record: _BondRecord,
    dependency_group: frozenset[VisibilityDependency],
) -> None:
    if not dependency_group:
        return

    record.visibility_dependency_groups = _minimal_visibility_dependency_groups(
        [*record.visibility_dependency_groups, dependency_group]
    )
    record.visibility_dependencies = set().union(*record.visibility_dependency_groups)


def _normalize_image_offset(value: object) -> tuple[int, int, int]:
    image = tuple(value)  # type: ignore[arg-type]
    return (int(round(float(image[0]))), int(round(float(image[1]))), int(round(float(image[2]))))


def _add_image_offsets(
    left: tuple[int, int, int],
    right: tuple[int, int, int],
) -> tuple[int, int, int]:
    return (left[0] + right[0], left[1] + right[1], left[2] + right[2])


def _ordered_image_reasons(image_reasons: set[ImageReason]) -> list[ImageReason]:
    return [reason for reason in _IMAGE_REASON_ORDER if reason in image_reasons]


def _ordered_visibility_dependencies(
    dependencies: set[VisibilityDependency],
) -> list[VisibilityDependency]:
    return [dependency for dependency in _VISIBILITY_DEPENDENCY_ORDER if dependency in dependencies]


def _ordered_visibility_dependency_groups(
    dependency_groups: list[frozenset[VisibilityDependency]],
) -> list[list[VisibilityDependency]]:
    return [
        _ordered_visibility_dependencies(set(dependency_group))
        for dependency_group in dependency_groups
    ]


def _atom_record_fractional_position(atom: _AtomRecord) -> list[float]:
    return [
        atom.site.fractional_position[axis] + atom.image_offset[axis] for axis in range(3)
    ]


def _atom_record_cartesian_position(
    atom: _AtomRecord,
    cell_vectors: list[list[float]],
) -> list[float]:
    return _fractional_to_cartesian(_atom_record_fractional_position(atom), cell_vectors)


def _canonicalize_fractional_position(
    fractional_position: Sequence[float],
) -> tuple[list[float], tuple[int, ...]]:
    canonical_position: list[float] = []
    boundary_axes: list[int] = []

    for axis, value in enumerate(fractional_position):
        wrapped_value = float(value) % 1.0
        if math.isclose(wrapped_value, 0.0, abs_tol=_BOUNDARY_TOLERANCE) or math.isclose(
            wrapped_value, 1.0, abs_tol=_BOUNDARY_TOLERANCE
        ):
            canonical_position.append(0.0)
            boundary_axes.append(axis)
            continue

        canonical_position.append(wrapped_value)

    return canonical_position, tuple(boundary_axes)


def _periodic_image_offsets(boundary_axes: tuple[int, ...]) -> list[tuple[int, int, int]]:
    if not boundary_axes:
        return [_CANONICAL_IMAGE_OFFSET]

    image_offsets: list[tuple[int, int, int]] = []
    for choices in product((0, 1), repeat=len(boundary_axes)):
        image_offset = [0, 0, 0]
        for axis, choice in zip(boundary_axes, choices, strict=True):
            image_offset[axis] = choice
        image_offsets.append((image_offset[0], image_offset[1], image_offset[2]))

    return image_offsets


def _fractional_to_cartesian(
    fractional_position: Sequence[float],
    cell_vectors: Sequence[Sequence[float]],
) -> list[float]:
    return [
        _clean_float(
            sum(fractional_position[axis] * cell_vectors[axis][component] for axis in range(3))
        )
        for component in range(3)
    ]


def _build_structure_summary(structure: Structure) -> StructureSummarySpec:
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
        "symmetry": _build_symmetry_summary(structure),
    }


def _build_symmetry_summary(structure: Structure) -> SymmetrySummarySpec:
    if not _has_valid_3d_periodic_cell(structure):
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


def _has_valid_3d_periodic_cell(structure: Structure) -> bool:
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
