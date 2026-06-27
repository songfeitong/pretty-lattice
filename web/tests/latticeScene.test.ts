import { describe, expect, test } from "bun:test";
import { OrthographicCamera, Quaternion, Vector3 } from "three";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  visibleSceneForComponents,
} from "../src/app/settings";
import {
  STRUCTURE_MATERIAL_TARGETS,
  resolveStructureMaterialFamilyForStyle,
  resolveStructureMaterialFamilyForTarget,
} from "../src/scene/materialPresetResolver";
import {
  BOND_COLOR,
  BOND_2D_RADIAL_SEGMENTS,
  BOND_RADIUS,
  BOND_TUBE_RADIAL_SEGMENTS,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  POLYHEDRON_EDGE_COLOR,
  POLYHEDRON_EDGE_OPACITY,
  POLYHEDRON_SURFACE_OPACITY,
  PREVIEW_SCENE_MESH_DETAIL,
  SCENE_FOG_COLOR,
  cellFrameLinePositions,
  computeSceneLayout,
  createSceneFog,
  polyhedronGeometryFromAtoms,
  previewSafeAreaForViewport,
  twoToneBondCylinderGeometry,
} from "../src/scene/LatticeScene";
import {
  applyCameraPoseSnapshot,
  createCameraPoseSnapshot,
} from "../src/scene/cameraPose";
import {
  createDefaultCrystalCameraState,
  stateWithDirectAxis,
} from "../src/scene/crystalCamera";
import {
  computeStructureExportAspectRatio,
  computeStructureExportFramePlan,
  projectCellFrameLinesToExportFrame,
} from "../src/scene/exportFrame";
import {
  applyOrthographicFrustum,
  computeCameraFitZoom,
  computeOrthographicFrustum,
  computeStandardCameraPose,
} from "../src/scene/viewMath";
import { computeOrientationGizmoAxes } from "../src/scene/orientationGizmoMath";

