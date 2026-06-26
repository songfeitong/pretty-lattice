import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box3,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MOUSE,
  OrthographicCamera,
  Quaternion,
  TOUCH,
  Vector3,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js";

import type {
  AtomRadiusModel,
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
} from "../api/scene";
import { atomColorForScheme } from "../app/colorSchemes";
import type {
  BondColorMode,
  ComponentOpacityState,
  ExportMeshQuality,
  RenderBackend,
  StyleState,
} from "../app/settings";
import {
  MAX_VIEW_SCALE,
  MIN_VIEW_SCALE,
  clampViewScale,
  type InteractionMode,
} from "../app/viewState";
import type { CameraInteractionStore } from "../app/cameraInteractionStore";
import { CameraHeadlight } from "./CameraHeadlight";
import { applyCameraPoseSnapshot, type CameraPoseSnapshot } from "./cameraPose";
import {
  computeCrystalCameraPose,
  createDefaultCrystalCameraState,
  type CrystalCameraState,
  type CrystalCameraPose,
} from "./crystalCamera";
import {
  applyOrthographicExportFrame,
  type StructureExportFramePlan,
} from "./exportFrame";
import { PREVIEW_AMBIENT_LIGHT_INTENSITY } from "./renderAppearance";
import {
  BOND_RADIUS,
  CELL_FRAME_COLOR,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  atomRadiusForModel,
  cellCenter,
  cellCorners,
  cellFrameLinePositions,
} from "./sceneGeometry";
import {
  applyOrthographicFrustum,
  type CameraFitBounds,
  computeCameraFitZoom,
  computeOrthographicFrustum,
  computeStandardCameraPose,
  type StandardCameraPose,
  type VectorTuple,
} from "./viewMath";
import { createPreviewRendererFactory } from "./renderBackend";

export interface PreviewSafeArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

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
const NARROW_VIEWPORT_BREAKPOINT = 760;
const NARROW_VIEWPORT_SAFE_AREA: PreviewSafeArea = {
  bottom: 132,
  left: 16,
  right: 88,
  top: 476,
};
const CAMERA_TARGET = new Vector3(0, 0, 0);
const CAMERA_LOCAL_FORWARD = new Vector3(0, 0, 1);
const CAMERA_LOCAL_UP = new Vector3(0, 1, 0);
const CAMERA_COMMAND_ANIMATION_DURATION_MS = 260;
const CAMERA_CONTROLS_IDLE_EPSILON_RADIANS = 0.0005;
const CAMERA_CONTROLS_IDLE_FRAMES = 1;
const CAMERA_CONTROLS_IDLE_ZOOM_EPSILON = 0.0005;
// OrbitControls and TrackballControls expose these gesture states publicly.
const CAMERA_CONTROLS_STATE_NONE = -1;
const CAMERA_CONTROLS_STATE_ROTATE = 0;
const CAMERA_CONTROLS_STATE_TOUCH_ROTATE = 3;
const CAMERA_CONTROLS_STATE_ORBIT_TOUCH_DOLLY_ROTATE = 6;
const VIEW_SCALE_SYNC_EPSILON = 0.0005;
const FRUSTUM_SYNC_EPSILON = 0.000001;
export const BOND_COLOR = "#c7cbd1";
export const BOND_2D_RADIAL_SEGMENTS = 12;
export const BOND_TUBE_RADIAL_SEGMENTS = 24;
export const POLYHEDRON_SURFACE_OPACITY = 0.5;
export const POLYHEDRON_EDGE_COLOR = "#f2f5f9";
export const POLYHEDRON_EDGE_OPACITY = 0.8;
const POLYHEDRON_EDGE_OPACITY_RATIO =
  POLYHEDRON_EDGE_OPACITY / POLYHEDRON_SURFACE_OPACITY;
export const SCENE_FOG_COLOR = "#fafafa";
const FOG_START_OFFSET_EARLY = -0.7;
const FOG_START_OFFSET_LATE = 0.35;
const FOG_FALLOFF_SPAN_STRONG = 0.35;
const FOG_FALLOFF_SPAN_SOFT = 1.15;
const ATOM_HIGHLIGHT_TARGET_COLOR = new Color("#ffffff");
const ATOM_HIGHLIGHT_PULSE_MS = 240;
const ATOM_HIGHLIGHT_SELECT_MS = 150;
const ATOM_HIGHLIGHT_EMISSIVE_COLOR_MIX = 0.5;
const ATOM_HIGHLIGHT_SELECTED_COLOR_MIX = 0.26;
const ATOM_HIGHLIGHT_PULSE_COLOR_MIX = 0.34;
const ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY = 0.32;
const ATOM_HIGHLIGHT_PULSE_EMISSIVE_INTENSITY = 0.42;
const ATOM_HIGHLIGHT_HALO_SELECTED_SCALE = 1.12;
const ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE = 1.03;
const ATOM_HIGHLIGHT_HALO_SELECTED_OPACITY = 0.28;

export {
  BOND_RADIUS,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  cellFrameLinePositions,
} from "./sceneGeometry";

