import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BatchedMesh,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Fog,
  Group,
  Matrix4,
  Quaternion,
  SpriteMaterial,
  Vector3,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type {
  AtomRadiusModel,
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
} from "../api/scene";
import {
  atomColorForScheme,
  autoDistinctElementColorOverrides,
  type ElementColorOverrides,
} from "../model/colorSchemes";
import type {
  AtomRenderingMode,
  BondRenderingMode,
  BondColorMode,
  ComponentOpacityState,
  ExportMeshQuality,
  StyleState,
  UnitCellLineStyle,
} from "../model";
import { DEFAULT_BOND_COLOR } from "../model";
import {
  BOND_RADIUS,
  CELL_FRAME_COLOR,
  CELL_FRAME_LINE_WIDTH_PIXELS,
  atomRadiusForModel,
  cellFrameLinePositions,
} from "./sceneGeometry";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import type { SceneLayout } from "./sceneLayout";
import type { VectorTuple } from "./viewMath";
import { StructureMaterial, type StructureMeshMaterial } from "./StructureMaterial";
import { InstancedAtoms } from "./InstancedAtoms";
import { AtomSelectionRing } from "./AtomSelectionRing";
import {
  ATOM_SELECTION_RING_PULSE_MIN_SCALE,
  ATOM_SELECTION_RING_SELECTED_OPACITY,
  ATOM_SELECTION_RING_SELECTED_SCALE,
  ATOM_HIGHLIGHT_PULSE_COLOR_MIX,
  ATOM_HIGHLIGHT_PULSE_EMISSIVE_INTENSITY,
  ATOM_HIGHLIGHT_PULSE_MS,
  ATOM_HIGHLIGHT_SELECT_MS,
  ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
  ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY,
  applyAtomHighlight,
  atomPulseFade,
  easeOutCubic,
} from "./atomHighlight";
import { polyhedronGeometryFromAtoms, twoToneBondCylinderGeometry } from "./structureGeometry";

export interface SceneMeshDetail {
  bondRadialSegments: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export const BOND_COLOR = DEFAULT_BOND_COLOR;
export const BOND_TUBE_RADIAL_SEGMENTS = 24;
export const POLYHEDRON_SURFACE_OPACITY = 0.5;
export const POLYHEDRON_EDGE_COLOR = "#f2f5f9";
export const POLYHEDRON_EDGE_LINE_WIDTH_PIXELS = 1;
export const POLYHEDRON_EDGE_OPACITY = 0.8;
const CELL_FRAME_DASH_SIZE = 0.08;
const CELL_FRAME_GAP_SIZE = 0.03;
const POLYHEDRON_EDGE_OPACITY_RATIO =
  POLYHEDRON_EDGE_OPACITY / POLYHEDRON_SURFACE_OPACITY;
export const SCENE_FOG_COLOR = "#fafafa";
const FOG_FRONT_PADDING_RATIO = 0.4;

export const PREVIEW_SCENE_MESH_DETAIL: SceneMeshDetail = {
  bondRadialSegments: 16,
  sphereHeightSegments: 24,
  sphereWidthSegments: 32,
};

export const EXPORT_SCENE_MESH_DETAIL_PRESETS: Record<ExportMeshQuality, SceneMeshDetail> = {
  low: {
    bondRadialSegments: 12,
    sphereHeightSegments: 16,
    sphereWidthSegments: 24,
  },
  medium: PREVIEW_SCENE_MESH_DETAIL,
  high: {
    bondRadialSegments: BOND_TUBE_RADIAL_SEGMENTS,
    sphereHeightSegments: 32,
    sphereWidthSegments: 48,
  },
  xhigh: {
    bondRadialSegments: 32,
    sphereHeightSegments: 48,
    sphereWidthSegments: 72,
  },
};

export function PreviewSceneContent({
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  layout,
  materialFamily,
  meshDetail,
  scene,
  inspectedAtomId,
  interactionLocked,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  polyhedronEdgeLineWidthScale = 1,
  pulseAtomId,
  pulseToken,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
  componentOpacity: ComponentOpacityState;
  layout: SceneLayout;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId: string | null;
  interactionLocked: boolean;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  polyhedronEdgeLineWidthScale?: number;
  pulseAtomId: string | null;
  pulseToken: number;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineStyle?: UnitCellLineStyle;
  unitCellLineWidthScale?: number;
}) {
  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomRenderingMode={atomRenderingMode}
        bondRenderingMode={bondRenderingMode}
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        materialFamily={materialFamily}
        meshDetail={meshDetail}
        scene={scene}
        inspectedAtomId={inspectedAtomId}
        interactionLocked={interactionLocked}
        onAtomInspect={onAtomInspect}
        onAtomPulse={onAtomPulse}
        onLockedInteractionAttempt={onLockedInteractionAttempt}
        polyhedronEdgeLineWidthScale={polyhedronEdgeLineWidthScale}
        pulseAtomId={pulseAtomId}
        pulseToken={pulseToken}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
        unitCellLineStyle={unitCellLineStyle}
        unitCellLineWidthScale={unitCellLineWidthScale}
      />
    </>
  );
}

