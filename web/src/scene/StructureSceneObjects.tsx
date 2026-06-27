import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Color,
  DoubleSide,
  Fog,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
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
import { atomColorForScheme } from "../model/colorSchemes";
import type {
  BondColorMode,
  ComponentOpacityState,
  ExportMeshQuality,
  StyleState,
} from "../model";
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
import { polyhedronGeometryFromAtoms, twoToneBondCylinderGeometry } from "./structureGeometry";

export interface SceneMeshDetail {
  bondRadialSegments: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export const BOND_COLOR = "#c7cbd1";
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
  pulseAtomId,
  pulseToken,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineWidthScale = 1,
}: {
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
  pulseAtomId: string | null;
  pulseToken: number;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineWidthScale?: number;
}) {
  const atomById = useMemo(() => new Map(scene.atoms.map((atom) => [atom.id, atom])), [scene]);

  return (
    <>
      <SceneFog layout={layout} style={style} />
      <MemoizedStructureSceneObjects
        atomById={atomById}
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
        pulseAtomId={pulseAtomId}
        pulseToken={pulseToken}
        showAtoms={showAtoms}
        showUnitCell={showUnitCell}
        style={style}
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

export function StructureSceneObjects({
  atomById,
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
  pulseAtomId = null,
  pulseToken = 0,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineWidthScale = 1,
}: {
  atomById: Map<string, AtomSpec>;
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
  pulseAtomId?: string | null;
  pulseToken?: number;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineWidthScale?: number;
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
            lineWidthScale={unitCellLineWidthScale}
            opacity={componentOpacity.unitCell / 100}
            vectors={scene.cell.vectors}
          />
        ) : null}
        {scene.polyhedra.map((polyhedron) => (
          <MemoizedPolyhedron
            key={polyhedron.id}
            atomById={atomById}
            colorScheme={style.colorScheme}
            materialFamily={materialFamily}
            opacity={componentOpacity.polyhedra / 100}
            polyhedron={polyhedron}
          />
        ))}
        {scene.bonds.map((bond) => (
          <MemoizedBond
            key={bond.id}
            atomById={atomById}
            bond={bond}
            colorMode={style.bondColorMode}
            colorScheme={style.colorScheme}
            materialFamily={materialFamily}
            meshDetail={meshDetail}
            thicknessScale={style.bondThickness / 100}
            opacity={componentOpacity.bonds / 100}
          />
        ))}
        {showAtoms
          ? scene.atoms.map((atom) => (
              <MemoizedAtom
                key={atom.id}
                atom={atom}
                colorScheme={style.colorScheme}
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
          : null}
      </group>
    </group>
  );
}

export const MemoizedStructureSceneObjects = memo(StructureSceneObjects);

interface AtomSelectionHighlightTransition {
  startColorMix: number;
  startEmissiveIntensity: number;
  startHaloOpacity: number;
  startHaloScale: number;
  startTimeMs: number;
}

function applyAtomHighlight(
  material: StructureMeshMaterial,
  baseColor: Color,
  colorMix: number,
  emissiveIntensity: number,
) {
  material.color.copy(baseColor).lerp(ATOM_HIGHLIGHT_TARGET_COLOR, colorMix);
  if ("emissive" in material) {
    material.emissive
      .copy(baseColor)
      .lerp(ATOM_HIGHLIGHT_TARGET_COLOR, ATOM_HIGHLIGHT_EMISSIVE_COLOR_MIX);
    material.emissiveIntensity = emissiveIntensity;
  }
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

function Atom({
  atom,
  colorScheme,
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
  const haloMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const haloMeshRef = useRef<Mesh | null>(null);
  const currentColorMixRef = useRef(0);
  const currentEmissiveIntensityRef = useRef(0);
  const currentHaloOpacityRef = useRef(0);
  const currentHaloScaleRef = useRef(ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE);
  const pulseStartTimeRef = useRef<number | null>(null);
  const selectionTransitionRef = useRef<AtomSelectionHighlightTransition | null>(null);
  const [isHighlightAnimationActive, setIsHighlightAnimationActive] = useState(false);
  const isTransparent = opacity < 1;
  const radius = atomRadiusForModel(atom, radiusModel);
  const scaledRadius = radius * radiusScale;
  const color = atomColorForScheme(atom, colorScheme);
  const baseColor = useMemo(() => new Color(color), [color]);

  const resetHighlight = useCallback(() => {
    currentColorMixRef.current = 0;
    currentEmissiveIntensityRef.current = 0;
    currentHaloOpacityRef.current = 0;
    currentHaloScaleRef.current = ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE;

    const atomMaterial = atomMaterialRef.current;
    if (atomMaterial) {
      applyAtomHighlight(atomMaterial, baseColor, 0, 0);
    }

    const haloMaterial = haloMaterialRef.current;
    const haloMesh = haloMeshRef.current;
    if (haloMaterial && haloMesh) {
      haloMesh.scale.setScalar(ATOM_HIGHLIGHT_HALO_PULSE_MIN_SCALE);
      haloMaterial.opacity = 0;
    }
  }, [baseColor]);

  useEffect(() => {
    if (pulseToken === 0) {
      pulseStartTimeRef.current = null;
      if (!inspected) {
        resetHighlight();
        setIsHighlightAnimationActive(false);
      }
      return;
    }

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
      startHaloOpacity: currentHaloOpacityRef.current,
      startHaloScale: currentHaloScaleRef.current,
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
          currentHaloOpacityRef={currentHaloOpacityRef}
          currentHaloScaleRef={currentHaloScaleRef}
          haloMaterialRef={haloMaterialRef}
          haloMeshRef={haloMeshRef}
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
  currentHaloOpacityRef,
  currentHaloScaleRef,
  haloMaterialRef,
  haloMeshRef,
  inspected,
  onComplete,
  pulseStartTimeRef,
  selectionTransitionRef,
}: {
  atomMaterialRef: { current: StructureMeshMaterial | null };
  baseColor: Color;
  currentColorMixRef: { current: number };
  currentEmissiveIntensityRef: { current: number };
  currentHaloOpacityRef: { current: number };
  currentHaloScaleRef: { current: number };
  haloMaterialRef: { current: MeshBasicMaterial | null };
  haloMeshRef: { current: Mesh | null };
  inspected: boolean;
  onComplete: () => void;
  pulseStartTimeRef: { current: number | null };
  selectionTransitionRef: { current: AtomSelectionHighlightTransition | null };
}) {
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
        onComplete();
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
      onComplete();
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
      applyAtomHighlight(atomMaterial, baseColor, 0, 0);
      onComplete();
    }
  });

  return null;
}

function Bond({
  atomById,
  bond,
  colorMode,
  colorScheme,
  materialFamily,
  meshDetail,
  opacity,
  thicknessScale,
}: {
  atomById: Map<string, AtomSpec>;
  bond: BondSpec;
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  materialFamily: ResolvedStructureMaterialFamily;
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

  if (colorMode === "by-atom") {
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
      color={BOND_COLOR}
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
  atomById,
  colorScheme,
  materialFamily,
  opacity,
  polyhedron,
}: {
  atomById: Map<string, AtomSpec>;
  colorScheme: StyleState["colorScheme"];
  materialFamily: ResolvedStructureMaterialFamily;
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
        <StructureMaterial
          color={color}
          depthWrite={false}
          materialFamily={materialFamily}
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

function CellFrame({
  lineWidthScale,
  opacity,
  vectors,
}: {
  lineWidthScale: number;
  opacity: number;
  vectors: VectorTuple[];
}) {
  const line = useMemo(() => {
    const geometry = new LineSegmentsGeometry();
    geometry.setPositions(cellFrameLinePositions(vectors));
    const lineWidth = CELL_FRAME_LINE_WIDTH_PIXELS * lineWidthScale;
    const material = new LineMaterial({
      alphaToCoverage: true,
      color: CELL_FRAME_COLOR,
      depthWrite: opacity >= 1,
      fog: false,
      linewidth: lineWidth,
      opacity,
      transparent: opacity < 1,
      worldUnits: false,
    });
    return new LineSegments2(geometry, material);
  }, [lineWidthScale, opacity, vectors]);

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
