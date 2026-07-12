import { describe, expect, test } from "bun:test";

import {
  bondCutoffDraftCanRestore,
  buildBondCutoffSubmission,
  createBondCutoffDrafts,
  formatBondCutoffDraftField,
} from "../src/app/inspector/bondCutoffEditor";
import type { BondFamilySpec, SceneSpec } from "../src/api/scene";

const family: BondFamilySpec = {
  elements: ["Na", "Cl"],
  key: "Na|Cl",
  minLength: 1,
  maxLength: 2.3451,
};

describe("bond cutoff editor", () => {
  test("uses a zero minimum and rounds the suggested maximum upward", () => {
    const drafts = createBondCutoffDrafts(sceneWithFamily(family), {});

    expect(drafts[family.key]).toEqual({
      initialOverride: false,
      maxText: "2.346",
      minText: "0.000",
      pendingRemoval: false,
    });
    expect(bondCutoffDraftCanRestore(drafts[family.key]!, family)).toBe(false);
    expect(formatBondCutoffDraftField("2")).toBe("2.000");
    expect(formatBondCutoffDraftField("0.25")).toBe("0.250");
  });

  test("treats equivalent numeric formatting as unchanged", () => {
    const drafts = createBondCutoffDrafts(sceneWithFamily(family), {});
    drafts[family.key] = { ...drafts[family.key]!, minText: "0.0", maxText: "2.3460" };

    const submission = buildBondCutoffSubmission([family], {}, drafts);

    expect(submission.changed).toBe(false);
    expect(submission.invalidFields.size).toBe(0);
  });

  test("rejects the whole draft when a changed range is not ordered", () => {
    const drafts = createBondCutoffDrafts(sceneWithFamily(family), {});
    drafts[family.key] = { ...drafts[family.key]!, minText: "3", maxText: "2" };

    const submission = buildBondCutoffSubmission([family], {}, drafts);

    expect(submission.changed).toBe(false);
    expect(submission.invalidFields).toEqual(new Set(["Na|Cl:min", "Na|Cl:max"]));
  });

  test("stages explicit removal without mutating the current overrides", () => {
    const overrides = { "Na|Cl": { min: 1, max: 2.5 } };
    const drafts = createBondCutoffDrafts(sceneWithFamily(family), overrides);
    drafts[family.key] = { ...drafts[family.key]!, pendingRemoval: true };

    const submission = buildBondCutoffSubmission([family], overrides, drafts);

    expect(submission.changed).toBe(true);
    expect(submission.nextOverrides).toEqual({});
    expect(overrides).toEqual({ "Na|Cl": { min: 1, max: 2.5 } });
  });
});

function sceneWithFamily(bondFamily: BondFamilySpec): SceneSpec {
  return {
    atoms: [],
    bondFamilies: [bondFamily],
    bonds: [],
    cell: { vectors: [] },
    polyhedra: [],
    summary: {
      atomCount: 0,
      cell: { a: "", alpha: "", b: "", beta: "", c: "", gamma: "" },
      formula: "",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}