describe("computeSceneLayout", () => {
  test("anchors the preview on the unit-cell center instead of atom distribution", () => {
    const scene = sceneWithOffCenterAtoms();

    expect(computeSceneLayout(scene).groupPosition).toEqual([-2.5, -1.5, -1]);
  });

  test("uses the VESTA-like c-outward b-star-up camera pose", () => {
    const pose = computeStandardCameraPose(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      3,
    );

    expectVectorClose(pose.outward, [0, 0, 1]);
    expectVectorClose(pose.cameraUp, [0, 1, 0]);
    expect(dot(pose.outward, pose.cameraUp)).toBeCloseTo(0);
    expect(dot([0, 1, 0], pose.cameraUp)).toBeGreaterThan(0);
  });

  test("fits the camera to stable preview safe areas", () => {
    const safeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };
    const zoom = computeCameraFitZoom(
      {
        projectedHeight: 17,
        projectedWidth: 17,
      },
      1000,
      800,
      safeArea,
    );

    expect(zoom).toBeCloseTo(404 / (17 * 1.15));
  });

  test("fits directly from the projected size instead of a 3D span cap", () => {
    const safeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };
    const zoom = computeCameraFitZoom(
      {
        projectedHeight: 2,
        projectedWidth: 4,
      },
      1000,
      800,
      safeArea,
    );

    expect(zoom).toBeCloseTo(404 / (4 * 1.15));
  });

  test("offsets the orthographic frustum toward the safe-area center", () => {
    const frustum = computeOrthographicFrustum(1000, 800, 100, {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    });

    expect((frustum.left + frustum.right) / 2).toBeCloseTo(-1.22);
    expect((frustum.bottom + frustum.top) / 2).toBeCloseTo(-0.54);
  });

  test("keeps the unit-cell center visually anchored while orthographic zoom changes", () => {
    const width = 1000;
    const height = 800;
    const safeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };
    const expectedScreenX = safeArea.left + (width - safeArea.left - safeArea.right) / 2;
    const expectedScreenY = safeArea.top + (height - safeArea.top - safeArea.bottom) / 2;

    for (const zoom of [10, 25, 50, 100, 200]) {
      const camera = new OrthographicCamera();
      camera.position.set(10, 10, 10);
      camera.lookAt(0, 0, 0);
      applyOrthographicFrustum(camera, width, height, zoom, safeArea);
      camera.updateMatrixWorld(true);

      const projectedCenter = new Vector3(0, 0, 0).project(camera);
      const screenX = ((projectedCenter.x + 1) / 2) * width;
      const screenY = ((-projectedCenter.y + 1) / 2) * height;

      expect(screenX).toBeCloseTo(expectedScreenX);
      expect(screenY).toBeCloseTo(expectedScreenY);
    }
  });

  test("folds the preview safe area for narrow viewports", () => {
    const desktopSafeArea = {
      bottom: 132,
      left: 420,
      right: 176,
      top: 24,
    };

    expect(previewSafeAreaForViewport(desktopSafeArea, 1280)).toBe(desktopSafeArea);
    expect(previewSafeAreaForViewport(desktopSafeArea, 390)).toEqual({
      bottom: 132,
      left: 16,
      right: 88,
      top: 476,
    });
  });

  test("describes the unit-cell frame as twelve screen-space line segments", () => {
    const positions = cellFrameLinePositions([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    expect(CELL_FRAME_LINE_WIDTH_PIXELS).toBe(1);
    expect(positions).toHaveLength(72);
    expect(positions.slice(0, 6)).toEqual([0, 0, 0, 4, 0, 0]);
    expect(positions.slice(-6)).toEqual([1, 3, 2, 5, 3, 2]);
  });

  test("fits the preview layout from frontend element radii", () => {
    const scene = sceneWithOffCenterAtoms();

    expect(computeSceneLayout(scene).span).toBeCloseTo(6);
    expect(computeSceneLayout(scene, "vdw").span).toBeCloseTo(9.2);
  });

  test("tracks the VESTA-like projected fit size for slender structures", () => {
    const layout = computeSceneLayout(sceneWithLongCell());

    expect(layout.cameraFitBounds.projectedWidth).toBeCloseTo(layout.span);
    expect(layout.cameraFitBounds.projectedHeight).toBeLessThan(layout.span);
  });

  test("uses the default c-outward projected footprint for 100 percent fit", () => {
    const layout = computeSceneLayout(sceneWithLongC());

    expect(layout.span).toBeGreaterThan(10);
    expect(layout.cameraFitBounds.projectedWidth).toBeLessThan(3);
    expect(layout.cameraFitBounds.projectedHeight).toBeLessThan(3);
  });

  test("keeps the projected fit size fixed after the initial default view", () => {
    const scene = sceneWithLongC();
    const cOutwardLayout = computeSceneLayout(scene);
    const aOutwardLayout = computeSceneLayout(
      scene,
      "uniform",
      stateWithDirectAxis(
        scene.cell.vectors,
        createDefaultCrystalCameraState(),
        "a",
      ),
    );

    expectVectorClose(aOutwardLayout.cameraPose.outward, [1, 0, 0]);
    expect(cOutwardLayout.cameraFitBounds.projectedHeight).toBeLessThan(3);
    expect(aOutwardLayout.cameraFitBounds).toEqual(cOutwardLayout.cameraFitBounds);
  });

  test("uses fixed first-version bond styling", () => {
    expect(BOND_COLOR).toBe("#c7cbd1");
    expect(BOND_2D_RADIAL_SEGMENTS).toBe(12);
    expect(BOND_RADIUS).toBe(0.14);
    expect(BOND_TUBE_RADIAL_SEGMENTS).toBe(24);
  });

  test("resolves one selected material family across structure objects", () => {
    const style = {
      ...createDefaultStyle(),
      materialPreset: "glossy",
    };
    const atomFamily = resolveStructureMaterialFamilyForTarget(style, "atom");
    const bondFamily = resolveStructureMaterialFamilyForTarget(style, "bond");
    const polyhedronFamily = resolveStructureMaterialFamilyForTarget(style, "polyhedron");

    expect(STRUCTURE_MATERIAL_TARGETS).toEqual(["atom", "bond", "polyhedron"]);
    expect(atomFamily.id).toBe("glossy");
    expect(atomFamily.material).toEqual({
      flatShading: false,
      kind: "standard",
      metalness: 0,
      roughness: 0.32,
    });
    expect(atomFamily.lighting.cameraLights).toHaveLength(2);
    expect(atomFamily.lighting.cameraLights[1]).toEqual({
      intensity: 0.85,
      offset: [-0.08, 0.38, 0.12],
    });
    expect(bondFamily).toEqual(atomFamily);
    expect(polyhedronFamily).toEqual(atomFamily);
    expect(resolveStructureMaterialFamilyForStyle({
      ...style,
      materialPreset: "flat-2d",
    }).material.kind).toBe("basic");
  });

  test("keeps preview mesh detail fixed while export presets scale together", () => {
    expect(PREVIEW_SCENE_MESH_DETAIL).toEqual({
      bond2dRadialSegments: 10,
      bondRadialSegments: 16,
      sphereHeightSegments: 24,
      sphereWidthSegments: 32,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.low).toEqual({
      bond2dRadialSegments: 8,
      bondRadialSegments: 12,
      sphereHeightSegments: 16,
      sphereWidthSegments: 24,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.medium).toBe(PREVIEW_SCENE_MESH_DETAIL);
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.high).toEqual({
      bond2dRadialSegments: 12,
      bondRadialSegments: 24,
      sphereHeightSegments: 32,
      sphereWidthSegments: 48,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.xhigh.sphereWidthSegments).toBe(72);
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.xhigh.bondRadialSegments).toBe(32);
  });

  test("builds by-atom bonds as one open cylinder side with a hard color boundary", () => {
    const geometry = twoToneBondCylinderGeometry({
      endColor: "#0000ff",
      length: 4,
      radialSegments: 4,
      radius: 0.5,
      startColor: "#ff0000",
    });
    const position = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    const rowVertexCount = 5;

    expect(position.count).toBe(4 * rowVertexCount);
    expect(geometry.index?.count).toBe(2 * 4 * 2 * 3);
    expect(position.getY(0)).toBeCloseTo(-2);
    expect(position.getY(rowVertexCount)).toBeCloseTo(0);
    expect(position.getY(rowVertexCount * 2)).toBeCloseTo(0);
    expect(position.getY(rowVertexCount * 3)).toBeCloseTo(2);
    expect([color.getX(rowVertexCount), color.getY(rowVertexCount), color.getZ(rowVertexCount)])
      .toEqual([1, 0, 0]);
    expect([
      color.getX(rowVertexCount * 2),
      color.getY(rowVertexCount * 2),
      color.getZ(rowVertexCount * 2),
    ]).toEqual([0, 0, 1]);

    for (let index = 0; index < position.count; index += 1) {
      const isCenterCapVertex =
        Math.abs(position.getY(index)) < 1e-12 &&
        Math.abs(position.getX(index)) < 1e-12 &&
        Math.abs(position.getZ(index)) < 1e-12;

      expect(isCenterCapVertex).toBe(false);
    }

    expect(firstTriangleNormalDotVertexNormal(geometry)).toBeGreaterThan(0);

    geometry.dispose();
  });

  test("captures and applies a narrow orthographic camera pose snapshot", () => {
    const sourceOrientation = new Quaternion();
    const snapshot = createCameraPoseSnapshot(sourceOrientation, [1, 2, 3]);
    const camera = new OrthographicCamera();

    applyCameraPoseSnapshot(camera, snapshot, 10, 3);

    expect(snapshot).toEqual({
      projection: "orthographic",
      quaternion: [0, 0, 0, 1],
      target: [1, 2, 3],
    });
    expect(camera.position.x).toBeCloseTo(1);
    expect(camera.position.y).toBeCloseTo(2);
    expect(camera.position.z).toBeCloseTo(13);
    expect(camera.up.x).toBeCloseTo(0);
    expect(camera.up.y).toBeCloseTo(1);
    expect(camera.up.z).toBeCloseTo(0);
    expect(camera.near).toBeCloseTo(0.01);
    expect(camera.far).toBeGreaterThanOrEqual(1000);
  });

  test("maps fog start and strength to a linear scene fog range", () => {
    expect(createSceneFog(40, 10, 25, 0)).toBeNull();

    const earlyFog = createSceneFog(40, 10, 0, 100);
    const lateFog = createSceneFog(40, 10, 100, 100);
    const softFog = createSceneFog(40, 10, 25, 25);
    const strongFog = createSceneFog(40, 10, 25, 100);

    expect(earlyFog).not.toBeNull();
    expect(lateFog).not.toBeNull();
    expect(softFog).not.toBeNull();
    expect(strongFog).not.toBeNull();
    expect(earlyFog?.color.getHexString()).toBe(SCENE_FOG_COLOR.slice(1));
    expect(earlyFog!.near).toBeLessThan(35);
    expect(lateFog!.near).toBeGreaterThan(earlyFog!.near);
    expect(lateFog!.far).toBeGreaterThan(earlyFog!.far);
    expect(strongFog!.near).toBeCloseTo(softFog!.near);
    expect(strongFog!.far).toBeLessThan(softFog!.far);
  });

  test("derives export aspect from the projected currently visible content", () => {
    const scene = sceneWithExportVisibilityAtoms();
    const visibility = createDefaultComponentVisibility(scene);
    const cameraPose = createCameraPoseSnapshot(new Quaternion());
    const componentOpacity = createDefaultComponentOpacity();
    const style = createDefaultStyle();

    const defaultVisibleScene = visibleSceneForComponents(scene, visibility);
    const withOneHopScene = visibleSceneForComponents(scene, {
      ...visibility,
      oneHopBondedAtoms: true,
    });

    expect(defaultVisibleScene).not.toBeNull();
    expect(withOneHopScene).not.toBeNull();
    expect(
      computeStructureExportAspectRatio({
        cameraPose,
        componentOpacity,
        scene: defaultVisibleScene!,
        showAtoms: true,
        showUnitCell: false,
        style,
      }),
    ).toBeCloseTo(2);
    expect(
      computeStructureExportAspectRatio({
        cameraPose,
        componentOpacity,
        scene: withOneHopScene!,
        showAtoms: true,
        showUnitCell: false,
        style,
      }),
    ).toBeCloseTo(2 / 3);
  });

  test("projects unit-cell frame lines into the export frame for vector PDF overlay", () => {
    const scene = sceneWithExportVisibilityAtoms();
    const cameraPose = createCameraPoseSnapshot(new Quaternion());
    const framePlan = computeStructureExportFramePlan({
      cameraPose,
      componentOpacity: createDefaultComponentOpacity(),
      height: 100,
      scene,
      showAtoms: false,
      showUnitCell: true,
      style: createDefaultStyle(),
      width: 100,
    });
    const lines = projectCellFrameLinesToExportFrame({ cameraPose, framePlan, scene });

    expect(lines).toHaveLength(12);
    for (const line of lines) {
      for (const point of [line.start, line.end]) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(100);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(100);
      }
    }
  });

  test("builds polyhedron geometry from returned hull atoms and faces", () => {
    const scene = sceneWithOffCenterAtoms();
    const polyhedron = {
      id: "polyhedron-Si-0",
      centerAtomId: "Si-0",
      hullAtomIds: ["Si-0", "Si-1", "Si-2", "Si-3"],
      faces: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
      visibilityDependencies: [],
      visibilityDependencyGroups: [],
    } satisfies SceneSpec["polyhedra"][number];
    const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));

    const geometry = polyhedronGeometryFromAtoms(polyhedron, atomById);

    expect(POLYHEDRON_EDGE_COLOR).toBe("#f2f5f9");
    expect(POLYHEDRON_EDGE_OPACITY).toBe(0.8);
    expect(POLYHEDRON_SURFACE_OPACITY).toBe(0.5);
    expect(geometry?.getAttribute("position").count).toBe(4);
    expect(geometry?.index?.count).toBe(12);
    geometry?.dispose();
  });

  test("skips polyhedron geometry when hull atoms or face indices are invalid", () => {
    const scene = sceneWithOffCenterAtoms();
    const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));

    expect(
      polyhedronGeometryFromAtoms(
        {
          id: "polyhedron-missing",
          centerAtomId: "Si-0",
          hullAtomIds: ["Si-0", "missing", "Si-2"],
          faces: [[0, 1, 2]],
          visibilityDependencies: [],
          visibilityDependencyGroups: [],
        },
        atomById,
      ),
    ).toBeNull();
    expect(
      polyhedronGeometryFromAtoms(
        {
          id: "polyhedron-invalid-face",
          centerAtomId: "Si-0",
          hullAtomIds: ["Si-0", "Si-1", "Si-2"],
          faces: [[0, 1, 3]],
          visibilityDependencies: [],
          visibilityDependencyGroups: [],
        },
        atomById,
      ),
    ).toBeNull();
  });

  test("normalizes orientation gizmo axes without orthogonalizing the cell", () => {
    const axes = computeOrientationGizmoAxes([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    expect(axes.map((axis) => axis.label)).toEqual(["a", "b", "c"]);
    expectVectorClose(axes[0]!.direction, [1, 0, 0]);
    expectVectorClose(axes[1]!.direction, [1 / Math.sqrt(10), 3 / Math.sqrt(10), 0]);
    expectVectorClose(axes[2]!.direction, [0, 0, 1]);
  });
});