export function SceneFog({
  layout,
  style,
}: {
  layout: SceneLayout;
  style: StyleState;
}) {
  const { invalidate, scene } = useThree();
  const fog = useMemo(
    () =>
      style.fogEnabled
        ? createSceneFog(
            layout.standardPose.distance,
            layout.span,
            layout.depthCueingBackOffset,
            layout.depthCueingFrontOffset,
            style.fogAmount,
            style.fogStart,
          )
        : null,
    [
      layout.span,
      layout.depthCueingBackOffset,
      layout.depthCueingFrontOffset,
      layout.standardPose.distance,
      style.fogAmount,
      style.fogEnabled,
      style.fogStart,
    ],
  );

  useLayoutEffect(() => {
    const previousFog = scene.fog;
    scene.fog = fog;
    invalidate();

    return () => {
      if (scene.fog === fog) {
        scene.fog = previousFog;
        invalidate();
      }
    };
  }, [fog, invalidate, scene]);

  return null;
}

export function createSceneFog(
  cameraDistance: number,
  span: number,
  backOffset: number,
  frontOffset: number,
  amount: number,
  start: number,
): Fog | null {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const safeStart = Number.isFinite(start) ? start : 0;
  const normalizedAmount = Math.min(1, Math.max(0, safeAmount / 100));
  const normalizedStart = Math.min(1, Math.max(0, safeStart / 100));
  if (normalizedAmount <= 0) {
    return null;
  }

  const safeSpan = Number.isFinite(span) ? Math.max(1, span) : 1;
  const safeBackOffset = Number.isFinite(backOffset)
    ? Math.max(0.01 * safeSpan, backOffset)
    : 0.01 * safeSpan;
  const safeFrontOffset = Number.isFinite(frontOffset)
    ? Math.min(safeBackOffset, frontOffset)
    : 0;
  const safeCameraDistance = Number.isFinite(cameraDistance)
    ? Math.max(0.01, cameraDistance)
    : 0.01;
  const frontPadding = safeSpan * FOG_FRONT_PADDING_RATIO;
  const firstStartOffset = safeFrontOffset - frontPadding;
  const lastStartOffset = Math.max(
    firstStartOffset,
    safeBackOffset - frontPadding,
  );
  const startOffset = lerp(
    firstStartOffset,
    lastStartOffset,
    normalizedStart,
  );
  const near = safeCameraDistance + startOffset;
  const back = safeCameraDistance + safeBackOffset;
  const far = near + (back - near) / normalizedAmount;

  return new Fog(SCENE_FOG_COLOR, near, far);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function StructureSceneObjects({
  atomRenderingMode = "mesh",
  bondRenderingMode = "mesh",
  componentOpacity,
  groupPosition,
  interactionLocked = false,
  materialFamily,
  meshDetail,
  scene,
  inspectedAtomId = null,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  polyhedronEdgeLineWidthScale = 1,
  pulseAtomId = null,
  pulseToken = 0,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineColor,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  atomRenderingMode?: AtomRenderingMode;
  bondRenderingMode?: BondRenderingMode;
  componentOpacity: ComponentOpacityState;
  groupPosition: VectorTuple;
  interactionLocked?: boolean;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  polyhedronEdgeLineWidthScale?: number;
  pulseAtomId?: string | null;
  pulseToken?: number;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineColor?: string;
  unitCellLineStyle?: UnitCellLineStyle;
  unitCellLineWidthScale?: number;
}) {
  const colorOverrides = useMemo(
    () =>
      autoDistinctElementColorOverrides(
        scene.atoms,
        style.colorScheme,
        style.distinguishSimilarColors,
      ),
    [scene.atoms, style.colorScheme, style.distinguishSimilarColors],
  );
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
            color={unitCellLineColor}
            fog={style.fogEnabled && style.fogAffectsUnitCell}
            lineWidthScale={unitCellLineWidthScale}
            opacity={componentOpacity.unitCell / 100}
            lineStyle={unitCellLineStyle}
            vectors={scene.cell.vectors}
          />
        ) : null}
        {scene.polyhedra.map((polyhedron, polyhedronIndex) => (
          <MemoizedPolyhedron
            key={polyhedronIndex}
            atoms={scene.atoms}
            colorScheme={style.colorScheme}
            colorOverrides={colorOverrides}
            materialFamily={materialFamily}
            opacity={componentOpacity.polyhedra / 100}
            polyhedron={polyhedron}
            lineWidthScale={polyhedronEdgeLineWidthScale}
          />
        ))}
        {bondRenderingMode === "batched" ? (
          <BatchedBonds
            atoms={scene.atoms}
            bonds={scene.bonds}
            bondColor={style.bondColor}
            colorMode={style.bondColorMode}
            colorScheme={style.colorScheme}
            colorOverrides={colorOverrides}
            materialFamily={materialFamily}
            meshDetail={meshDetail}
            thicknessScale={style.bondThickness / 100}
            opacity={componentOpacity.bonds / 100}
          />
        ) : (
          scene.bonds.map((bond, bondIndex) => (
            <MemoizedBond
              key={bondIndex}
              atoms={scene.atoms}
              bond={bond}
              bondColor={style.bondColor}
              colorMode={style.bondColorMode}
              colorScheme={style.colorScheme}
              colorOverrides={colorOverrides}
              materialFamily={materialFamily}
              meshDetail={meshDetail}
              thicknessScale={style.bondThickness / 100}
              opacity={componentOpacity.bonds / 100}
            />
          ))
        )}
        {showAtoms && atomRenderingMode === "instanced" ? (
          <InstancedAtoms
            atoms={scene.atoms}
            colorScheme={style.colorScheme}
            colorOverrides={colorOverrides}
            inspectedAtomId={inspectedAtomId}
            interactionLocked={interactionLocked}
            materialFamily={materialFamily}
            meshDetail={meshDetail}
            onInspect={onAtomInspect}
            onPulse={onAtomPulse}
            onLockedInteractionAttempt={onLockedInteractionAttempt}
            pulseAtomId={pulseAtomId}
            pulseToken={pulseToken}
            radiusModel={style.atomRadiusModel}
            radiusScale={style.atomRadius / 100}
            opacity={componentOpacity.atoms / 100}
          />
        ) : showAtoms ? (
          scene.atoms.map((atom) => (
            <MemoizedAtom
              key={atom.id}
              atom={atom}
              colorScheme={style.colorScheme}
              colorOverrides={colorOverrides}
              inspected={inspectedAtomId === atom.id}
              interactionLocked={interactionLocked}
              materialFamily={materialFamily}
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
        ) : null}
      </group>
    </group>
  );
}

