import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Quaternion, Vector3 } from "three";

import type { SceneSpec } from "../api/scene";
import type { CameraInteractionStore } from "../model/cameraInteractionStore";
import type { PreviewSafeArea } from "../model/layout";
import {
  DEFAULT_DRAG_SENSITIVITY,
  DEFAULT_PREVIEW_MESH_QUALITY,
  type AtomLabelSettings,
  type ComponentOpacityState,
  type MeshQuality,
  type StyleState,
  type UnitCellLineStyle,
} from "../model";
import type { PreviewFpsStore } from "../model/previewFpsStore";
import type { InteractionMode } from "../model/viewState";
import { computeCrystalCameraPose, type CrystalCameraState } from "./crystalCamera";
import { MaterialPresetLights } from "./MaterialPresetLights";
import {
  resolveStructureMaterialFamiliesForStyle,
  resolveStructureMaterialFamilyForStyle,
} from "./materialPresetResolver";
import { PreviewCameraController } from "./PreviewCameraController";
import {
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  PreviewSceneContent,
} from "./StructureSceneObjects";
import { computeSceneStructureLayout, type SceneLayout } from "./sceneLayout";
import { atomRadiusForModel } from "./sceneGeometry";
import { DEFAULT_RENDERER_PARAMETERS } from "./rendererParameters";
import type { VectorTuple } from "./viewMath";

export type { PreviewSafeArea } from "../model/layout";
export {
  BOND_RADIUS,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  cellFrameLinePositions,
} from "./sceneGeometry";
export { ExportSceneContent } from "./ExportSceneContent";
export {
  BOND_COLOR,
  BOND_TUBE_RADIAL_SEGMENTS,
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  POLYHEDRON_EDGE_COLOR,
  POLYHEDRON_EDGE_OPACITY,
  POLYHEDRON_SURFACE_OPACITY,
  PREVIEW_SCENE_MESH_DETAIL,
  SCENE_FOG_COLOR,
  createSceneFog,
  type SceneMeshDetail,
} from "./StructureSceneObjects";
export {
  computeSceneLayout,
  computeSceneStructureLayout,
  previewSafeAreaForViewport,
  type SceneLayout,
  type SceneStructureLayout,
} from "./sceneLayout";
export { polyhedronGeometryFromAtoms, twoToneBondCylinderGeometry } from "./structureGeometry";

export interface CameraOrientationRef {
  current: Quaternion;
}

interface OrthographicCanvasCameraProps {
  far: number;
  near: number;
  position: VectorTuple;
  zoom: number;
}

interface ClientPoint {
  x: number;
  y: number;
}

interface ClientRectBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export interface AtomBoxSelectionSnapshot {
  atomIdAtClientPoint: (point: ClientPoint) => string | null;
  atomIdsInClientRect: (rect: ClientRectBounds) => string[];
}

const EMPTY_SAFE_AREA: PreviewSafeArea = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};
const CAMERA_ORIENTATION_CHANGE_EPSILON = 0.002;
const FPS_IDLE_TIMEOUT_MS = 550;
const FPS_REPORT_INTERVAL_MS = 250;
const FPS_SMOOTHING_WEIGHT = 0.18;