function expectVectorClose(actual: [number, number, number], expected: [number, number, number]) {
  expect(actual[0]).toBeCloseTo(expected[0]);
  expect(actual[1]).toBeCloseTo(expected[1]);
  expect(actual[2]).toBeCloseTo(expected[2]);
}

function dot(left: [number, number, number], right: [number, number, number]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function firstTriangleNormalDotVertexNormal(geometry: ReturnType<typeof twoToneBondCylinderGeometry>) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.index;

  expect(index).not.toBeNull();

  const a = index!.getX(0);
  const b = index!.getX(1);
  const c = index!.getX(2);
  const pointA = new Vector3(position.getX(a), position.getY(a), position.getZ(a));
  const pointB = new Vector3(position.getX(b), position.getY(b), position.getZ(b));
  const pointC = new Vector3(position.getX(c), position.getY(c), position.getZ(c));
  const faceNormal = pointB.sub(pointA).cross(pointC.sub(pointA)).normalize();
  const vertexNormal = new Vector3(normal.getX(a), normal.getY(a), normal.getZ(a));

  return faceNormal.dot(vertexNormal);
}

function sceneWithOffCenterAtoms(): SceneSpec {
  return {
    atoms: [
      atom("Si-0", [0.1, 0.1, 0.1]),
      atom("Si-1", [0.3, 0.1, 0.1]),
      atom("Si-2", [0.1, 0.3, 0.1]),
      atom("Si-3", [0.1, 0.1, 0.3]),
    ],
    bonds: [],
    polyhedra: [],
    cell: {
      vectors: [
        [4, 0, 0],
        [1, 3, 0],
        [0, 0, 2],
      ],
    },
    summary: {
      atomCount: 4,
      cell: {
        a: "4.00",
        alpha: "90.00",
        b: "3.16",
        beta: "90.00",
        c: "2.00",
        gamma: "71.57",
      },
      formula: "Si",
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

function sceneWithExportVisibilityAtoms(): SceneSpec {
  return {
    atoms: [
      atom("Na-0", [0, 0, 0]),
      {
        ...atom("Na-0-boundary", [1, 0, 0]),
        imageOffset: [1, 0, 0],
        imageReasons: ["boundary"],
        isPeriodicImage: true,
        visibilityDependencies: ["boundaryAtoms"],
        visibilityDependencyGroups: [["boundaryAtoms"]],
      },
      {
        ...atom("Cl-1-one-hop", [0, -2, 0]),
        imageOffset: [0, -1, 0],
        imageReasons: ["bonded"],
        isPeriodicImage: true,
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
    ],
    bonds: [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    polyhedra: [],
    summary: {
      atomCount: 1,
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

function sceneWithLongCell(): SceneSpec {
  return {
    ...sceneWithOffCenterAtoms(),
    atoms: [
      atom("Si-0", [0, 0, 0]),
      atom("Si-1", [10, 0, 0]),
    ],
    cell: {
      vectors: [
        [10, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      ...sceneWithOffCenterAtoms().summary,
      atomCount: 2,
    },
  };
}

function sceneWithLongC(): SceneSpec {
  return {
    ...sceneWithOffCenterAtoms(),
    atoms: [
      atom("Si-0", [0, 0, 0]),
      atom("Si-1", [0, 0, 10]),
    ],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 10],
      ],
    },
    summary: {
      ...sceneWithOffCenterAtoms().summary,
      atomCount: 2,
    },
  };
}

function atom(id: string, position: [number, number, number]): AtomSpec {
  const siteIndex = Number(id.match(/-(\d+)/)?.[1] ?? 0);
  return {
    element: "Si",
    fractionalPosition: [0, 0, 0],
    id,
    imageOffset: [0, 0, 0],
    isPeriodicImage: false,
    imageReasons: [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
    position,
    siteId: id,
    siteIndex,
  };
}
