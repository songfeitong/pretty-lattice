import type { AtomSpec } from "../api/scene";

export type AtomLabelMode = "all" | "elements" | "atoms";
export type AtomLabelKind = "element" | "number";

export interface AtomLabelSettings {
  atomIds: string[];
  elements: Record<string, boolean>;
  enabled: boolean;
  kind: AtomLabelKind;
  mode: AtomLabelMode;
  size: number;
}

export interface AtomLabelSpec {
  atom: AtomSpec;
  label: string;
}

export const ATOM_LABEL_SIZE_MIN = 25;
export const ATOM_LABEL_SIZE_MAX = 150;

export const DEFAULT_ATOM_LABEL_SETTINGS: AtomLabelSettings = {
  atomIds: [],
  elements: {},
  enabled: false,
  kind: "element",
  mode: "all",
  size: 75,
};

export function createDefaultAtomLabelSettings(): AtomLabelSettings {
  return {
    ...DEFAULT_ATOM_LABEL_SETTINGS,
    atomIds: [],
    elements: {},
  };
}

export function atomLabelsForAtoms({
  atoms,
  kind = "element",
  mode,
  selectedAtomIds,
  selectedElements,
}: {
  atoms: readonly AtomSpec[];
  kind?: AtomLabelKind;
  mode: AtomLabelMode;
  selectedAtomIds: readonly string[];
  selectedElements: Record<string, boolean>;
}): AtomLabelSpec[] {
  const labelBySiteId =
    kind === "number"
      ? atomNumberLabelsBySiteId(atoms)
      : canonicalAtomLabelsBySiteId(atoms);
  return atoms
    .filter((atom) => atomLabelVisible(atom, mode, selectedAtomIds, selectedElements))
    .map((atom) => ({
      atom,
      label: labelBySiteId.get(atom.siteId) ?? fallbackAtomLabel(atom),
    }));
}

export function atomLabelForAtom(
  atom: AtomSpec,
  atoms: readonly AtomSpec[],
): string {
  const labelBySiteId = canonicalAtomLabelsBySiteId(atoms);
  return labelBySiteId.get(atom.siteId) ?? fallbackAtomLabel(atom);
}

export function atomNumberForAtom(
  atom: AtomSpec,
  atoms: readonly AtomSpec[],
): string {
  const labelBySiteId = atomNumberLabelsBySiteId(atoms);
  return labelBySiteId.get(atom.siteId) ?? `${atom.siteIndex + 1}`;
}

export function atomLabelOptionsForAtoms(atoms: readonly AtomSpec[]): {
  atomId: string;
  element: string;
  label: string;
}[] {
  const labelBySiteId = canonicalAtomLabelsBySiteId(atoms);
  return atoms
    .filter((atom) => !atom.isPeriodicImage)
    .slice()
    .sort((firstAtom, secondAtom) => firstAtom.siteIndex - secondAtom.siteIndex)
    .map((atom) => ({
      atomId: atom.id,
      element: atom.element,
      label: labelBySiteId.get(atom.siteId) ?? fallbackAtomLabel(atom),
    }));
}

export function atomLabelElementsForAtoms(atoms: readonly AtomSpec[]): string[] {
  return Array.from(
    new Set(
      atoms
        .filter((atom) => !atom.isPeriodicImage)
        .map((atom) => atom.element),
    ),
  ).sort((firstElement, secondElement) => firstElement.localeCompare(secondElement));
}

export function selectedAtomLabelSettingsForScene(
  settings: AtomLabelSettings,
  atoms: readonly AtomSpec[],
): AtomLabelSettings {
  const elements = atomLabelElementsForAtoms(atoms);
  const elementSet = new Set(elements);
  const nextElements = Object.fromEntries(
    elements.map((element) => [element, settings.elements[element] ?? true]),
  );
  const atomOptions = atomLabelOptionsForAtoms(atoms);
  const atomIdSet = new Set(atomOptions.map((option) => option.atomId));
  const selectedAtomIds = settings.atomIds.filter((atomId) => atomIdSet.has(atomId));
  const normalizedAtomIds =
    selectedAtomIds.length > 0 ? selectedAtomIds : atomOptions[0] ? [atomOptions[0].atomId] : [];

  return {
    ...settings,
    atomIds: normalizedAtomIds,
    elements: Object.fromEntries(
      Object.entries(nextElements).filter(([element]) => elementSet.has(element)),
    ),
  };
}

function atomLabelVisible(
  atom: AtomSpec,
  mode: AtomLabelMode,
  selectedAtomIds: readonly string[],
  selectedElements: Record<string, boolean>,
): boolean {
  if (mode === "all") {
    return true;
  }

  if (mode === "elements") {
    return selectedElements[atom.element] !== false;
  }

  return selectedAtomIds.includes(atom.id);
}

function canonicalAtomLabelsBySiteId(atoms: readonly AtomSpec[]): Map<string, string> {
  const canonicalAtoms = atoms
    .filter((atom) => !atom.isPeriodicImage)
    .slice()
    .sort((firstAtom, secondAtom) => firstAtom.siteIndex - secondAtom.siteIndex);
  const elementCounts = new Map<string, number>();
  const labelBySiteId = new Map<string, string>();

  for (const atom of canonicalAtoms) {
    const nextCount = (elementCounts.get(atom.element) ?? 0) + 1;
    elementCounts.set(atom.element, nextCount);
    labelBySiteId.set(atom.siteId, `${atom.element}${nextCount}`);
  }

  return labelBySiteId;
}

function atomNumberLabelsBySiteId(atoms: readonly AtomSpec[]): Map<string, string> {
  const canonicalAtoms = atoms
    .filter((atom) => !atom.isPeriodicImage)
    .slice()
    .sort((firstAtom, secondAtom) => firstAtom.siteIndex - secondAtom.siteIndex);
  const labelBySiteId = new Map<string, string>();

  canonicalAtoms.forEach((atom, index) => {
    labelBySiteId.set(atom.siteId, `${index + 1}`);
  });

  return labelBySiteId;
}

function fallbackAtomLabel(atom: AtomSpec): string {
  return `${atom.element}${atom.siteIndex + 1}`;
}
