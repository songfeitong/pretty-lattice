import { describe, expect, test } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import {
  bondInspectorCopyText,
  createDefaultBondVisibilityOverrides,
  inspectedBondInfoForId,
  resetBondFamilyVisibility,
  setBondFamilyVisible,
  setBondInstanceVisible,
  visibleSceneForComponents,
  createDefaultComponentVisibility,
} from "../src/model";

describe("bond objects", () => {
  test("filters family and individual visibility without changing connectivity metadata", () => {
    const scene = bondScene();
    const defaults = createDefaultComponentVisibility(scene);
    const familyHidden = setBondFamilyVisible(
      createDefaultBondVisibilityOverrides(),
      "Na|Cl",
      false,
    );
    const withoutFamily = visibleSceneForComponents(
      scene,
      { ...defaults, polyhedra: true },
      undefined,
      familyHidden,
    );

    expect(withoutFamily?.bonds).toEqual([]);
    expect(withoutFamily?.bondFamilies).toEqual(scene.bondFamilies);
    expect(withoutFamily?.polyhedra).toEqual(scene.polyhedra);

    const oneHidden = setBondInstanceVisible(
      createDefaultBondVisibilityOverrides(),
      scene.bonds[0]!,
      false,
    );
    const withoutOne = visibleSceneForComponents(
      scene,
      defaults,
      undefined,
      oneHidden,
    );
    expect(withoutOne?.bonds.map((bond) => bond.id)).toEqual(["bond:two"]);

    const reset = resetBondFamilyVisibility(oneHidden, "Na|Cl", scene.bonds);
    expect(reset.hiddenFamilies.size).toBe(0);
    expect(reset.hiddenBondInstances.size).toBe(0);
  });

  test("resolves stable bond information and the read-only copy format", () => {
    const info = inspectedBondInfoForId(bondScene(), "bond:one");

    expect(info?.bond.relationId).toBe("relation:one");
    expect(bondInspectorCopyText(info!)).toBe(
      [
        "Bond: Na:0 -- Cl:1",
        "Length (A): 1.000000",
        "Start cell: 0, 0, 0",
        "End cell: 0, 0, 0",
      ].join("\n"),
    );
  });
});

function bondScene(): SceneSpec {
  return {
    atoms: [atom("Na-0", "Na", 0), atom("Cl-1", "Cl", 1)],
    bondFamilies: [
      {
        elements: ["Na", "Cl"],
        key: "Na|Cl",
        minLength: 1,
        maxLength: 1.2,
      },
    ],
    bonds: [bond("bond:one", "relation:one", 1), bond("bond:two", "relation:two", 1.2)],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    polyhedra: [
      {
        centerAtomIndex: 0,
        faces: [],
        hullAtomIndices: [0, 1],
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
    ],
    summary: {
      atomCount: 2,
      cell: {
        a: "1",
        alpha: "90",
        b: "1",
        beta: "90",
        c: "1",
        gamma: "90",
      },
      formula: "NaCl",
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

function atom(id: string, element: string, siteIndex: number): SceneSpec["atoms"][number] {
  return {
    element,
    fractionalPosition: [siteIndex, 0, 0],
    id,
    imageOffset: [0, 0, 0],
    imageReasons: [],
    isPeriodicImage: false,
    position: [siteIndex, 0, 0],
    siteId: id,
    siteIndex,
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function bond(
  id: string,
  relationId: string,
  length: number,
): SceneSpec["bonds"][number] {
  return {
    endAtomIndex: 1,
    endImageOffset: [0, 0, 0],
    endSiteId: "Cl-1",
    familyKey: "Na|Cl",
    id,
    length,
    relationId,
    relativeImageOffset: [0, 0, 0],
    startAtomIndex: 0,
    startImageOffset: [0, 0, 0],
    startSiteId: "Na-0",
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
