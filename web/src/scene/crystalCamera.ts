import { Matrix4, Quaternion, Vector3 } from "three";

import type {
  CrystalAxisLabel,
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  CrystalCameraState,
} from "../model/crystalCameraState";
import { withDefaultCellVectors, type StandardCameraPose, type VectorTuple } from "./viewMath";

export type {
  CrystalAxisLabel,
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  CrystalCameraState,
} from "../model/crystalCameraState";

export interface CrystalBasisVectors {
  direct: [Vector3, Vector3, Vector3];
  reciprocal: [Vector3, Vector3, Vector3];
}

export interface CrystalCameraPose {
  cameraPosition: VectorTuple;
  cameraUp: VectorTuple;
  distance: number;
  outward: VectorTuple;
  quaternion: Quaternion;
  target: VectorTuple;
  up: VectorTuple;
}

export interface CrystalCameraVectors {
  outward: Vector3;
  primary: Vector3;
  right: Vector3;
  secondary: Vector3;
  up: Vector3;
}

const EPSILON = 1e-10;
const CAMERA_TARGET = new Vector3(0, 0, 0);
const CAMERA_LOCAL_FORWARD = new Vector3(0, 0, 1);
const CAMERA_LOCAL_RIGHT = new Vector3(1, 0, 0);
const CAMERA_LOCAL_UP = new Vector3(0, 1, 0);
const DEFAULT_DIRECT: VectorTuple = [0, 0, 1];
const DEFAULT_RECIPROCAL: VectorTuple = [0, 1, 0];
const DEFAULT_SECONDARY_DIRECTION: Record<
  CrystalCameraScreenDirection,
  CrystalCameraScreenDirection
> = {
  outward: "upward",
  right: "outward",
  upward: "outward",
};
const SCREEN_DIRECTION_INDEX: Record<CrystalCameraScreenDirection, number> = {
  right: 0,
  upward: 1,
  outward: 2,
};
const FALLBACK_DIRECT_AXES: Record<CrystalAxisLabel, VectorTuple> = {
  a: [1, 0, 0],
  b: [0, 1, 0],
  c: [0, 0, 1],
};

export function createDefaultCrystalCameraState(): CrystalCameraState {
  return {
    direct: DEFAULT_DIRECT,
    primary: "outward",
    reciprocal: DEFAULT_RECIPROCAL,
    secondary: "upward",
    rollDegrees: 0,
  };
}

export function defaultSecondaryDirectionForPrimary(
  primary: CrystalCameraScreenDirection,
): CrystalCameraScreenDirection {
  return DEFAULT_SECONDARY_DIRECTION[primary];
}

export function secondaryDirectionForPrimaryChange(
  currentPrimary: CrystalCameraScreenDirection,
  currentSecondary: CrystalCameraScreenDirection,
  nextPrimary: CrystalCameraScreenDirection,
): CrystalCameraScreenDirection {
  if (currentSecondary !== nextPrimary) {
    return currentSecondary;
  }

  if (currentPrimary !== nextPrimary) {
    return currentPrimary;
  }

  return defaultSecondaryDirectionForPrimary(nextPrimary);
}

export function crystalAxisDirectCoefficients(axis: CrystalAxisLabel): VectorTuple {
  return FALLBACK_DIRECT_AXES[axis];
}

export function computeCrystalBasisVectors(vectors: VectorTuple[]): CrystalBasisVectors {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const a = vectorFromTuple(vectorA, new Vector3(1, 0, 0));
  const b = vectorFromTuple(vectorB, new Vector3(0, 1, 0));
  const c = vectorFromTuple(vectorC, new Vector3(0, 0, 1));
  const volume = a.dot(b.clone().cross(c));

  if (Math.abs(volume) < EPSILON) {
    return {
      direct: [a, b, c],
      reciprocal: [
        new Vector3(1, 0, 0),
        new Vector3(0, 1, 0),
        new Vector3(0, 0, 1),
      ],
    };
  }

  return {
    direct: [a, b, c],
    reciprocal: [
      b.clone().cross(c).divideScalar(volume),
      c.clone().cross(a).divideScalar(volume),
      a.clone().cross(b).divideScalar(volume),
    ],
  };
}

