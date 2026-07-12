import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  BatchedMesh,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Matrix4,
  MeshBasicMaterial,
  Vector3,
} from "three";

import type { BondColorMode } from "../model";
import { DEFAULT_BOND_COLOR } from "../model";
import type { SelectionActivation } from "../selection/selectionActivationPreference";
import { BOND_RADIUS } from "./sceneGeometry";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import { twoToneBondCylinderGeometry } from "./structureGeometry";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { StructureMaterial } from "./StructureMaterial";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import type { BondRenderItem } from "./BondRenderItems";
import {
  createBatchPickRegistry,
  itemForBatchId,
  registerBatchPickItem,
  type BatchPickRegistry,
} from "./batchPicking";
import {
  ATOM_HIGHLIGHT_PULSE_COLOR_MIX,
  ATOM_HIGHLIGHT_PULSE_MS,
  SELECTION_HANDOFF_MS,
  SELECTION_HANDOFF_WHITE_MIX,
  SELECTION_HIGHLIGHT_COLOR,
  atomPulseFade,
  easeOutCubic,
} from "./atomHighlight";
import { selectionPointerAction } from "./selectionActivation";

interface BondBatchBuild {
  itemCount: number;
  items: BondRenderItem[];
  key: string;
  maxIndexCount: number;
  maxVertexCount: number;
  mode: BondColorMode;
  radialSegments: number;
}

export function BatchedBonds({
  bondRenderItems,
  colorMode,
  inspectedBondId,
  interactionLocked,
  selectionActivation,
  materialFamily,
  meshDetail,
  onInspect,
  onLockedInteractionAttempt,
  onPulse,
  opacity,
  pulseBondId,
  pulseToken,
  selectionHighlightColor = SELECTION_HIGHLIGHT_COLOR,
  thicknessScale,
}: {
  bondRenderItems: BondRenderItem[];
  colorMode: BondColorMode;
  inspectedBondId: string | null;
  interactionLocked: boolean;
  selectionActivation: SelectionActivation;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  onInspect?: (bondId: string | null) => void;
  onLockedInteractionAttempt?: () => void;
  onPulse?: (bondId: string) => void;
  opacity: number;
  pulseBondId: string | null;
  pulseToken: number;
  selectionHighlightColor?: string;
  thicknessScale: number;
}) {
  const meshRef = useRef<BatchedMesh | null>(null);
  const pickRegistryRef = useRef<BatchPickRegistry<BondRenderItem>>(
    createBatchPickRegistry<BondRenderItem>(),
  );
  const populatedBatchMeshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchKeyRef = useRef<string | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const batch = useMemo(
    () =>
      createBondBatchBuild({
        bondRenderItems,
        colorMode,
        radialSegments: meshDetail.bondRadialSegments,
        radius: BOND_RADIUS * thicknessScale,
      }),
    [bondRenderItems, colorMode, meshDetail.bondRadialSegments, thicknessScale],
  );
  const itemById = useMemo(
    () => new Map(bondRenderItems.map((item) => [item.id, item])),
    [bondRenderItems],
  );
  const inspectedItem = inspectedBondId
    ? (itemById.get(inspectedBondId) ?? null)
    : null;
  const pulseItem =
    inspectedItem || !pulseBondId || pulseToken === 0
      ? null
      : (itemById.get(pulseBondId) ?? null);
  const activeHighlightItem = inspectedItem ?? pulseItem;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !batch) {
      pickRegistryRef.current = createBatchPickRegistry<BondRenderItem>();
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

    const pickRegistry = createBatchPickRegistry<BondRenderItem>();
    populateBatchedBondMesh(mesh, batch, pickRegistry);
    pickRegistryRef.current = pickRegistry;
    populatedBatchMeshRef.current = mesh;
    populatedBatchKeyRef.current = batch.key;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [batch, invalidate]);

  const itemForEvent = useCallback(
    (event: ThreeEvent<MouseEvent>) =>
      itemForBatchId(pickRegistryRef.current, event.batchId),
    [],
  );
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const item = itemForEvent(event);
      if (!item) {
        return;
      }
      event.stopPropagation();
      const action = selectionPointerAction({
        activation: selectionActivation,
        event: "click",
        interactionLocked,
        selected: item.id === inspectedBondId,
      });
      if (action === "locked-feedback") {
        onLockedInteractionAttempt?.();
      } else if (action === "select") {
        onInspect?.(item.id);
      } else if (action === "pulse") {
        onPulse?.(item.id);
      }
    },
    [
      inspectedBondId,
      interactionLocked,
      itemForEvent,
      onInspect,
      onLockedInteractionAttempt,
      onPulse,
      selectionActivation,
    ],
  );
  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const item = itemForEvent(event);
      if (!item) {
        return;
      }
      event.stopPropagation();
      const action = selectionPointerAction({
        activation: selectionActivation,
        event: "double-click",
        interactionLocked,
        selected: item.id === inspectedBondId,
      });
      if (action === "locked-feedback") {
        onLockedInteractionAttempt?.();
      } else if (action === "select") {
        onInspect?.(item.id);
      }
    },
    [
      interactionLocked,
      inspectedBondId,
      itemForEvent,
      onInspect,
      onLockedInteractionAttempt,
      selectionActivation,
    ],
  );

  if (!batch) {
    return null;
  }

  const isTransparent = opacity < 1;
  const usesVertexColors = batch.mode === "bicolor";
  const unicolorBondColor = batch.items[0]?.startColor ?? DEFAULT_BOND_COLOR;

  return (
    <>
      <batchedMesh
        key={batch.key}
        ref={meshRef}
        args={[batch.itemCount, batch.maxVertexCount, batch.maxIndexCount]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        renderOrder={STRUCTURE_RENDER_ORDER.bondMesh}
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
      {activeHighlightItem ? (
        <BondHighlightAnimator
          key={[
            activeHighlightItem.id,
            inspectedItem ? "selected" : "pulse",
            inspectedItem ? "" : pulseToken,
          ].join(":")}
          inspected={inspectedItem !== null}
          item={activeHighlightItem}
          radius={activeHighlightItem.radius}
          selectionHighlightColor={selectionHighlightColor}
        />
      ) : null}
    </>
  );
}

