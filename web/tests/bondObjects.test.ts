import { describe, expect, test } from "bun:test";

import type { BondFamilySpec, SceneSpec } from "../src/api/scene";
import {
  bondInspectorCopyText,
  createDefaultBondVisibilityOverrides,
  createDefaultComponentVisibility,
  createDefaultStyle,
  clearBondOverridePropertyForFamily,
  formatBondFamilyLength,
  formatBondVector,
  inspectedBondInfoForId,
  resolveBondOpacityForStyle,
  resolveBondRadiusForStyle,
  setBondFamilyOverrideProperty,
  setBondOverrideProperty,
  setBondFamilyVisible,
  setBondRelationVisible,
  visibleSceneForComponents,
} from "../src/model";

describe("bond objects", () => {
  test("filters family and relation visibility without changing connectivity metadata", () => {
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

    const oneHidden = setBondRelationVisible(
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

  });

  test("hides every periodic instance of the same logical bond relation", () => {
    const scene = bondScene();
    scene.bonds.push({
      ...scene.bonds[0]!,
      id: "bond:one-periodic-copy",
      startImageOffset: [1, 0, 0],
      endImageOffset: [1, 0, 0],
    });
    const hidden = setBondRelationVisible(
      createDefaultBondVisibilityOverrides(),
      scene.bonds[0]!,
      false,
    );
    const visible = visibleSceneForComponents(
      scene,
      createDefaultComponentVisibility(scene),
      undefined,
      hidden,
    );

    expect(visible?.bonds.map((bond) => bond.id)).toEqual(["bond:two"]);
  });

  test("resolves stable bond information and the read-only copy format", () => {
    const info = inspectedBondInfoForId(bondScene(), "bond:one");

    expect(info?.bond.relationId).toBe("relation:one");
    expect(formatBondVector(info!, 3)).toBe("1.000, 0.000, 0.000");
    expect(bondInspectorCopyText(info!)).toBe(
      [
        "Bond: Na:0 -- Cl:1",
        "Bond length (A): 1.000000",
        "Vector\u2009(frac): 1.000000, 0.000000, 0.000000",
        "Cell offset: (0, 0, 0) - (0, 0, 0)",
      ].join("\n"),
    );
  });

  test("formats signed fractional components as coordinates", () => {
    const scene = bondScene();
    scene.atoms[1]!.fractionalPosition = [0.5, -0.25, 0];
    const info = inspectedBondInfoForId(scene, "bond:one");

    expect(formatBondVector(info!, 3)).toBe("0.500, -0.250, 0.000");
  });

  test("resolves family and individual appearance overrides with atom-style inheritance", () => {
    const scene = bondScene();
    const bond = scene.bonds[0]!;
    let objectStyles = createDefaultStyle().objectStyles;
    objectStyles = setBondFamilyOverrideProperty(objectStyles, "Na|Cl", "radius", 0.2);
    objectStyles = setBondFamilyOverrideProperty(objectStyles, "Na|Cl", "opacity", 60);

    expect(resolveBondRadiusForStyle(bond, objectStyles, 0.1)).toBe(0.2);
    expect(resolveBondOpacityForStyle(bond, objectStyles, 100)).toBe(60);

    objectStyles = setBondOverrideProperty(objectStyles, bond.id, "radius", 0.3);
    objectStyles = setBondOverrideProperty(objectStyles, bond.id, "opacity", 35);
    expect(resolveBondRadiusForStyle(bond, objectStyles, 0.1)).toBe(0.3);
    expect(resolveBondOpacityForStyle(bond, objectStyles, 100)).toBe(35);

    objectStyles = clearBondOverridePropertyForFamily(
      objectStyles,
      scene.bonds,
      "Na|Cl",
      "radius",
    );
    expect(resolveBondRadiusForStyle(bond, objectStyles, 0.1)).toBe(0.2);
    expect(resolveBondOpacityForStyle(bond, objectStyles, 100)).toBe(35);
  });
});

describe("formatBondFamilyLength", () => {
  test("preserves a range when distinct endpoints round to the same display value", () => {
    expect(formatBondFamilyLength(bondFamily(1.001, 1.004))).toBe("1.00–1.00");
  });

  test("shows one value when the original endpoints are equal", () => {
    expect(formatBondFamilyLength(bondFamily(1, 1))).toBe("1.00");
  });

  test("shows an em dash when the range is unavailable", () => {
    expect(formatBondFamilyLength(bondFamily(null, null))).toBe("—");
  });
});

function bondFamily(minLength: number | null, maxLength: number | null): BondFamilySpec {
  return {
    elements: ["Na", "Cl"],
    key: "Na|Cl",
    maxLength,
    minLength,
  };
}

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
