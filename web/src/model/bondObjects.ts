import type {
  AtomSpec,
  BondAlgorithm,
  BondFamilySpec,
  BondSpec,
  SceneSpec,
} from "../api/scene";

export const CUSTOM_BONDING_MODE = "custom";
export type BondingMode = BondAlgorithm | typeof CUSTOM_BONDING_MODE;

export interface CustomBondingProfile {
  baseAlgorithm: BondAlgorithm;
  cutoffOverrides: Record<string, number>;
}

export interface BondVisibilityOverrides {
  hiddenFamilies: ReadonlySet<string>;
  hiddenBondInstances: ReadonlySet<string>;
  hiddenBondFamilyByInstance: ReadonlyMap<string, string>;
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
    hiddenBondInstances: new Set<string>(),
    hiddenBondFamilyByInstance: new Map<string, string>(),
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
    !overrides.hiddenBondInstances.has(bond.id)
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

export function setBondInstanceVisible(
  overrides: BondVisibilityOverrides,
  bond: BondSpec,
  visible: boolean,
): BondVisibilityOverrides {
  const hiddenBondInstances = new Set(overrides.hiddenBondInstances);
  const hiddenBondFamilyByInstance = new Map(
    overrides.hiddenBondFamilyByInstance,
  );
  if (visible) {
    hiddenBondInstances.delete(bond.id);
    hiddenBondFamilyByInstance.delete(bond.id);
  } else {
    hiddenBondInstances.add(bond.id);
    hiddenBondFamilyByInstance.set(bond.id, bond.familyKey);
  }
  return { ...overrides, hiddenBondFamilyByInstance, hiddenBondInstances };
}

export function resetBondFamilyVisibility(
  overrides: BondVisibilityOverrides,
  familyKey: string,
  bonds: readonly BondSpec[],
): BondVisibilityOverrides {
  const hiddenFamilies = new Set(overrides.hiddenFamilies);
  hiddenFamilies.delete(familyKey);
  const familyBondIds = new Set(
    bonds.filter((bond) => bond.familyKey === familyKey).map((bond) => bond.id),
  );
  for (const [bondId, hiddenFamilyKey] of overrides.hiddenBondFamilyByInstance) {
    if (hiddenFamilyKey === familyKey) {
      familyBondIds.add(bondId);
    }
  }
  const hiddenBondInstances = new Set(
    [...overrides.hiddenBondInstances].filter(
      (bondId) => !familyBondIds.has(bondId),
    ),
  );
  const hiddenBondFamilyByInstance = new Map(
    [...overrides.hiddenBondFamilyByInstance].filter(
      ([bondId]) => !familyBondIds.has(bondId),
    ),
  );
  return {
    hiddenFamilies,
    hiddenBondFamilyByInstance,
    hiddenBondInstances,
  };
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

export function bondFamilyHasVisibilityOverride(
  overrides: BondVisibilityOverrides,
  familyKey: string,
  bonds: readonly BondSpec[],
): boolean {
  if (overrides.hiddenFamilies.has(familyKey)) {
    return true;
  }
  if (
    [...overrides.hiddenBondFamilyByInstance.values()].some(
      (hiddenFamilyKey) => hiddenFamilyKey === familyKey,
    )
  ) {
    return true;
  }
  return bonds.some(
    (bond) =>
      bond.familyKey === familyKey && overrides.hiddenBondInstances.has(bond.id),
  );
}

export function atomSiteLabel(atom: AtomSpec): string {
  return `${atom.element}:${atom.siteIndex}`;
}

export function formatBondLengthForDisplay(length: number): string {
  return `${length.toFixed(3)} Å`;
}

export function formatBondFamilyLength(family: BondFamilySpec): string {
  if (family.minLength === null || family.maxLength === null) {
    return "—";
  }
  const minimum = formatCompactLength(family.minLength);
  const maximum = formatCompactLength(family.maxLength);
  return minimum === maximum ? minimum : `${minimum}–${maximum}`;
}

export function formatCellOffset(offset: readonly number[]): string {
  return offset.join(", ");
}

export function bondInspectorCopyText(info: InspectedBondInfo): string {
  return [
    `Bond: ${atomSiteLabel(info.startAtom)} -- ${atomSiteLabel(info.endAtom)}`,
    `Length (A): ${info.bond.length.toFixed(6)}`,
    `Start cell: ${formatCellOffset(info.bond.startImageOffset)}`,
    `End cell: ${formatCellOffset(info.bond.endImageOffset)}`,
  ].join("\n");
}

function formatCompactLength(length: number): string {
  return length.toFixed(3).replace(/\.?0+$/, "");
}