export interface SceneMeshDetail {
  bond2dRadialSegments: number;
  bondRadialSegments: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export const PREVIEW_SCENE_MESH_DETAIL: SceneMeshDetail = {
  bond2dRadialSegments: 10,
  bondRadialSegments: 16,
  sphereHeightSegments: 24,
  sphereWidthSegments: 32,
};

export const EXPORT_SCENE_MESH_DETAIL_PRESETS: Record<ExportMeshQuality, SceneMeshDetail> = {
  low: {
    bond2dRadialSegments: 8,
    bondRadialSegments: 12,
    sphereHeightSegments: 16,
    sphereWidthSegments: 24,
  },
  medium: PREVIEW_SCENE_MESH_DETAIL,
  high: {
    bond2dRadialSegments: BOND_2D_RADIAL_SEGMENTS,
    bondRadialSegments: BOND_TUBE_RADIAL_SEGMENTS,
    sphereHeightSegments: 32,
    sphereWidthSegments: 48,
  },
  xhigh: {
    bond2dRadialSegments: 16,
    bondRadialSegments: 32,
    sphereHeightSegments: 48,
    sphereWidthSegments: 72,
  },
};

export function LatticeScene({
  cameraOrientationRef,
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
  onCameraOrientationChange,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  resetCounter,
  renderBackend,
  safeArea = EMPTY_SAFE_AREA,
  scene,
  inspectedAtomId = null,
  pulseAtomId = null,
  pulseToken = 0,
  showAtoms = true,
  showUnitCell = true,
  style,
  suspendCameraOrientationUpdates = false,
}: {
  cameraOrientationRef?: CameraOrientationRef;
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
  onCameraOrientationChange?: () => void;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  resetCounter: number;
  renderBackend: RenderBackend;
  safeArea?: PreviewSafeArea;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  pulseAtomId?: string | null;
  pulseToken?: number;
  showAtoms?: boolean;
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
  const rendererFactory = useMemo(
    () => createPreviewRendererFactory(renderBackend),
    [renderBackend],
  );

  return (
    <Canvas
      key={renderBackend}
      orthographic
      camera={cameraProps}
      gl={rendererFactory}
      data-testid="lattice-canvas"
    >
      <ambientLight intensity={PREVIEW_AMBIENT_LIGHT_INTENSITY} />
      <CameraHeadlight />
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
        componentOpacity={componentOpacity}
        layout={layout}
        meshDetail={PREVIEW_SCENE_MESH_DETAIL}
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
        onCameraOrientationChange={onCameraOrientationChange}
        suspendUpdates={suspendCameraOrientationUpdates}
      />
    </Canvas>
  );
}

function CameraOrientationTracker({
  cameraOrientationRef,
  onCameraOrientationChange,
  suspendUpdates,
}: {
  cameraOrientationRef?: CameraOrientationRef;
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

function PreviewSceneContent({
  componentOpacity,
  layout,
  meshDetail,
  scene,
  inspectedAtomId,
  interactionLocked,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  pulseAtomId,
  pulseToken,
  showAtoms,
  showUnitCell,
  style,
}: {
  componentOpacity: ComponentOpacityState;
  layout: SceneLayout;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId: string | null;
  interactionLocked: boolean;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  pulseAtomId: string | null;
  pulseToken: number;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
}) {
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);

  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomById={atomById}
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        meshDetail={meshDetail}
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
    </>
  );
}

export function ExportSceneContent({
  cameraPose,
  componentOpacity,
  exportFramePlan,
  layout,
  meshDetail,
  scene,
  showAtoms,
  showUnitCell,
  style,
}: {
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  exportFramePlan: StructureExportFramePlan;
  layout: SceneLayout;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
}) {
  const { camera } = useThree();
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);

  useLayoutEffect(() => {
    applyCameraPoseSnapshot(camera, cameraPose, layout.standardPose.distance, layout.span);
  }, [camera, cameraPose, layout.span, layout.standardPose.distance]);

  useLayoutEffect(() => {
    if (camera instanceof OrthographicCamera) {
      applyOrthographicExportFrame(camera, exportFramePlan);
    }
  }, [camera, exportFramePlan]);

  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomById={atomById}
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        meshDetail={meshDetail}
        scene={scene}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
      />
    </>
  );
}

function SceneFog({
  layout,
  style,
}: {
  layout: SceneLayout;
  style: StyleState;
}) {
  const { scene } = useThree();
  const fog = useMemo(
    () =>
      style.fogEnabled
        ? createSceneFog(
            layout.standardPose.distance,
            layout.span,
            style.fogStart,
            style.fogStrength,
          )
        : null,
    [
      layout.span,
      layout.standardPose.distance,
      style.fogEnabled,
      style.fogStart,
      style.fogStrength,
    ],
  );

  useLayoutEffect(() => {
    const previousFog = scene.fog;
    scene.fog = fog;

    return () => {
      if (scene.fog === fog) {
        scene.fog = previousFog;
      }
    };
  }, [fog, scene]);

  return null;
}