export const MemoizedStructureSceneObjects = memo(StructureSceneObjects);

interface AtomSelectionHighlightTransition {
  startColorMix: number;
  startEmissiveIntensity: number;
  startRingOpacity: number;
  startRingScale: number;
  startTimeMs: number;
}

function Atom({
  atom,
  colorScheme,
  colorOverrides,
  inspected,
  interactionLocked,
  materialFamily,
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
  colorOverrides?: ElementColorOverrides;
  inspected: boolean;
  interactionLocked: boolean;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  onInspect?: (atomId: string | null) => void;
  onPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  opacity: number;
  pulseToken: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}) {
  const atomMaterialRef = useRef<StructureMeshMaterial | null>(null);
  const ringMaterialRef = useRef<SpriteMaterial | null>(null);
  const ringGroupRef = useRef<Group | null>(null);
  const currentColorMixRef = useRef(0);
  const currentEmissiveIntensityRef = useRef(0);
  const currentRingOpacityRef = useRef(0);
  const currentRingScaleRef = useRef(ATOM_SELECTION_RING_PULSE_MIN_SCALE);
  const handledPulseTokenRef = useRef(0);
  const pulseStartTimeRef = useRef<number | null>(null);
  const selectionTransitionRef = useRef<AtomSelectionHighlightTransition | null>(null);
  const [isHighlightAnimationActive, setIsHighlightAnimationActive] = useState(false);
  const isTransparent = opacity < 1;
  const radius = atomRadiusForModel(atom, radiusModel);
  const scaledRadius = radius * radiusScale;
  const color = atomColorForScheme(atom, colorScheme, colorOverrides);
  const baseColor = useMemo(() => new Color(color), [color]);

  const resetHighlight = useCallback(() => {
    currentColorMixRef.current = 0;
    currentEmissiveIntensityRef.current = 0;
    currentRingOpacityRef.current = 0;
    currentRingScaleRef.current = ATOM_SELECTION_RING_PULSE_MIN_SCALE;

    const atomMaterial = atomMaterialRef.current;
    if (atomMaterial) {
      applyAtomHighlight(atomMaterial, baseColor, 0, 0);
    }

    const ringMaterial = ringMaterialRef.current;
    const ringGroup = ringGroupRef.current;
    if (ringMaterial && ringGroup) {
      ringGroup.scale.setScalar(ATOM_SELECTION_RING_PULSE_MIN_SCALE);
      ringMaterial.opacity = 0;
    }
  }, [baseColor]);

  useEffect(() => {
    if (pulseToken === 0) {
      handledPulseTokenRef.current = 0;
      pulseStartTimeRef.current = null;
      if (!inspected) {
        resetHighlight();
        setIsHighlightAnimationActive(false);
      }
      return;
    }

    if (pulseToken === handledPulseTokenRef.current) {
      return;
    }

    handledPulseTokenRef.current = pulseToken;
    pulseStartTimeRef.current = performance.now();
    setIsHighlightAnimationActive(true);
  }, [inspected, pulseToken, resetHighlight]);

  useEffect(() => {
    if (!inspected) {
      selectionTransitionRef.current = null;
      if (pulseStartTimeRef.current === null) {
        resetHighlight();
        setIsHighlightAnimationActive(false);
      }
      return;
    }

    selectionTransitionRef.current = {
      startColorMix: currentColorMixRef.current,
      startEmissiveIntensity: currentEmissiveIntensityRef.current,
      startRingOpacity: currentRingOpacityRef.current,
      startRingScale: currentRingScaleRef.current,
      startTimeMs: performance.now(),
    };
    pulseStartTimeRef.current = null;
    setIsHighlightAnimationActive(true);
  }, [baseColor, inspected, resetHighlight]);

  const handleHighlightAnimationComplete = useCallback(() => {
    setIsHighlightAnimationActive(false);
  }, []);

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
        <AtomSelectionRing
          materialRef={ringMaterialRef}
          opacity={0}
          radius={scaledRadius}
          ringRef={ringGroupRef}
          scale={ATOM_SELECTION_RING_PULSE_MIN_SCALE}
        />
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
        <StructureMaterial
          color={color}
          depthWrite={!isTransparent}
          materialFamily={materialFamily}
          materialRef={atomMaterialRef}
          opacity={opacity}
          transparent={isTransparent}
        />
      </mesh>
      {isHighlightAnimationActive ? (
        <AtomHighlightAnimator
          atomMaterialRef={atomMaterialRef}
          baseColor={baseColor}
          currentColorMixRef={currentColorMixRef}
          currentEmissiveIntensityRef={currentEmissiveIntensityRef}
          currentRingOpacityRef={currentRingOpacityRef}
          currentRingScaleRef={currentRingScaleRef}
          ringMaterialRef={ringMaterialRef}
          ringGroupRef={ringGroupRef}
          inspected={inspected}
          onComplete={handleHighlightAnimationComplete}
          pulseStartTimeRef={pulseStartTimeRef}
          selectionTransitionRef={selectionTransitionRef}
        />
      ) : null}
    </group>
  );
}