export function computeCrystalCameraPose(
  vectors: VectorTuple[],
  state: CrystalCameraState,
  span: number,
): CrystalCameraPose {
  const cameraVectors = computeCrystalCameraVectors(vectors, state);
  const distance = Math.max(4, span * 4);
  const cameraPosition = cameraVectors.outward.clone().multiplyScalar(distance);
  const quaternion = cameraQuaternionFromOutwardUp(cameraVectors.outward, cameraVectors.up);

  return {
    cameraPosition: vectorTuple(cameraPosition),
    cameraUp: vectorTuple(cameraVectors.up),
    distance,
    outward: vectorTuple(cameraVectors.outward),
    quaternion,
    target: vectorTuple(CAMERA_TARGET),
    up: vectorTuple(cameraVectors.up),
  };
}

export function computeDefaultCrystalCameraPose(
  vectors: VectorTuple[],
  span: number,
): StandardCameraPose {
  const pose = computeCrystalCameraPose(vectors, createDefaultCrystalCameraState(), span);

  return {
    cameraPosition: pose.cameraPosition,
    cameraUp: pose.cameraUp,
    distance: pose.distance,
    outward: pose.outward,
    target: pose.target,
  };
}

export function computeCrystalCameraVectors(
  vectors: VectorTuple[],
  state: CrystalCameraState,
): CrystalCameraVectors {
  const basis = computeCrystalBasisVectors(vectors);
  const direct = coefficientsToVector(state.direct, basis.direct, new Vector3(0, 0, 1)).normalize();
  const reciprocal = coefficientsToVector(
    state.reciprocal,
    basis.reciprocal,
    new Vector3(0, 1, 0),
  );
  const fallbackSecondary = vestaLikeSecondaryForPrimary(basis, direct);
  const secondary = projectPerpendicular(reciprocal, direct, fallbackSecondary);
  const screenFrame = completeScreenFrame(state.primary, direct, state.secondary, secondary);

  return {
    outward: screenFrame.outward,
    primary: direct,
    right: screenFrame.right,
    secondary,
    up: screenFrame.upward,
  };
}

export function applyCrystalCameraRoll(
  vectors: VectorTuple[],
  state: CrystalCameraState,
  rollDegrees: number,
): CrystalCameraState {
  const basis = computeCrystalBasisVectors(vectors);
  const primary = coefficientsToVector(state.direct, basis.direct, new Vector3(0, 0, 1)).normalize();
  const anchor = vestaLikeSecondaryForPrimary(basis, primary);
  const rollAnchorDirection = defaultSecondaryDirectionForPrimary(state.primary);
  const rolledAnchor = anchor
    .clone()
    .applyAxisAngle(primary, degreesToRadians(rollDegrees))
    .normalize();
  const screenFrame = completeScreenFrame(state.primary, primary, rollAnchorDirection, rolledAnchor);
  const safeSecondaryDirection = normalizeSecondaryDirection(state.primary, state.secondary);
  const secondary = screenVectorForDirection(screenFrame, safeSecondaryDirection);

  return {
    ...state,
    reciprocal: normalizeCoefficients(vectorToReciprocalCoefficients(secondary, basis)),
    secondary: safeSecondaryDirection,
    rollDegrees: normalizeRollDegrees(rollDegrees),
  };
}

export function stateWithPrimaryDirection(
  vectors: VectorTuple[],
  quaternion: Quaternion,
  primary: CrystalCameraPrimaryDirection,
  secondary = defaultSecondaryDirectionForPrimary(primary),
): CrystalCameraState {
  const poseVectors = vectorsFromCameraQuaternion(quaternion);

  return stateFromViewVectors(vectors, primary, secondary, poseVectors.up, poseVectors.outward);
}

export function stateFromViewVectors(
  vectors: VectorTuple[],
  primary: CrystalCameraPrimaryDirection,
  secondary: CrystalCameraScreenDirection,
  up: Vector3,
  outward: Vector3,
): CrystalCameraState {
  const basis = computeCrystalBasisVectors(vectors);
  const safeSecondaryDirection = normalizeSecondaryDirection(primary, secondary);
  const poseVectors = screenFrameFromOutwardUp(outward, up);
  const primaryVector = screenVectorForDirection(poseVectors, primary);
  const secondaryVector = screenVectorForDirection(poseVectors, safeSecondaryDirection);
  const safePrimary = normalizeOrFallback(primaryVector, new Vector3(0, 0, 1));
  const anchor = vestaLikeSecondaryForPrimary(basis, safePrimary);
  const rollAnchorDirection = defaultSecondaryDirectionForPrimary(primary);
  const rollVector = screenVectorForDirection(poseVectors, rollAnchorDirection);
  const safeRollVector = projectPerpendicular(rollVector, safePrimary, anchor);
  const safeSecondary = projectPerpendicular(secondaryVector, safePrimary, anchor);
  const rollDegrees = signedAngleAroundAxis(anchor, safeRollVector, safePrimary);

  return {
    direct: normalizeCoefficients(vectorToDirectCoefficients(safePrimary, basis)),
    primary,
    reciprocal: normalizeCoefficients(vectorToReciprocalCoefficients(safeSecondary, basis)),
    secondary: safeSecondaryDirection,
    rollDegrees: normalizeRollDegrees(rollDegrees),
  };
}