export function createSceneFog(
  cameraDistance: number,
  span: number,
  start: number,
  strength: number,
): Fog | null {
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeStrength = Number.isFinite(strength) ? strength : 0;
  const normalizedStart = Math.min(1, Math.max(0, safeStart / 100));
  const normalizedStrength = Math.min(1, Math.max(0, safeStrength / 100));
  if (normalizedStrength <= 0) {
    return null;
  }

  const safeSpan = Number.isFinite(span) ? Math.max(1, span) : 1;
  const safeCameraDistance = Number.isFinite(cameraDistance)
    ? Math.max(0.01, cameraDistance)
    : 0.01;
  const startOffset = lerp(
    FOG_START_OFFSET_EARLY,
    FOG_START_OFFSET_LATE,
    normalizedStart,
  );
  const falloffSpan = lerp(
    FOG_FALLOFF_SPAN_SOFT,
    FOG_FALLOFF_SPAN_STRONG,
    normalizedStrength,
  );
  const near = safeCameraDistance + safeSpan * startOffset;
  const far = near + safeSpan * falloffSpan;

  return new Fog(SCENE_FOG_COLOR, near, far);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function StructureSceneObjects({
  atomById,
  componentOpacity,
  groupPosition,
  interactionLocked = false,
  meshDetail,
  scene,
  inspectedAtomId = null,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  pulseAtomId = null,
  pulseToken = 0,
  showAtoms,
  showUnitCell,
  style,
}: {
  atomById: Map<string, AtomSpec>;
  componentOpacity: ComponentOpacityState;
  groupPosition: VectorTuple;
  interactionLocked?: boolean;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  pulseAtomId?: string | null;
  pulseToken?: number;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
}) {
  const handlePointerMissed = useCallback(() => {
    if (interactionLocked) {
      return;
    }

    onAtomInspect?.(null);
  }, [interactionLocked, onAtomInspect]);

  return (
    <group onPointerMissed={handlePointerMissed}>
      <group position={groupPosition}>
        {showUnitCell ? (
          <CellFrame
            opacity={componentOpacity.unitCell / 100}
            vectors={scene.cell.vectors}
          />
        ) : null}
        {scene.polyhedra.map((polyhedron) => (
          <Polyhedron
            key={polyhedron.id}
            atomById={atomById}
            colorScheme={style.colorScheme}
            opacity={componentOpacity.polyhedra / 100}
            polyhedron={polyhedron}
          />
        ))}
        {scene.bonds.map((bond) => (
          <Bond
            key={bond.id}
            atomById={atomById}
            bond={bond}
            colorMode={style.bondColorMode}
            colorScheme={style.colorScheme}
            meshDetail={meshDetail}
            thicknessScale={style.bondThickness / 100}
            opacity={componentOpacity.bonds / 100}
          />
        ))}
        {showAtoms
          ? scene.atoms.map((atom) => (
              <Atom
                key={atom.id}
                atom={atom}
                colorScheme={style.colorScheme}
                inspected={inspectedAtomId === atom.id}
                interactionLocked={interactionLocked}
                meshDetail={meshDetail}
                onInspect={onAtomInspect}
                onPulse={onAtomPulse}
                onLockedInteractionAttempt={onLockedInteractionAttempt}
                pulseToken={pulseAtomId === atom.id ? pulseToken : 0}
                radiusModel={style.atomRadiusModel}
                radiusScale={style.atomRadius / 100}
                opacity={componentOpacity.atoms / 100}
              />
            ))
          : null}
      </group>
    </group>
  );
}

const MemoizedStructureSceneObjects = memo(StructureSceneObjects);

type CameraControls = OrbitControls | TrackballControls;

interface CameraControlsStateSource {
  keyState?: number;
  state?: number;
}

interface CameraControlsInteractionState {
  active: boolean;
  idleFrames: number;
  lastQuaternion: Quaternion;
  lastZoom: number;
  waitingForIdle: boolean;
}

function PreviewCameraController({
  cameraAnimatedCommandVersion,
  cameraCommandVersion,
  cameraInteractionStore,
  cameraPose,
  cellVectors,
  interactionLocked,
  interactionMode,
  layout,
  onCameraCommandAnimationActiveChange,
  onCameraControlsInteractionActiveChange,
  resetCounter,
  safeArea,
}: {
  cameraAnimatedCommandVersion: number;
  cameraCommandVersion: number;
  cameraInteractionStore: CameraInteractionStore;
  cameraPose: CrystalCameraPose;
  cellVectors: VectorTuple[];
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  layout: SceneLayout;
  onCameraCommandAnimationActiveChange?: (isActive: boolean) => void;
  onCameraControlsInteractionActiveChange?: (
    isActive: boolean,
    quaternionSnapshot?: Quaternion,
  ) => void;
  resetCounter: number;
  safeArea: PreviewSafeArea;
}) {
  const { camera, gl, size } = useThree();
  const controlsRef = useRef<CameraControls | null>(null);
  const cameraAnimationRef = useRef<CameraPoseAnimation | null>(null);
  const cameraControlsInteractionRef = useRef<CameraControlsInteractionState>({
    active: false,
    idleFrames: 0,
    lastQuaternion: new Quaternion(),
    lastZoom: camera instanceof OrthographicCamera ? camera.zoom : 0,
    waitingForIdle: false,
  });
  const isCameraAnimationActiveRef = useRef(false);
  const onCameraCommandAnimationActiveChangeRef = useRef(onCameraCommandAnimationActiveChange);
  const onCameraControlsInteractionActiveChangeRef = useRef(
    onCameraControlsInteractionActiveChange,
  );
  const cameraPoseRef = useRef(cameraPose);
  const hasAppliedInitialPoseRef = useRef(false);
  const lastCameraAnimatedCommandVersionRef = useRef(cameraAnimatedCommandVersion);
  const lastCameraCommandVersionRef = useRef(cameraCommandVersion);
  const lastLayoutSpanRef = useRef(layout.span);
  const lastResetCounterRef = useRef(resetCounter);
  const syncedViewScaleRef = useRef(cameraInteractionStore.getViewScaleSnapshot());
  cameraPoseRef.current = cameraPose;
  const effectiveSafeArea = useMemo(
    () => previewSafeAreaForViewport(safeArea, size.width),
    [safeArea, size.width],
  );
  const fitZoom = useMemo(
    () => computeCameraFitZoom(layout.cameraFitBounds, size.width, size.height, effectiveSafeArea),
    [effectiveSafeArea, layout.cameraFitBounds, size.height, size.width],
  );
  onCameraCommandAnimationActiveChangeRef.current = onCameraCommandAnimationActiveChange;
  onCameraControlsInteractionActiveChangeRef.current =
    onCameraControlsInteractionActiveChange;

  const setCameraAnimationActive = useCallback(
    (isActive: boolean, forceNotify = false) => {
      if (isCameraAnimationActiveRef.current === isActive && !forceNotify) {
        return;
      }

      isCameraAnimationActiveRef.current = isActive;
      onCameraCommandAnimationActiveChangeRef.current?.(isActive);
    },
    [],
  );

  const getCameraZoomSnapshot = useCallback(
    () => (camera instanceof OrthographicCamera ? camera.zoom : 0),
    [camera],
  );

  const startCameraControlsInteraction = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    interaction.idleFrames = 0;
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = getCameraZoomSnapshot();
    interaction.waitingForIdle = false;

    if (interaction.active) {
      return;
    }

    interaction.active = true;
    onCameraControlsInteractionActiveChangeRef.current?.(true);
  }, [camera, getCameraZoomSnapshot]);

  const finishCameraControlsInteraction = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    if (!interaction.active) {
      return;
    }

    interaction.active = false;
    interaction.idleFrames = 0;
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = getCameraZoomSnapshot();
    interaction.waitingForIdle = false;
    onCameraControlsInteractionActiveChangeRef.current?.(
      false,
      camera.quaternion.clone(),
    );
  }, [camera, getCameraZoomSnapshot]);

  const requestCameraControlsInteractionFinish = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    if (!interaction.active) {
      return;
    }

    interaction.idleFrames = 0;
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = getCameraZoomSnapshot();
    interaction.waitingForIdle = true;
  }, [camera, getCameraZoomSnapshot]);

  const settleCameraControlsInteraction = useCallback(() => {
    const interaction = cameraControlsInteractionRef.current;
    if (!interaction.active || !interaction.waitingForIdle) {
      return;
    }

    const nextZoom = getCameraZoomSnapshot();
    const orientationDelta = interaction.lastQuaternion.angleTo(camera.quaternion);
    const zoomDelta = Math.abs(nextZoom - interaction.lastZoom);
    interaction.lastQuaternion.copy(camera.quaternion);
    interaction.lastZoom = nextZoom;

    if (
      orientationDelta > CAMERA_CONTROLS_IDLE_EPSILON_RADIANS ||
      zoomDelta > CAMERA_CONTROLS_IDLE_ZOOM_EPSILON
    ) {
      interaction.idleFrames = 0;
      return;
    }

    interaction.idleFrames += 1;
    if (interaction.idleFrames >= CAMERA_CONTROLS_IDLE_FRAMES) {
      finishCameraControlsInteraction();
    }
  }, [camera, finishCameraControlsInteraction, getCameraZoomSnapshot]);

  useLayoutEffect(() => {
    const commandChanged = cameraCommandVersion !== lastCameraCommandVersionRef.current;
    const animatedCommandChanged =
      cameraAnimatedCommandVersion !== lastCameraAnimatedCommandVersionRef.current;
    const resetChanged = resetCounter !== lastResetCounterRef.current;
    const layoutSpanChanged = Math.abs(layout.span - lastLayoutSpanRef.current) > 1e-8;
    const shouldAnimate =
      hasAppliedInitialPoseRef.current &&
      commandChanged &&
      animatedCommandChanged &&
      !resetChanged &&
      !layoutSpanChanged &&
      !prefersReducedCameraMotion();

    lastCameraCommandVersionRef.current = cameraCommandVersion;
    lastCameraAnimatedCommandVersionRef.current = cameraAnimatedCommandVersion;
    lastResetCounterRef.current = resetCounter;
    lastLayoutSpanRef.current = layout.span;
    hasAppliedInitialPoseRef.current = true;

    if (shouldAnimate) {
      cameraAnimationRef.current = createCameraPoseAnimation(camera, cameraPoseRef.current, layout.span);
      setCameraAnimationActive(true);
      return;
    }

    cameraAnimationRef.current = null;
    setCameraAnimationActive(false, commandChanged && animatedCommandChanged);
    applyStandardCameraPose(camera, cameraPoseRef.current, layout.span);
    controlsRef.current?.target.copy(CAMERA_TARGET);
    controlsRef.current?.update();
  }, [
    camera,
    cameraAnimatedCommandVersion,
    cameraCommandVersion,
    layout.span,
    resetCounter,
    setCameraAnimationActive,
  ]);

  useLayoutEffect(() => {
    const nextViewScale = cameraInteractionStore.getViewScaleSnapshot();
    syncedViewScaleRef.current = nextViewScale;

    if (!(camera instanceof OrthographicCamera)) {
      return;
    }

    syncOrthographicFrustumToZoom(
      camera,
      size.width,
      size.height,
      fitZoom * nextViewScale,
      effectiveSafeArea,
    );
  }, [
    camera,
    cameraInteractionStore,
    effectiveSafeArea,
    fitZoom,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    if (!(camera instanceof OrthographicCamera)) {
      return;
    }

    return cameraInteractionStore.subscribeViewScaleCommand(() => {
      const { viewScale: commandViewScale } =
        cameraInteractionStore.getViewScaleCommandSnapshot();
      const nextViewScale = clampViewScale(commandViewScale);
      syncedViewScaleRef.current = nextViewScale;
      syncOrthographicFrustumToZoom(
        camera,
        size.width,
        size.height,
        fitZoom * nextViewScale,
        effectiveSafeArea,
      );
    });
  }, [
    camera,
    cameraInteractionStore,
    effectiveSafeArea,
    fitZoom,
    size.height,
    size.width,
  ]);

  useEffect(() => {
    return cameraInteractionStore.subscribeCameraStateCommand(() => {
      const { cameraState } = cameraInteractionStore.getCameraStateCommandSnapshot();
      if (!cameraState) {
        return;
      }

      cameraAnimationRef.current = null;
      setCameraAnimationActive(false);
      applyStandardCameraPose(
        camera,
        computeCrystalCameraPose(cellVectors, cameraState, layout.span),
        layout.span,
      );
      controlsRef.current?.target.copy(CAMERA_TARGET);
      controlsRef.current?.update();
    });
  }, [
    camera,
    cameraInteractionStore,
    cellVectors,
    layout.span,
    setCameraAnimationActive,
  ]);

  useEffect(() => {
    const controls =
      interactionMode === "trackball"
        ? new TrackballControls(camera, gl.domElement)
        : new OrbitControls(camera, gl.domElement);
    function handleControlsStart() {
      if (isCameraDirectionControlsInteraction(controls)) {
        startCameraControlsInteraction();
      }
      cameraAnimationRef.current = null;
      setCameraAnimationActive(false);
    }
    function handleControlsEnd() {
      requestCameraControlsInteractionFinish();
    }

    configureCameraControls(controls, interactionMode, interactionLocked, fitZoom);
    controls.target.copy(CAMERA_TARGET);
    resizeCameraControls(controls);
    controls.addEventListener("start", handleControlsStart);
    controls.addEventListener("end", handleControlsEnd);
    controls.update();
    controlsRef.current = controls;

    return () => {
      controls.removeEventListener("start", handleControlsStart);
      controls.removeEventListener("end", handleControlsEnd);
      finishCameraControlsInteraction();
      controls.dispose();
      if (controlsRef.current === controls) {
        controlsRef.current = null;
      }
    };
  }, [
    camera,
    finishCameraControlsInteraction,
    gl.domElement,
    interactionMode,
    requestCameraControlsInteractionFinish,
    resetCounter,
    setCameraAnimationActive,
    startCameraControlsInteraction,
  ]);

  useEffect(() => {
    return () => setCameraAnimationActive(false);
  }, [setCameraAnimationActive]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }

    configureCameraControls(controls, interactionMode, interactionLocked, fitZoom);
    controls.target.copy(CAMERA_TARGET);
    controls.update();
  }, [fitZoom, interactionLocked, interactionMode, resetCounter]);

  useEffect(() => {
    resizeCameraControls(controlsRef.current);
  }, [size.height, size.width]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !(camera instanceof OrthographicCamera)) {
      return;
    }
    const orthographicCamera = camera;

    function handleControlsChange() {
      const nextViewScale = syncOrthographicFrustumToCameraZoom(
        orthographicCamera,
        fitZoom,
        size.width,
        size.height,
        effectiveSafeArea,
      );

      if (Math.abs(nextViewScale - syncedViewScaleRef.current) < VIEW_SCALE_SYNC_EPSILON) {
        return;
      }

      syncedViewScaleRef.current = nextViewScale;
      cameraInteractionStore.setViewScaleSnapshot(nextViewScale);
    }

    controls.addEventListener("change", handleControlsChange);
    return () => controls.removeEventListener("change", handleControlsChange);
  }, [
    camera,
    cameraInteractionStore,
    effectiveSafeArea,
    fitZoom,
    size.height,
    size.width,
  ]);

  useFrame(() => {
    const animation = cameraAnimationRef.current;
    if (animation) {
      const isComplete = applyCameraPoseAnimationFrame(camera, animation, performance.now());
      if (isComplete) {
        cameraAnimationRef.current = null;
        setCameraAnimationActive(false);
      }
      controlsRef.current?.target.copy(CAMERA_TARGET);
      controlsRef.current?.update();
    } else {
      controlsRef.current?.update();
    }

    if (camera instanceof OrthographicCamera) {
      syncOrthographicFrustumToCameraZoom(
        camera,
        fitZoom,
        size.width,
        size.height,
        effectiveSafeArea,
      );
    }

    settleCameraControlsInteraction();
  });

  return null;
}

