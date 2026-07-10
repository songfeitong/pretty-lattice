from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field
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
    ensure_atom_record,
    normalize_image_offset,
    site_element_symbol,
    subtract_image_offsets,
)
from pretty_lattice.structures.schema import (
    BondAlgorithm,
    BondSpec,
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
) -> ConnectivityResult:
    neighbor_analyzer = _neighbor_analyzer_for_bond_algorithm(bond_algorithm)
    cutoff_neighbors_by_site = (
        _vesta_neighbor_records_by_site(structure)
        if bond_algorithm == "cut-off-dict"
        else None
    )
    analyzed_neighbors_by_site: dict[int, list[NeighborRecord]] = {}
    source_keys = [*canonical_source_keys, *boundary_source_keys]
    bond_records: dict[tuple[str, str], BondRecord] = {}
    connections_by_source: dict[AtomKey, list[ConnectedAtom]] = {
        source_key: [] for source_key in source_keys
    }

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

        for neighbor in neighbor_records:
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

    return ConnectivityResult(
        bonds=list(bond_records.values()),
        connections_by_source=connections_by_source,
    )


def build_bonds(
    *,
    atom_index_by_key: dict[AtomKey, int],
    connectivity: ConnectivityResult,
) -> list[BondSpec]:
    bonds: list[BondSpec] = []
    for bond in connectivity.bonds:
        start_atom_index = atom_index_by_key.get(bond.start_atom_key)
        end_atom_index = atom_index_by_key.get(bond.end_atom_key)
        if start_atom_index is None or end_atom_index is None:
            continue

        bonds.append(
            {
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


def _neighbor_records_for_site(
    *,
    neighbor_analyzer: _NeighborAnalyzer,
    site_index: int,
    structure: Structure,
) -> list[NeighborRecord]:
    return [
        NeighborRecord(
            site_index=int(neighbor["site_index"]),
            image=normalize_image_offset(
                neighbor.get("image", CANONICAL_IMAGE_OFFSET)
            ),
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
    accepted = distances < _VESTA_CUTOFF_CONFIG.cutoff_matrix[
        site_codes[center_indices], site_codes[target_indices]
    ]
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