export function LatticeScene({
  cameraOrientationRef,
  cameraAnimatedCommandVersion = 0,
  cameraInteractionStore,
  cameraState,
  cameraCommandVersion,
  componentOpacity,
  dragSensitivity = DEFAULT_DRAG_SENSITIVITY,
  interactionLocked,
  interactionMode,
  layoutScene,
  lightStrength = 1,
  onCameraCommandAnimationActiveChange,
  onCameraControlsInteractionActiveChange,
  onCameraOrientationFrame,
  onCameraOrientationChange,
  onAtomInspect,
  onAtomBoxSelectionSnapshotChange,
  onAtomMeasure,
  onAtomPulse,
  onLockedInteractionAttempt,
  resetCounter,
  safeArea = EMPTY_SAFE_AREA,
  scene,
  inspectedAtomId = null,
  measuredAtomIds = [],
  pulseAtomId = null,
  pulseToken = 0,
  previewMeshQuality = DEFAULT_PREVIEW_MESH_QUALITY,
  previewFpsStore,
  atomLabelSettings = null,
  showAtoms = true,
  showFpsOverlay = false,
  showUnitCell = true,
  style,
  suspendCameraOrientationUpdates = false,
  unitCellLineStyle = "solid",
}: {
  cameraOrientationRef?: CameraOrientationRef;
  cameraAnimatedCommandVersion?: number;
  cameraInteractionStore: CameraInteractionStore;
  cameraCommandVersion: number;
  cameraState: CrystalCameraState;
  componentOpacity: ComponentOpacityState;
  dragSensitivity?: number;
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  layoutScene?: SceneSpec;
  lightStrength?: number;
  onCameraCommandAnimationActiveChange?: (isActive: boolean) => void;
  onCameraControlsInteractionActiveChange?: (
    isActive: boolean,
    quaternionSnapshot?: Quaternion,
  ) => void;
  onCameraOrientationFrame?: () => void;
  onCameraOrientationChange?: () => void;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomBoxSelectionSnapshotChange?: (snapshot: AtomBoxSelectionSnapshot | null) => void;
  onAtomMeasure?: (atomId: string) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  resetCounter: number;
  safeArea?: PreviewSafeArea;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  measuredAtomIds?: string[];
  pulseAtomId?: string | null;
  pulseToken?: number;
  previewMeshQuality?: MeshQuality;
  previewFpsStore?: PreviewFpsStore;
  atomLabelSettings?: AtomLabelSettings | null;
  showAtoms?: boolean;
  showFpsOverlay?: boolean;
  showUnitCell?: boolean;
  style: StyleState;
  suspendCameraOrientationUpdates?: boolean;
  unitCellLineStyle?: UnitCellLineStyle;
}) {
  const layoutSourceScene = layoutScene ?? scene;
  const structureLayout = useMemo(
    () => computeSceneStructureLayout(layoutSourceScene),
    [layoutSourceScene],
  );
  const cameraPose = useMemo(
    () =>
      computeCrystalCameraPose(
        layoutSourceScene.cell.vectors,
        cameraState,
        structureLayout.span,
      ),
    [cameraState, layoutSourceScene.cell.vectors, structureLayout.span],
  );
  const layout = useMemo<SceneLayout>(
    () => ({
      ...structureLayout,
      cameraPose,
    }),
    [cameraPose, structureLayout],
  );
  const cameraProps = useMemo<OrthographicCanvasCameraProps>(
    () => ({
      position: layout.cameraPose.cameraPosition,
      zoom: 1,
      near: 0.01,
      far: Math.max(1000, layout.cameraPose.distance + layout.span * 8),
    }),
    [layout.cameraPose.cameraPosition, layout.cameraPose.distance, layout.span],
  );
  const materialFamily = useMemo(
    () => resolveStructureMaterialFamilyForStyle(style),
    [style.materialPreset],
  );
  const materialFamilies = useMemo(
    () => resolveStructureMaterialFamiliesForStyle(style),
    [style.materialPreset],
  );

  return (
    <Canvas
      orthographic
      camera={cameraProps}
      frameloop="demand"
      gl={DEFAULT_RENDERER_PARAMETERS}
      data-testid="lattice-canvas"
    >
      <MaterialPresetLights
        intensityScale={lightStrength}
        lighting={materialFamily.lighting}
      />
      <PreviewCameraController
        cameraAnimatedCommandVersion={cameraAnimatedCommandVersion}
        cameraCommandVersion={cameraCommandVersion}
        cameraInteractionStore={cameraInteractionStore}
        cameraPose={layout.cameraPose}
        cellVectors={layoutSourceScene.cell.vectors}
        dragSensitivity={dragSensitivity}
        interactionLocked={interactionLocked}
        interactionMode={interactionMode}
        layout={layout}
        onCameraCommandAnimationActiveChange={onCameraCommandAnimationActiveChange}
        onCameraControlsInteractionActiveChange={onCameraControlsInteractionActiveChange}
        resetCounter={resetCounter}
        safeArea={safeArea}
      />
      <PreviewSceneContent
        atomLabelSettings={atomLabelSettings}
        componentOpacity={componentOpacity}
        layout={layout}
        materialFamilies={materialFamilies}
        meshDetail={EXPORT_SCENE_MESH_DETAIL_PRESETS[previewMeshQuality]}
        scene={scene}
        inspectedAtomId={inspectedAtomId}
        measuredAtomIds={measuredAtomIds}
        interactionLocked={interactionLocked}
        onAtomInspect={onAtomInspect}
        onAtomMeasure={onAtomMeasure}
        onAtomPulse={onAtomPulse}
        onLockedInteractionAttempt={onLockedInteractionAttempt}
        pulseAtomId={pulseAtomId}
        pulseToken={pulseToken}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
        unitCellLineStyle={unitCellLineStyle}
      />
      <CameraOrientationTracker
        cameraOrientationRef={cameraOrientationRef}
        onCameraOrientationFrame={onCameraOrientationFrame}
        onCameraOrientationChange={onCameraOrientationChange}
        suspendUpdates={suspendCameraOrientationUpdates}
      />
      <AtomBoxSelectionSnapshotReporter
        atomRadiusModel={style.atomRadiusModel}
        atomRadiusScale={style.atomRadius / 100}
        groupPosition={layout.groupPosition}
        onSnapshotChange={onAtomBoxSelectionSnapshotChange}
        scene={scene}
        showAtoms={showAtoms}
      />
      {showFpsOverlay && previewFpsStore ? (
        <PreviewFpsMeter previewFpsStore={previewFpsStore} />
      ) : null}
    </Canvas>
  );
}

