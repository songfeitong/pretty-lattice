from __future__ import annotations

import json
import math
from importlib.resources import files
from typing import Literal, NotRequired, TypedDict, cast

BondAlgorithm = Literal["crystal-nn", "minimum-distance", "cut-off-dict"]
ImageReason = Literal["boundary", "bonded"]
VisibilityDependency = Literal["boundaryAtoms", "oneHopBondedAtoms"]

_SCENE_CONTRACT = json.loads(files(__package__).joinpath("scene_contract.json").read_text())

MEDIUM_STRUCTURE_ATOM_COUNT = int(_SCENE_CONTRACT["structureSizeTiers"]["mediumFromAtomCount"])
LARGE_STRUCTURE_ATOM_COUNT = int(_SCENE_CONTRACT["structureSizeTiers"]["largeFromAtomCount"])
DEFAULT_BOND_ALGORITHM = cast(BondAlgorithm, _SCENE_CONTRACT["defaultBondAlgorithm"])
LARGE_STRUCTURE_BOND_ALGORITHM = cast(BondAlgorithm, _SCENE_CONTRACT["largeStructureBondAlgorithm"])
BOND_ALGORITHM_LABELS: dict[BondAlgorithm, str] = {
    cast(BondAlgorithm, entry["value"]): str(entry["pythonLabel"])
    for entry in _SCENE_CONTRACT["bondAlgorithms"]
}
BOND_ALGORITHM_ALIASES: dict[str, BondAlgorithm] = {
    alias: cast(BondAlgorithm, value)
    for alias, value in _SCENE_CONTRACT["bondAlgorithmAliases"].items()
}


class UnsupportedBondAlgorithmError(ValueError):
    """Raised when a requested preview bond algorithm is not allowlisted."""


class InvalidBondCutoffOverridesError(ValueError):
    """Raised when custom family cutoff overrides are malformed or unknown."""


class CustomBondRecalculationError(RuntimeError):
    """Raised when a custom bonding recomputation cannot be completed atomically."""


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
    siteIndex: int
    element: str
    position: list[float]
    fractionalPosition: list[float]
    imageOffset: list[int]
    isPeriodicImage: bool
    imageReasons: list[ImageReason]
    visibilityDependencies: list[VisibilityDependency]
    visibilityDependencyGroups: list[list[VisibilityDependency]]


class BondSpec(TypedDict):
    id: str
    relationId: str
    familyKey: str
    startSiteId: str
    startImageOffset: list[int]
    endSiteId: str
    endImageOffset: list[int]
    relativeImageOffset: list[int]
    length: float
    startAtomIndex: int
    endAtomIndex: int
    visibilityDependencies: list[VisibilityDependency]
    visibilityDependencyGroups: list[list[VisibilityDependency]]


class PolyhedronSpec(TypedDict):
    centerAtomIndex: int
    hullAtomIndices: list[int]
    faces: list[list[int]]
    visibilityDependencies: list[VisibilityDependency]
    visibilityDependencyGroups: list[list[VisibilityDependency]]


class BondFamilySpec(TypedDict):
    key: str
    elements: list[str]
    minLength: float | None
    maxLength: float | None


class AnalysisWarningSpec(TypedDict):
    code: str
    message: str


class SceneSpec(TypedDict):
    cell: CellSpec
    atoms: list[AtomSpec]
    bonds: list[BondSpec]
    bondFamilies: list[BondFamilySpec]
    polyhedra: list[PolyhedronSpec]
    summary: StructureSummarySpec
    connectivity: Literal["deferred", "ready"]
    bondAlgorithm: BondAlgorithm
    warnings: NotRequired[list[AnalysisWarningSpec]]


def normalize_bond_algorithm(value: str | None) -> BondAlgorithm | None:
    if value is None or value == "":
        return None

    normalized = value.strip()
    if normalized in BOND_ALGORITHM_LABELS:
        return normalized  # type: ignore[return-value]
    if normalized in BOND_ALGORITHM_ALIASES:
        return BOND_ALGORITHM_ALIASES[normalized]

    supported = ", ".join(BOND_ALGORITHM_LABELS)
    raise UnsupportedBondAlgorithmError(
        f"Unsupported bond algorithm '{value}'. Supported algorithms: {supported}."
    )


def bond_algorithm_label(bond_algorithm: BondAlgorithm) -> str:
    return BOND_ALGORITHM_LABELS[bond_algorithm]


def default_bond_algorithm_for_atom_count(atom_count: int) -> BondAlgorithm:
    if atom_count < MEDIUM_STRUCTURE_ATOM_COUNT:
        return DEFAULT_BOND_ALGORITHM

    return LARGE_STRUCTURE_BOND_ALGORITHM


def classify_structure_size(atom_count: int) -> Literal["small", "medium", "large"]:
    if atom_count < MEDIUM_STRUCTURE_ATOM_COUNT:
        return "small"
    if atom_count < LARGE_STRUCTURE_ATOM_COUNT:
        return "medium"
    return "large"


def parse_bond_cutoff_overrides(value: str | None) -> dict[str, float]:
    if value is None or value == "":
        return {}

    try:
        payload = json.loads(value)
    except json.JSONDecodeError as exc:
        raise InvalidBondCutoffOverridesError(
            "Bond cutoff overrides must be a JSON object."
        ) from exc

    if not isinstance(payload, dict):
        raise InvalidBondCutoffOverridesError("Bond cutoff overrides must be a JSON object.")
    if len(payload) > 1_024:
        raise InvalidBondCutoffOverridesError("Bond cutoff overrides contain too many families.")

    overrides: dict[str, float] = {}
    for family_key, cutoff in payload.items():
        if not isinstance(family_key, str) or not family_key.strip():
            raise InvalidBondCutoffOverridesError("Each bond cutoff override needs a family key.")
        if isinstance(cutoff, bool) or not isinstance(cutoff, (int, float)):
            raise InvalidBondCutoffOverridesError(
                f"Bond cutoff for '{family_key}' must be a positive number."
            )
        numeric_cutoff = float(cutoff)
        if not math.isfinite(numeric_cutoff) or numeric_cutoff <= 0:
            raise InvalidBondCutoffOverridesError(
                f"Bond cutoff for '{family_key}' must be a positive number."
            )
        overrides[family_key.strip()] = numeric_cutoff

    return overrides
