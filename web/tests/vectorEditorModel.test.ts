import { describe, expect, test } from "bun:test";

import {
  cameraStateFromVectorEditorDraft,
  resetVectorEditorDraft,
  updateVectorEditorDraft,
  vectorEditorRows,
} from "../src/app/controls/commonPanel/orientation/vectorEditorModel";
import { createDefaultCrystalCameraState } from "../src/scene/crystalCamera";
import type { VectorTuple } from "../src/model";

const CUBIC_CELL: VectorTuple[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

describe("vector editor model", () => {
  test("updates one draft field without mutating the rest of the draft", () => {
    const draft = {
      direct: ["1.00", "0.00", "0.00"] as [string, string, string],
      reciprocal: ["0.00", "1.00", "0.00"] as [string, string, string],
    };

    expect(updateVectorEditorDraft(draft, "direct", 1, "2.50")).toEqual({
      direct: ["1.00", "2.50", "0.00"],
      reciprocal: ["0.00", "1.00", "0.00"],
    });
    expect(updateVectorEditorDraft(draft, "reciprocal", 9, "3")).toBe(draft);
  });

  test("resets a draft from the current camera state", () => {
    const state = {
      ...createDefaultCrystalCameraState(CUBIC_CELL),
      direct: [0, 1, -0.25] as VectorTuple,
      reciprocal: [1, 0.5, 0] as VectorTuple,
    };

    expect(resetVectorEditorDraft(state)).toEqual({
      direct: ["0.00", "1.00", "-0.25"],
      reciprocal: ["1.00", "0.50", "0.00"],
    });
  });

  test("applies a valid vector draft through the crystal camera model", () => {
    const cameraState = createDefaultCrystalCameraState(CUBIC_CELL);
    const nextState = cameraStateFromVectorEditorDraft({
      cameraState,
      cellVectors: CUBIC_CELL,
      draft: {
        direct: ["1", "0", "0"],
        reciprocal: ["0", "1", "0"],
      },
    });

    expect(nextState).not.toBeNull();
    expect(nextState?.primary).toBe(cameraState.primary);
    expect(nextState?.secondary).toBe(cameraState.secondary);
    expect(nextState?.direct).toEqual([1, 0, 0]);
    expect(nextState?.reciprocal).toEqual([0, 1, 0]);
  });

  test("rejects invalid vector drafts before applying camera changes", () => {
    const cameraState = createDefaultCrystalCameraState(CUBIC_CELL);

    expect(
      cameraStateFromVectorEditorDraft({
        cameraState,
        cellVectors: CUBIC_CELL,
        draft: {
          direct: ["1", "bad", "0"],
          reciprocal: ["0", "1", "0"],
        },
      }),
    ).toBeNull();
  });

  test("builds primary and secondary row metadata from the camera state", () => {
    const cameraState = {
      ...createDefaultCrystalCameraState(CUBIC_CELL),
      primary: "right" as const,
      secondary: "upward" as const,
    };
    const draft = resetVectorEditorDraft(cameraState);

    expect(vectorEditorRows(cameraState, draft)).toMatchObject([
      { isPrimaryAxis: true, label: "X", row: "direct" },
      {
        isPrimaryAxis: false,
        label: "Y",
        row: "reciprocal",
        secondaryOptions: [
          { direction: "upward", letter: "Y", label: "Up" },
          { direction: "outward", letter: "Z", label: "Out" },
        ],
      },
    ]);
  });
});
