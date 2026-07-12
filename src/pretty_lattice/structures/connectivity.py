from __future__ import annotations

import math
from collections.abc import Mapping
from dataclasses import dataclass, field
from itertools import chain, product
from types import MappingProxyType

import numpy as np
from pymatgen.core import Structure
from pymatgen.core.local_env import CrystalNN, CutOffDictNN, MinimumDistanceNN

from pretty_lattice.structures.periodic_images import (
    CANONICAL_IMAGE_OFFSET,
    AtomKey,
    AtomRecord,
    SceneSite,
    add_image_offsets,
    atom_instance_id,
    atom_record_cartesian_position,
    ensure_atom_record,
    normalize_image_offset,
    site_element_symbol,
    subtract_image_offsets,
)
from pretty_lattice.structures.preview_limits import (
    MAX_CUSTOM_BOND_SEARCH_CANDIDATES,
    MAX_SCENE_BONDS,
    enforce_custom_bond_search_cost,
    enforce_scene_bond_limit,
)
from pretty_lattice.structures.schema import (
    BondAlgorithm,
    BondCutoffRange,
    BondFamilySpec,
    BondSpec,
    InvalidBondCutoffOverridesError,
    UnsupportedBondAlgorithmError,
    VisibilityDependency,
)
from pretty_lattice.structures.visibility import (
    combined_visibility_dependency_groups,
    minimal_visibility_dependency_groups,
    ordered_visibility_dependencies,
    ordered_visibility_dependency_groups,
)


@dataclass
class BondRecord:
    start_atom_key: AtomKey
    end_atom_key: AtomKey
    visibility_dependencies: set[VisibilityDependency] = field(default_factory=set)
    visibility_dependency_groups: list[frozenset[VisibilityDependency]] = field(
        default_factory=list
    )


@dataclass(frozen=True)
class ConnectedAtom:
    source_key: AtomKey
    target_key: AtomKey
    source_atom_id: str
    target_atom_id: str


@dataclass(frozen=True)
class ConnectivityResult:
    bonds: list[BondRecord]
    connections_by_source: dict[AtomKey, list[ConnectedAtom]]
    element_order: dict[str, int] = field(default_factory=dict)
    family_elements: dict[str, tuple[str, str]] = field(default_factory=dict)
    family_order: list[str] = field(default_factory=list)


@dataclass(frozen=True, slots=True)
class NeighborRecord:
    site_index: int
    image: tuple[int, int, int]


@dataclass(frozen=True)
class _CutoffConfig:
    max_distance: float
    symbol_codes: Mapping[str, int]
    unknown_symbol_code: int
    cutoff_matrix: np.ndarray


def _load_vesta_cutoff_config() -> _CutoffConfig:
    analyzer = CutOffDictNN.from_preset("vesta_2019")
    symbols = sorted(
        set(analyzer._lookup_dict).union(
            symbol
            for cutoffs_by_symbol in analyzer._lookup_dict.values()
            for symbol in cutoffs_by_symbol
        )
    )
    symbol_codes = MappingProxyType({symbol: index for index, symbol in enumerate(symbols)})
    unknown_symbol_code = len(symbols)
    values = np.zeros((len(symbols) + 1, len(symbols) + 1), dtype=float)
    for source_symbol, cutoffs_by_symbol in analyzer._lookup_dict.items():
        source_code = symbol_codes[source_symbol]
        for target_symbol, cutoff in cutoffs_by_symbol.items():
            values[source_code, symbol_codes[target_symbol]] = cutoff

    immutable_values = np.frombuffer(values.tobytes(), dtype=values.dtype).reshape(values.shape)
    return _CutoffConfig(
        max_distance=float(analyzer._max_dist),
        symbol_codes=symbol_codes,
        unknown_symbol_code=unknown_symbol_code,
        cutoff_matrix=immutable_values,
    )


_VESTA_CUTOFF_CONFIG = _load_vesta_cutoff_config()
type _NeighborAnalyzer = CrystalNN | MinimumDistanceNN


