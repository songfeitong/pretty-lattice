import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  STYLE_FOG_AMOUNT_MAX,
  STYLE_FOG_AMOUNT_MIN,
  STYLE_FOG_START_MAX,
  STYLE_FOG_START_MIN,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  defaultPreviewMeshQualityForScene,
  createDefaultExportSettings,
  createDefaultStyle,
  createCustomColormapFromScheme,
  createDefaultComponentVisibility,
  elementColorOverridesForStyle,
  hasCustomColormapChanges,
  INSPECTOR_OPEN_SCENE_OFFSET_X_PX,
  INSPECTOR_PREVIEW_SAFE_AREA,
  STRUCTURE_ATOM_COUNT_THRESHOLD,
  parseExportDimensionInput,
  setExportAspectRatioLocked,
  setExportBackground,
  setExportComponentSelected,
  setExportDimension,
  setExportFormat,
  setExportLegendLayout,
  setExportMeshQuality,
  setExportSupersampling,
  countPeriodicImageAtoms,
  hasPolyhedra,
  hasPeriodicImageAtoms,
  previewSafeAreaForInspector,
  sceneOffsetXForInspector,
  syncExportSettingsProjectedSize,
  validateExportSettings,
  visibleSceneForComponents,
} from "../src/model";

describe("settings", () => {
  test("keeps the large-scene mesh quality threshold", () => {
    const belowThreshold = STRUCTURE_ATOM_COUNT_THRESHOLD - 1;
    const atThreshold = STRUCTURE_ATOM_COUNT_THRESHOLD;
    const aboveThreshold = STRUCTURE_ATOM_COUNT_THRESHOLD + 1;

    expect(defaultPreviewMeshQualityForScene(null)).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(belowThreshold))).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(atThreshold))).toBe("low");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(aboveThreshold))).toBe("low");
    expect(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS).toBe(true);
    expect(DEFAULT_UNIT_CELL_LINE_STYLE).toBe("solid");
  });

  test("defaults style controls to 40 percent atoms, 100 percent bonds, bicolor bonds, and enabled depth cueing", () => {
    expect(createDefaultStyle()).toEqual({
      atomRadius: 40,
      atomRadiusModel: "uniform",
      bondColor: "#d2d2d2",
      bondColorMode: "bicolor",
      bondThickness: 100,
      colorScheme: "vesta-soft",
      colorSchemeMode: "preset",
      customColormap: null,
      distinguishSimilarColors: true,
      fogAffectsUnitCell: false,
      fogAmount: 40,
      fogEnabled: true,
      fogStart: 40,
      materialPreset: "modern-matte",
    });
    expect(STYLE_FOG_START_MIN).toBe(0);
    expect(STYLE_FOG_START_MAX).toBe(100);
    expect(STYLE_FOG_AMOUNT_MIN).toBe(0);
    expect(STYLE_FOG_AMOUNT_MAX).toBe(100);
    expect(STYLE_SCALE_MIN.atomRadius).toBe(0);
    expect(STYLE_SCALE_MAX.atomRadius).toBe(100);
    expect(STYLE_SCALE_MAX.bondThickness).toBe(200);
  });

  test("uses auto color overrides only for preset color schemes", () => {
    const presetStyle = createDefaultStyle();
    const presetOverrides = elementColorOverridesForStyle(
      atomsWithElements(["O", "V"]),
      presetStyle,
    );

    expect(presetOverrides?.V).toBeDefined();

    const customColormap = createCustomColormapFromScheme("vesta-soft");
    customColormap.elements.V = "#123456";
    const customStyle = {
      ...presetStyle,
      colorSchemeMode: "custom" as const,
      customColormap,
    };

    expect(elementColorOverridesForStyle(atomsWithElements(["O", "V"]), customStyle)).toEqual(
      expect.objectContaining({ V: "#123456" }),
    );
  });

  test("detects whether a custom color map differs from its base preset", () => {
    const customColormap = createCustomColormapFromScheme("vesta-soft");

    expect(hasCustomColormapChanges(customColormap)).toBe(false);

    customColormap.elements.V = "#123456";
    expect(hasCustomColormapChanges(customColormap)).toBe(true);

    const baseVColor = createCustomColormapFromScheme("vesta-soft").elements.V;
    expect(baseVColor).toBeDefined();
    customColormap.elements.V = baseVColor!;
    expect(hasCustomColormapChanges(customColormap)).toBe(false);
  });

  test("defaults figure export settings to PNG with separate 2D and 3D quality controls", () => {
    expect(createDefaultExportSettings()).toEqual({
      aspectRatioLocked: false,
      background: "transparent",
      combineComponents: true,
      components: {
        legend: false,
        crystalAxes: false,
        structure: true,
      },
      format: "png",
      height: 2000,
      legendLayout: "horizontal",
      meshQuality: "high",
      pixelsPerProjectedUnit: null,
      supersampling: 2,
      width: 2000,
    });
  });

  test("creates independent nested export component defaults", () => {
    const firstSettings = createDefaultExportSettings();
    firstSettings.components.legend = true;

    expect(createDefaultExportSettings().components.legend).toBe(false);
  });

  test("edits export dimensions with locked and unlocked projected scale", () => {
    const defaultSettings = createDefaultExportSettings();
    const squareProjectedSize = { height: 1, width: 1 };
    const wideProjectedSize = { height: 1, width: 2 };
    const lockedSettings = setExportAspectRatioLocked(
      defaultSettings,
      true,
      squareProjectedSize,
    );

    expect(lockedSettings).toMatchObject({
      height: 2000,
      pixelsPerProjectedUnit: 2000,
      width: 2000,
    });
    expect(setExportDimension(lockedSettings, "width", 3000, squareProjectedSize)).toMatchObject({
      height: 3000,
      pixelsPerProjectedUnit: 3000,
      width: 3000,
    });
    expect(setExportDimension(lockedSettings, "height", 1200, squareProjectedSize)).toMatchObject({
      height: 1200,
      pixelsPerProjectedUnit: 1200,
      width: 1200,
    });
    expect(setExportDimension(lockedSettings, "width", 3000, wideProjectedSize)).toMatchObject({
      height: 1500,
      pixelsPerProjectedUnit: 1500,
      width: 3000,
    });
    expect(syncExportSettingsProjectedSize(lockedSettings, squareProjectedSize)).toMatchObject({
      height: 2000,
      width: 2000,
    });

    const wideLockedSettings = setExportAspectRatioLocked(
      defaultSettings,
      true,
      wideProjectedSize,
    );
    expect(wideLockedSettings).toMatchObject({
      height: 1000,
      pixelsPerProjectedUnit: 1000,
      width: 2000,
    });
    expect(syncExportSettingsProjectedSize(wideLockedSettings, squareProjectedSize)).toMatchObject({
      height: 1000,
      pixelsPerProjectedUnit: 1000,
      width: 1000,
    });
    expect(
      syncExportSettingsProjectedSize(
        syncExportSettingsProjectedSize(wideLockedSettings, squareProjectedSize),
        wideProjectedSize,
      ),
    ).toMatchObject({
      height: 1000,
      pixelsPerProjectedUnit: 1000,
      width: 2000,
    });

    expect(setExportAspectRatioLocked(defaultSettings, true, wideProjectedSize)).toMatchObject({
      height: 1000,
      width: 2000,
    });
    expect(
      setExportAspectRatioLocked(defaultSettings, true, {
        height: 2,
        width: 1,
      }),
    ).toMatchObject({
      height: 2000,
      width: 1000,
    });

    expect(setExportDimension(defaultSettings, "height", 1200)).toMatchObject({
      height: 1200,
      pixelsPerProjectedUnit: null,
      width: 2000,
    });
    expect(syncExportSettingsProjectedSize(defaultSettings, squareProjectedSize)).toBe(
      defaultSettings,
    );
  });

  test("parses and validates bounded export quality settings", () => {
    const defaultSettings = createDefaultExportSettings();

    expect(parseExportDimensionInput("3200px")).toBe(3200);
    expect(parseExportDimensionInput("0")).toBeNull();
    expect(parseExportDimensionInput("99999")).toBe(6000);
    expect(setExportSupersampling(defaultSettings, 9).supersampling).toBe(4);
    expect(setExportMeshQuality(defaultSettings, "xhigh").meshQuality).toBe("xhigh");
    expect(setExportComponentSelected(defaultSettings, "legend", true).components).toEqual({
      legend: true,
      crystalAxes: false,
      structure: true,
    });
    expect(setExportLegendLayout(defaultSettings, "vertical").legendLayout).toBe("vertical");
    expect(setExportBackground(defaultSettings, "black").background).toBe("black");
    expect(setExportFormat(defaultSettings, "pdf")).toEqual({
      ...defaultSettings,
      format: "pdf",
    });
    expect(setExportFormat(defaultSettings, "jpg")).toEqual({
      ...defaultSettings,
      background: "white",
      format: "jpg",
    });
    expect(
      setExportBackground(
        {
          ...defaultSettings,
          background: "white",
          format: "jpg",
        },
        "transparent",
      ).background,
    ).toBe("white");
    expect(validateExportSettings(defaultSettings).valid).toBe(true);
    expect(validateExportSettings({
      ...defaultSettings,
      supersampling: 4,
    }).valid).toBe(true);
    expect(
      validateExportSettings({
        ...defaultSettings,
        components: {
          legend: false,
          crystalAxes: false,
          structure: false,
        },
      }),
    ).toEqual({
      message: "Select at least one export component.",
      valid: false,
    });
    expect(
      validateExportSettings({
        ...defaultSettings,
        background: "transparent",
        format: "jpg",
      }),
    ).toEqual({
      valid: false,
      message: "JPG exports need a white or black background.",
    });
    expect(
      validateExportSettings({
        ...defaultSettings,
        height: 6000,
        supersampling: 4,
        width: 6000,
      }),
    ).toEqual({
      valid: false,
      message: "Size and supersampling are too large for this browser export.",
    });
  });

  test("detects periodic image atoms", () => {
    const scene = sceneWithPeriodicImages();

    expect(countPeriodicImageAtoms(scene)).toBe(3);
    expect(hasPeriodicImageAtoms(scene)).toBe(true);
    expect(countPeriodicImageAtoms(null)).toBe(0);
    expect(hasPeriodicImageAtoms(null)).toBe(false);
  });

  test("detects polyhedra while default visibility keeps polyhedra hidden", () => {
    const scene = sceneWithPeriodicImages();

    expect(hasPolyhedra(scene)).toBe(true);
    expect(hasPolyhedra({ ...scene, polyhedra: [] })).toBe(false);
    expect(hasPolyhedra(null)).toBe(false);
    expect(createDefaultComponentVisibility(scene).polyhedra).toBe(false);
    expect(createDefaultComponentVisibility(scene).atomLabels).toBe(false);
    expect(createDefaultComponentVisibility({ ...scene, polyhedra: [] }).polyhedra).toBe(false);
    expect(createDefaultComponentVisibility().polyhedra).toBe(false);
  });

  test("filters image atoms, bonds, and polyhedra locally without mutating the loaded scene", () => {
    const scene = sceneWithPeriodicImages();
    const defaultVisibility = createDefaultComponentVisibility(scene);

    const defaultWithoutOneHopVisibility = {
      ...defaultVisibility,
      oneHopBondedAtoms: false,
    };
    const visibleScene = visibleSceneForComponents(scene, defaultWithoutOneHopVisibility);

    expect(defaultVisibility.oneHopBondedAtoms).toBe(true);
    expect(defaultVisibility.atomLabels).toBe(false);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
    ]);
    expect(bondAtomIds(visibleScene)).toEqual([
      "Na-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1",
    ]);
    expect(visibleScene?.polyhedra).toEqual([]);

    const withOneHop = visibleSceneForComponents(scene, {
      ...defaultWithoutOneHopVisibility,
      oneHopBondedAtoms: true,
    });
    expect(withOneHop?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
      "Cl-1-image-1-1-0",
    ]);
    expect(bondAtomIds(withOneHop)).toEqual([
      "Na-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0",
      "Na-0-image-1-0-0--Cl-1-image-1-1-0",
    ]);

    const withPolyhedra = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(polyhedronAtomIds(withPolyhedra)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Na-0-image-1-0-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1-image-1-1-0--Cl-1",
    ]);

    const withoutBoundary = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: true,
      boundaryAtoms: false,
    });
    expect(withoutBoundary?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
    ]);
    expect(bondAtomIds(withoutBoundary)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0",
    ]);
    expect(polyhedronAtomIds(withoutBoundary)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Cl-1-image-0--1-0--Cl-1",
    ]);

    const withoutOneHop = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: false,
    });
    expect(withoutOneHop?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
    ]);
    expect(bondAtomIds(withoutOneHop)).toEqual([
      "Na-0--Cl-1",
      "Na-0-image-1-0-0--Cl-1",
    ]);
    expect(polyhedronAtomIds(withoutOneHop)).toEqual([
      "Na-0--Cl-1",
      "Na-0--Na-0-image-1-0-0--Cl-1",
    ]);

    const withoutBonds = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      bonds: false,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(withoutBonds?.atoms).toHaveLength(5);
    expect(withoutBonds?.bonds).toEqual([]);
    expect(withoutBonds?.polyhedra).toHaveLength(4);

    const withoutPolyhedra = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: false,
    });
    expect(withoutPolyhedra?.atoms).toHaveLength(5);
    expect(withoutPolyhedra?.bonds).toHaveLength(4);
    expect(withoutPolyhedra?.polyhedra).toEqual([]);

    const withAtomLabels = visibleSceneForComponents(scene, {
      ...defaultWithoutOneHopVisibility,
      atomLabels: true,
    });
    expect(withAtomLabels).toEqual(visibleScene);

    const withoutAtomSpheres = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      atoms: false,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(withoutAtomSpheres?.atoms).toHaveLength(5);
    expect(withoutAtomSpheres?.polyhedra).toHaveLength(4);
    expect(scene.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
      "Cl-1-image-1-1-0",
    ]);
    expect(scene.polyhedra).toHaveLength(4);
  });

  test("uses a stable right safe area and a small inspector scene offset", () => {
    const safeArea = previewSafeAreaForInspector();

    expect(safeArea).toBe(INSPECTOR_PREVIEW_SAFE_AREA);
    expect(safeArea.right).toBe(176);
    expect(safeArea.left).toBe(420);
    expect(safeArea.bottom).toBe(116);
    expect(safeArea.top).toBe(40);
    expect(sceneOffsetXForInspector(false, 1200)).toBe(0);
    expect(sceneOffsetXForInspector(true, 760)).toBe(0);
    expect(sceneOffsetXForInspector(true, 1200)).toBe(INSPECTOR_OPEN_SCENE_OFFSET_X_PX);
  });
});

