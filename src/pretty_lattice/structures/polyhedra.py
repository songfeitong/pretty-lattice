from __future__ import annotations

from pymatgen.core import Structure
from scipy.spatial import Delaunay, QhullError

from pretty_lattice.structures.connectivity import ConnectedAtom, ConnectivityResult
from pretty_lattice.structures.periodic_images import (
    AtomKey,
    AtomRecord,
    atom_record_cartesian_position,
    site_specie,
)
from pretty_lattice.structures.schema import PolyhedronSpec
from pretty_lattice.structures.visibility import (
    combined_visibility_dependency_groups_for_records,
    ordered_visibility_dependencies,
    ordered_visibility_dependency_groups,
)


def build_polyhedra(
    *,
    atom_index_by_key: dict[AtomKey, int],
    atom_records: dict[AtomKey, AtomRecord],
    cell_vectors: list[list[float]],
    connectivity: ConnectivityResult,
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
        hull_keys = [
            source_key,
            *(connected_atom.target_key for connected_atom, _ in drawn_connected_atoms),
        ]
        try:
            hull_atom_indices = [atom_index_by_key[key] for key in hull_keys]
        except KeyError:
            continue
        positions = [
            atom_record_cartesian_position(atom, cell_vectors) for atom in hull_atoms
        ]
        faces = _polyhedron_faces_from_positions(positions)
        if not faces:
            continue

        visibility_dependency_groups = [
            dependency_group
            for dependency_group in combined_visibility_dependency_groups_for_records(
                [atom.visibility_dependency_groups for atom in hull_atoms]
            )
            if dependency_group
        ]
        visibility_dependencies = (
            set().union(*visibility_dependency_groups)
            if visibility_dependency_groups
            else set()
        )
        polyhedra.append(
            {
                "centerAtomIndex": hull_atom_indices[0],
                "hullAtomIndices": hull_atom_indices,
                "faces": faces,
                "visibilityDependencies": ordered_visibility_dependencies(
                    visibility_dependencies
                ),
                "visibilityDependencyGroups": ordered_visibility_dependency_groups(
                    visibility_dependency_groups
                ),
            }
        )

    return polyhedra


def _drawn_connected_atoms(
    atom_records: dict[AtomKey, AtomRecord],
    connected_atoms: list[ConnectedAtom],
) -> tuple[list[tuple[ConnectedAtom, AtomRecord]], bool]:
    drawn_connected_atoms: list[tuple[ConnectedAtom, AtomRecord]] = []
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
    connected_atoms: list[tuple[ConnectedAtom, AtomRecord]],
) -> bool:
    center_specie = site_specie(structure[center_site_index])
    for connected_atom, _atom_record in connected_atoms:
        connected_specie = site_specie(structure[connected_atom.target_key[0]])
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