def build_connectivity(
    *,
    atom_records: dict[AtomKey, AtomRecord],
    bond_algorithm: BondAlgorithm,
    canonical_source_keys: list[AtomKey],
    boundary_source_keys: list[AtomKey],
    sites: list[SceneSite],
    structure: Structure,
    cutoff_overrides: Mapping[str, BondCutoffRange] | None = None,
) -> ConnectivityResult:
    element_order = _element_order_for_sites(sites)
    normalized_cutoff_overrides, override_family_elements = _normalize_cutoff_overrides(
        cutoff_overrides or {},
        element_order=element_order,
    )
    neighbor_analyzer = _neighbor_analyzer_for_bond_algorithm(bond_algorithm)
    cutoff_neighbors_by_site = (
        _vesta_neighbor_records_by_site(structure) if bond_algorithm == "cut-off-dict" else None
    )
    analyzed_neighbors_by_site: dict[int, list[NeighborRecord]] = {}
    override_neighbors_by_site = (
        _cutoff_override_neighbor_records_by_site(
            structure,
            sites=sites,
            cutoff_overrides=normalized_cutoff_overrides,
            element_order=element_order,
        )
        if normalized_cutoff_overrides
        else [[] for _ in structure]
    )
    source_keys = [*canonical_source_keys, *boundary_source_keys]
    bond_records: dict[tuple[str, str], BondRecord] = {}
    connections_by_source: dict[AtomKey, list[ConnectedAtom]] = {
        source_key: [] for source_key in source_keys
    }
    family_elements = dict(override_family_elements)
    base_family_keys: set[str] = set()

    for source_site_index, source_image_offset in source_keys:
        source_key = (source_site_index, source_image_offset)
        source_site = sites[source_site_index]
        source_atom_id = atom_instance_id(source_site.site_id, source_image_offset)
        source_is_boundary_image = source_image_offset != CANONICAL_IMAGE_OFFSET

        if cutoff_neighbors_by_site is not None:
            neighbor_records = cutoff_neighbors_by_site[source_site_index]
        else:
            neighbor_records = analyzed_neighbors_by_site.get(source_site_index)
            if neighbor_records is None:
                if neighbor_analyzer is None:
                    raise RuntimeError("Neighbor analyzer is unavailable.")
                neighbor_records = _neighbor_records_for_site(
                    neighbor_analyzer=neighbor_analyzer,
                    site_index=source_site_index,
                    structure=structure,
                )
                analyzed_neighbors_by_site[source_site_index] = neighbor_records

        for base_neighbor in neighbor_records:
            base_family_key, _base_family_pair = bond_family_for_elements(
                source_site.element_symbol,
                sites[base_neighbor.site_index].element_symbol,
                element_order=element_order,
            )
            base_family_keys.add(base_family_key)

        effective_neighbor_records = _effective_neighbor_records(
            base_neighbors=neighbor_records,
            override_neighbors=override_neighbors_by_site[source_site_index],
            source_site=source_site,
            sites=sites,
            cutoff_overrides=normalized_cutoff_overrides,
            element_order=element_order,
        )
        seen_target_keys: set[AtomKey] = set()
        for neighbor in effective_neighbor_records:
            target_site_index = neighbor.site_index
            target_site = sites[target_site_index]
            target_image_offset = add_image_offsets(
                add_image_offsets(
                    source_image_offset,
                    neighbor.image,
                ),
                subtract_image_offsets(
                    target_site.canonical_image_offset,
                    source_site.canonical_image_offset,
                ),
            )
            target_atom_id = atom_instance_id(target_site.site_id, target_image_offset)
            if target_atom_id == source_atom_id:
                continue
            target_key = (target_site_index, target_image_offset)
            if target_key in seen_target_keys:
                continue
            seen_target_keys.add(target_key)

            family_key, family_pair = bond_family_for_elements(
                source_site.element_symbol,
                target_site.element_symbol,
                element_order=element_order,
            )
            family_elements[family_key] = family_pair

            if target_image_offset != CANONICAL_IMAGE_OFFSET:
                visibility_dependencies: tuple[VisibilityDependency, ...] = (
                    ("boundaryAtoms", "oneHopBondedAtoms")
                    if source_is_boundary_image
                    else ("oneHopBondedAtoms",)
                )
                ensure_atom_record(
                    atom_records,
                    image_offset=target_image_offset,
                    image_reasons=("bonded",),
                    site=target_site,
                    visibility_dependencies=visibility_dependencies,
                )

            connections_by_source[source_key].append(
                ConnectedAtom(
                    source_key=source_key,
                    target_key=target_key,
                    source_atom_id=source_atom_id,
                    target_atom_id=target_atom_id,
                )
            )

            endpoint_key = tuple(sorted((source_atom_id, target_atom_id)))
            bond_record = bond_records.get(endpoint_key)
            if bond_record is None:
                if len(bond_records) >= MAX_SCENE_BONDS:
                    enforce_scene_bond_limit(MAX_SCENE_BONDS + 1)
                bond_record = BondRecord(
                    start_atom_key=source_key,
                    end_atom_key=target_key,
                )
                bond_records[endpoint_key] = bond_record

            source_atom = atom_records[(source_site_index, source_image_offset)]
            target_atom = atom_records[target_key]
            for dependency_group in combined_visibility_dependency_groups(
                source_atom.visibility_dependency_groups,
                target_atom.visibility_dependency_groups,
            ):
                _merge_bond_visibility_dependency_group(bond_record, dependency_group)

    new_family_keys = normalized_cutoff_overrides.keys() - base_family_keys
    if new_family_keys:
        family_key = sorted(new_family_keys)[0]
        raise InvalidBondCutoffOverridesError(
            f"Bond family '{family_key}' does not exist in the base connectivity."
        )

    return ConnectivityResult(
        bonds=list(bond_records.values()),
        connections_by_source=connections_by_source,
        element_order=element_order,
        family_elements=family_elements,
        family_order=sorted(
            family_elements,
            key=lambda key: _family_sort_key(family_elements[key], element_order),
        ),
    )