interface CameraPoseAnimation {
  durationMs: number;
  startDistance: number;
  startQuaternion: Quaternion;
  startTimeMs: number;
  targetDistance: number;
  targetPose: CrystalCameraPose;
  targetQuaternion: Quaternion;
  targetSpan: number;
}

interface AtomSelectionHighlightTransition {
  startColorMix: number;
  startEmissiveIntensity: number;
  startHaloOpacity: number;
  startHaloScale: number;
  startTimeMs: number;
}

function createCameraPoseAnimation(
  camera: { position: Vector3; quaternion: Quaternion },
  targetPose: CrystalCameraPose,
  targetSpan: number,
): CameraPoseAnimation {
  return {
    durationMs: CAMERA_COMMAND_ANIMATION_DURATION_MS,
    startDistance: Math.max(camera.position.distanceTo(CAMERA_TARGET), 1e-6),
    startQuaternion: camera.quaternion.clone().normalize(),
    startTimeMs: performance.now(),
    targetDistance: Math.max(targetPose.distance, 1e-6),
    targetPose,
    targetQuaternion: targetPose.quaternion.clone().normalize(),
    targetSpan,
  };
}

function applyCameraPoseAnimationFrame(
  camera: {
    lookAt: (x: number, y: number, z: number) => void;
    position: Vector3;
    quaternion: Quaternion;
    up: Vector3;
  },
  animation: CameraPoseAnimation,
  nowMs: number,
): boolean {
  const progress = Math.max(
    0,
    Math.min(1, (nowMs - animation.startTimeMs) / animation.durationMs),
  );

  if (progress >= 1) {
    applyStandardCameraPose(camera, animation.targetPose, animation.targetSpan);
    return true;
  }

  const easedProgress = easeOutCubic(progress);
  const quaternion = animation.startQuaternion.clone().slerp(
    animation.targetQuaternion,
    easedProgress,
  );
  const outward = CAMERA_LOCAL_FORWARD.clone().applyQuaternion(quaternion).normalize();
  const up = CAMERA_LOCAL_UP.clone().applyQuaternion(quaternion).normalize();
  const distance =
    animation.startDistance +
    (animation.targetDistance - animation.startDistance) * easedProgress;

  camera.position.copy(outward.multiplyScalar(distance));
  camera.up.copy(up);
  camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
  return false;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function prefersReducedCameraMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function syncOrthographicFrustumToCameraZoom(
  camera: OrthographicCamera,
  fitZoom: number,
  width: number,
  height: number,
  safeArea: PreviewSafeArea,
): number {
  const nextViewScale = clampViewScale(camera.zoom / fitZoom);
  const nextZoom = fitZoom * nextViewScale;

  syncOrthographicFrustumToZoom(camera, width, height, nextZoom, safeArea);

  return nextViewScale;
}

function syncOrthographicFrustumToZoom(
  camera: OrthographicCamera,
  width: number,
  height: number,
  zoom: number,
  safeArea: PreviewSafeArea,
) {
  const frustum = computeOrthographicFrustum(width, height, zoom, safeArea);

  if (
    Math.abs(camera.zoom - zoom) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.left - frustum.left) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.right - frustum.right) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.top - frustum.top) > FRUSTUM_SYNC_EPSILON ||
    Math.abs(camera.bottom - frustum.bottom) > FRUSTUM_SYNC_EPSILON
  ) {
    applyOrthographicFrustum(camera, width, height, zoom, safeArea);
  }
}

