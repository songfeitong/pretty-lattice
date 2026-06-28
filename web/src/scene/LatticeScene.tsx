import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Quaternion } from "three";

import type { SceneSpec } from "../api/scene";
import type { CameraInteractionStore } from "../model/cameraInteractionStore";
import type { PreviewSafeArea } from "../model/layout";
import {
  DEFAULT_PREVIEW_MESH_QUALITY,
  type AtomRenderingMode,
  type BondRenderingMode,
  type ComponentOpacityState,
  type MeshQuality,
  type StyleState,
} from "../model";
import type { PreviewFpsStore } from "../model/previewFpsStore";
import type { InteractionMode } from "../model/viewState";
import { CameraHeadlight } from "./CameraHeadlight";
import { computeCrystalCameraPose, type CrystalCameraState } from "./crystalCamera";
import {
  resolveStructureMaterialFamilyForStyle,
  type ResolvedStructureMaterialFamily,
} from "./materialPresetResolver";
import { PreviewCameraController } from "./PreviewCameraController";
import {
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  PreviewSceneContent,
} from "./StructureSceneObjects";
import { computeSceneStructureLayout, type SceneLayout } from "./sceneLayout";
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

const EMPTY_SAFE_AREA: PreviewSafeArea = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};
const FPS_IDLE_TIMEOUT_MS = 550;
const FPS_REPORT_INTERVAL_MS = 250;
const FPS_SMOOTHING_WEIGHT = 0.18;

export function LatticeScene({
  cameraOrientationRef,
  atomRenderingMode = "mesh",
  bondRenderingMode = "mesh",
  cameraAnimatedCommandVersion = 0,
  cameraInteractionStore,
  cameraState,
  cameraCommandVersion,
  componentOpacity,
  interactionLocked,
  interactionMode,
  layoutScene,
  onCameraCommandAnimationActiveChange,
  onCameraControlsInteractionActiveChange,
  onCameraOrientationFrame,
  onCameraOrientationChange,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  resetCounter,
  safeArea = EMPTY_SAFE_AREA,
  scene,
  inspectedAtomId = null,
  pulseAtomId = null,
  pulseToken = 0,
  previewMeshQuality = DEFAULT_PREVIEW_MESH_QUALITY,
  previewFpsStore,
  showAtoms = true,
  showFpsOverlay = false,
  showUnitCell = true,
  style,
  suspendCameraOrientationUpdates = false,
}: {
  cameraOrientationRef?: CameraOrientationRef;
  atomRenderingMode?: AtomRenderingMode;
  bondRenderingMode?: BondRenderingMode;
  cameraAnimatedCommandVersion?: number;
  cameraInteractionStore: CameraInteractionStore;
  cameraCommandVersion: number;
  cameraState: CrystalCameraState;
  componentOpacity: ComponentOpacityState;
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  layoutScene?: SceneSpec;
  onCameraCommandAnimationActiveChange?: (isActive: boolean) => void;
  onCameraControlsInteractionActiveChange?: (
    isActive: boolean,
    quaternionSnapshot?: Quaternion,
  ) => void;
  onCameraOrientationFrame?: () => void;
  onCameraOrientationChange?: () => void;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  resetCounter: number;
  safeArea?: PreviewSafeArea;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  pulseAtomId?: string | null;
  pulseToken?: number;
  previewMeshQuality?: MeshQuality;
  previewFpsStore?: PreviewFpsStore;
  showAtoms?: boolean;
  showFpsOverlay?: boolean;
  showUnitCell?: boolean;
  style: StyleState;
  suspendCameraOrientationUpdates?: boolean;
}) {
  const layoutSourceScene = layoutScene ?? scene;
  const structureLayout = useMemo(
    () => computeSceneStructureLayout(layoutSourceScene, style.atomRadiusModel),
    [layoutSourceScene, style.atomRadiusModel],
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
      position: layout.standardPose.cameraPosition,
      zoom: 1,
      near: 0.01,
      far: Math.max(1000, layout.standardPose.distance + layout.span * 8),
    }),
    [layout.span, layout.standardPose.cameraPosition, layout.standardPose.distance],
  );
  const materialFamily = useMemo(
    () => resolveStructureMaterialFamilyForStyle(style),
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
      <ambientLight intensity={materialFamily.lighting.ambientIntensity} />
      <MaterialPresetCameraLights materialFamily={materialFamily} />
      <PreviewCameraController
        cameraAnimatedCommandVersion={cameraAnimatedCommandVersion}
        cameraCommandVersion={cameraCommandVersion}
        cameraInteractionStore={cameraInteractionStore}
        cameraPose={layout.cameraPose}
        cellVectors={layoutSourceScene.cell.vectors}
        interactionLocked={interactionLocked}
        interactionMode={interactionMode}
        layout={layout}
        onCameraCommandAnimationActiveChange={onCameraCommandAnimationActiveChange}
        onCameraControlsInteractionActiveChange={onCameraControlsInteractionActiveChange}
        resetCounter={resetCounter}
        safeArea={safeArea}
      />
      <PreviewSceneContent
        atomRenderingMode={atomRenderingMode}
        bondRenderingMode={bondRenderingMode}
        componentOpacity={componentOpacity}
        layout={layout}
        materialFamily={materialFamily}
        meshDetail={EXPORT_SCENE_MESH_DETAIL_PRESETS[previewMeshQuality]}
        scene={scene}
        inspectedAtomId={inspectedAtomId}
        interactionLocked={interactionLocked}
        onAtomInspect={onAtomInspect}
        onAtomPulse={onAtomPulse}
        onLockedInteractionAttempt={onLockedInteractionAttempt}
        pulseAtomId={pulseAtomId}
        pulseToken={pulseToken}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
      />
      <CameraOrientationTracker
        cameraOrientationRef={cameraOrientationRef}
        onCameraOrientationFrame={onCameraOrientationFrame}
        onCameraOrientationChange={onCameraOrientationChange}
        suspendUpdates={suspendCameraOrientationUpdates}
      />
      {showFpsOverlay && previewFpsStore ? (
        <PreviewFpsMeter previewFpsStore={previewFpsStore} />
      ) : null}
    </Canvas>
  );
}

function MaterialPresetCameraLights({
  materialFamily,
}: {
  materialFamily: ResolvedStructureMaterialFamily;
}) {
  return (
    <>
      {materialFamily.lighting.cameraLights.map((light, index) => (
        <CameraHeadlight
          key={`${index}:${light.intensity}:${light.offset.join(",")}`}
          intensity={light.intensity}
          offset={light.offset}
        />
      ))}
    </>
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
    cameraOrientationRef?.current.copy(camera.quaternion);
    lastNotifiedOrientationRef.current.copy(camera.quaternion);
    lastNotificationTimeRef.current = performance.now();
    if (!suspendUpdates) {
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
    if (orientationDelta < 0.002 || now - lastNotificationTimeRef.current < 120) {
      return;
    }

    lastNotifiedOrientationRef.current.copy(camera.quaternion);
    lastNotificationTimeRef.current = now;
    onCameraOrientationChange();
  });

  return null;
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