function CameraOrientationTracker({
  cameraOrientationRef,
  onCameraOrientationFrame,
  onCameraOrientationChange,
  suspendUpdates,
}: {
  cameraOrientationRef?: CameraOrientationRef;
  onCameraOrientationFrame?: () => void;
  onCameraOrientationChange?: () => void;
  suspendUpdates: boolean;
}) {
  const { camera } = useThree();
  const lastNotifiedOrientationRef = useRef(new Quaternion());
  const lastNotificationTimeRef = useRef(0);

  useEffect(() => {
    const orientationDelta =
      cameraOrientationRef?.current.angleTo(camera.quaternion) ?? Infinity;
    cameraOrientationRef?.current.copy(camera.quaternion);
    lastNotifiedOrientationRef.current.copy(camera.quaternion);
    lastNotificationTimeRef.current = performance.now();
    if (!suspendUpdates && orientationDelta >= CAMERA_ORIENTATION_CHANGE_EPSILON) {
      onCameraOrientationChange?.();
    }
  }, [camera, cameraOrientationRef, onCameraOrientationChange, suspendUpdates]);

  useFrame(() => {
    cameraOrientationRef?.current.copy(camera.quaternion);
    onCameraOrientationFrame?.();

    if (!onCameraOrientationChange || suspendUpdates) {
      return;
    }

    const now = performance.now();
    const orientationDelta = lastNotifiedOrientationRef.current.angleTo(camera.quaternion);
    if (
      orientationDelta < CAMERA_ORIENTATION_CHANGE_EPSILON ||
      now - lastNotificationTimeRef.current < 120
    ) {
      return;
    }

    lastNotifiedOrientationRef.current.copy(camera.quaternion);
    lastNotificationTimeRef.current = now;
    onCameraOrientationChange();
  });

  return null;
}

