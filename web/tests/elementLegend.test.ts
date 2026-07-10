import { describe, expect, test } from "bun:test";

import type { SceneSpec } from "../src/api/scene";
import { deriveElementLegendEntries } from "../src/app/elementLegend";

describe("deriveElementLegendEntries", () => {
  test("keeps unique elements in first-seen order", () => {
    expect(
      deriveElementLegendEntries(
        sceneWithAtoms([
          { element: "Na" },
          { element: "Cl" },
          { element: "Na" },
          { element: "O" },
        ]),
      ),
    ).toEqual([
      { color: "#e7d15f", element: "Na" },
      { color: "#87e17c", element: "Cl" },
      { color: "#e15949", element: "O" },
    ]);
  });

  test("returns no legend entries without a loaded scene", () => {
    expect(deriveElementLegendEntries(null)).toEqual([]);
  });

  test("returns no legend entries for a scene without atoms", () => {
    expect(deriveElementLegendEntries(sceneWithAtoms([]))).toEqual([]);
  });

  test("can derive legend colors from the selected Jmol scheme", () => {
    expect(
      deriveElementLegendEntries(
        sceneWithAtoms([
          { element: "Na" },
          { element: "O" },
        ]),
        "jmol",
      ),
    ).toEqual([
      { color: "#ab5cf2", element: "Na" },
      { color: "#ff0d0d", element: "O" },
    ]);
  });

  test("can derive legend colors from the original VESTA scheme", () => {
    expect(
      deriveElementLegendEntries(
        sceneWithAtoms([
          { element: "Na" },
          { element: "O" },
        ]),
        "vesta",
      ),
    ).toEqual([
      { color: "#fadd3d", element: "Na" },
      { color: "#ff0300", element: "O" },
    ]);
  });

  test("derives entries from canonical atoms instead of periodic images", () => {
    expect(
      deriveElementLegendEntries(
        sceneWithAtoms([
          { element: "Na", isPeriodicImage: true },
          { element: "Na" },
          { element: "Cl", isPeriodicImage: true },
          { element: "Cl" },
        ]),
      ),
    ).toEqual([
      { color: "#e7d15f", element: "Na" },
      { color: "#87e17c", element: "Cl" },
    ]);
  });
});

interface TestAtom {
  element: string;
  isPeriodicImage?: boolean;
}

function sceneWithAtoms(atoms: TestAtom[]): SceneSpec {
  return {
    atoms: atoms.map(({ element, isPeriodicImage = false }, index) => ({
      element,
      id: `${element}-${index}`,
      siteId: `${element}-${index}`,
      siteIndex: index,
      position: [index, 0, 0],
      fractionalPosition: [index, 0, 0],
      imageOffset: isPeriodicImage ? [1, 0, 0] : [0, 0, 0],
      isPeriodicImage,
      imageReasons: isPeriodicImage ? ["boundary"] : [],
      visibilityDependencies: isPeriodicImage ? ["boundaryAtoms"] : [],
      visibilityDependencyGroups: isPeriodicImage ? [["boundaryAtoms"]] : [],
    })),
    bonds: [],
    bondFamilies: [],
    polyhedra: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount: atoms.length,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "-",
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