function configureCameraControls(
  controls: CameraControls,
  interactionMode: InteractionMode,
  interactionLocked: boolean,
  fitZoom: number,
) {
  controls.enabled = !interactionLocked;
  controls.minZoom = fitZoom * MIN_VIEW_SCALE;
  controls.maxZoom = fitZoom * MAX_VIEW_SCALE;

  if (interactionMode === "trackball" && controls instanceof TrackballControls) {
    controls.noPan = true;
    controls.noZoom = interactionLocked;
    controls.noRotate = interactionLocked;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = null;
    return;
  }

  if (interactionMode === "orbit" && controls instanceof OrbitControls) {
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.enableRotate = !interactionLocked;
    controls.enableZoom = !interactionLocked;
    controls.mouseButtons.LEFT = MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = MOUSE.DOLLY;
    controls.mouseButtons.RIGHT = null;
    controls.touches.ONE = TOUCH.ROTATE;
    controls.touches.TWO = TOUCH.DOLLY_ROTATE;
  }
}

function resizeCameraControls(controls: CameraControls | null) {
  if (controls instanceof TrackballControls) {
    controls.handleResize();
  }
}

function isCameraDirectionControlsInteraction(controls: CameraControls): boolean {
  const stateSource = controls as CameraControlsStateSource;
  const state =
    stateSource.keyState !== undefined &&
    stateSource.keyState !== CAMERA_CONTROLS_STATE_NONE
      ? stateSource.keyState
      : stateSource.state;

  return (
    state === CAMERA_CONTROLS_STATE_ROTATE ||
    state === CAMERA_CONTROLS_STATE_TOUCH_ROTATE ||
    state === CAMERA_CONTROLS_STATE_ORBIT_TOUCH_DOLLY_ROTATE
  );
}

function applyStandardCameraPose(
  camera: { lookAt: (x: number, y: number, z: number) => void; position: Vector3; up: Vector3 },
  standardPose: StandardCameraPose,
  span: number,
) {
  camera.position.set(...standardPose.cameraPosition);
  camera.up.set(...standardPose.cameraUp);
  camera.lookAt(...standardPose.target);

  if (camera instanceof OrthographicCamera) {
    camera.near = 0.01;
    camera.far = Math.max(1000, standardPose.distance + span * 8);
    camera.updateProjectionMatrix();
  }

  camera.position.set(...standardPose.cameraPosition);
}

function applyAtomHighlight(
  material: MeshLambertMaterial,
  baseColor: Color,
  colorMix: number,
  emissiveIntensity: number,
) {
  material.color.copy(baseColor).lerp(ATOM_HIGHLIGHT_TARGET_COLOR, colorMix);
  material.emissive
    .copy(baseColor)
    .lerp(ATOM_HIGHLIGHT_TARGET_COLOR, ATOM_HIGHLIGHT_EMISSIVE_COLOR_MIX);
  material.emissiveIntensity = emissiveIntensity;
}