function AtomBoxSelectionSnapshotReporter({
  atomRadiusModel,
  atomRadiusScale,
  groupPosition,
  onSnapshotChange,
  scene,
  showAtoms,
}: {
  atomRadiusModel: StyleState["atomRadiusModel"];
  atomRadiusScale: number;
  groupPosition: VectorTuple;
  onSnapshotChange?: (snapshot: AtomBoxSelectionSnapshot | null) => void;
  scene: SceneSpec;
  showAtoms: boolean;
}) {
  const { camera, gl } = useThree();
  const snapshot = useMemo<AtomBoxSelectionSnapshot>(
    () => ({
      atomIdAtClientPoint: (point) => {
        if (!showAtoms) {
          return null;
        }

        let nearestAtomId: string | null = null;
        let nearestDistance = Infinity;
        for (const atom of scene.atoms) {
          const atomScreenPoint = atomClientPoint(atom.position, groupPosition, camera, gl.domElement);
          if (!atomScreenPoint) {
            continue;
          }

          const distance = Math.hypot(atomScreenPoint.x - point.x, atomScreenPoint.y - point.y);
          const hitRadius = Math.max(
            8,
            atomClientRadius(
              atom.position,
              atomRadiusForModel(atom, atomRadiusModel) * atomRadiusScale,
              groupPosition,
              camera,
              gl.domElement,
            ) + 4,
          );
          if (distance <= hitRadius && distance < nearestDistance) {
            nearestAtomId = atom.id;
            nearestDistance = distance;
          }
        }

        return nearestAtomId;
      },
      atomIdsInClientRect: (rect) => {
        if (!showAtoms) {
          return [];
        }

        return scene.atoms.flatMap((atom) => {
          const atomScreenPoint = atomClientPoint(atom.position, groupPosition, camera, gl.domElement);
          if (!atomScreenPoint) {
            return [];
          }

          return atomScreenPoint.x >= rect.left &&
            atomScreenPoint.x <= rect.right &&
            atomScreenPoint.y >= rect.top &&
            atomScreenPoint.y <= rect.bottom
            ? [atom.id]
            : [];
        });
      },
    }),
    [
      atomRadiusModel,
      atomRadiusScale,
      camera,
      gl.domElement,
      groupPosition,
      scene.atoms,
      showAtoms,
    ],
  );

  useEffect(() => {
    onSnapshotChange?.(snapshot);

    return () => {
      onSnapshotChange?.(null);
    };
  }, [onSnapshotChange, snapshot]);

  return null;
}

function atomClientPoint(
  position: VectorTuple,
  groupPosition: VectorTuple,
  camera: Parameters<Vector3["project"]>[0],
  canvas: HTMLCanvasElement,
): ClientPoint | null {
  const bounds = canvas.getBoundingClientRect();
  const projected = new Vector3(...position)
    .add(new Vector3(...groupPosition))
    .project(camera);
  if (projected.z < -1 || projected.z > 1) {
    return null;
  }

  return {
    x: bounds.left + ((projected.x + 1) * bounds.width) / 2,
    y: bounds.top + ((1 - projected.y) * bounds.height) / 2,
  };
}

function atomClientRadius(
  position: VectorTuple,
  radius: number,
  groupPosition: VectorTuple,
  camera: Parameters<Vector3["project"]>[0],
  canvas: HTMLCanvasElement,
): number {
  const center = atomClientPoint(position, groupPosition, camera, canvas);
  if (!center) {
    return 0;
  }

  const cameraRight = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
  const edgePosition = new Vector3(...position).add(cameraRight.multiplyScalar(radius));
  const edge = atomClientPoint([edgePosition.x, edgePosition.y, edgePosition.z], groupPosition, camera, canvas);
  if (!edge) {
    return 0;
  }

  return Math.hypot(edge.x - center.x, edge.y - center.y);
}

function PreviewFpsMeter({
  previewFpsStore,
}: {
  previewFpsStore: PreviewFpsStore;
}) {
  const idleTimeoutRef = useRef<number | null>(null);
  const lastReportTimeRef = useRef(0);
  const smoothedFpsRef = useRef(0);

  useEffect(() => {
    previewFpsStore.setFpsSnapshot(0);
    return () => {
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      previewFpsStore.setFpsSnapshot(0);
    };
  }, [previewFpsStore]);

  useFrame((_, delta) => {
    const instantFps =
      delta > 0 && Number.isFinite(delta) ? Math.min(999, 1 / delta) : 0;
    smoothedFpsRef.current =
      smoothedFpsRef.current === 0
        ? instantFps
        : smoothedFpsRef.current * (1 - FPS_SMOOTHING_WEIGHT) +
          instantFps * FPS_SMOOTHING_WEIGHT;

    const now = performance.now();
    if (now - lastReportTimeRef.current >= FPS_REPORT_INTERVAL_MS) {
      lastReportTimeRef.current = now;
      previewFpsStore.setFpsSnapshot(smoothedFpsRef.current);
    }

    if (idleTimeoutRef.current !== null) {
      window.clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = window.setTimeout(() => {
      idleTimeoutRef.current = null;
      lastReportTimeRef.current = 0;
      smoothedFpsRef.current = 0;
      previewFpsStore.setFpsSnapshot(0);
    }, FPS_IDLE_TIMEOUT_MS);
  });

  return null;
}
