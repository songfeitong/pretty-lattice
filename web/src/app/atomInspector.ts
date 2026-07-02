import type { AtomSpec, SceneSpec } from "../api/scene";
import { atomLabelForAtom } from "../model/atomLabels";

const DISPLAY_COORDINATE_DIGITS = 3;
const COPY_COORDINATE_DIGITS = 6;

export interface InspectedAtomInfo {
  atom: AtomSpec;
  canonicalAtom: AtomSpec;
  sceneAtoms: AtomSpec[];
}

export interface AtomMeasurementInfo {
  atoms: AtomSpec[];
  sceneAtoms: AtomSpec[];
  firstAtom: AtomSpec;
  secondAtom: AtomSpec | null;
  thirdAtom: AtomSpec | null;
  delta: [number, number, number] | null;
  distance: number | null;
  angleDegrees: number | null;
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

  return { atom, canonicalAtom, sceneAtoms: scene.atoms };
}

export function atomMeasurementInfoForIds(
  scene: SceneSpec | null,
  atomIds: readonly string[],
): AtomMeasurementInfo | null {
  if (!scene || atomIds.length === 0) {
    return null;
  }

  const selectedAtomIds = new Set(atomIds);
  const atoms = scene.atoms.filter((atom) => selectedAtomIds.has(atom.id));
  const firstAtom = atoms[0];
  if (!firstAtom) {
    return null;
  }

  const hasMeasurement = atoms.length === 2 || atoms.length === 3;
  const secondAtom = hasMeasurement ? atoms[1] ?? null : null;
  const thirdAtom = hasMeasurement ? atoms[2] ?? null : null;
  if (!secondAtom) {
    return {
      atoms,
      sceneAtoms: scene.atoms,
      firstAtom,
      secondAtom: null,
      thirdAtom: null,
      delta: null,
      distance: null,
      angleDegrees: null,
    };
  }

  const delta = vectorDelta(firstAtom.position, secondAtom.position);
  const angleDegrees =
    thirdAtom ? angleDegreesForPoints(firstAtom.position, secondAtom.position, thirdAtom.position) : null;
  return {
    atoms,
    sceneAtoms: scene.atoms,
    firstAtom,
    secondAtom,
    thirdAtom,
    delta,
    distance: vectorLength(delta),
    angleDegrees,
  };
}

export function formatAtomCoordinateForDisplay(values: [number, number, number]): string {
  return values.map((value) => formatFixedCoordinate(value, DISPLAY_COORDINATE_DIGITS)).join(", ");
}

export function formatAtomDistanceForDisplay(value: number): string {
  return formatFixedCoordinate(value, DISPLAY_COORDINATE_DIGITS);
}

export function formatAtomAngleForDisplay(value: number): string {
  return formatFixedCoordinate(value, DISPLAY_COORDINATE_DIGITS);
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
    `Label: ${atomLabelForAtom(info.canonicalAtom, info.sceneAtoms)}`,
    `Element: ${info.canonicalAtom.element}`,
    `Index: ${atomSiteIndex(info.canonicalAtom)}`,
    `Fractional: ${formatAtomCoordinateForCopy(info.canonicalAtom.fractionalPosition)}`,
    `Cartesian (A): ${formatAtomCoordinateForCopy(info.canonicalAtom.position)}`,
    `Cell offset: ${formatCellOffset(info.atom.imageOffset)}`,
  ].join("\n");
}

function formatFixedCoordinate(value: number, digits: number): string {
  const normalizedValue = Object.is(value, -0) || Math.abs(value) < 10 ** -digits ? 0 : value;
  return normalizedValue.toFixed(digits);
}

function vectorDelta(
  firstPosition: [number, number, number],
  secondPosition: [number, number, number],
): [number, number, number] {
  return [
    secondPosition[0] - firstPosition[0],
    secondPosition[1] - firstPosition[1],
    secondPosition[2] - firstPosition[2],
  ];
}

function vectorLength(vector: [number, number, number]): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function angleDegreesForPoints(
  firstPosition: [number, number, number],
  vertexPosition: [number, number, number],
  thirdPosition: [number, number, number],
): number | null {
  const firstVector = vectorDelta(vertexPosition, firstPosition);
  const thirdVector = vectorDelta(vertexPosition, thirdPosition);
  const firstLength = vectorLength(firstVector);
  const thirdLength = vectorLength(thirdVector);
  if (firstLength === 0 || thirdLength === 0) {
    return null;
  }

  const dot =
    firstVector[0] * thirdVector[0] +
    firstVector[1] * thirdVector[1] +
    firstVector[2] * thirdVector[2];
  const cosine = Math.min(1, Math.max(-1, dot / (firstLength * thirdLength)));
  return (Math.acos(cosine) * 180) / Math.PI;
}

function formatCellOffsetValue(value: number): string {
  return `${value}`;
}