function Atom({
  atom,
  colorScheme,
  inspected,
  interactionLocked,
  meshDetail,
  onInspect,
  onPulse,
  onLockedInteractionAttempt,
  opacity,
  pulseToken,
  radiusModel,
  radiusScale,
}: {
  atom: AtomSpec;
  colorScheme: StyleState["colorScheme"];
  inspected: boolean;
  interactionLocked: boolean;
  meshDetail: SceneMeshDetail;
  onInspect?: (atomId: string | null) => void;
  onPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  opacity: number;
  pulseToken: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}) {
  const atomMaterialRef = useRef<MeshLambertMaterial | null>(null);
  const haloMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const haloMeshRef = useRef<Mesh | null>(null);
  const currentColorMixRef = useRef(0);
  const currentEmissiveIntensityRef = useRef(0);
  const currentHaloOpacityRef = useRef(0);
  const currentHaloScaleRef = useRef(ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE);
  const pulseStartTimeRef = useRef<number | null>(null);
  const selectionTransitionRef = useRef<AtomSelectionHighlightTransition | null>(null);
  const isTransparent = opacity < 1;
  const radius = atomRadiusForModel(atom, radiusModel);
  const scaledRadius = radius * radiusScale;
  const color = atomColorForScheme(atom, colorScheme);
  const baseColor = useMemo(() => new Color(color), [color]);

  useEffect(() => {
    if (pulseToken === 0) {
      pulseStartTimeRef.current = null;
      return;
    }

    pulseStartTimeRef.current = performance.now();
  }, [pulseToken]);

  useEffect(() => {
    if (!inspected) {
      selectionTransitionRef.current = null;
      return;
    }

    selectionTransitionRef.current = {
      startColorMix: currentColorMixRef.current,
      startEmissiveIntensity: currentEmissiveIntensityRef.current,
      startHaloOpacity: currentHaloOpacityRef.current,
      startHaloScale: currentHaloScaleRef.current,
      startTimeMs: performance.now(),
    };
    pulseStartTimeRef.current = null;
  }, [inspected]);

  useFrame(() => {
    const atomMaterial = atomMaterialRef.current;
    if (!atomMaterial) {
      return;
    }
    const haloMaterial = haloMaterialRef.current;
    const haloMesh = haloMeshRef.current;

    if (inspected) {
      const selectionTransition = selectionTransitionRef.current;
      if (!selectionTransition) {
        currentColorMixRef.current = ATOM_HIGHLIGHT_SELECTED_COLOR_MIX;
        currentEmissiveIntensityRef.current = ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY;
        currentHaloOpacityRef.current = ATOM_HIGHLIGHT_HALO_SELECTED_OPACITY;
        currentHaloScaleRef.current = ATOM_HIGHLIGHT_HALO_SELECTED_SCALE;
        applyAtomHighlight(
          atomMaterial,
          baseColor,
          ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
          ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY,
        );
        if (haloMaterial && haloMesh) {
          haloMesh.scale.setScalar(ATOM_HIGHLIGHT_HALO_SELECTED_SCALE);
          haloMaterial.opacity = ATOM_HIGHLIGHT_HALO_SELECTED_OPACITY;
        }
        return;
      }

      const progress = Math.min(
        1,
        (performance.now() - selectionTransition.startTimeMs) / ATOM_HIGHLIGHT_SELECT_MS,
      );
      const easedProgress = easeOutCubic(progress);
      const colorMix =
        selectionTransition.startColorMix +
        (ATOM_HIGHLIGHT_SELECTED_COLOR_MIX - selectionTransition.startColorMix) *
          easedProgress;
      const emissiveIntensity =
        selectionTransition.startEmissiveIntensity +
        (ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY -
          selectionTransition.startEmissiveIntensity) *
          easedProgress;
      const haloOpacity =
        selectionTransition.startHaloOpacity +
        (ATOM_HIGHLIGHT_HALO_SELECTED_OPACITY - selectionTransition.startHaloOpacity) *
          easedProgress;
      const haloScale =
        selectionTransition.startHaloScale +
        (ATOM_HIGHLIGHT_HALO_SELECTED_SCALE - selectionTransition.startHaloScale) *
          easedProgress;
      currentColorMixRef.current = colorMix;
      currentEmissiveIntensityRef.current = emissiveIntensity;
      currentHaloOpacityRef.current = haloOpacity;
      currentHaloScaleRef.current = haloScale;
      applyAtomHighlight(atomMaterial, baseColor, colorMix, emissiveIntensity);
      if (haloMaterial && haloMesh) {
        haloMesh.scale.setScalar(haloScale);
        haloMaterial.opacity = haloOpacity;
      }

      if (progress >= 1) {
        selectionTransitionRef.current = null;
      }
      return;
    }

    const pulseStartTime = pulseStartTimeRef.current;
    if (pulseStartTime === null) {
      currentColorMixRef.current = 0;
      currentEmissiveIntensityRef.current = 0;
      currentHaloOpacityRef.current = 0;
      currentHaloScaleRef.current = ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE;
      applyAtomHighlight(atomMaterial, baseColor, 0, 0);
      if (haloMaterial && haloMesh) {
        haloMesh.scale.setScalar(ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE);
        haloMaterial.opacity = 0;
      }
      return;
    }

    const progress = Math.min(
      1,
      (performance.now() - pulseStartTime) / ATOM_HIGHLIGHT_PULSE_MS,
    );
    const fadeIn = Math.min(1, progress / 0.28);
    const fadeOut = progress < 0.28 ? 1 : 1 - (progress - 0.28) / 0.72;
    const fade = fadeIn * Math.max(0, fadeOut) ** 0.72;
    const colorMix = ATOM_HIGHLIGHT_PULSE_COLOR_MIX * fade;
    const emissiveIntensity = ATOM_HIGHLIGHT_PULSE_EMISSIVE_INTENSITY * fade;
    currentColorMixRef.current = colorMix;
    currentEmissiveIntensityRef.current = emissiveIntensity;
    currentHaloOpacityRef.current = 0;
    currentHaloScaleRef.current = ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE;
    applyAtomHighlight(atomMaterial, baseColor, colorMix, emissiveIntensity);
    if (haloMaterial && haloMesh) {
      haloMesh.scale.setScalar(ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE);
      haloMaterial.opacity = 0;
    }

    if (progress >= 1) {
      pulseStartTimeRef.current = null;
    }
  });

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (interactionLocked) {
        return;
      }

      onPulse?.(atom.id);
    },
    [atom.id, interactionLocked, onLockedInteractionAttempt, onPulse],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      if (interactionLocked) {
        onLockedInteractionAttempt?.();
        return;
      }

      onInspect?.(atom.id);
    },
    [atom.id, interactionLocked, onInspect, onLockedInteractionAttempt],
  );

  return (
    <group position={atom.position}>
      {inspected ? (
        <mesh ref={haloMeshRef} renderOrder={2}>
          <sphereGeometry
            args={[
              scaledRadius,
              meshDetail.sphereWidthSegments,
              meshDetail.sphereHeightSegments,
            ]}
          />
          <meshBasicMaterial
            ref={haloMaterialRef}
            color={color}
            depthWrite={false}
            opacity={0}
            transparent
          />
        </mesh>
      ) : null}
      <mesh
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <sphereGeometry
          args={[
            scaledRadius,
            meshDetail.sphereWidthSegments,
            meshDetail.sphereHeightSegments,
          ]}
        />
        <meshLambertMaterial
          ref={atomMaterialRef}
          key={isTransparent ? "transparent" : "opaque"}
          color={color}
          depthWrite={!isTransparent}
          opacity={opacity}
          transparent={isTransparent}
        />
      </mesh>
    </group>
  );
}

