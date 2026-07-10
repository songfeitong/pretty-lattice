from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass, field
from itertools import product

from pymatgen.core import Structure
from pymatgen.core.sites import PeriodicSite

from pretty_lattice.structures.preview_limits import (
    MAX_SCENE_ATOMS,
    enforce_scene_atom_limit,
)
from pretty_lattice.structures.schema import AtomSpec, ImageReason, VisibilityDependency
from pretty_lattice.structures.visibility import (
    ordered_image_reasons,
    ordered_visibility_dependencies,
    ordered_visibility_dependency_groups,
)

BOUNDARY_TOLERANCE = 1e-6
CANONICAL_IMAGE_OFFSET = (0, 0, 0)
FLOAT_ZERO_TOLERANCE = 1e-12
type AtomKey = tuple[int, tuple[int, int, int]]


@dataclass(frozen=True)
class SceneSite:
    index: int
    site_id: str
    element_symbol: str
    fractional_position: list[float]
    canonical_image_offset: tuple[int, int, int]


@dataclass
class AtomRecord:
    site: SceneSite
    image_offset: tuple[int, int, int]
    image_reasons: set[ImageReason] = field(default_factory=set)
    visibility_dependencies: set[VisibilityDependency] = field(default_factory=set)
    visibility_dependency_groups: list[frozenset[VisibilityDependency]] = field(
        default_factory=list
    )


@dataclass(frozen=True)
class AtomRecords:
    sites: list[SceneSite]
    atom_records: dict[AtomKey, AtomRecord]
    canonical_source_keys: list[AtomKey]


def build_atom_records(
    structure: Structure,
    *,
    can_generate_periodic_images: bool,
) -> AtomRecords:
    sites: list[SceneSite] = []
    atom_records: dict[AtomKey, AtomRecord] = {}
    canonical_source_keys: list[AtomKey] = []

    for index, site in enumerate(structure):
        symbol = normalize_element_symbol(site_element_symbol(site))
        fractional_position = vector3(site.frac_coords)
        site_id = f"{symbol}-{index}"
        canonical_fractional_position = fractional_position
        canonical_image_offset = CANONICAL_IMAGE_OFFSET
        boundary_axes: tuple[int, ...] = ()

        if can_generate_periodic_images:
            (
                canonical_fractional_position,
                canonical_image_offset,
                boundary_axes,
            ) = canonicalize_fractional_position(fractional_position)

        site_data = SceneSite(
            index=index,
            site_id=site_id,
            element_symbol=symbol,
            fractional_position=canonical_fractional_position,
            canonical_image_offset=canonical_image_offset,
        )
        sites.append(site_data)

        if can_generate_periodic_images:
            for image_offset in periodic_image_offsets(boundary_axes):
                image_reasons: tuple[ImageReason, ...] = ()
                visibility_dependencies: tuple[VisibilityDependency, ...] = ()
                if image_offset != CANONICAL_IMAGE_OFFSET:
                    image_reasons = ("boundary",)
                    visibility_dependencies = ("boundaryAtoms",)

                ensure_atom_record(
                    atom_records,
                    image_offset=image_offset,
                    image_reasons=image_reasons,
                    site=site_data,
                    visibility_dependencies=visibility_dependencies,
                )
                if image_offset == CANONICAL_IMAGE_OFFSET:
                    canonical_source_keys.append((index, image_offset))
            continue

        ensure_atom_record(
            atom_records,
            image_offset=CANONICAL_IMAGE_OFFSET,
            image_reasons=(),
            site=site_data,
            visibility_dependencies=(),
        )
        canonical_source_keys.append((index, CANONICAL_IMAGE_OFFSET))

    return AtomRecords(
        sites=sites,
        atom_records=atom_records,
        canonical_source_keys=canonical_source_keys,
    )


def ensure_atom_record(
    records: dict[AtomKey, AtomRecord],
    *,
    image_offset: tuple[int, int, int],
    image_reasons: Sequence[ImageReason],
    site: SceneSite,
    visibility_dependencies: Sequence[VisibilityDependency],
) -> AtomRecord:
    key = (site.index, image_offset)
    record = records.get(key)
    if record is None:
        if len(records) >= MAX_SCENE_ATOMS:
            enforce_scene_atom_limit(MAX_SCENE_ATOMS + 1)
        record = AtomRecord(site=site, image_offset=image_offset)
        records[key] = record

    record.image_reasons.update(image_reasons)
    merge_atom_visibility_dependencies(record, visibility_dependencies)
    return record


def merge_atom_visibility_dependencies(
    record: AtomRecord,
    visibility_dependencies: Sequence[VisibilityDependency],
) -> None:
    new_dependencies = frozenset(visibility_dependencies)
    if not new_dependencies:
        return

    record.visibility_dependencies.update(new_dependencies)
    if new_dependencies not in record.visibility_dependency_groups:
        record.visibility_dependency_groups.append(new_dependencies)