function AtomHighlightAnimator({
  atomMaterialRef,
  baseColor,
  currentColorMixRef,
  currentEmissiveIntensityRef,
  currentRingOpacityRef,
  currentRingScaleRef,
  ringMaterialRef,
  ringGroupRef,
  inspected,
  onComplete,
  pulseStartTimeRef,
  selectionTransitionRef,
}: {
  atomMaterialRef: { current: StructureMeshMaterial | null };
  baseColor: Color;
  currentColorMixRef: { current: number };
  currentEmissiveIntensityRef: { current: number };
  currentRingOpacityRef: { current: number };
  currentRingScaleRef: { current: number };
  ringMaterialRef: { current: SpriteMaterial | null };
  ringGroupRef: { current: Group | null };
  inspected: boolean;
  onComplete: () => void;
  pulseStartTimeRef: { current: number | null };
  selectionTransitionRef: { current: AtomSelectionHighlightTransition | null };
}) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
  }, [invalidate]);

  useFrame(() => {
    const atomMaterial = atomMaterialRef.current;
    if (!atomMaterial) {
      return;
    }
    const ringMaterial = ringMaterialRef.current;
    const ringGroup = ringGroupRef.current;

    if (inspected) {
      const selectionTransition = selectionTransitionRef.current;
      if (!selectionTransition) {
        currentColorMixRef.current = ATOM_HIGHLIGHT_SELECTED_COLOR_MIX;
        currentEmissiveIntensityRef.current = ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY;
        currentRingOpacityRef.current = ATOM_SELECTION_RING_SELECTED_OPACITY;
        currentRingScaleRef.current = ATOM_SELECTION_RING_SELECTED_SCALE;
        applyAtomHighlight(
          atomMaterial,
          baseColor,
          ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
          ATOM_HIGHLIGHT_SELECTED_EMISSIVE_INTENSITY,
        );
        if (ringMaterial && ringGroup) {
          ringGroup.scale.setScalar(ATOM_SELECTION_RING_SELECTED_SCALE);
          ringMaterial.opacity = ATOM_SELECTION_RING_SELECTED_OPACITY;
        }
        onComplete();
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
      const ringOpacity =
        selectionTransition.startRingOpacity +
        (ATOM_SELECTION_RING_SELECTED_OPACITY - selectionTransition.startRingOpacity) *
          easedProgress;
      const ringScale =
        selectionTransition.startRingScale +
        (ATOM_SELECTION_RING_SELECTED_SCALE - selectionTransition.startRingScale) *
          easedProgress;
      currentColorMixRef.current = colorMix;
      currentEmissiveIntensityRef.current = emissiveIntensity;
      currentRingOpacityRef.current = ringOpacity;
      currentRingScaleRef.current = ringScale;
      applyAtomHighlight(atomMaterial, baseColor, colorMix, emissiveIntensity);
      if (ringMaterial && ringGroup) {
        ringGroup.scale.setScalar(ringScale);
        ringMaterial.opacity = ringOpacity;
      }

      if (progress >= 1) {
        selectionTransitionRef.current = null;
        onComplete();
      } else {
        invalidate();
      }
      return;
    }

    const pulseStartTime = pulseStartTimeRef.current;
    if (pulseStartTime === null) {
      currentColorMixRef.current = 0;
      currentEmissiveIntensityRef.current = 0;
      currentRingOpacityRef.current = 0;
      currentRingScaleRef.current = ATOM_SELECTION_RING_PULSE_MIN_SCALE;
      applyAtomHighlight(atomMaterial, baseColor, 0, 0);
      if (ringMaterial && ringGroup) {
        ringGroup.scale.setScalar(ATOM_SELECTION_RING_PULSE_MIN_SCALE);
        ringMaterial.opacity = 0;
      }
      onComplete();
      return;
    }

    const progress = Math.min(
      1,
      (performance.now() - pulseStartTime) / ATOM_HIGHLIGHT_PULSE_MS,
    );
    const fade = atomPulseFade(progress);
    const colorMix = ATOM_HIGHLIGHT_PULSE_COLOR_MIX * fade;
    const emissiveIntensity = ATOM_HIGHLIGHT_PULSE_EMISSIVE_INTENSITY * fade;
    currentColorMixRef.current = colorMix;
    currentEmissiveIntensityRef.current = emissiveIntensity;
    currentRingOpacityRef.current = 0;
    currentRingScaleRef.current = ATOM_SELECTION_RING_PULSE_MIN_SCALE;
    applyAtomHighlight(atomMaterial, baseColor, colorMix, emissiveIntensity);
    if (ringMaterial && ringGroup) {
      ringGroup.scale.setScalar(ATOM_SELECTION_RING_PULSE_MIN_SCALE);
      ringMaterial.opacity = 0;
    }

    if (progress >= 1) {
      pulseStartTimeRef.current = null;
      applyAtomHighlight(atomMaterial, baseColor, 0, 0);
      onComplete();
    } else {
      invalidate();
    }
  });

  return null;
}