def build_bonds(
    *,
    atom_index_by_key: dict[AtomKey, int],
    atom_records: dict[AtomKey, AtomRecord],
    cell_vectors: list[list[float]],
    connectivity: ConnectivityResult,
) -> list[BondSpec]:
    bonds: list[BondSpec] = []
    for bond in connectivity.bonds:
        start_atom = atom_records.get(bond.start_atom_key)
        end_atom = atom_records.get(bond.end_atom_key)
        if start_atom is None or end_atom is None:
            continue
        start_atom, end_atom = _canonical_bond_endpoints(
            start_atom,
            end_atom,
            element_order=connectivity.element_order,
        )
        start_key = (start_atom.site.index, start_atom.image_offset)
        end_key = (end_atom.site.index, end_atom.image_offset)
        start_atom_index = atom_index_by_key.get(start_key)
        end_atom_index = atom_index_by_key.get(end_key)
        if start_atom_index is None or end_atom_index is None:
            continue

        start_offset = start_atom.image_offset
        end_offset = end_atom.image_offset
        relative_offset = subtract_image_offsets(end_offset, start_offset)
        family_key, _family_pair = bond_family_for_elements(
            start_atom.site.element_symbol,
            end_atom.site.element_symbol,
            element_order=connectivity.element_order,
        )
        start_position = atom_record_cartesian_position(start_atom, cell_vectors)
        end_position = atom_record_cartesian_position(end_atom, cell_vectors)
        length = float(np.linalg.norm(np.subtract(end_position, start_position)))

        bonds.append(
            {
                "id": bond_instance_id(start_atom, end_atom),
                "relationId": bond_relation_id(
                    start_atom.site.site_id,
                    end_atom.site.site_id,
                    relative_offset,
                ),
                "familyKey": family_key,
                "startSiteId": start_atom.site.site_id,
                "startImageOffset": list(start_offset),
                "endSiteId": end_atom.site.site_id,
                "endImageOffset": list(end_offset),
                "relativeImageOffset": list(relative_offset),
                "length": length,
                "startAtomIndex": start_atom_index,
                "endAtomIndex": end_atom_index,
                "visibilityDependencies": ordered_visibility_dependencies(
                    bond.visibility_dependencies
                ),
                "visibilityDependencyGroups": ordered_visibility_dependency_groups(
                    bond.visibility_dependency_groups
                ),
            }
        )

    return bonds


