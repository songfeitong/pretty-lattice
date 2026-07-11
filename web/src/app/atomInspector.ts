import type { AtomSpec, SceneSpec } from "../api/scene";

const DISPLAY_COORDINATE_DIGITS = 3;
const COPY_COORDINATE_DIGITS = 6;

export interface InspectedAtomInfo {
  atom: AtomSpec;
  canonicalAtom: AtomSpec;
}

export function inspectedAtomInfoForId(
  scene: SceneSpec | null,
  atomId: string | null,
): InspectedAtomInfo | null {
  if (!scene || !atomId) {
    return null;
  }

  const atom = scene.atoms.find((candidate) => candidate.id === atomId);
  if (!atom) {
    return null;
  }

  const canonicalAtom =
    scene.atoms.find(
      (candidate) => candidate.siteId === atom.siteId && !candidate.isPeriodicImage,
    ) ?? atom;

  return { atom, canonicalAtom };
}

export function formatAtomCoordinateForDisplay(values: [number, number, number]): string {
  return values.map((value) => formatFixedCoordinate(value, DISPLAY_COORDINATE_DIGITS)).join(", ");
}

export function formatAtomCoordinateForCopy(values: [number, number, number]): string {
  return values.map((value) => formatFixedCoordinate(value, COPY_COORDINATE_DIGITS)).join(", ");
}

export function formatCellOffset(values: [number, number, number]): string {
  return values.map(formatCellOffsetValue).join(", ");
}

export function atomSiteIndex(atom: AtomSpec): number | string {
  if (typeof atom.siteIndex === "number" && Number.isFinite(atom.siteIndex)) {
    return atom.siteIndex;
  }

  const match = atom.siteId.match(/-(\d+)$/);
  return match?.[1] ?? "-";
}

export function atomInspectorCopyText(info: InspectedAtomInfo): string {
  return [
    `Element: ${info.canonicalAtom.element}`,
    `Index: ${atomSiteIndex(info.canonicalAtom)}`,
    `Fractional: ${formatAtomCoordinateForCopy(info.atom.fractionalPosition)}`,
    `Cartesian\u2009(Å): ${formatAtomCoordinateForCopy(info.atom.position)}`,
    `Cell offset: ${formatCellOffset(info.atom.imageOffset)}`,
  ].join("\n");
}

function formatFixedCoordinate(value: number, digits: number): string {
  const normalizedValue = Object.is(value, -0) || Math.abs(value) < 10 ** -digits ? 0 : value;
  return normalizedValue.toFixed(digits);
}

function formatCellOffsetValue(value: number): string {
  return `${value}`;
}