interface BondBatchItem {
  center: Vector3;
  endColor: string;
  length: number;
  quaternion: Quaternion;
  startAtomIndex: number;
  endAtomIndex: number;
  startColor: string;
}

interface BondBatchBuild {
  itemCount: number;
  items: BondBatchItem[];
  key: string;
  maxIndexCount: number;
  maxVertexCount: number;
  mode: BondColorMode;
  radialSegments: number;
  radius: number;
}

function BatchedBonds({
  atoms,
  bondColor,
  bonds,
  colorMode,
  colorScheme,
  colorOverrides,
  materialFamily,
  meshDetail,
  opacity,
  thicknessScale,
}: {
  atoms: AtomSpec[];
  bondColor: string;
  bonds: BondSpec[];
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  opacity: number;
  thicknessScale: number;
}) {
  const meshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchMeshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchKeyRef = useRef<string | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const batch = useMemo(
    () =>
      createBondBatchBuild({
        atoms,
        bondColor,
        bonds,
        colorMode,
        colorScheme,
        colorOverrides,
        radialSegments: meshDetail.bondRadialSegments,
        radius: BOND_RADIUS * thicknessScale,
      }),
    [
      atoms,
      bondColor,
      bonds,
      colorMode,
      colorOverrides,
      colorScheme,
      meshDetail.bondRadialSegments,
      thicknessScale,
    ],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !batch) {
      populatedBatchMeshRef.current = null;
      populatedBatchKeyRef.current = null;
      return;
    }

    if (
      populatedBatchMeshRef.current === mesh &&
      populatedBatchKeyRef.current === batch.key
    ) {
      return;
    }

    populateBatchedBondMesh(mesh, batch);
    populatedBatchMeshRef.current = mesh;
    populatedBatchKeyRef.current = batch.key;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [batch, invalidate]);

  if (!batch) {
    return null;
  }

  const isTransparent = opacity < 1;
  const usesVertexColors = batch.mode === "bicolor";
  const unicolorBondColor = batch.items[0]?.startColor ?? BOND_COLOR;

  return (
    <batchedMesh
      key={batch.key}
      ref={meshRef}
      args={[batch.itemCount, batch.maxVertexCount, batch.maxIndexCount]}
    >
      <StructureMaterial
        color={usesVertexColors ? undefined : unicolorBondColor}
        depthWrite={!isTransparent}
        materialFamily={materialFamily}
        opacity={opacity}
        transparent={isTransparent}
        vertexColors={usesVertexColors}
      />
    </batchedMesh>
  );
}