function Bond({
  atomById,
  bond,
  colorMode,
  colorScheme,
  meshDetail,
  opacity,
  thicknessScale,
}: {
  atomById: Map<string, AtomSpec>;
  bond: BondSpec;
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  meshDetail: SceneMeshDetail;
  opacity: number;
  thicknessScale: number;
}) {
  const geometry = useMemo(() => {
    const startAtom = atomById.get(bond.startAtomId);
    const endAtom = atomById.get(bond.endAtomId);
    if (!startAtom || !endAtom) {
      return null;
    }

    const start = new Vector3(...startAtom.position);
    const end = new Vector3(...endAtom.position);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length <= 0) {
      return null;
    }

    const center = start.clone().add(end).multiplyScalar(0.5);
    const quaternion = new Quaternion().setFromUnitVectors(
      new Vector3(0, 1, 0),
      direction.clone().normalize(),
    );

    return {
      center,
      endColor: atomColorForScheme(endAtom, colorScheme),
      length,
      quaternion,
      startColor: atomColorForScheme(startAtom, colorScheme),
    };
  }, [atomById, bond.endAtomId, bond.startAtomId, colorScheme]);

  if (!geometry) {
    return null;
  }

  const isTransparent = opacity < 1;
  const radius = BOND_RADIUS * thicknessScale;

  if (colorMode === "unicolor-2d") {
    return (
      <BondCylinder
        color={BOND_COLOR}
        isTransparent={isTransparent}
        length={geometry.length}
        material="basic"
        opacity={opacity}
        position={geometry.center}
        quaternion={geometry.quaternion}
        radialSegments={meshDetail.bond2dRadialSegments}
        radius={radius}
      />
    );
  }

  if (colorMode === "by-atom") {
    return (
      <TwoToneBondCylinder
        endColor={geometry.endColor}
        isTransparent={isTransparent}
        length={geometry.length}
        opacity={opacity}
        position={geometry.center}
        quaternion={geometry.quaternion}
        radialSegments={meshDetail.bondRadialSegments}
        radius={radius}
        startColor={geometry.startColor}
      />
    );
  }

  return (
    <BondCylinder
      color={BOND_COLOR}
      isTransparent={isTransparent}
      length={geometry.length}
      opacity={opacity}
      position={geometry.center}
      quaternion={geometry.quaternion}
      radialSegments={meshDetail.bondRadialSegments}
      radius={radius}
    />
  );
}

function TwoToneBondCylinder({
  endColor,
  isTransparent,
  length,
  opacity,
  position,
  quaternion,
  radialSegments,
  radius,
  startColor,
}: {
  endColor: string;
  isTransparent: boolean;
  length: number;
  opacity: number;
  position: Vector3;
  quaternion: Quaternion;
  radialSegments: number;
  radius: number;
  startColor: string;
}) {
  const geometry = useMemo(
    () =>
      twoToneBondCylinderGeometry({
        endColor,
        length,
        radialSegments,
        radius,
        startColor,
      }),
    [endColor, length, radialSegments, radius, startColor],
  );

  return (
    <mesh geometry={geometry} position={position} quaternion={quaternion}>
      <meshLambertMaterial
        key={isTransparent ? "two-tone-transparent" : "two-tone-opaque"}
        depthWrite={!isTransparent}
        opacity={opacity}
        transparent={isTransparent}
        vertexColors
      />
    </mesh>
  );
}

function BondCylinder({
  color,
  isTransparent,
  length,
  material = "lambert",
  opacity,
  position,
  quaternion,
  radialSegments,
  radius,
}: {
  color: string;
  isTransparent: boolean;
  length: number;
  material?: "basic" | "lambert";
  opacity: number;
  position: Vector3;
  quaternion: Quaternion;
  radialSegments: number;
  radius: number;
}) {
  const materialProps = {
    color,
    depthWrite: !isTransparent,
    opacity,
    transparent: isTransparent,
  };

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry
        args={[
          radius,
          radius,
          length,
          radialSegments,
        ]}
      />
      {material === "basic" ? (
        <meshBasicMaterial
          key={isTransparent ? "basic-transparent" : "basic-opaque"}
          {...materialProps}
        />
      ) : (
        <meshLambertMaterial
          key={isTransparent ? "lambert-transparent" : "lambert-opaque"}
          {...materialProps}
        />
      )}
    </mesh>
  );
}