def build_bond_families(
    connectivity: ConnectivityResult,
    bonds: list[BondSpec],
) -> list[BondFamilySpec]:
    lengths_by_family: dict[str, list[float]] = {
        family_key: [] for family_key in connectivity.family_order
    }
    for bond in bonds:
        lengths_by_family.setdefault(bond["familyKey"], []).append(bond["length"])

    return [
        {
            "key": family_key,
            "elements": list(connectivity.family_elements[family_key]),
            "minLength": min(lengths) if lengths else None,
            "maxLength": max(lengths) if lengths else None,
        }
        for family_key in connectivity.family_order
        for lengths in [lengths_by_family.get(family_key, [])]
    ]


def bond_family_for_elements(
    left: str,
    right: str,
    *,
    element_order: Mapping[str, int],
) -> tuple[str, tuple[str, str]]:
    pair = tuple(
        sorted(
            (left, right),
            key=lambda element: (element_order.get(element, len(element_order)), element),
        )
    )
    family_pair = (pair[0], pair[1])
    return f"{family_pair[0]}|{family_pair[1]}", family_pair


def bond_instance_id(start_atom: AtomRecord, end_atom: AtomRecord) -> str:
    return "bond:" + "--".join(
        (
            _atom_endpoint_id(start_atom.site.site_id, start_atom.image_offset),
            _atom_endpoint_id(end_atom.site.site_id, end_atom.image_offset),
        )
    )


def bond_relation_id(
    start_site_id: str,
    end_site_id: str,
    relative_offset: tuple[int, int, int],
) -> str:
    return (
        f"bond-relation:{start_site_id}--{end_site_id}@"
        f"{relative_offset[0]},{relative_offset[1]},{relative_offset[2]}"
    )


def _atom_endpoint_id(site_id: str, image_offset: tuple[int, int, int]) -> str:
    return f"{site_id}@{image_offset[0]},{image_offset[1]},{image_offset[2]}"


def _canonical_bond_endpoints(
    start_atom: AtomRecord,
    end_atom: AtomRecord,
    *,
    element_order: Mapping[str, int],
) -> tuple[AtomRecord, AtomRecord]:
    def endpoint_key(atom: AtomRecord) -> tuple[int, int, tuple[int, int, int]]:
        return (
            element_order[atom.site.element_symbol],
            atom.site.index,
            atom.image_offset,
        )

    if endpoint_key(start_atom) <= endpoint_key(end_atom):
        return start_atom, end_atom
    return end_atom, start_atom


def _effective_neighbor_records(
    *,
    base_neighbors: list[NeighborRecord],
    override_neighbors: list[NeighborRecord],
    source_site: SceneSite,
    sites: list[SceneSite],
    cutoff_overrides: Mapping[str, BondCutoffRange],
    element_order: Mapping[str, int],
) -> list[NeighborRecord]:
    inherited = [
        neighbor
        for neighbor in base_neighbors
        if bond_family_for_elements(
            source_site.element_symbol,
            sites[neighbor.site_index].element_symbol,
            element_order=element_order,
        )[0]
        not in cutoff_overrides
    ]
    return [*inherited, *override_neighbors]


