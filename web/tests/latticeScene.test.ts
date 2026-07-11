import { describe, expect, test } from "bun:test";
import { OrthographicCamera, Quaternion, Vector3 } from "three";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  visibleSceneForComponents,
} from "../src/model";
import {
  STRUCTURE_MATERIAL_TARGETS,
  resolveStructureMaterialFamilyForStyle,
  resolveStructureMaterialFamilyForTarget,
} from "../src/scene/materialPresetResolver";
import {
  CELL_FRAME_LINE_WIDTH_PIXELS,
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  PREVIEW_SCENE_MESH_DETAIL,
  SCENE_FOG_COLOR,
  STRUCTURE_RENDER_ORDER,
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
  createPolyhedronSurfaceBatchBuild,
  disposePolyhedronSurfaceBatchBuild,
} from "../src/scene/BatchedPolyhedra";
import { createAtomRenderItems } from "../src/scene/AtomRenderItems";
import {
  createBatchPickRegistry,
  itemForBatchId,
  registerBatchPickItem,
} from "../src/scene/batchPicking";
import {
  createDefaultCrystalCameraState,
  stateWithDirectAxis,
} from "../src/scene/crystalCamera";
import {
  computeStructureExportAspectRatio,
  type StructureExportFramePlan,
} from "../src/scene/exportFrame";
import { structureLineWidthScale } from "../src/scene/exportRenderer";
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

  test("uses the Naumann standard view with direct c projected upward", () => {
    const pose = computeStandardCameraPose(
      [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      3,
    );

    expectVectorClose(pose.outward, standardCubicOutward());
    expectVectorClose(pose.cameraUp, standardCubicUp());
    expect(dot(pose.outward, pose.cameraUp)).toBeCloseTo(0);
    expect(dot([0, 0, 1], pose.cameraUp)).toBeGreaterThan(0);
  });

  test("keeps the same Naumann standard view for rectangular orthogonal cells", () => {
    const pose = computeStandardCameraPose(
      [
        [2, 0, 0],
        [0, 3, 0],
        [0, 0, 4],
      ],
      4,
    );

    expectVectorClose(pose.outward, standardCubicOutward());
    expectVectorClose(pose.cameraUp, standardCubicUp());
  });

  test("uses the same basal viewing angle for hexagonal cells", () => {
    const pose = computeStandardCameraPose(
      [
        [1, 0, 0],
        [-0.5, Math.sqrt(3) / 2, 0],
        [0, 0, 1],
      ],
      3,
    );

    expectVectorClose(pose.outward, standardCubicOutward());
    expectVectorClose(pose.cameraUp, standardCubicUp());
  });

  test("fits the camera from the geometric mean of projected and available size", () => {
    const safeArea = {
      bottom: 116,
      left: 420,
      right: 176,
      top: 40,
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

    expect(zoom).toBeCloseTo(Math.sqrt(404 * 644) / (17 * 2));
  });

  test("fits from projected area scale instead of a longest-side cap", () => {
    const safeArea = {
      bottom: 116,
      left: 420,
      right: 176,
      top: 40,
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

    expect(zoom).toBeCloseTo(Math.sqrt(404 * 644) / (Math.sqrt(2 * 4) * 2));
  });

  test("offsets the orthographic frustum toward the safe-area center", () => {
    const frustum = computeOrthographicFrustum(1000, 800, 100, {
      bottom: 116,
      left: 420,
      right: 176,
      top: 40,
    });

    expect((frustum.left + frustum.right) / 2).toBeCloseTo(-1.22);
    expect((frustum.bottom + frustum.top) / 2).toBeCloseTo(-0.38);
  });

  test("keeps the unit-cell center visually anchored while orthographic zoom changes", () => {
    const width = 1000;
    const height = 800;
    const safeArea = {
      bottom: 116,
      left: 420,
      right: 176,
      top: 40,
    };
    const expectedScreenX =
      safeArea.left + (width - safeArea.left - safeArea.right) / 2;
    const expectedScreenY =
      safeArea.top + (height - safeArea.top - safeArea.bottom) / 2;

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
      bottom: 116,
      left: 420,
      right: 176,
      top: 40,
    };

    expect(previewSafeAreaForViewport(desktopSafeArea, 1280)).toBe(
      desktopSafeArea,
    );
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

  test("draws transparent structure objects before polyhedron shells and overlays", () => {
    expect(STRUCTURE_RENDER_ORDER.atomMesh).toBeLessThan(
      STRUCTURE_RENDER_ORDER.bondMesh,
    );
    expect(STRUCTURE_RENDER_ORDER.bondMesh).toBeLessThan(
      STRUCTURE_RENDER_ORDER.unitCellFrame,
    );
    expect(STRUCTURE_RENDER_ORDER.unitCellFrame).toBeLessThan(
      STRUCTURE_RENDER_ORDER.polyhedronSurface,
    );
    expect(STRUCTURE_RENDER_ORDER.polyhedronSurface).toBeLessThan(
      STRUCTURE_RENDER_ORDER.polyhedronEdge,
    );
    expect(STRUCTURE_RENDER_ORDER.polyhedronEdge).toBeLessThan(
      STRUCTURE_RENDER_ORDER.atomSelectionRim,
    );
  });

  test("builds atom render items for batched atom rendering", () => {
    const style = {
      ...createDefaultStyle(),
      atomRadius: 150,
    };
    const [item] = createAtomRenderItems({
      atoms: [atom("Si-0", [1, 2, 3])],
      colorScheme: style.colorScheme,
      style,
    });

    expect(item?.id).toBe("Si-0");
    expect(item?.atom.id).toBe("Si-0");
    expect(item?.position).toEqual([1, 2, 3]);
    expect(item?.radius).toBeCloseTo(1.5);
    expect(item?.color.startsWith("#")).toBe(true);
  });

  test("resolves batched pick items including batch id zero", () => {
    const registry = createBatchPickRegistry<{ id: string; label: string }>();
    const item = { id: "Si-0", label: "first atom" };

    registerBatchPickItem(registry, 0, item);

    expect(itemForBatchId(registry, 0)).toBe(item);
    expect(itemForBatchId(registry, undefined)).toBeNull();
    expect(registry.batchIdByItemId.get("Si-0")).toBe(0);
  });

  test("fits the preview layout from unit-cell bounds only", () => {
    const scene = sceneWithOffCenterAtoms();

    expect(computeSceneLayout(scene).span).toBeCloseTo(5);
    expect(computeSceneLayout(scene, "vdw").span).toBeCloseTo(5);
    expect(computeSceneLayout(scene, "vdw").cameraFitBounds).toEqual(
      computeSceneLayout(scene).cameraFitBounds,
    );
  });

  test("uses atom positions for the depth cueing front and back references", () => {
    const scene = sceneWithOffCenterAtoms();
    const layout = computeSceneLayout(scene);
    const outward = new Vector3(...layout.standardPose.outward).normalize();
    const offset = new Vector3(...layout.groupPosition);
    const projections = scene.atoms.map((item) =>
      new Vector3(...item.position).add(offset).dot(outward),
    );
    const expectedFrontOffset = -Math.max(0, ...projections);
    const expectedBackOffset = Math.max(
      0.01 * layout.span,
      -Math.min(0, ...projections),
    );

    expect(layout.depthCueingFrontOffset).toBeCloseTo(expectedFrontOffset);
    expect(layout.depthCueingBackOffset).toBeCloseTo(expectedBackOffset);
  });

  test("tracks the standard-view projected fit size for slender unit cells", () => {
    const layout = computeSceneLayout(sceneWithLongCell());

    expect(layout.cameraFitBounds.projectedWidth).toBeGreaterThan(0);
    expect(layout.cameraFitBounds.projectedWidth).toBeLessThan(layout.span);
    expect(layout.cameraFitBounds.projectedHeight).toBeLessThan(layout.span);
  });

  test("uses the default standard-view projected footprint for 100 percent fit", () => {
    const layout = computeSceneLayout(sceneWithLongC());

    expect(layout.span).toBeCloseTo(10);
    expect(layout.cameraFitBounds.projectedWidth).toBeGreaterThan(0);
    expect(layout.cameraFitBounds.projectedHeight).toBeGreaterThan(0);
  });

  test("keeps the projected fit size fixed after the initial default view", () => {
    const scene = sceneWithLongC();
    const standardLayout = computeSceneLayout(scene);
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
    expect(standardLayout.cameraFitBounds.projectedHeight).toBeGreaterThan(0);
    expect(aOutwardLayout.cameraFitBounds).toEqual(
      standardLayout.cameraFitBounds,
    );
  });

  test("resolves selected material family with per-target overrides", () => {
    const style = {
      ...createDefaultStyle(),
      materialPreset: "glossy",
    };
    const atomFamily = resolveStructureMaterialFamilyForTarget(style, "atom");
    const bondFamily = resolveStructureMaterialFamilyForTarget(style, "bond");
    const polyhedronFamily = resolveStructureMaterialFamilyForTarget(
      style,
      "polyhedron",
    );

    expect(STRUCTURE_MATERIAL_TARGETS).toEqual(["atom", "bond", "polyhedron"]);
    expect(atomFamily.id).toBe("glossy");
    expect(atomFamily.material.type).toBe("MeshStandardMaterial");
    expect(bondFamily).toEqual(atomFamily);
    expect(polyhedronFamily.id).toBe(atomFamily.id);
    expect(polyhedronFamily.lighting).toEqual(atomFamily.lighting);
    expect(polyhedronFamily.material.type).toBe("MeshStandardMaterial");
    expect(polyhedronFamily.material.props).not.toEqual(
      atomFamily.material.props,
    );
    expect(
      resolveStructureMaterialFamilyForStyle({
        ...style,
        materialPreset: "2d",
      }).material.type,
    ).toBe("MeshBasicMaterial");
    expect(
      resolveStructureMaterialFamilyForTarget(
        {
          ...style,
          materialPreset: "2d",
        },
        "polyhedron",
      ),
    ).toEqual(
      resolveStructureMaterialFamilyForTarget(
        {
          ...style,
          materialPreset: "2d",
        },
        "atom",
      ),
    );
  });

  test("keeps preview mesh detail aligned with the medium quality preset", () => {
    expect(PREVIEW_SCENE_MESH_DETAIL).toEqual({
      bondRadialSegments: 16,
      sphereHeightSegments: 24,
      sphereWidthSegments: 32,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.low).toEqual({
      bondRadialSegments: 12,
      sphereHeightSegments: 16,
      sphereWidthSegments: 24,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.medium).toBe(
      PREVIEW_SCENE_MESH_DETAIL,
    );
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.high).toEqual({
      bondRadialSegments: 24,
      sphereHeightSegments: 32,
      sphereWidthSegments: 48,
    });
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.xhigh.sphereWidthSegments).toBe(72);
    expect(EXPORT_SCENE_MESH_DETAIL_PRESETS.xhigh.bondRadialSegments).toBe(32);
  });

  test("scales exported structure line width from the tight content bounds", () => {
    expect(
      structureLineWidthScale(exportFramePlanWithBounds(2000, 2000), 1),
    ).toBeCloseTo(2);
    expect(
      structureLineWidthScale(exportFramePlanWithBounds(2000, 2000, 4), 4),
    ).toBeCloseTo(8);
    expect(
      structureLineWidthScale(exportFramePlanWithBounds(600, 600, 2), 2),
    ).toBeCloseTo(2);
    expect(
      structureLineWidthScale(exportFramePlanWithBounds(5000, 5000), 1),
    ).toBeCloseTo(5);
  });

  test("builds bicolor bonds as one open cylinder side with a hard color boundary", () => {
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
    expect([
      color.getX(rowVertexCount),
      color.getY(rowVertexCount),
      color.getZ(rowVertexCount),
    ]).toEqual([1, 0, 0]);
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

  test("maps depth cueing start and amount to a linear scene fog range", () => {
    expect(createSceneFog(40, 10, 6, 1, 0, 25)).toBeNull();

    const earlyFog = createSceneFog(40, 10, 6, 1, 50, 0);
    const lateFog = createSceneFog(40, 10, 6, 1, 50, 100);
    const subtleFog = createSceneFog(40, 10, 6, 1, 25, 25);
    const strongFog = createSceneFog(40, 10, 6, 1, 100, 25);

    expect(earlyFog).not.toBeNull();
    expect(lateFog).not.toBeNull();
    expect(subtleFog).not.toBeNull();
    expect(strongFog).not.toBeNull();
    expect(earlyFog?.color.getHexString()).toBe(SCENE_FOG_COLOR.slice(1));
    expect(earlyFog!.near).toBeCloseTo(37);
    expect(lateFog!.near).toBeGreaterThan(earlyFog!.near);
    expect(lateFog!.near).toBeCloseTo(42);
    expect(lateFog!.far).toBeLessThan(earlyFog!.far);
    expect(strongFog!.near).toBeCloseTo(subtleFog!.near);
    expect(strongFog!.far).toBeLessThan(subtleFog!.far);

    const backDepth = 40 + 6;
    const earlyBackFade =
      (backDepth - earlyFog!.near) / (earlyFog!.far - earlyFog!.near);
    const lateBackFade =
      (backDepth - lateFog!.near) / (lateFog!.far - lateFog!.near);
    expect(earlyBackFade).toBeCloseTo(0.5);
    expect(lateBackFade).toBeCloseTo(0.5);
    expect(strongFog!.far).toBeCloseTo(backDepth);
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
    ).toBeCloseTo(2.25);
    expect(
      computeStructureExportAspectRatio({
        cameraPose,
        componentOpacity,
        scene: withOneHopScene!,
        showAtoms: true,
        showUnitCell: false,
        style,
      }),
    ).toBeCloseTo(9 / 14);
  });

  test("builds polyhedron geometry from returned hull atoms and faces", () => {
    const scene = sceneWithOffCenterAtoms();
    const polyhedron = {
      centerAtomIndex: 0,
      hullAtomIndices: [0, 1, 2, 3],
      faces: [
        [0, 1, 2],
        [0, 1, 3],
        [0, 2, 3],
        [1, 2, 3],
      ],
      visibilityDependencies: [],
      visibilityDependencyGroups: [],
    } satisfies SceneSpec["polyhedra"][number];

    const geometry = polyhedronGeometryFromAtoms(polyhedron, scene.atoms);

    expect(geometry?.getAttribute("position").count).toBe(4);
    expect(geometry?.index?.count).toBe(12);
    geometry?.dispose();
  });

  test("skips polyhedron geometry when hull atoms or face indices are invalid", () => {
    const scene = sceneWithOffCenterAtoms();

    expect(
      polyhedronGeometryFromAtoms(
        {
          centerAtomIndex: 0,
          hullAtomIndices: [0, 999, 2],
          faces: [[0, 1, 2]],
          visibilityDependencies: [],
          visibilityDependencyGroups: [],
        },
        scene.atoms,
      ),
    ).toBeNull();
    expect(
      polyhedronGeometryFromAtoms(
        {
          centerAtomIndex: 0,
          hullAtomIndices: [0, 1, 2],
          faces: [[0, 1, 3]],
          visibilityDependencies: [],
          visibilityDependencyGroups: [],
        },
        scene.atoms,
      ),
    ).toBeNull();
  });

  test("builds one surface batch for valid polyhedra and skips invalid entries", () => {
    const scene = sceneWithOffCenterAtoms();
    const atoms = [
      ...scene.atoms,
      atom("Si-4", [1.1, 0.1, 0.1]),
      atom("Si-5", [1.3, 0.1, 0.1]),
      atom("Si-6", [1.1, 0.3, 0.1]),
      atom("Si-7", [1.1, 0.1, 0.3]),
    ];
    const validPolyhedron = tetrahedronPolyhedron();
    const secondValidPolyhedron = {
      ...tetrahedronPolyhedron(),
      centerAtomIndex: 4,
      hullAtomIndices: [4, 5, 6, 7],
    };
    const invalidCenterPolyhedron = {
      ...tetrahedronPolyhedron(),
      centerAtomIndex: 999,
    };
    const invalidFacePolyhedron = {
      ...tetrahedronPolyhedron(),
      faces: [[0, 1, 4]],
    } satisfies SceneSpec["polyhedra"][number];

    const batch = createPolyhedronSurfaceBatchBuild({
      atoms,
      colorScheme: createDefaultStyle().colorScheme,
      polyhedra: [
        validPolyhedron,
        invalidCenterPolyhedron,
        secondValidPolyhedron,
        invalidFacePolyhedron,
      ],
      style: createDefaultStyle(),
    });

    expect(batch).not.toBeNull();
    if (!batch) {
      throw new Error("Expected valid polyhedra to produce a surface batch.");
    }

    expect(batch.itemCount).toBe(2);
    expect(batch.maxVertexCount).toBe(8);
    expect(batch.maxIndexCount).toBe(24);
    expect(batch.items.map((item) => item.polyhedronIndex)).toEqual([0, 2]);
    expect(batch.edgeItems.map((item) => item.polyhedronIndex)).toEqual([0, 2]);
    expect(batch.key.startsWith("polyhedra:2:")).toBe(true);
    disposePolyhedronSurfaceBatchBuild(batch);
  });

  test("deduplicates coincident polyhedron surface faces across the batch", () => {
    const scene = sceneWithOffCenterAtoms();
    const batch = createPolyhedronSurfaceBatchBuild({
      atoms: scene.atoms,
      colorScheme: createDefaultStyle().colorScheme,
      polyhedra: [
        tetrahedronPolyhedron(),
        {
          ...tetrahedronPolyhedron(),
          centerAtomIndex: 1,
        },
      ],
      style: createDefaultStyle(),
    });

    expect(batch).not.toBeNull();
    if (!batch) {
      throw new Error("Expected valid polyhedra to produce a surface batch.");
    }

    expect(batch.itemCount).toBe(1);
    expect(batch.maxVertexCount).toBe(4);
    expect(batch.maxIndexCount).toBe(12);
    expect(batch.items.map((item) => item.polyhedronIndex)).toEqual([0]);
    expect(batch.edgeItems.map((item) => item.polyhedronIndex)).toEqual([0, 1]);
    disposePolyhedronSurfaceBatchBuild(batch);
  });

  test("keeps nearly coincident but distinct polyhedron surface faces", () => {
    const scene = sceneWithOffCenterAtoms();
    const atoms = [
      ...scene.atoms,
      atom("Si-4", [0.10000001, 0.1, 0.1]),
      atom("Si-5", [0.3, 0.1, 0.1]),
      atom("Si-6", [0.1, 0.3, 0.1]),
      atom("Si-7", [0.1, 0.1, 0.3]),
    ];
    const batch = createPolyhedronSurfaceBatchBuild({
      atoms,
      colorScheme: createDefaultStyle().colorScheme,
      polyhedra: [
        tetrahedronPolyhedron(),
        {
          ...tetrahedronPolyhedron(),
          centerAtomIndex: 4,
          hullAtomIndices: [4, 5, 6, 7],
        },
      ],
      style: createDefaultStyle(),
    });

    expect(batch).not.toBeNull();
    if (!batch) {
      throw new Error("Expected valid polyhedra to produce a surface batch.");
    }

    expect(batch.itemCount).toBe(2);
    expect(batch.items.map((item) => item.polyhedronIndex)).toEqual([0, 1]);
    expect(batch.edgeItems.map((item) => item.polyhedronIndex)).toEqual([0, 1]);
    disposePolyhedronSurfaceBatchBuild(batch);
  });

  test("normalizes orientation gizmo axes without orthogonalizing the cell", () => {
    const axes = computeOrientationGizmoAxes([
      [4, 0, 0],
      [1, 3, 0],
      [0, 0, 2],
    ]);

    expect(axes.map((axis) => axis.label)).toEqual(["a", "b", "c"]);
    expectVectorClose(axes[0]!.direction, [1, 0, 0]);
    expectVectorClose(axes[1]!.direction, [
      1 / Math.sqrt(10),
      3 / Math.sqrt(10),
      0,
    ]);
    expectVectorClose(axes[2]!.direction, [0, 0, 1]);
  });
});

function expectVectorClose(
  actual: [number, number, number],
  expected: [number, number, number],
) {
  expect(actual[0]).toBeCloseTo(expected[0]);
  expect(actual[1]).toBeCloseTo(expected[1]);
  expect(actual[2]).toBeCloseTo(expected[2]);
}

function standardCubicOutward(): [number, number, number] {
  const length = Math.sqrt(41);
  return [6 / length, 2 / length, 1 / length];
}

function standardCubicUp(): [number, number, number] {
  const length = Math.sqrt(1640);
  return [-6 / length, -2 / length, 40 / length];
}

function dot(left: [number, number, number], right: [number, number, number]) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function tetrahedronPolyhedron(): SceneSpec["polyhedra"][number] {
  return {
    centerAtomIndex: 0,
    hullAtomIndices: [0, 1, 2, 3],
    faces: [
      [0, 1, 2],
      [0, 1, 3],
      [0, 2, 3],
      [1, 2, 3],
    ],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function firstTriangleNormalDotVertexNormal(
  geometry: ReturnType<typeof twoToneBondCylinderGeometry>,
) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.index;

  expect(index).not.toBeNull();

  const a = index!.getX(0);
  const b = index!.getX(1);
  const c = index!.getX(2);
  const pointA = new Vector3(
    position.getX(a),
    position.getY(a),
    position.getZ(a),
  );
  const pointB = new Vector3(
    position.getX(b),
    position.getY(b),
    position.getZ(b),
  );
  const pointC = new Vector3(
    position.getX(c),
    position.getY(c),
    position.getZ(c),
  );
  const faceNormal = pointB.sub(pointA).cross(pointC.sub(pointA)).normalize();
  const vertexNormal = new Vector3(
    normal.getX(a),
    normal.getY(a),
    normal.getZ(a),
  );

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
    bondFamilies: [],
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
    atoms: [atom("Si-0", [0, 0, 0]), atom("Si-1", [10, 0, 0])],
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
    atoms: [atom("Si-0", [0, 0, 0]), atom("Si-1", [0, 0, 10])],
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

function exportFramePlanWithBounds(
  contentWidth: number,
  contentHeight: number,
  supersampling = 1,
): StructureExportFramePlan {
  return {
    aspectRatio: contentWidth / contentHeight,
    bounds: {
      centerX: contentWidth / 2,
      centerY: contentHeight / 2,
      height: contentHeight,
      maxX: contentWidth,
      maxY: contentHeight,
      minX: 0,
      minY: 0,
      width: contentWidth,
    },
    centerX: contentWidth / 2,
    centerY: contentHeight / 2,
    height: contentHeight * supersampling,
    width: contentWidth * supersampling,
    zoom: supersampling,
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
