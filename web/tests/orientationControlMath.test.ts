import { describe, expect, test } from "bun:test";

import {
  displayRollDegrees,
  draftFromCameraState,
  formatRollValue,
  parseRollInput,
  rollDisplayAnimationProgress,
  rollValueInputWidth,
  screenAxisLabel,
  shortestRollDelta,
  toPositiveRollDegrees,
} from "../src/app/controls/commonPanel/orientation/orientationControlMath";
import { createDefaultCrystalCameraState } from "../src/scene/crystalCamera";

describe("orientation control math", () => {
  test("formats roll values as positive display degrees", () => {
    expect(toPositiveRollDegrees(-1)).toBe(359);
    expect(displayRollDegrees(359.6)).toBe(0);
    expect(formatRollValue(-90)).toBe("270");
    expect(rollValueInputWidth("123456789")).toBe("8ch");
  });

  test("computes the shortest displayed roll animation path", () => {
    expect(shortestRollDelta(350, 10)).toBe(20);
    expect(shortestRollDelta(10, 350)).toBe(-20);
    expect(shortestRollDelta(0, 180)).toBe(180);
    expect(rollDisplayAnimationProgress(0.5)).toBeCloseTo(0.875);
  });

  test("parses numeric roll text with an optional degree suffix", () => {
    expect(parseRollInput("42°")).toBe(42);
    expect(parseRollInput("  -15 ")).toBe(-15);
    expect(parseRollInput("nope")).toBeNull();
  });

  test("formats vector draft fields from the current camera state", () => {
    const state = {
      ...createDefaultCrystalCameraState(),
      direct: [1, Number.NaN, -0.125] as [number, number, number],
      reciprocal: [0.333, 2, Infinity] as [number, number, number],
    };

    expect(draftFromCameraState(state)).toEqual({
      direct: ["1.00", "0.00", "-0.13"],
      reciprocal: ["0.33", "2.00", "0.00"],
    });
    expect(screenAxisLabel("outward")).toBe("Z");
  });
});
