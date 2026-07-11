from __future__ import annotations

import json
from importlib.resources import files

MIB = 1024 * 1024

_SCENE_CONTRACT = json.loads(files(__package__).joinpath("scene_contract.json").read_text())
MAX_STRUCTURE_UPLOAD_BYTES = int(_SCENE_CONTRACT["previewLimits"]["maxUploadBytes"])
MAX_STRUCTURE_ATOMS = 25_600
MAX_SCENE_ATOMS = 64_000
MAX_SCENE_BONDS = 256_000
MAX_SCENE_POLYHEDRA = 25_600
MAX_CUSTOM_BOND_SEARCH_CANDIDATES = MAX_SCENE_BONDS * 4
MAX_ESTIMATED_SCENE_BYTES = 80 * MIB

# Conservative estimates cover the repeated identifiers and visibility metadata in SceneSpec.
ESTIMATED_SCENE_FIXED_BYTES = 2 * 1024
ESTIMATED_BYTES_PER_SCENE_ATOM = 512
ESTIMATED_BYTES_PER_SCENE_BOND = 192
ESTIMATED_BYTES_PER_SCENE_POLYHEDRON = 1024

STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview."


class PreviewLimitExceeded(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message

    def __str__(self) -> str:
        return self.message


def enforce_structure_atom_limit(atom_count: int) -> None:
    if atom_count > MAX_STRUCTURE_ATOMS:
        raise PreviewLimitExceeded(
            code="structure-too-many-atoms",
            message=(
                f"Structure contains {atom_count:,} atoms; preview limit is "
                f"{MAX_STRUCTURE_ATOMS:,}."
            ),
        )


def enforce_scene_atom_limit(atom_count: int) -> None:
    _enforce_generated_count(
        count=atom_count,
        limit=MAX_SCENE_ATOMS,
        kind="atoms",
        code="scene-too-many-atoms",
    )


def enforce_scene_bond_limit(bond_count: int) -> None:
    _enforce_generated_count(
        count=bond_count,
        limit=MAX_SCENE_BONDS,
        kind="bonds",
        code="scene-too-many-bonds",
    )


def enforce_scene_polyhedron_limit(polyhedron_count: int) -> None:
    _enforce_generated_count(
        count=polyhedron_count,
        limit=MAX_SCENE_POLYHEDRA,
        kind="polyhedra",
        code="scene-too-many-polyhedra",
    )


def enforce_custom_bond_search_cost(candidate_count: int) -> None:
    if candidate_count > MAX_CUSTOM_BOND_SEARCH_CANDIDATES:
        raise PreviewLimitExceeded(
            code="bond-cutoff-search-too-expensive",
            message=(
                "Custom bond cutoffs would require an overly expensive periodic "
                "neighbor search; reduce the maximum length or the structure size."
            ),
        )


def estimated_scene_bytes(
    *,
    atom_count: int,
    bond_count: int,
    polyhedron_count: int,
) -> int:
    return (
        ESTIMATED_SCENE_FIXED_BYTES
        + atom_count * ESTIMATED_BYTES_PER_SCENE_ATOM
        + bond_count * ESTIMATED_BYTES_PER_SCENE_BOND
        + polyhedron_count * ESTIMATED_BYTES_PER_SCENE_POLYHEDRON
    )


def enforce_scene_limits(
    *,
    atom_count: int,
    bond_count: int,
    polyhedron_count: int,
) -> None:
    enforce_scene_atom_limit(atom_count)
    enforce_scene_bond_limit(bond_count)
    enforce_scene_polyhedron_limit(polyhedron_count)
    estimated_bytes = estimated_scene_bytes(
        atom_count=atom_count,
        bond_count=bond_count,
        polyhedron_count=polyhedron_count,
    )
    if estimated_bytes > MAX_ESTIMATED_SCENE_BYTES:
        raise PreviewLimitExceeded(
            code="scene-response-too-large",
            message=(
                "Generated scene is estimated to exceed the "
                f"{MAX_ESTIMATED_SCENE_BYTES // MIB} MiB preview response limit."
            ),
        )


def _enforce_generated_count(*, count: int, limit: int, kind: str, code: str) -> None:
    if count > limit:
        raise PreviewLimitExceeded(
            code=code,
            message=f"Generated scene contains more than {limit:,} {kind}; preview limit exceeded.",
        )
