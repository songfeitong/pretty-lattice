from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable

from pymatgen.core import Structure
from scipy.spatial import Delaunay, QhullError

from pretty_lattice.structures.connectivity import ConnectedAtom, ConnectivityResult
from pretty_lattice.structures.periodic_images import (
    AtomKey,
    AtomRecord,
    atom_record_cartesian_position,
    site_specie,
)
from pretty_lattice.structures.preview_limits import (
    MAX_SCENE_POLYHEDRA,
    enforce_scene_polyhedron_limit,
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

        if len(polyhedra) >= MAX_SCENE_POLYHEDRA:
            enforce_scene_polyhedron_limit(MAX_SCENE_POLYHEDRA + 1)

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

    return _merge_coplanar_hull_faces(positions, hull_faces)


def _merge_coplanar_hull_faces(
    positions: list[list[float]], hull_faces: Iterable[Iterable[int]]
) -> list[list[int]]:
    hull_centroid = _centroid(positions)
    face_groups: dict[tuple[float, float, float, float], set[int]] = defaultdict(set)

    for face in hull_faces:
        face_indices = tuple(int(index) for index in face)
        if len(set(face_indices)) != 3:
            continue

        face_positions = [positions[index] for index in face_indices]
        plane_key = _canonical_plane_key(face_positions)
        if plane_key is None:
            continue

        face_groups[plane_key].update(face_indices)

    faces: list[list[int]] = []
    seen_faces: set[tuple[int, int, int]] = set()
    for plane_key, face_vertex_indices in face_groups.items():
        vertex_indices = sorted(face_vertex_indices)
        if len(vertex_indices) < 3:
            continue

        normal = list(plane_key[:3])
        ordered_indices = _ordered_coplanar_vertex_indices(
            positions,
            normal=normal,
            vertex_indices=vertex_indices,
        )
        if len(ordered_indices) < 3:
            continue

        anchor = ordered_indices[0]
        for index in range(1, len(ordered_indices) - 1):
            face_indices = _outward_oriented_face(
                [anchor, ordered_indices[index], ordered_indices[index + 1]],
                hull_centroid=hull_centroid,
                positions=positions,
            )
            face_key = tuple(sorted(face_indices))
            if face_key in seen_faces:
                continue

            seen_faces.add(face_key)
            faces.append(face_indices)

    return faces


def _canonical_plane_key(
    positions: list[list[float]],
) -> tuple[float, float, float, float] | None:
    normal = _cross(
        _subtract(positions[1], positions[0]),
        _subtract(positions[2], positions[0]),
    )
    normal_length = _norm(normal)
    if math.isclose(normal_length, 0.0, abs_tol=1e-10):
        return None

    normal = [coordinate / normal_length for coordinate in normal]
    plane_offset = -_dot(normal, positions[0])
    for coordinate in (*normal, plane_offset):
        if not math.isclose(coordinate, 0.0, abs_tol=1e-8):
            if coordinate < 0:
                normal = [-value for value in normal]
                plane_offset = -plane_offset
            break

    return (
        round(normal[0], 8),
        round(normal[1], 8),
        round(normal[2], 8),
        round(plane_offset, 8),
    )


def _ordered_coplanar_vertex_indices(
    positions: list[list[float]],
    *,
    normal: list[float],
    vertex_indices: list[int],
) -> list[int]:
    projected_vertices = _projected_coplanar_vertices(
        positions,
        normal=normal,
        vertex_indices=vertex_indices,
    )
    ordered_indices = _projected_convex_hull_indices(projected_vertices)
    if len(ordered_indices) < 3:
        return []

    minimum_index = min(
        range(len(ordered_indices)),
        key=lambda index: _position_key(positions[ordered_indices[index]]),
    )
    return ordered_indices[minimum_index:] + ordered_indices[:minimum_index]


def _projected_coplanar_vertices(
    positions: list[list[float]],
    *,
    normal: list[float],
    vertex_indices: list[int],
) -> list[tuple[float, float, int]]:
    dropped_axis = max(range(3), key=lambda axis: abs(normal[axis]))
    projected_axes = [axis for axis in range(3) if axis != dropped_axis]
    unique_vertices: dict[tuple[float, float, float], tuple[float, float, int]] = {}

    for index in vertex_indices:
        position = positions[index]
        unique_vertices.setdefault(
            _position_key(position),
            (position[projected_axes[0]], position[projected_axes[1]], index),
        )

    return sorted(unique_vertices.values(), key=lambda vertex: (vertex[0], vertex[1]))


def _projected_convex_hull_indices(
    projected_vertices: list[tuple[float, float, int]],
) -> list[int]:
    if len(projected_vertices) <= 1:
        return [vertex[2] for vertex in projected_vertices]

    lower: list[tuple[float, float, int]] = []
    for vertex in projected_vertices:
        while len(lower) >= 2 and _projected_cross(lower[-2], lower[-1], vertex) <= 1e-10:
            lower.pop()
        lower.append(vertex)

    upper: list[tuple[float, float, int]] = []
    for vertex in reversed(projected_vertices):
        while len(upper) >= 2 and _projected_cross(upper[-2], upper[-1], vertex) <= 1e-10:
            upper.pop()
        upper.append(vertex)

    return [vertex[2] for vertex in [*lower[:-1], *upper[:-1]]]


def _projected_cross(
    origin: tuple[float, float, int],
    middle: tuple[float, float, int],
    end: tuple[float, float, int],
) -> float:
    return (middle[0] - origin[0]) * (end[1] - origin[1]) - (
        middle[1] - origin[1]
    ) * (end[0] - origin[0])


def _outward_oriented_face(
    face_indices: list[int],
    *,
    hull_centroid: list[float],
    positions: list[list[float]],
) -> list[int]:
    face_positions = [positions[index] for index in face_indices]
    normal = _cross(
        _subtract(face_positions[1], face_positions[0]),
        _subtract(face_positions[2], face_positions[0]),
    )
    face_centroid = _centroid(face_positions)
    if _dot(normal, _subtract(face_centroid, hull_centroid)) < 0:
        return [face_indices[0], face_indices[2], face_indices[1]]

    return face_indices


def _centroid(positions: list[list[float]]) -> list[float]:
    return [
        sum(position[axis] for position in positions) / len(positions)
        for axis in range(3)
    ]


def _position_key(position: list[float]) -> tuple[float, float, float]:
    return (round(position[0], 8), round(position[1], 8), round(position[2], 8))


def _subtract(left: list[float], right: list[float]) -> list[float]:
    return [left[axis] - right[axis] for axis in range(3)]


def _dot(left: list[float], right: list[float]) -> float:
    return sum(left[axis] * right[axis] for axis in range(3))


def _cross(left: list[float], right: list[float]) -> list[float]:
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ]


def _norm(vector: list[float]) -> float:
    return math.sqrt(_dot(vector, vector))