def atom_record_to_spec(
    atom: AtomRecord,
    cell_vectors: list[list[float]],
) -> AtomSpec:
    shifted_fractional_position = atom_record_fractional_position(atom)
    return {
        "id": atom_instance_id(atom.site.site_id, atom.image_offset),
        "siteId": atom.site.site_id,
        "siteIndex": atom.site.index,
        "element": atom.site.element_symbol,
        "position": atom_record_cartesian_position(atom, cell_vectors),
        "fractionalPosition": shifted_fractional_position,
        "imageOffset": [int(value) for value in atom.image_offset],
        "isPeriodicImage": atom.image_offset != CANONICAL_IMAGE_OFFSET,
        "imageReasons": ordered_image_reasons(atom.image_reasons),
        "visibilityDependencies": ordered_visibility_dependencies(atom.visibility_dependencies),
        "visibilityDependencyGroups": ordered_visibility_dependency_groups(
            atom.visibility_dependency_groups
        ),
    }


def atom_instance_id(site_id: str, image_offset: tuple[int, int, int]) -> str:
    if image_offset == CANONICAL_IMAGE_OFFSET:
        return site_id
    return f"{site_id}-image-{image_offset[0]}-{image_offset[1]}-{image_offset[2]}"


def atom_record_fractional_position(atom: AtomRecord) -> list[float]:
    return [
        atom.site.fractional_position[axis] + atom.image_offset[axis] for axis in range(3)
    ]


def atom_record_cartesian_position(
    atom: AtomRecord,
    cell_vectors: list[list[float]],
) -> list[float]:
    return fractional_to_cartesian(atom_record_fractional_position(atom), cell_vectors)


def vector3(values: Sequence[float]) -> list[float]:
    return [clean_float(values[0]), clean_float(values[1]), clean_float(values[2])]


def clean_float(value: float) -> float:
    cleaned = float(value)
    if math.isclose(cleaned, 0.0, abs_tol=FLOAT_ZERO_TOLERANCE):
        return 0.0
    return cleaned


def site_element_symbol(site: PeriodicSite) -> str:
    specie = site_specie(site)
    symbol = getattr(specie, "symbol", str(specie))
    return str(symbol)


def normalize_element_symbol(symbol: str) -> str:
    normalized = symbol.strip()
    if not normalized:
        raise ValueError("Element symbol cannot be empty.")
    return normalized[0].upper() + normalized[1:].lower()


def site_specie(site: PeriodicSite):
    try:
        return site.specie
    except AttributeError:
        return max(site.species.items(), key=lambda item: float(item[1]))[0]


def canonicalize_fractional_position(
    fractional_position: Sequence[float],
) -> tuple[list[float], tuple[int, int, int], tuple[int, ...]]:
    canonical_position: list[float] = []
    canonical_image_offset: list[int] = []
    boundary_axes: list[int] = []

    for axis, value in enumerate(fractional_position):
        wrapped_value = float(value) % 1.0
        if math.isclose(wrapped_value, 0.0, abs_tol=BOUNDARY_TOLERANCE) or math.isclose(
            wrapped_value, 1.0, abs_tol=BOUNDARY_TOLERANCE
        ):
            canonical_position.append(0.0)
            canonical_image_offset.append(int(round(float(value))))
            boundary_axes.append(axis)
            continue

        canonical_position.append(wrapped_value)
        canonical_image_offset.append(0)

    return (
        canonical_position,
        (
            canonical_image_offset[0],
            canonical_image_offset[1],
            canonical_image_offset[2],
        ),
        tuple(boundary_axes),
    )


def periodic_image_offsets(boundary_axes: tuple[int, ...]) -> list[tuple[int, int, int]]:
    if not boundary_axes:
        return [CANONICAL_IMAGE_OFFSET]

    image_offsets: list[tuple[int, int, int]] = []
    for choices in product((0, 1), repeat=len(boundary_axes)):
        image_offset = [0, 0, 0]
        for axis, choice in zip(boundary_axes, choices, strict=True):
            image_offset[axis] = choice
        image_offsets.append((image_offset[0], image_offset[1], image_offset[2]))

    return image_offsets


def fractional_to_cartesian(
    fractional_position: Sequence[float],
    cell_vectors: Sequence[Sequence[float]],
) -> list[float]:
    return [
        clean_float(
            sum(fractional_position[axis] * cell_vectors[axis][component] for axis in range(3))
        )
        for component in range(3)
    ]


def normalize_image_offset(value: object) -> tuple[int, int, int]:
    image = tuple(value)  # type: ignore[arg-type]
    return (int(round(float(image[0]))), int(round(float(image[1]))), int(round(float(image[2]))))


def add_image_offsets(
    left: tuple[int, int, int],
    right: tuple[int, int, int],
) -> tuple[int, int, int]:
    return (left[0] + right[0], left[1] + right[1], left[2] + right[2])


def subtract_image_offsets(
    left: tuple[int, int, int],
    right: tuple[int, int, int],
) -> tuple[int, int, int]:
    return (left[0] - right[0], left[1] - right[1], left[2] - right[2])
