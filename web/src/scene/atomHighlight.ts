import { Color } from "three";

export const ATOM_HIGHLIGHT_TARGET_COLOR = new Color("#ffffff");
export const SELECTION_HIGHLIGHT_COLOR = "#ffd200";
export const ATOM_HIGHLIGHT_PULSE_MS = 240;
export const ATOM_HIGHLIGHT_SELECTED_COLOR_MIX = 0.26;
export const ATOM_HIGHLIGHT_PULSE_COLOR_MIX = 0.34;
export const SELECTION_HANDOFF_MS = 150;
export const SELECTION_HANDOFF_WHITE_MIX = 0.2;

export function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

export function atomPulseFade(progress: number): number {
  const fadeIn = Math.min(1, progress / 0.4);
  const fadeOut = progress < 0.4 ? 1 : 1 - (progress - 0.4) / 0.6;
  return fadeIn * Math.max(0, fadeOut) ** 0.72;
}
