import { describe, expect, test } from "bun:test";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  STYLE_FOG_START_MAX,
  STYLE_FOG_START_MIN,
  STYLE_FOG_STRENGTH_MAX,
  STYLE_FOG_STRENGTH_MIN,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  defaultAtomRenderingModeForScene,
  defaultBondRenderingModeForScene,
  defaultPreviewMeshQualityForScene,
  createDefaultExportSettings,
  createDefaultStyle,
  createDefaultComponentVisibility,
  INSPECTOR_OPEN_SCENE_OFFSET_X_PX,
  INSPECTOR_PREVIEW_SAFE_AREA,
  PREVIEW_PERFORMANCE_ATOM_COUNT_THRESHOLD,
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
} from "../src/app/settings";

describe("settings", () => {
  test("defaults rendering modes to batched paths and keeps the large-scene mesh quality threshold", () => {
    const belowThreshold = PREVIEW_PERFORMANCE_ATOM_COUNT_THRESHOLD - 1;
    const atThreshold = PREVIEW_PERFORMANCE_ATOM_COUNT_THRESHOLD;
    const aboveThreshold = PREVIEW_PERFORMANCE_ATOM_COUNT_THRESHOLD + 1;

    expect(defaultAtomRenderingModeForScene(null)).toBe("instanced");
    expect(defaultAtomRenderingModeForScene(sceneWithAtomCount(belowThreshold))).toBe("instanced");
    expect(defaultAtomRenderingModeForScene(sceneWithAtomCount(atThreshold))).toBe("instanced");
    expect(defaultAtomRenderingModeForScene(sceneWithAtomCount(aboveThreshold))).toBe("instanced");
    expect(defaultBondRenderingModeForScene(null)).toBe("batched");
    expect(defaultBondRenderingModeForScene(sceneWithAtomCount(belowThreshold))).toBe("batched");
    expect(defaultBondRenderingModeForScene(sceneWithAtomCount(atThreshold))).toBe("batched");
    expect(defaultBondRenderingModeForScene(sceneWithAtomCount(aboveThreshold))).toBe("batched");

    expect(defaultPreviewMeshQualityForScene(null)).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(belowThreshold))).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(atThreshold))).toBe("medium");
    expect(defaultPreviewMeshQualityForScene(sceneWithAtomCount(aboveThreshold))).toBe("low");
  });

  test("defaults style controls to global 100 percent and by-atom bonds", () => {
    expect(createDefaultStyle()).toEqual({
      atomRadius: 100,
      atomRadiusModel: "uniform",
      bondColorMode: "by-atom",
      bondThickness: 100,
      colorScheme: "vesta-soft",
      fogEnabled: false,
      fogStart: 50,
      fogStrength: 50,
      materialPreset: "classic-matte",
    });
    expect(STYLE_FOG_START_MIN).toBe(0);
    expect(STYLE_FOG_START_MAX).toBe(100);
    expect(STYLE_FOG_STRENGTH_MIN).toBe(0);
    expect(STYLE_FOG_STRENGTH_MAX).toBe(100);
    expect(STYLE_SCALE_MIN.atomRadius).toBe(0);
    expect(STYLE_SCALE_MAX.bondThickness).toBe(200);
  });

  test("defaults figure export settings to PNG with separate 2D and 3D quality controls", () => {
    expect(createDefaultExportSettings()).toEqual({
      aspectRatioLocked: false,
      background: "transparent",
      combineComponents: true,
      components: {
        legend: false,
        latticeVectors: false,
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
      latticeVectors: false,
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
          latticeVectors: false,
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
    expect(createDefaultComponentVisibility({ ...scene, polyhedra: [] }).polyhedra).toBe(false);
    expect(createDefaultComponentVisibility().polyhedra).toBe(false);
  });

  test("filters image atoms, bonds, and polyhedra locally without mutating the loaded scene", () => {
    const scene = sceneWithPeriodicImages();
    const defaultVisibility = createDefaultComponentVisibility(scene);

    const visibleScene = visibleSceneForComponents(scene, defaultVisibility);

    expect(defaultVisibility.oneHopBondedAtoms).toBe(false);
    expect(visibleScene?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
    ]);
    expect(visibleScene?.bonds.map((bond) => bond.id)).toEqual([
      "bond-canonical",
      "bond-boundary-canonical",
    ]);
    expect(visibleScene?.polyhedra).toEqual([]);

    const withOneHop = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      oneHopBondedAtoms: true,
    });
    expect(withOneHop?.atoms.map((atom) => atom.id)).toEqual([
      "Na-0",
      "Na-0-image-1-0-0",
      "Cl-1",
      "Cl-1-image-0--1-0",
      "Cl-1-image-1-1-0",
    ]);
    expect(withOneHop?.bonds.map((bond) => bond.id)).toEqual([
      "bond-canonical",
      "bond-boundary-canonical",
      "bond-one-hop",
      "bond-boundary-source",
    ]);

    const withPolyhedra = visibleSceneForComponents(scene, {
      ...defaultVisibility,
      polyhedra: true,
      oneHopBondedAtoms: true,
    });
    expect(withPolyhedra?.polyhedra.map((polyhedron) => polyhedron.id)).toEqual([
      "polyhedron-canonical",
      "polyhedron-boundary",
      "polyhedron-one-hop",
      "polyhedron-boundary-one-hop",
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
    expect(withoutBoundary?.bonds.map((bond) => bond.id)).toEqual([
      "bond-canonical",
      "bond-one-hop",
    ]);
    expect(withoutBoundary?.polyhedra.map((polyhedron) => polyhedron.id)).toEqual([
      "polyhedron-canonical",
      "polyhedron-one-hop",
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
    expect(withoutOneHop?.bonds.map((bond) => bond.id)).toEqual([
      "bond-canonical",
      "bond-boundary-canonical",
    ]);
    expect(withoutOneHop?.polyhedra.map((polyhedron) => polyhedron.id)).toEqual([
      "polyhedron-canonical",
      "polyhedron-boundary",
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
    expect(withoutPolyhedra?.atoms).toHaveLength(3);
    expect(withoutPolyhedra?.bonds).toHaveLength(2);
    expect(withoutPolyhedra?.polyhedra).toEqual([]);

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
    expect(safeArea.bottom).toBe(132);
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
        id: "bond-canonical",
        startAtomId: "Na-0",
        endAtomId: "Cl-1",
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
      {
        id: "bond-boundary-canonical",
        startAtomId: "Na-0-image-1-0-0",
        endAtomId: "Cl-1",
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms", "oneHopBondedAtoms"]],
      },
      {
        id: "bond-one-hop",
        startAtomId: "Na-0",
        endAtomId: "Cl-1-image-0--1-0",
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
      {
        id: "bond-boundary-source",
        startAtomId: "Na-0-image-1-0-0",
        endAtomId: "Cl-1-image-1-1-0",
        visibilityDependencies: ["boundaryAtoms", "oneHopBondedAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms", "oneHopBondedAtoms"]],
      },
    ],
    polyhedra: [
      polyhedron("polyhedron-canonical", ["Na-0", "Cl-1"]),
      polyhedron("polyhedron-boundary", ["Na-0", "Na-0-image-1-0-0", "Cl-1"]),
      polyhedron("polyhedron-one-hop", ["Na-0", "Cl-1-image-0--1-0", "Cl-1"]),
      polyhedron("polyhedron-boundary-one-hop", [
        "Na-0-image-1-0-0",
        "Cl-1-image-1-1-0",
        "Cl-1",
      ]),
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

function polyhedron(id: string, hullAtomIds: string[]): SceneSpec["polyhedra"][number] {
  return {
    id,
    centerAtomId: hullAtomIds[0]!,
    hullAtomIds,
    faces: hullAtomIds.length >= 3 ? [[0, 1, 2]] : [],
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