export function stateWithDirectAxis(
  vectors: VectorTuple[],
  state: CrystalCameraState,
  axis: CrystalAxisLabel,
): CrystalCameraState {
  const nextState = {
    ...state,
    direct: crystalAxisDirectCoefficients(axis),
  };

  return applyCrystalCameraRoll(vectors, nextState, 0);
}

export function normalizeCoefficients(coefficients: VectorTuple): VectorTuple {
  const finite = coefficients.map((value) => (Number.isFinite(value) ? value : 0)) as VectorTuple;
  const maxAbs = Math.max(...finite.map((value) => Math.abs(value)));

  if (maxAbs < EPSILON) {
    return [0, 0, 0];
  }

  return finite.map((value) => snapCoefficient(value / maxAbs)) as VectorTuple;
}

export function parseVectorCoefficients(values: readonly string[]): VectorTuple | null {
  if (values.length !== 3) {
    return null;
  }

  const parsed = values.map((value) => Number(value.trim()));
  if (parsed.some((value) => !Number.isFinite(value))) {
    return null;
  }

  return parsed as VectorTuple;
}

export function normalizeRollDegrees(rollDegrees: number): number {
  if (!Number.isFinite(rollDegrees)) {
    return 0;
  }

  const normalized = ((((rollDegrees + 180) % 360) + 360) % 360) - 180;
  return Math.abs(normalized) < 0.000001 ? 0 : normalized;
}

export function vectorsFromCameraQuaternion(quaternion: Quaternion): {
  outward: Vector3;
  right: Vector3;
  up: Vector3;
} {
  return {
    outward: CAMERA_LOCAL_FORWARD.clone().applyQuaternion(quaternion).normalize(),
    right: CAMERA_LOCAL_RIGHT.clone().applyQuaternion(quaternion).normalize(),
    up: CAMERA_LOCAL_UP.clone().applyQuaternion(quaternion).normalize(),
  };
}

function vestaLikeSecondaryForPrimary(
  basis: CrystalBasisVectors,
  primary: Vector3,
): Vector3 {
  for (const candidate of [basis.reciprocal[2], basis.reciprocal[1], basis.reciprocal[0]]) {
    const projected = candidate.clone().sub(primary.clone().multiplyScalar(candidate.dot(primary)));
    if (projected.lengthSq() >= EPSILON) {
      return projected.normalize();
    }
  }

  return stablePerpendicular(primary);
}

function cameraQuaternionFromOutwardUp(outward: Vector3, up: Vector3): Quaternion {
  const { outward: z, right: x, upward: y } = screenFrameFromOutwardUp(outward, up);
  const matrix = new Matrix4().makeBasis(x, y, z);

  return new Quaternion().setFromRotationMatrix(matrix).normalize();
}

function completeScreenFrame(
  primaryDirection: CrystalCameraScreenDirection,
  primaryVector: Vector3,
  secondaryDirection: CrystalCameraScreenDirection,
  secondaryVector: Vector3,
): Record<CrystalCameraScreenDirection, Vector3> {
  const safeSecondaryDirection = normalizeSecondaryDirection(primaryDirection, secondaryDirection);
  const axes: Partial<Record<CrystalCameraScreenDirection, Vector3>> = {
    [primaryDirection]: primaryVector.clone().normalize(),
    [safeSecondaryDirection]: secondaryVector.clone().normalize(),
  };
  const missingDirection = (["right", "upward", "outward"] as const).find(
    (direction) => axes[direction] === undefined,
  )!;
  const crossSign = screenCrossSign(primaryDirection, safeSecondaryDirection, missingDirection);
  axes[missingDirection] = axes[primaryDirection]!
    .clone()
    .cross(axes[safeSecondaryDirection]!)
    .multiplyScalar(crossSign)
    .normalize();

  return {
    outward: axes.outward!,
    right: axes.right!,
    upward: axes.upward!,
  };
}

function screenFrameFromOutwardUp(
  outward: Vector3,
  up: Vector3,
): Record<CrystalCameraScreenDirection, Vector3> {
  const z = normalizeOrFallback(outward, new Vector3(0, 0, 1));
  const y = projectPerpendicular(up, z, stablePerpendicular(z));
  const x = y.clone().cross(z).normalize();
  const correctedY = z.clone().cross(x).normalize();

  return {
    outward: z,
    right: x,
    upward: correctedY,
  };
}

