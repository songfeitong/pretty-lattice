import { describe, expect, test } from "bun:test";
import { Vector3 } from "three";

import {
  applyCrystalCameraRoll,
  computeCrystalBasisVectors,
  computeCrystalCameraVectors,
  createDefaultCrystalCameraState,
  normalizeCoefficients,
  stateFromViewVectors,
  stateWithDirectAxis,
} from "../src/scene/crystalCamera";
import type { VectorTuple } from "../src/scene/viewMath";

const CUBIC_CELL: VectorTuple[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

describe("crystal camera math", () => {
  test("computes reciprocal vectors dual to the direct lattice", () => {
    const basis = computeCrystalBasisVectors([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    for (let directIndex = 0; directIndex < 3; directIndex += 1) {
      for (let reciprocalIndex = 0; reciprocalIndex < 3; reciprocalIndex += 1) {
        expect(
          basis.direct[directIndex]!.dot(basis.reciprocal[reciprocalIndex]!),
        ).toBeCloseTo(directIndex === reciprocalIndex ? 1 : 0);
      }
    }
  });

  test("uses VESTA-like c-star then b-star fallback for roll zero", () => {
    const aPrimary = computeCrystalCameraVectors(
      CUBIC_CELL,
      stateWithDirectAxis(CUBIC_CELL, createDefaultCrystalCameraState(), "a"),
    );
    const bPrimary = computeCrystalCameraVectors(
      CUBIC_CELL,
      stateWithDirectAxis(CUBIC_CELL, createDefaultCrystalCameraState(), "b"),
    );
    const cPrimary = computeCrystalCameraVectors(
      CUBIC_CELL,
      stateWithDirectAxis(CUBIC_CELL, createDefaultCrystalCameraState(), "c"),
    );

    expectVectorClose(aPrimary.outward, [1, 0, 0]);
    expectVectorClose(aPrimary.up, [0, 0, 1]);
    expectVectorClose(bPrimary.outward, [0, 1, 0]);
    expectVectorClose(bPrimary.up, [0, 0, 1]);
    expectVectorClose(cPrimary.outward, [0, 0, 1]);
    expectVectorClose(cPrimary.up, [0, 1, 0]);
  });

  test("roll rotates around the primary direct direction", () => {
    const rolledState = applyCrystalCameraRoll(
      CUBIC_CELL,
      createDefaultCrystalCameraState(),
      90,
    );
    const rolledVectors = computeCrystalCameraVectors(CUBIC_CELL, rolledState);

    expectVectorClose(rolledVectors.outward, [0, 0, 1]);
    expectVectorClose(rolledVectors.up, [-1, 0, 0]);
    expect(rolledState.rollDegrees).toBe(90);
  });

  test("derives the missing screen axis from a right-handed frame", () => {
    const vectors = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [1, 0, 0],
      primary: "right",
      reciprocal: [0, 1, 0],
      secondary: "upward",
    });

    expectVectorClose(vectors.right, [1, 0, 0]);
    expectVectorClose(vectors.up, [0, 1, 0]);
    expectVectorClose(vectors.outward, [0, 0, 1]);
  });

  test("manual secondary vectors recompute the nearest roll angle", () => {
    const state = stateFromViewVectors(
      CUBIC_CELL,
      "upward",
      "outward",
      new Vector3(0, 0, 1),
      new Vector3(-1, 0, 0),
    );

    expect(state.primary).toBe("upward");
    expect(state.secondary).toBe("outward");
    expect(state.rollDegrees).toBeCloseTo(90);
    expect(state.direct).toEqual([0, 0, 1]);
    expect(state.reciprocal).toEqual([-1, 0, 0]);
  });

  test("secondary direction changes do not redefine roll zero", () => {
    const state = stateFromViewVectors(
      CUBIC_CELL,
      "outward",
      "right",
      new Vector3(0, 1, 0),
      new Vector3(0, 0, 1),
    );

    expect(state.secondary).toBe("right");
    expect(state.rollDegrees).toBeCloseTo(0);
    expect(state.direct).toEqual([0, 0, 1]);
    expect(state.reciprocal).toEqual([1, 0, 0]);

    const rolledState = applyCrystalCameraRoll(CUBIC_CELL, state, 90);
    const rolledVectors = computeCrystalCameraVectors(CUBIC_CELL, rolledState);

    expect(rolledState.secondary).toBe("right");
    expect(rolledState.rollDegrees).toBe(90);
    expectVectorClose(rolledVectors.outward, [0, 0, 1]);
    expectVectorClose(rolledVectors.up, [-1, 0, 0]);
    expectVectorClose(rolledVectors.right, [0, 1, 0]);
  });

  test("normalizes coefficients and silently falls back from degenerate vectors", () => {
    expect(normalizeCoefficients([2, -4, 0.0000000001])).toEqual([0.5, -1, 0]);

    const vectors = computeCrystalCameraVectors(CUBIC_CELL, {
      ...createDefaultCrystalCameraState(),
      direct: [0, 0, 0],
      reciprocal: [0, 0, 1],
    });

    expect(Number.isFinite(vectors.up.x)).toBe(true);
    expect(Number.isFinite(vectors.outward.y)).toBe(true);
    expect(Math.abs(vectors.up.dot(vectors.outward))).toBeLessThan(0.000001);
  });
});

function expectVectorClose(actual: Vector3, expected: VectorTuple) {
  expect(actual.x).toBeCloseTo(expected[0]);
  expect(actual.y).toBeCloseTo(expected[1]);
  expect(actual.z).toBeCloseTo(expected[2]);
}