function createBondBatchBuild({
  atoms,
  bondColor,
  bonds,
  colorMode,
  colorScheme,
  colorOverrides,
  radialSegments,
  radius,
}: {
  atoms: AtomSpec[];
  bondColor: string;
  bonds: BondSpec[];
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  radialSegments: number;
  radius: number;
}): BondBatchBuild | null {
  const segments = Math.max(3, Math.floor(radialSegments));
  const items = bondBatchItems({
    atoms,
    bondColor,
    bonds,
    colorMode,
    colorScheme,
    colorOverrides,
  });

  if (items.length === 0 || radius <= 0) {
    return null;
  }

  if (colorMode === "bicolor") {
    const vertexCount = items.length * twoToneBondVertexCount(segments);
    const indexCount = items.length * twoToneBondIndexCount(segments);
    return {
      itemCount: items.length,
      items,
      key: bondBatchKey({ colorMode, items, radialSegments: segments, radius }),
      maxIndexCount: indexCount,
      maxVertexCount: vertexCount,
      mode: colorMode,
      radialSegments: segments,
      radius,
    };
  }

  const geometry = unicolorBondGeometry(radius, segments);
  const maxVertexCount = geometry.getAttribute("position").count;
  const maxIndexCount = geometry.getIndex()?.count ?? maxVertexCount;
  geometry.dispose();

  return {
    itemCount: items.length,
    items,
    key: bondBatchKey({ colorMode, items, radialSegments: segments, radius }),
    maxIndexCount,
    maxVertexCount,
    mode: colorMode,
    radialSegments: segments,
    radius,
  };
}

function bondBatchItems({
  atoms,
  bondColor,
  bonds,
  colorMode,
  colorScheme,
  colorOverrides,
}: {
  atoms: AtomSpec[];
  bondColor: string;
  bonds: BondSpec[];
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
}): BondBatchItem[] {
  const items: BondBatchItem[] = [];

  for (const bond of bonds) {
    const startAtom = atoms[bond.startAtomIndex];
    const endAtom = atoms[bond.endAtomIndex];
    if (!startAtom || !endAtom) {
      continue;
    }

    const start = new Vector3(...startAtom.position);
    const end = new Vector3(...endAtom.position);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length <= 0) {
      continue;
    }

    items.push({
      center: start.clone().add(end).multiplyScalar(0.5),
      endColor:
        colorMode === "bicolor" ? atomColorForScheme(endAtom, colorScheme, colorOverrides) : bondColor,
      length,
      quaternion: new Quaternion().setFromUnitVectors(
        new Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
      startAtomIndex: bond.startAtomIndex,
      endAtomIndex: bond.endAtomIndex,
      startColor:
        colorMode === "bicolor"
          ? atomColorForScheme(startAtom, colorScheme, colorOverrides)
          : bondColor,
    });
  }

  return items;
}

