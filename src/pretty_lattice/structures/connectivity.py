from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from pymatgen.core import Structure
from pymatgen.core.local_env import CrystalNN, CutOffDictNN, MinimumDistanceNN
from pymatgen.core.sites import PeriodicSite
from pymatgen.core.structure import PeriodicNeighbor

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
    neighbor_info_by_site = _neighbor_info_by_site_for_connectivity(
        bond_algorithm=bond_algorithm,
        neighbor_analyzer=neighbor_analyzer,
        structure=structure,
    )
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

        neighbor_info = (
            neighbor_info_by_site[source_site_index]
            if neighbor_info_by_site is not None
            else neighbor_analyzer.get_nn_info(structure, source_site_index)
        )
        for neighbor in neighbor_info:
            target_site_index = int(neighbor["site_index"])
            target_site = sites[target_site_index]
            target_image_offset = add_image_offsets(
                source_image_offset,
                normalize_image_offset(neighbor.get("image", CANONICAL_IMAGE_OFFSET)),
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


def _neighbor_info_by_site_for_connectivity(
    *,
    bond_algorithm: BondAlgorithm,
    neighbor_analyzer: object,
    structure: Structure,
) -> list[list[dict]] | None:
    if bond_algorithm == "vesta":
        return neighbor_analyzer.get_all_nn_info(structure)  # type: ignore[attr-defined]

    return None


def _neighbor_analyzer_for_bond_algorithm(bond_algorithm: BondAlgorithm):
    if bond_algorithm == "crystal-nn":
        return CrystalNN()
    if bond_algorithm == "minimum-distance":
        return MinimumDistanceNN()
    if bond_algorithm == "vesta":
        return _VestaCutOffDictNN.from_preset("vesta_2019")

    raise UnsupportedBondAlgorithmError(f"Unsupported bond algorithm '{bond_algorithm}'.")


class _VestaCutOffDictNN(CutOffDictNN):
    def get_all_nn_info(self, structure: Structure) -> list[list[dict]]:
        return [
            self._neighbor_info_for_site_neighbors(
                site=structure[site_index],
                neighbors=neighbors,
            )
            for site_index, neighbors in enumerate(structure.get_all_neighbors(self._max_dist))
        ]

    def get_nn_info(self, structure: Structure, n: int) -> list[dict]:
        return self._neighbor_info_for_site_neighbors(
            site=structure[n],
            neighbors=structure.get_neighbors(structure[n], self._max_dist),
        )

    def _neighbor_info_for_site_neighbors(
        self,
        *,
        site: PeriodicSite,
        neighbors: Iterable[PeriodicNeighbor],
    ) -> list[dict]:
        site_key = site_element_symbol(site)
        neighbor_info: list[dict] = []

        for neighbor in neighbors:
            distance = neighbor.nn_distance
            neighbor_key = site_element_symbol(neighbor)
            cutoff = self._lookup_dict.get(site_key, {}).get(neighbor_key, 0.0)
            if distance < cutoff:
                neighbor_info.append(
                    {
                        "site": neighbor,
                        "image": neighbor.image,
                        "weight": distance,
                        "site_index": neighbor.index,
                    }
                )

        return neighbor_info


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
