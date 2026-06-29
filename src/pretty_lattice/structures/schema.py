from __future__ import annotations

from typing import Literal, NotRequired, TypedDict

BondAlgorithm = Literal["crystal-nn", "minimum-distance", "vesta"]
ImageReason = Literal["boundary", "bonded"]
VisibilityDependency = Literal["boundaryAtoms", "oneHopBondedAtoms"]

DEFAULT_BOND_ALGORITHM: BondAlgorithm = "vesta"
BOND_ALGORITHM_LABELS: dict[BondAlgorithm, str] = {
    "crystal-nn": "CrystalNN",
    "minimum-distance": "MinimumDistanceNN",
    "vesta": "VESTA",
}


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


def normalize_bond_algorithm(value: str | None) -> BondAlgorithm | None:
    if value is None or value == "":
        return None

    normalized = value.strip()
    if normalized in BOND_ALGORITHM_LABELS:
        return normalized  # type: ignore[return-value]

    supported = ", ".join(BOND_ALGORITHM_LABELS)
    raise UnsupportedBondAlgorithmError(
        f"Unsupported bond algorithm '{value}'. Supported algorithms: {supported}."
    )


def bond_algorithm_label(bond_algorithm: BondAlgorithm) -> str:
    return BOND_ALGORITHM_LABELS[bond_algorithm]