def _cutoff_override_neighbor_records_by_site(
    structure: Structure,
    *,
    sites: list[SceneSite],
    cutoff_overrides: Mapping[str, BondCutoffRange],
    element_order: Mapping[str, int],
) -> list[list[NeighborRecord]]:
    max_distance = max(cutoff_range["max"] for cutoff_range in cutoff_overrides.values())
    _enforce_custom_neighbor_search_cost(structure, max_distance)
    center_indices, target_indices, images, distances = structure.get_neighbor_list(max_distance)
    enforce_custom_bond_search_cost(len(center_indices))
    accepted_images = np.rint(images).astype(np.int64)
    neighbors_by_site: list[list[NeighborRecord]] = [[] for _ in structure]

    for center_index, target_index, image, distance in zip(
        center_indices,
        target_indices,
        accepted_images,
        distances,
        strict=True,
    ):
        family_key, _family_pair = bond_family_for_elements(
            sites[int(center_index)].element_symbol,
            sites[int(target_index)].element_symbol,
            element_order=element_order,
        )
        cutoff_range = cutoff_overrides.get(family_key)
        numeric_distance = float(distance)
        if (
            cutoff_range is None
            or numeric_distance < cutoff_range["min"] - 1e-10
            or numeric_distance > cutoff_range["max"] + 1e-10
        ):
            continue
        neighbors_by_site[int(center_index)].append(
            NeighborRecord(
                site_index=int(target_index),
                image=(int(image[0]), int(image[1]), int(image[2])),
            )
        )

    return neighbors_by_site


def _enforce_custom_neighbor_search_cost(
    structure: Structure,
    max_distance: float,
) -> None:
    candidate_count = _custom_neighbor_candidate_count(structure, max_distance)
    enforce_custom_bond_search_cost(candidate_count)


def _custom_neighbor_candidate_count(
    structure: Structure,
    max_distance: float,
) -> int:
    atom_count = len(structure)
    search_distance = max_distance + 1e-8
    reciprocal_lengths = structure.lattice.reciprocal_lattice_crystallographic.abc
    max_images = tuple(
        math.ceil(search_distance * float(reciprocal_length))
        for reciprocal_length in reciprocal_lengths
    )
    image_count = math.prod(2 * maximum + 1 for maximum in max_images)
    # Bound the preflight itself before enumerating periodic targets.
    enforce_custom_bond_search_cost(atom_count * image_count)

    positions = [tuple(float(value) for value in position) for position in structure.cart_coords]
    center_bins: dict[tuple[int, int, int], list[int]] = {}
    for index, position in enumerate(positions):
        center_bins.setdefault(_neighbor_bin(position, search_distance), []).append(index)

    squared_distance = search_distance**2
    candidate_count = 0
    image_ranges = tuple(range(-maximum, maximum + 1) for maximum in max_images)
    image_offsets = product(*image_ranges)
    # Dense clusters fail quickly without first walking through empty translated cells.
    ordered_image_offsets = chain(
        ((0, 0, 0),),
        (offset for offset in image_offsets if offset != (0, 0, 0)),
    )
    for image_offset in ordered_image_offsets:
        translation = tuple(
            float(value) for value in np.dot(np.asarray(image_offset), structure.lattice.matrix)
        )
        for target_index, position in enumerate(positions):
            target = (
                position[0] + translation[0],
                position[1] + translation[1],
                position[2] + translation[2],
            )
            target_bin = _neighbor_bin(target, search_distance)
            for delta in product((-1, 0, 1), repeat=3):
                neighbor_bin = (
                    target_bin[0] + delta[0],
                    target_bin[1] + delta[1],
                    target_bin[2] + delta[2],
                )
                for center_index in center_bins.get(neighbor_bin, ()):
                    if image_offset == (0, 0, 0) and center_index == target_index:
                        continue
                    center = positions[center_index]
                    if (center[0] - target[0]) ** 2 + (center[1] - target[1]) ** 2 + (
                        center[2] - target[2]
                    ) ** 2 <= squared_distance:
                        candidate_count += 1
                        if candidate_count > MAX_CUSTOM_BOND_SEARCH_CANDIDATES:
                            enforce_custom_bond_search_cost(candidate_count)

    return candidate_count


def _neighbor_bin(
    position: tuple[float, float, float],
    bin_size: float,
) -> tuple[int, int, int]:
    return (
        math.floor(position[0] / bin_size),
        math.floor(position[1] / bin_size),
        math.floor(position[2] / bin_size),
    )