function populateBatchedBondMesh(mesh: BatchedMesh, batch: BondBatchBuild) {
  const matrix = new Matrix4();
  const unicolorGeometry =
    batch.mode === "unicolor" ? unicolorBondGeometry(batch.radius, batch.radialSegments) : null;
  const unicolorGeometryId = unicolorGeometry
    ? mesh.addGeometry(prepareBatchGeometry(unicolorGeometry))
    : null;

  for (const item of batch.items) {
    const geometryId = unicolorGeometryId ?? addTwoToneBondGeometry(mesh, item, batch);
    const instanceId = mesh.addInstance(geometryId);
    const scale =
      batch.mode === "unicolor" ? new Vector3(1, item.length, 1) : new Vector3(1, 1, 1);
    matrix.compose(item.center, item.quaternion, scale);
    mesh.setMatrixAt(instanceId, matrix);
  }

  unicolorGeometry?.dispose();
}

function addTwoToneBondGeometry(
  mesh: BatchedMesh,
  item: BondBatchItem,
  batch: BondBatchBuild,
): number {
  const geometry = prepareBatchGeometry(
    twoToneBondCylinderGeometry({
      endColor: item.endColor,
      length: item.length,
      radialSegments: batch.radialSegments,
      radius: batch.radius,
      startColor: item.startColor,
    }),
  );
  const geometryId = mesh.addGeometry(geometry);
  geometry.dispose();
  return geometryId;
}

