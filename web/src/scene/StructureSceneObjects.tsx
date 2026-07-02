import { useThree } from "@react-three/fiber";
import { memo, useCallback, useLayoutEffect, useMemo } from "react";
import { Fog } from "three";

import type { SceneSpec } from "../api/scene";
import type {
  ComponentOpacityState,
  ExportMeshQuality,
  StyleState,
  UnitCellLineStyle,
} from "../model";
import {
  baseColorSchemeForStyle,
  DEFAULT_BOND_COLOR,
  elementColorOverridesForStyle,
} from "../model";
import type { ResolvedStructureMaterialFamilies } from "./materialPresetResolver";
import type { SceneLayout } from "./sceneLayout";
import type { VectorTuple } from "./viewMath";
import { InstancedAtoms } from "./InstancedAtoms";
import { BatchedBonds } from "./BatchedBonds";
import { createBondRenderItems } from "./BondRenderItems";
import { CellFrame } from "./CellFrame";
import { MemoizedBatchedPolyhedra } from "./BatchedPolyhedra";
import { AtomLabels } from "./AtomLabels";
export {
  POLYHEDRON_EDGE_COLOR,
  POLYHEDRON_EDGE_OPACITY,
  POLYHEDRON_SURFACE_OPACITY,
} from "./BatchedPolyhedra";

export interface SceneMeshDetail {
  bondRadialSegments: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export const BOND_COLOR = DEFAULT_BOND_COLOR;
export const BOND_TUBE_RADIAL_SEGMENTS = 24;
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
  componentOpacity,
  layout,
  materialFamilies,
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
  showAtomLabels,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  componentOpacity: ComponentOpacityState;
  layout: SceneLayout;
  materialFamilies: ResolvedStructureMaterialFamilies;
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
  showAtomLabels: boolean;
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
        componentOpacity={componentOpacity}
        groupPosition={layout.groupPosition}
        materialFamilies={materialFamilies}
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
        showAtomLabels={showAtomLabels}
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
  componentOpacity,
  groupPosition,
  interactionLocked = false,
  materialFamilies,
  meshDetail,
  scene,
  inspectedAtomId = null,
  onAtomInspect,
  onAtomPulse,
  onLockedInteractionAttempt,
  polyhedronEdgeLineWidthScale = 1,
  pulseAtomId = null,
  pulseToken = 0,
  showAtomLabels,
  showAtoms,
  showUnitCell,
  style,
  unitCellLineColor,
  unitCellLineStyle = "solid",
  unitCellLineWidthScale = 1,
}: {
  componentOpacity: ComponentOpacityState;
  groupPosition: VectorTuple;
  interactionLocked?: boolean;
  materialFamilies: ResolvedStructureMaterialFamilies;
  meshDetail: SceneMeshDetail;
  scene: SceneSpec;
  inspectedAtomId?: string | null;
  onAtomInspect?: (atomId: string | null) => void;
  onAtomPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  polyhedronEdgeLineWidthScale?: number;
  pulseAtomId?: string | null;
  pulseToken?: number;
  showAtomLabels: boolean;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  unitCellLineColor?: string;
  unitCellLineStyle?: UnitCellLineStyle;
  unitCellLineWidthScale?: number;
}) {
  const colorOverrides = useMemo(
    () => elementColorOverridesForStyle(scene.atoms, style),
    [scene.atoms, style],
  );
  const colorScheme = baseColorSchemeForStyle(style);
  const bondRenderItems = useMemo(
    () =>
      createBondRenderItems({
        atoms: scene.atoms,
        bondColor: style.bondColor,
        bonds: scene.bonds,
        colorMode: style.bondColorMode,
        colorScheme,
        colorOverrides,
      }),
    [
      colorScheme,
      colorOverrides,
      scene.atoms,
      scene.bonds,
      style.bondColor,
      style.bondColorMode,
    ],
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
        <MemoizedBatchedPolyhedra
          atoms={scene.atoms}
          colorScheme={colorScheme}
          colorOverrides={colorOverrides}
          materialFamily={materialFamilies.polyhedron}
          opacity={componentOpacity.polyhedra / 100}
          polyhedra={scene.polyhedra}
          lineWidthScale={polyhedronEdgeLineWidthScale}
        />
        <BatchedBonds
          bondRenderItems={bondRenderItems}
          colorMode={style.bondColorMode}
          materialFamily={materialFamilies.bond}
          meshDetail={meshDetail}
          thicknessScale={style.bondThickness / 100}
          opacity={componentOpacity.bonds / 100}
        />
        {showAtoms ? (
          <InstancedAtoms
            atoms={scene.atoms}
            colorScheme={colorScheme}
            colorOverrides={colorOverrides}
            inspectedAtomId={inspectedAtomId}
            interactionLocked={interactionLocked}
            materialFamily={materialFamilies.atom}
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
        ) : null}
        {showAtomLabels ? (
          <AtomLabels
            atoms={scene.atoms}
            radiusModel={style.atomRadiusModel}
            radiusScale={style.atomRadius / 100}
          />
        ) : null}
      </group>
    </group>
  );
}

export const MemoizedStructureSceneObjects = memo(StructureSceneObjects);
