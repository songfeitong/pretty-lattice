import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  atomInspectorCopyText,
  atomSiteIndex,
  formatAtomCoordinateForCopy,
  formatAtomCoordinateForDisplay,
  formatCellOffset,
  inspectedAtomInfoForId,
} from "../src/app/atomInspector";

describe("atom inspector formatting", () => {
  test("formats visible coordinates compactly and copy coordinates precisely", () => {
    expect(formatAtomCoordinateForDisplay([0, -0, 0.1479044])).toBe("0.000, 0.000, 0.148");
    expect(formatAtomCoordinateForCopy([0, -0, 0.1479044])).toBe("0.000000, 0.000000, 0.147904");
  });

  test("formats cell offsets without explicit positive signs", () => {
    expect(formatCellOffset([1, 0, -1])).toBe("1, 0, -1");
    expect(formatCellOffset([0, 0, 0])).toBe("0, 0, 0");
  });

  test("uses the unit-cell atom for coordinates and the clicked image for cell offset", () => {
    const scene = sceneWithImageAtom();

    const info = inspectedAtomInfoForId(scene, "Al-1-image-1-0--1");

    expect(info?.atom.id).toBe("Al-1-image-1-0--1");
    expect(info?.canonicalAtom.id).toBe("Al-1");
    expect(info?.canonicalAtom.siteIndex).toBe(1);
    expect(atomInspectorCopyText(info!)).toBe([
      "Element: Al",
      "Index: 1",
      "Fractional: 0.250000, 0.500000, 0.147904",
      "Cartesian (A): 1.200000, 2.300000, 1.939946",
      "Cell offset: 1, 0, -1",
    ].join("\n"));
  });

  test("falls back to the site id when a loaded scene has no explicit site index", () => {
    const scene = sceneWithImageAtom();
    const canonicalAtom = scene.atoms[0]!;
    delete (canonicalAtom as Partial<AtomSpec>).siteIndex;

    const info = inspectedAtomInfoForId(scene, "Al-1-image-1-0--1");

    expect(atomSiteIndex(info!.canonicalAtom)).toBe("1");
    expect(atomInspectorCopyText(info!).split("\n")[1]).toBe("Index: 1");
  });
});

function sceneWithImageAtom(): SceneSpec {
  return {
    atoms: [
      atom({
        id: "Al-1",
        siteId: "Al-1",
        siteIndex: 1,
        position: [1.2, 2.3, 1.9399463],
        fractionalPosition: [0.25, 0.5, 0.1479044],
        imageOffset: [0, 0, 0],
      }),
      atom({
        id: "Al-1-image-1-0--1",
        siteId: "Al-1",
        siteIndex: 1,
        position: [6.005, 2.3, -11.176],
        fractionalPosition: [1.25, 0.5, -0.852096],
        imageOffset: [1, 0, -1],
        isPeriodicImage: true,
      }),
    ],
    bonds: [],
    bondFamilies: [],
    cell: { vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    polyhedra: [],
    summary: {
      atomCount: 1,
      cell: {
        a: "1.00",
        alpha: "90.0",
        b: "1.00",
        beta: "90.0",
        c: "1.00",
        gamma: "90.0",
      },
      formula: "Al",
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

function atom({
  id,
  siteId,
  siteIndex,
  position,
  fractionalPosition,
  imageOffset,
  isPeriodicImage = false,
}: {
  id: string;
  siteId: string;
  siteIndex: number;
  position: [number, number, number];
  fractionalPosition: [number, number, number];
  imageOffset: [number, number, number];
  isPeriodicImage?: boolean;
}): AtomSpec {
  return {
    element: "Al",
    fractionalPosition,
    id,
    imageOffset,
    imageReasons: isPeriodicImage ? ["boundary"] : [],
    isPeriodicImage,
    position,
    siteId,
    siteIndex,
    visibilityDependencies: isPeriodicImage ? ["boundaryAtoms"] : [],
    visibilityDependencyGroups: isPeriodicImage ? [["boundaryAtoms"]] : [],
  };
}
