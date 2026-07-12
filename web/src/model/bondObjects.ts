import type {
  AtomSpec,
  BondAlgorithm,
  BondCutoffRange,
  BondFamilySpec,
  BondSpec,
  SceneSpec,
} from "../api/scene";

export const CUSTOM_BONDING_MODE = "custom";
export type BondingMode = BondAlgorithm | typeof CUSTOM_BONDING_MODE;

export interface CustomBondingProfile {
  baseAlgorithm: BondAlgorithm;
  cutoffOverrides: Record<string, BondCutoffRange>;
}

export interface BondVisibilityOverrides {
  hiddenFamilies: ReadonlySet<string>;
  hiddenBondRelations: ReadonlySet<string>;
}

export interface InspectedBondInfo {
  bond: BondSpec;
  family: BondFamilySpec;
  startAtom: AtomSpec;
  endAtom: AtomSpec;
}

export function createDefaultBondVisibilityOverrides(): BondVisibilityOverrides {
  return {
    hiddenFamilies: new Set<string>(),
    hiddenBondRelations: new Set<string>(),
  };
}

export function isBondVisible(
  bond: BondSpec,
  overrides: BondVisibilityOverrides,
  globallyVisible = true,
): boolean {
  return (
    globallyVisible &&
    !overrides.hiddenFamilies.has(bond.familyKey) &&
    !overrides.hiddenBondRelations.has(bond.relationId)
  );
}

export function setBondFamilyVisible(
  overrides: BondVisibilityOverrides,
  familyKey: string,
  visible: boolean,
): BondVisibilityOverrides {
  const hiddenFamilies = new Set(overrides.hiddenFamilies);
  if (visible) {
    hiddenFamilies.delete(familyKey);
  } else {
    hiddenFamilies.add(familyKey);
  }
  return { ...overrides, hiddenFamilies };
}

export function setBondRelationVisible(
  overrides: BondVisibilityOverrides,
  bond: BondSpec,
  visible: boolean,
): BondVisibilityOverrides {
  const hiddenBondRelations = new Set(overrides.hiddenBondRelations);
  if (visible) {
    hiddenBondRelations.delete(bond.relationId);
  } else {
    hiddenBondRelations.add(bond.relationId);
  }
  return { ...overrides, hiddenBondRelations };
}

export function inspectedBondInfoForId(
  scene: SceneSpec | null,
  bondId: string | null,
): InspectedBondInfo | null {
  if (!scene || !bondId) {
    return null;
  }
  const bond = scene.bonds.find((candidate) => candidate.id === bondId);
  if (!bond) {
    return null;
  }
  const startAtom = scene.atoms[bond.startAtomIndex];
  const endAtom = scene.atoms[bond.endAtomIndex];
  const family = scene.bondFamilies.find(
    (candidate) => candidate.key === bond.familyKey,
  );
  if (!startAtom || !endAtom || !family) {
    return null;
  }
  return { bond, endAtom, family, startAtom };
}

export function atomSiteLabel(atom: AtomSpec): string {
  return `${atom.element}:${atom.siteIndex}`;
}

export function formatBondLengthForDisplay(length: number): string {
  return `${length.toFixed(3)} Å`;
}

export function formatBondVector(
  info: InspectedBondInfo,
  digits: number,
): string {
  return info.endAtom.fractionalPosition
    .map((value, index) => value - info.startAtom.fractionalPosition[index]!)
    .map((value) => {
      const normalizedValue = Math.abs(value) < 10 ** -digits ? 0 : value;
      return normalizedValue.toFixed(digits);
    })
    .join(", ");
}

export function formatBondFamilyLength(family: BondFamilySpec): string {
  if (family.minLength === null || family.maxLength === null) {
    return "—";
  }
  const minimum = formatBondListLength(family.minLength);
  const maximum = formatBondListLength(family.maxLength);
  return family.minLength === family.maxLength
    ? minimum
    : `${minimum}–${maximum}`;
}

export function formatCellOffset(offset: readonly number[]): string {
  return offset.join(", ");
}

export function bondInspectorCopyText(info: InspectedBondInfo): string {
  return [
    `Bond: ${atomSiteLabel(info.startAtom)} -- ${atomSiteLabel(info.endAtom)}`,
    `Bond length (A): ${info.bond.length.toFixed(6)}`,
    `Vector\u2009(frac): ${formatBondVector(info, 6)}`,
    `Cell offset: (${formatCellOffset(info.bond.startImageOffset)}) - (${formatCellOffset(info.bond.endImageOffset)})`,
  ].join("\n");
}

function formatBondListLength(length: number): string {
  return length.toFixed(2);
}
