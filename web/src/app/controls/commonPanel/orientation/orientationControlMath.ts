import { normalizeRollDegrees } from "../../../../scene/crystalCamera";
import type {
  CrystalCameraScreenDirection,
  CrystalCameraState,
} from "../../../../model";

export const SCREEN_AXIS_OPTIONS: readonly {
  direction: CrystalCameraScreenDirection;
  letter: "X" | "Y" | "Z";
  label: "Right" | "Up" | "Out";
}[] = [
  { direction: "right", letter: "X", label: "Right" },
  { direction: "upward", letter: "Y", label: "Up" },
  { direction: "outward", letter: "Z", label: "Out" },
];

export function screenAxisOption(direction: CrystalCameraScreenDirection) {
  return SCREEN_AXIS_OPTIONS.find((option) => option.direction === direction)!;
}

export function screenAxisLabel(direction: CrystalCameraScreenDirection): string {
  const option = screenAxisOption(direction);
  return option.letter;
}

export function shortestRollDelta(from: number, to: number): number {
  const delta = ((toPositiveRollDegrees(to) - toPositiveRollDegrees(from) + 540) % 360) - 180;
  return delta === -180 ? 180 : delta;
}

export function rollDisplayAnimationProgress(progress: number): number {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  return 1 - (1 - clampedProgress) ** 3;
}

export function draftFromCameraState(cameraState: CrystalCameraState): {
  direct: [string, string, string];
  reciprocal: [string, string, string];
} {
  return {
    direct: cameraState.direct.map(formatVectorCoefficient) as [string, string, string],
    reciprocal: cameraState.reciprocal.map(formatVectorCoefficient) as [string, string, string],
  };
}

export function formatVectorCoefficient(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

export function formatRollValue(value: number): string {
  return String(displayRollDegrees(value));
}

export function rollValueInputWidth(value: string): string {
  return `${Math.min(8, Math.max(1, value.length))}ch`;
}

export function toPositiveRollDegrees(value: number): number {
  const signedValue = normalizeRollDegrees(value);
  return signedValue < 0 ? signedValue + 360 : signedValue;
}

export function displayRollDegrees(value: number): number {
  const roundedValue = Math.round(toPositiveRollDegrees(value));
  return roundedValue >= 360 ? 0 : roundedValue;
}

export function parseRollInput(value: string): number | null {
  const nextValue = Number(value.trim().replace(/°$/, ""));
  return Number.isFinite(nextValue) ? nextValue : null;
}