function prepareBatchGeometry<TGeometry extends BufferGeometry>(geometry: TGeometry): TGeometry {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function unicolorBondGeometry(radius: number, radialSegments: number): CylinderGeometry {
  return new CylinderGeometry(radius, radius, 1, radialSegments);
}

function twoToneBondVertexCount(radialSegments: number): number {
  return 4 * (radialSegments + 1);
}

function twoToneBondIndexCount(radialSegments: number): number {
  return 12 * radialSegments;
}

function bondBatchKey({
  colorMode,
  items,
  radialSegments,
  radius,
}: {
  colorMode: BondColorMode;
  items: BondBatchItem[];
  radialSegments: number;
  radius: number;
}): string {
  let hash = hashString(`${colorMode}:${radialSegments}:${radius}`);
  for (const item of items) {
    hash = hashString(
      [
        hash,
        item.startAtomIndex,
        item.endAtomIndex,
        item.length,
        item.center.toArray().join(","),
        item.quaternion.toArray().join(","),
        item.startColor,
        item.endColor,
      ].join(":"),
    );
  }
  return `bonds:${items.length}:${hash.toString(36)}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function Bond({
  atoms,
  bond,
  bondColor,
  colorMode,
  colorScheme,
  colorOverrides,
  materialFamily,
  meshDetail,
  opacity,
  thicknessScale,
}: {
  atoms: AtomSpec[];
  bond: BondSpec;
  bondColor: string;
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  opacity: number;
  thicknessScale: number;
}) {
  const geometry = useMemo(() => {
    const startAtom = atoms[bond.startAtomIndex];
    const endAtom = atoms[bond.endAtomIndex];
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
      endColor: atomColorForScheme(endAtom, colorScheme, colorOverrides),
      length,
      quaternion,
      startColor: atomColorForScheme(startAtom, colorScheme, colorOverrides),
    };
  }, [atoms, bond.endAtomIndex, bond.startAtomIndex, colorOverrides, colorScheme]);

  if (!geometry) {
    return null;
  }

  const isTransparent = opacity < 1;
  const radius = BOND_RADIUS * thicknessScale;

  if (colorMode === "bicolor") {
    return (
      <TwoToneBondCylinder
        endColor={geometry.endColor}
        isTransparent={isTransparent}
        length={geometry.length}
        materialFamily={materialFamily}
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
      color={bondColor}
      isTransparent={isTransparent}
      length={geometry.length}
      materialFamily={materialFamily}
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
  materialFamily,
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
  materialFamily: ResolvedStructureMaterialFamily;
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

  useEffect(() => {
    return () => {
      geometry.dispose();
    };
  }, [geometry]);

  return (
    <mesh geometry={geometry} position={position} quaternion={quaternion}>
      <StructureMaterial
        depthWrite={!isTransparent}
        materialFamily={materialFamily}
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
  materialFamily,
  opacity,
  position,
  quaternion,
  radialSegments,
  radius,
}: {
  color: string;
  isTransparent: boolean;
  length: number;
  materialFamily: ResolvedStructureMaterialFamily;
  opacity: number;
  position: Vector3;
  quaternion: Quaternion;
  radialSegments: number;
  radius: number;
}) {
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
      <StructureMaterial
        color={color}
        depthWrite={!isTransparent}
        materialFamily={materialFamily}
        opacity={opacity}
        transparent={isTransparent}
      />
    </mesh>
  );
}

function Polyhedron({
  atoms,
  colorScheme,
  colorOverrides,
  lineWidthScale,
  materialFamily,
  opacity,
  polyhedron,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  lineWidthScale: number;
  materialFamily: ResolvedStructureMaterialFamily;
  opacity: number;
  polyhedron: PolyhedronSpec;
}) {
  const geometry = useMemo(
    () => polyhedronGeometryFromAtoms(polyhedron, atoms),
    [atoms, polyhedron],
  );
  const centerAtom = atoms[polyhedron.centerAtomIndex];
  const color = centerAtom
    ? atomColorForScheme(centerAtom, colorScheme, colorOverrides)
    : POLYHEDRON_EDGE_COLOR;
  const edgeLine = useMemo(() => {
    if (!geometry) {
      return null;
    }

    const edgeGeometry = new EdgesGeometry(geometry);
    const edgePositions = edgeGeometry.getAttribute("position");
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(Array.from(edgePositions.array));
    edgeGeometry.dispose();

    const material = new LineMaterial({
      alphaToCoverage: true,
      color: POLYHEDRON_EDGE_COLOR,
      depthWrite: false,
      fog: false,
      linewidth: POLYHEDRON_EDGE_LINE_WIDTH_PIXELS * lineWidthScale,
      opacity: Math.min(1, opacity * POLYHEDRON_EDGE_OPACITY_RATIO),
      transparent: true,
      worldUnits: false,
    });

    return new LineSegments2(lineGeometry, material);
  }, [geometry, lineWidthScale, opacity]);

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  useEffect(() => {
    return () => {
      edgeLine?.geometry.dispose();
      edgeLine?.material.dispose();
    };
  }, [edgeLine]);

  if (!geometry || !centerAtom || !edgeLine) {
    return null;
  }

  return (
    <group>
      <mesh geometry={geometry}>
        <StructureMaterial
          color={color}
          depthWrite={false}
          materialFamily={materialFamily}
          opacity={opacity}
          side={DoubleSide}
          transparent
        />
      </mesh>
      <primitive object={edgeLine} />
    </group>
  );
}

function CellFrame({
  color = CELL_FRAME_COLOR,
  fog,
  lineWidthScale,
  lineStyle,
  opacity,
  vectors,
}: {
  color?: string;
  fog: boolean;
  lineWidthScale: number;
  lineStyle: UnitCellLineStyle;
  opacity: number;
  vectors: VectorTuple[];
}) {
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(cellFrameLinePositions(vectors));
    const lineWidth = CELL_FRAME_LINE_WIDTH_PIXELS * lineWidthScale;
    const material = new LineMaterial({
      alphaToCoverage: true,
      color,
      dashed: lineStyle === "dashed",
      depthWrite: opacity >= 1,
      dashSize: CELL_FRAME_DASH_SIZE,
      fog,
      gapSize: CELL_FRAME_GAP_SIZE,
      linewidth: lineWidth,
      opacity,
      transparent: opacity < 1,
      worldUnits: false,
    });
    const line = new LineSegments2(geometry, material);
    if (lineStyle === "dashed") {
      material.defines.USE_DASH = "";
      material.needsUpdate = true;
      line.computeLineDistances();
    }
    return line;
  }, [color, fog, lineStyle, lineWidthScale, opacity, vectors]);

  useEffect(() => {
    return () => {
      line.geometry.dispose();
      line.material.dispose();
    };
  }, [line]);

  return <primitive object={line} />;
}

const MemoizedAtom = memo(Atom);
const MemoizedBond = memo(Bond);
const MemoizedPolyhedron = memo(Polyhedron);