def _normalize_cutoff_overrides(
    cutoff_overrides: Mapping[str, BondCutoffRange],
    *,
    element_order: Mapping[str, int],
) -> tuple[dict[str, BondCutoffRange], dict[str, tuple[str, str]]]:
    normalized: dict[str, BondCutoffRange] = {}
    family_elements: dict[str, tuple[str, str]] = {}
    for supplied_key, cutoff_range in cutoff_overrides.items():
        elements = supplied_key.split("|")
        if len(elements) != 2 or any(element not in element_order for element in elements):
            raise InvalidBondCutoffOverridesError(f"Unknown bond family '{supplied_key}'.")
        family_key, family_pair = bond_family_for_elements(
            elements[0],
            elements[1],
            element_order=element_order,
        )
        minimum = float(cutoff_range["min"])
        maximum = float(cutoff_range["max"])
        if (
            not math.isfinite(minimum)
            or not math.isfinite(maximum)
            or minimum < 0
            or maximum <= minimum
        ):
            raise InvalidBondCutoffOverridesError(
                f"Bond cutoff for '{supplied_key}' must satisfy 0 <= min < max."
            )
        normalized[family_key] = {"min": minimum, "max": maximum}
        family_elements[family_key] = family_pair
    return normalized, family_elements


def _element_order_for_sites(sites: list[SceneSite]) -> dict[str, int]:
    order: dict[str, int] = {}
    for site in sorted(sites, key=lambda candidate: candidate.index):
        order.setdefault(site.element_symbol, len(order))
    return order


def _family_sort_key(
    family: tuple[str, str],
    element_order: Mapping[str, int],
) -> tuple[int, int, str, str]:
    return (
        element_order.get(family[0], len(element_order)),
        element_order.get(family[1], len(element_order)),
        family[0],
        family[1],
    )


def _neighbor_records_for_site(
    *,
    neighbor_analyzer: _NeighborAnalyzer,
    site_index: int,
    structure: Structure,
) -> list[NeighborRecord]:
    return [
        NeighborRecord(
            site_index=int(neighbor["site_index"]),
            image=normalize_image_offset(neighbor.get("image", CANONICAL_IMAGE_OFFSET)),
        )
        for neighbor in neighbor_analyzer.get_nn_info(structure, site_index)
    ]


def _vesta_neighbor_records_by_site(structure: Structure) -> list[list[NeighborRecord]]:
    center_indices, target_indices, images, distances = structure.get_neighbor_list(
        _VESTA_CUTOFF_CONFIG.max_distance
    )
    site_codes = np.fromiter(
        (
            _VESTA_CUTOFF_CONFIG.symbol_codes.get(
                site_element_symbol(site),
                _VESTA_CUTOFF_CONFIG.unknown_symbol_code,
            )
            for site in structure
        ),
        dtype=np.intp,
        count=len(structure),
    )
    accepted = (
        distances
        < _VESTA_CUTOFF_CONFIG.cutoff_matrix[site_codes[center_indices], site_codes[target_indices]]
    )
    accepted_images = np.rint(images[accepted]).astype(np.int64)

    neighbors_by_site: list[list[NeighborRecord]] = [[] for _ in structure]
    for center_index, target_index, image in zip(
        center_indices[accepted],
        target_indices[accepted],
        accepted_images,
        strict=True,
    ):
        neighbors_by_site[int(center_index)].append(
            NeighborRecord(
                site_index=int(target_index),
                image=(int(image[0]), int(image[1]), int(image[2])),
            )
        )
    return neighbors_by_site


def _neighbor_analyzer_for_bond_algorithm(
    bond_algorithm: BondAlgorithm,
) -> _NeighborAnalyzer | None:
    if bond_algorithm == "crystal-nn":
        return CrystalNN()
    if bond_algorithm == "minimum-distance":
        return MinimumDistanceNN()
    if bond_algorithm == "cut-off-dict":
        return None

    raise UnsupportedBondAlgorithmError(f"Unsupported bond algorithm '{bond_algorithm}'.")


def _merge_bond_visibility_dependency_group(
    record: BondRecord,
    dependency_group: frozenset[VisibilityDependency],
) -> None:
    if not dependency_group:
        return

    record.visibility_dependency_groups = minimal_visibility_dependency_groups(
        [*record.visibility_dependency_groups, dependency_group]
    )
    record.visibility_dependencies = set().union(*record.visibility_dependency_groups)
