import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import { createAtomAppearanceModel } from "../src/app/inspector/atomAppearanceModel";
import { createDefaultStyle, setAtomOverrideProperty } from "../src/model";

describe("atom appearance model", () => {
  test("canonicalizes periodic selections and derives hidden recovery rows", () => {
    const canonical = atom("Na-0", 0);
    const hidden = atom("Na-1", 1);
    const periodicImage = {
      ...canonical,
      id: "Na-0-image-1-0-0",
      imageOffset: [1, 0, 0] as [number, number, number],
      isPeriodicImage: true,
    };
    const style = createDefaultStyle();
    const objectStyles = setAtomOverrideProperty(
      style.objectStyles,
      hidden.siteId,
      "visible",
      false,
    );

    const model = createAtomAppearanceModel({
      atomOpacity: 100,
      atomsVisible: true,
      scene: sceneWithAtoms([canonical, hidden, periodicImage]),
      selectedAtomId: periodicImage.id,
      style: { ...style, objectStyles },
    });

    expect(model.objectAtoms.map(({ id }) => id)).toEqual(["Na-0", "Na-1"]);
    expect(model.selectedAtom?.id).toBe("Na-0");
    expect(model.elementGroups).toHaveLength(1);
    expect(model.elementGroups[0]?.atoms).toHaveLength(2);
    expect(model.hiddenAtoms.map(({ atom }) => atom.id)).toEqual(["Na-1"]);
  });
});

function atom(id: string, siteIndex: number): AtomSpec {
  return {
    element: "Na",
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

function sceneWithAtoms(atoms: AtomSpec[]): SceneSpec {
  return {
    atoms,
    bonds: [],
    bondFamilies: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: atoms.length,
      cell: {
        a: "1.00",
        alpha: "90.0",
        b: "1.00",
        beta: "90.0",
        c: "1.00",
        gamma: "90.0",
      },
      formula: "Na",
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