function sceneWithPeriodicImages(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", [0, 0, 0], [], []),
      atom("Na-0-image-1-0-0", "Na", [1, 0, 0], ["boundary"], [["boundaryAtoms"]]),
      atom("Cl-1", "Cl", [0, 0, 0], [], []),
      atom(
        "Cl-1-image-0--1-0",
        "Cl",
        [0, -1, 0],
        ["bonded"],
        [["oneHopBondedAtoms"]],
      ),
      atom(
        "Cl-1-image-1-1-0",
        "Cl",
        [1, 1, 0],
        ["bonded"],
        [["boundaryAtoms", "oneHopBondedAtoms"]],
      ),
    ],
    bonds: [
      {
        startAtomIndex: 0,
        endAtomIndex: 2,
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
      {
        startAtomIndex: 1,
        endAtomIndex: 2,
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms", "oneHopBondedAtoms"]],
      },
      {
        startAtomIndex: 0,
        endAtomIndex: 3,
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
      {
        startAtomIndex: 1,
        endAtomIndex: 4,
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms", "oneHopBondedAtoms"]],
      },
    ],
    polyhedra: [
      polyhedron([0, 2]),
      polyhedron([0, 1, 2]),
      polyhedron([0, 3, 2]),
      polyhedron([1, 4, 2]),
    ],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount: 2,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
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

function sceneWithAtomCount(atomCount: number): SceneSpec {
  const scene = sceneWithPeriodicImages();
  return {
    ...scene,
    summary: {
      ...scene.summary,
      atomCount,
    },
  };
}

function atomsWithElements(elements: string[]): AtomSpec[] {
  return elements.map((element, index) =>
    atom(`${element}-${index}`, element, [0, 0, 0], [], []),
  );
}

function bondAtomIds(scene: SceneSpec | null): string[] {
  if (!scene) {
    return [];
  }

  return scene.bonds.map(
    (bond) => `${scene.atoms[bond.startAtomIndex]?.id}--${scene.atoms[bond.endAtomIndex]?.id}`,
  );
}

function polyhedronAtomIds(scene: SceneSpec | null): string[] {
  if (!scene) {
    return [];
  }

  return scene.polyhedra.map((polyhedron) =>
    polyhedron.hullAtomIndices.map((atomIndex) => scene.atoms[atomIndex]?.id).join("--"),
  );
}

function polyhedron(hullAtomIndices: number[]): SceneSpec["polyhedra"][number] {
  return {
    centerAtomIndex: hullAtomIndices[0]!,
    hullAtomIndices,
    faces: hullAtomIndices.length >= 3 ? [[0, 1, 2]] : [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function atom(
  id: string,
  element: string,
  imageOffset: [number, number, number],
  imageReasons: AtomSpec["imageReasons"],
  visibilityDependencyGroups: AtomSpec["visibilityDependencyGroups"],
): AtomSpec {
  const isPeriodicImage = imageOffset.some((value) => value !== 0);
  const visibilityDependencies = Array.from(new Set(visibilityDependencyGroups.flat()));
  const siteId = id.split("-image-", 1)[0]!;
  const siteIndex = Number(siteId.match(/-(\d+)/)?.[1] ?? 0);
  return {
    element,
    fractionalPosition: imageOffset,
    id,
    imageOffset,
    isPeriodicImage,
    imageReasons,
    visibilityDependencies,
    visibilityDependencyGroups,
    position: imageOffset,
    siteId,
    siteIndex,
  };
}