function screenVectorForDirection(
  screenFrame: Record<CrystalCameraScreenDirection, Vector3>,
  direction: CrystalCameraScreenDirection,
): Vector3 {
  return screenFrame[direction].clone();
}

function normalizeSecondaryDirection(
  primary: CrystalCameraScreenDirection,
  secondary: CrystalCameraScreenDirection,
): CrystalCameraScreenDirection {
  return primary === secondary ? defaultSecondaryDirectionForPrimary(primary) : secondary;
}

function screenCrossSign(
  first: CrystalCameraScreenDirection,
  second: CrystalCameraScreenDirection,
  third: CrystalCameraScreenDirection,
): 1 | -1 {
  const permutation = [
    SCREEN_DIRECTION_INDEX[first],
    SCREEN_DIRECTION_INDEX[second],
    SCREEN_DIRECTION_INDEX[third],
  ];
  let inversions = 0;
  for (let left = 0; left < permutation.length; left += 1) {
    for (let right = left + 1; right < permutation.length; right += 1) {
      if (permutation[left]! > permutation[right]!) {
        inversions += 1;
      }
    }
  }

  return inversions % 2 === 0 ? 1 : -1;
}

function coefficientsToVector(
  coefficients: VectorTuple,
  basisVectors: [Vector3, Vector3, Vector3],
  fallback: Vector3,
): Vector3 {
  const vector = basisVectors[0]
    .clone()
    .multiplyScalar(coefficients[0])
    .add(basisVectors[1].clone().multiplyScalar(coefficients[1]))
    .add(basisVectors[2].clone().multiplyScalar(coefficients[2]));

  return normalizeOrFallback(vector, fallback);
}

function vectorToDirectCoefficients(vector: Vector3, basis: CrystalBasisVectors): VectorTuple {
  return [
    vector.dot(basis.reciprocal[0]),
    vector.dot(basis.reciprocal[1]),
    vector.dot(basis.reciprocal[2]),
  ];
}

function vectorToReciprocalCoefficients(vector: Vector3, basis: CrystalBasisVectors): VectorTuple {
  return [
    vector.dot(basis.direct[0]),
    vector.dot(basis.direct[1]),
    vector.dot(basis.direct[2]),
  ];
}

function projectPerpendicular(vector: Vector3, axis: Vector3, fallback: Vector3): Vector3 {
  const safeAxis = normalizeOrFallback(axis, new Vector3(0, 0, 1));
  const projected = vector.clone().sub(safeAxis.clone().multiplyScalar(vector.dot(safeAxis)));

  if (projected.lengthSq() >= EPSILON) {
    return projected.normalize();
  }

  return normalizeOrFallback(fallback, stablePerpendicular(safeAxis));
}

function stablePerpendicular(axis: Vector3): Vector3 {
  const candidates = [
    new Vector3(0, 0, 1),
    new Vector3(0, 1, 0),
    new Vector3(1, 0, 0),
  ];

  for (const candidate of candidates) {
    const projected = candidate.clone().sub(axis.clone().multiplyScalar(candidate.dot(axis)));
    if (projected.lengthSq() >= EPSILON) {
      return projected.normalize();
    }
  }

  return new Vector3(0, 1, 0);
}

function signedAngleAroundAxis(from: Vector3, to: Vector3, axis: Vector3): number {
  const safeFrom = projectPerpendicular(from, axis, stablePerpendicular(axis));
  const safeTo = projectPerpendicular(to, axis, safeFrom);
  const sin = axis.dot(safeFrom.clone().cross(safeTo));
  const cos = safeFrom.dot(safeTo);

  return radiansToDegrees(Math.atan2(sin, cos));
}

function normalizeOrFallback(vector: Vector3, fallback: Vector3): Vector3 {
  if (vector.lengthSq() < EPSILON) {
    return fallback.clone().normalize();
  }

  return vector.clone().normalize();
}

function vectorFromTuple(tuple: VectorTuple, fallback: Vector3): Vector3 {
  const vector = new Vector3(...tuple);

  return vector.lengthSq() < EPSILON ? fallback.clone() : vector;
}

function snapCoefficient(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.000001) {
    return rounded;
  }

  return Number(value.toFixed(4));
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function vectorTuple(vector: Vector3): VectorTuple {
  return [vector.x, vector.y, vector.z];
}