function createBondBatchBuild({
  bondRenderItems,
  colorMode,
  radialSegments,
  radius,
}: {
  bondRenderItems: BondRenderItem[];
  colorMode: BondColorMode;
  radialSegments: number;
  radius: number;
}): BondBatchBuild | null {
  const segments = Math.max(3, Math.floor(radialSegments));
  const items = bondRenderItems;

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
    };
  }

  const geometry = unicolorBondGeometry(1, segments);
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
  };
}

function populateBatchedBondMesh(
  mesh: BatchedMesh,
  batch: BondBatchBuild,
  pickRegistry: BatchPickRegistry<BondRenderItem>,
) {
  const matrix = new Matrix4();
  const unicolorGeometry =
    batch.mode === "unicolor"
      ? unicolorBondGeometry(1, batch.radialSegments)
      : null;
  const unicolorGeometryId = unicolorGeometry
    ? mesh.addGeometry(prepareBatchGeometry(unicolorGeometry))
    : null;

  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = true;

  for (const item of batch.items) {
    const geometryId =
      unicolorGeometryId ?? addTwoToneBondGeometry(mesh, item, batch);
    const batchId = mesh.addInstance(geometryId);
    const scale =
      batch.mode === "unicolor"
        ? new Vector3(item.radius, item.length, item.radius)
        : new Vector3(1, 1, 1);
    matrix.compose(item.center, item.quaternion, scale);
    mesh.setMatrixAt(batchId, matrix);
    registerBatchPickItem(pickRegistry, batchId, item);
  }

  unicolorGeometry?.dispose();
}

function BondHighlightAnimator({
  inspected,
  item,
  radius,
  selectionHighlightColor,
}: {
  inspected: boolean;
  item: BondRenderItem;
  radius: number;
  selectionHighlightColor: string;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const tintMaterialRef = useRef<MeshBasicMaterial | null>(null);
  const startTimeRef = useRef(performance.now());
  const activeRef = useRef(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    activeRef.current = true;
    invalidate();
  }, [inspected, invalidate, item.id]);

  useFrame(() => {
    if (!activeRef.current) {
      return;
    }
    const tintMaterial = tintMaterialRef.current;
    if (!tintMaterial) {
      return;
    }
    const duration = inspected ? SELECTION_HANDOFF_MS : ATOM_HIGHLIGHT_PULSE_MS;
    const progress = Math.min(
      1,
      (performance.now() - startTimeRef.current) / duration,
    );
    const fade = inspected ? easeOutCubic(progress) : atomPulseFade(progress);
    if (inspected) {
      tintMaterial.color
        .set("#ffffff")
        .lerp(new Color(selectionHighlightColor), fade);
      tintMaterial.opacity =
        SELECTION_HANDOFF_WHITE_MIX +
        (0.85 - SELECTION_HANDOFF_WHITE_MIX) * fade;
    } else {
      tintMaterial.opacity = ATOM_HIGHLIGHT_PULSE_COLOR_MIX * fade;
    }
    if (progress >= 1) {
      activeRef.current = false;
      if (!inspected) {
        tintMaterial.opacity = 0;
      }
      return;
    }
    invalidate();
  });

  return (
    <group
      position={item.center}
      quaternion={item.quaternion}
      scale={[1, item.length, 1]}
      renderOrder={STRUCTURE_RENDER_ORDER.bondSelectionHighlight}
    >
      <mesh raycast={ignoreBondHighlightRaycast}>
        <cylinderGeometry args={[radius * 1.01, radius * 1.01, 1, 24]} />
        <meshBasicMaterial
          ref={tintMaterialRef}
          color={inspected ? selectionHighlightColor : "#ffffff"}
          depthWrite={false}
          opacity={0}
          transparent
        />
      </mesh>
    </group>
  );
}

function ignoreBondHighlightRaycast() {}

function addTwoToneBondGeometry(
  mesh: BatchedMesh,
  item: BondRenderItem,
  batch: BondBatchBuild,
): number {
  const geometry = prepareBatchGeometry(
    twoToneBondCylinderGeometry({
      endColor: item.endColor,
      length: item.length,
      radialSegments: batch.radialSegments,
      radius: item.radius,
      startColor: item.startColor,
    }),
  );
  const geometryId = mesh.addGeometry(geometry);
  geometry.dispose();
  return geometryId;
}

function prepareBatchGeometry<TGeometry extends BufferGeometry>(
  geometry: TGeometry,
): TGeometry {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function unicolorBondGeometry(
  radius: number,
  radialSegments: number,
): CylinderGeometry {
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
  items: BondRenderItem[];
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
        item.radius,
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