export function twoToneBondCylinderGeometry({
  endColor,
  length,
  radialSegments,
  radius,
  startColor,
}: {
  endColor: string;
  length: number;
  radialSegments: number;
  radius: number;
  startColor: string;
}): BufferGeometry {
  const segments = Math.max(3, Math.floor(radialSegments));
  const halfLength = length / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const start = new Color(startColor);
  const end = new Color(endColor);
  const rows = [
    { color: start, y: -halfLength },
    { color: start, y: 0 },
    { color: end, y: 0 },
    { color: end, y: halfLength },
  ];

  for (const row of rows) {
    for (let index = 0; index <= segments; index += 1) {
      const theta = (index / segments) * Math.PI * 2;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      positions.push(radius * sinTheta, row.y, radius * cosTheta);
      normals.push(sinTheta, 0, cosTheta);
      colors.push(row.color.r, row.color.g, row.color.b);
    }
  }

  const rowVertexCount = segments + 1;
  addCylinderSideStrip(indices, 0, 1, rowVertexCount, segments);
  addCylinderSideStrip(indices, 2, 3, rowVertexCount, segments);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

function addCylinderSideStrip(
  indices: number[],
  startRow: number,
  endRow: number,
  rowVertexCount: number,
  segments: number,
) {
  const startOffset = startRow * rowVertexCount;
  const endOffset = endRow * rowVertexCount;

  for (let index = 0; index < segments; index += 1) {
    const a = startOffset + index;
    const b = endOffset + index;
    const c = endOffset + index + 1;
    const d = startOffset + index + 1;

    indices.push(a, d, b, b, d, c);
  }
}

function Polyhedron({
  atomById,
  colorScheme,
  opacity,
  polyhedron,
}: {
  atomById: Map<string, AtomSpec>;
  colorScheme: StyleState["colorScheme"];
  opacity: number;
  polyhedron: PolyhedronSpec;
}) {
  const geometry = useMemo(
    () => polyhedronGeometryFromAtoms(polyhedron, atomById),
    [atomById, polyhedron],
  );
  const centerAtom = atomById.get(polyhedron.centerAtomId);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  if (!geometry || !centerAtom) {
    return null;
  }

  const color = atomColorForScheme(centerAtom, colorScheme);

  return (
    <group>
      <mesh geometry={geometry}>
        <meshLambertMaterial
          color={color}
          depthWrite={false}
          opacity={opacity}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial
          color={POLYHEDRON_EDGE_COLOR}
          depthWrite={false}
          opacity={Math.min(1, opacity * POLYHEDRON_EDGE_OPACITY_RATIO)}
          transparent
        />
      </lineSegments>
    </group>
  );
}

export function polyhedronGeometryFromAtoms(
  polyhedron: PolyhedronSpec,
  atomById: Map<string, AtomSpec>,
): BufferGeometry | null {
  const positions: number[] = [];
  for (const atomId of polyhedron.hullAtomIds) {
    const atom = atomById.get(atomId);
    if (!atom) {
      return null;
    }

    positions.push(...atom.position);
  }

  const indices: number[] = [];
  for (const face of polyhedron.faces) {
    if (
      face.length !== 3 ||
      new Set(face).size !== 3 ||
      face.some(
        (vertexIndex) =>
          !Number.isInteger(vertexIndex) ||
          vertexIndex < 0 ||
          vertexIndex >= polyhedron.hullAtomIds.length,
      )
    ) {
      return null;
    }

    indices.push(...face);
  }

  if (indices.length === 0) {
    return null;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CellFrame({ opacity, vectors }: { opacity: number; vectors: VectorTuple[] }) {
  const geometry = useMemo(() => {
    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute(
      "position",
      new Float32BufferAttribute(cellFrameLinePositions(vectors), 3),
    );
    return nextGeometry;
  }, [vectors]);

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial
        color={CELL_FRAME_COLOR}
        depthWrite={opacity >= 1}
        fog={false}
        linewidth={CELL_FRAME_LINE_WIDTH_PIXELS}
        opacity={opacity}
        transparent={opacity < 1}
      />
    </lineSegments>
  );
}

export interface SceneStructureLayout {
  cameraFitBounds: CameraFitBounds;
  groupPosition: VectorTuple;
  span: number;
  standardPose: StandardCameraPose;
}

export interface SceneLayout extends SceneStructureLayout {
  cameraPose: CrystalCameraPose;
}

export function computeSceneLayout(
  scene: SceneSpec,
  atomRadiusModel: AtomRadiusModel = "uniform",
  cameraState?: CrystalCameraState,
): SceneLayout {
  const structureLayout = computeSceneStructureLayout(scene, atomRadiusModel);
  const cameraPose = computeCrystalCameraPose(
    scene.cell.vectors,
    cameraState ?? createDefaultCrystalCameraState(),
    structureLayout.span,
  );

  return {
    ...structureLayout,
    cameraPose,
  };
}

export function computeSceneStructureLayout(
  scene: SceneSpec,
  atomRadiusModel: AtomRadiusModel = "uniform",
): SceneStructureLayout {
  const points = [
    ...cellCorners(scene.cell.vectors),
    ...scene.atoms.map((atom) => new Vector3(...atom.position)),
  ];
  const box = new Box3().setFromPoints(points);
  const maxRadius = Math.max(
    0,
    ...scene.atoms.map((atom) => atomRadiusForModel(atom, atomRadiusModel)),
  );
  box.expandByScalar(maxRadius);
  const center = cellCenter(scene.cell.vectors);
  const size = box.getSize(new Vector3());
  const span = Math.max(1, size.x, size.y, size.z);
  const standardPose = computeStandardCameraPose(scene.cell.vectors, span);
  const groupPosition: VectorTuple = [-center.x, -center.y, -center.z];
  const defaultCameraPose = computeCrystalCameraPose(
    scene.cell.vectors,
    createDefaultCrystalCameraState(),
    span,
  );

  return {
    cameraFitBounds: computeProjectedCameraFitBounds(
      scene,
      atomRadiusModel,
      groupPosition,
      defaultCameraPose,
    ),
    groupPosition,
    span,
    standardPose,
  };
}

function computeProjectedCameraFitBounds(
  scene: SceneSpec,
  atomRadiusModel: AtomRadiusModel,
  groupPosition: VectorTuple,
  cameraPose: Pick<CrystalCameraPose, "cameraUp" | "outward">,
): CameraFitBounds {
  const outward = new Vector3(...cameraPose.outward).normalize();
  const cameraUp = new Vector3(...cameraPose.cameraUp).normalize();
  const right = cameraUp.clone().cross(outward).normalize();
  const screenUp = outward.clone().cross(right).normalize();
  const offset = new Vector3(...groupPosition);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  function includePoint(point: Vector3 | VectorTuple, radius = 0) {
    const localPoint = Array.isArray(point)
      ? new Vector3(...point)
      : point.clone();
    localPoint.add(offset);
    const safeRadius = Math.max(0, radius);
    const x = localPoint.dot(right);
    const y = localPoint.dot(screenUp);

    minX = Math.min(minX, x - safeRadius);
    maxX = Math.max(maxX, x + safeRadius);
    minY = Math.min(minY, y - safeRadius);
    maxY = Math.max(maxY, y + safeRadius);
  }

  for (const corner of cellCorners(scene.cell.vectors)) {
    includePoint(corner);
  }

  for (const atom of scene.atoms) {
    includePoint(atom.position, atomRadiusForModel(atom, atomRadiusModel));
  }

  return {
    projectedHeight: Math.max(1, maxY - minY),
    projectedWidth: Math.max(1, maxX - minX),
  };
}

export function previewSafeAreaForViewport(
  safeArea: PreviewSafeArea,
  viewportWidth: number,
): PreviewSafeArea {
  if (viewportWidth > NARROW_VIEWPORT_BREAKPOINT) {
    return safeArea;
  }

  return {
    bottom: Math.max(safeArea.bottom, NARROW_VIEWPORT_SAFE_AREA.bottom),
    left: NARROW_VIEWPORT_SAFE_AREA.left,
    right: NARROW_VIEWPORT_SAFE_AREA.right,
    top: Math.max(safeArea.top, NARROW_VIEWPORT_SAFE_AREA.top),
  };
}
