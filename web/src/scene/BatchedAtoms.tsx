import { type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  BatchedMesh,
  BufferGeometry,
  Color,
  Group,
  Matrix4,
  Quaternion,
  SphereGeometry,
  SpriteMaterial,
  Vector3,
} from "three";

import type { AtomRadiusModel, AtomSpec } from "../api/scene";
import type { ElementColorOverrides } from "../model/colorSchemes";
import type { StyleState } from "../model";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import { StructureMaterial } from "./StructureMaterial";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { AtomSelectionRing } from "./AtomSelectionRing";
import {
  ATOM_HIGHLIGHT_PULSE_COLOR_MIX,
  ATOM_HIGHLIGHT_PULSE_MS,
  ATOM_HIGHLIGHT_SELECT_MS,
  ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
  ATOM_HIGHLIGHT_TARGET_COLOR,
  ATOM_SELECTION_RING_PULSE_MIN_SCALE,
  ATOM_SELECTION_RING_SELECTED_OPACITY,
  ATOM_SELECTION_RING_SELECTED_SCALE,
  atomPulseFade,
  easeOutCubic,
} from "./atomHighlight";
import {
  atomRenderItemById,
  createAtomRenderItems,
  type AtomRenderItem,
} from "./AtomRenderItems";
import {
  createBatchPickRegistry,
  itemForBatchId,
  registerBatchPickItem,
  type BatchPickRegistry,
} from "./batchPicking";
import type { VectorTuple } from "./viewMath";

interface AtomBatchBuild {
  itemCount: number;
  items: AtomRenderItem[];
  key: string;
  maxIndexCount: number;
  maxVertexCount: number;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}

export function BatchedAtoms({
  atoms,
  colorScheme,
  colorOverrides,
  inspectedAtomId,
  interactionLocked,
  materialFamily,
  meshDetail,
  onInspect,
  onPulse,
  onLockedInteractionAttempt,
  opacity,
  pulseAtomId,
  pulseToken,
  radiusModel,
  radiusScale,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  inspectedAtomId: string | null;
  interactionLocked: boolean;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  onInspect?: (atomId: string | null) => void;
  onPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  opacity: number;
  pulseAtomId: string | null;
  pulseToken: number;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}) {
  const meshRef = useRef<BatchedMesh | null>(null);
  const pickRegistryRef = useRef<BatchPickRegistry<AtomRenderItem>>(
    createBatchPickRegistry<AtomRenderItem>(),
  );
  const populatedBatchMeshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchKeyRef = useRef<string | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const isTransparent = opacity < 1;
  const atomRenderItems = useMemo(
    () =>
      createAtomRenderItems({
        atoms,
        colorScheme,
        colorOverrides,
        radiusModel,
        radiusScale,
      }),
    [atoms, colorOverrides, colorScheme, radiusModel, radiusScale],
  );
  const itemByAtomId = useMemo(
    () => atomRenderItemById(atomRenderItems),
    [atomRenderItems],
  );
  const batch = useMemo(
    () =>
      createAtomBatchBuild({
        items: atomRenderItems,
        sphereHeightSegments: meshDetail.sphereHeightSegments,
        sphereWidthSegments: meshDetail.sphereWidthSegments,
      }),
    [
      atomRenderItems,
      meshDetail.sphereHeightSegments,
      meshDetail.sphereWidthSegments,
    ],
  );
  const inspectedItem = itemForAtomId(itemByAtomId, inspectedAtomId);
  const activePulse = pulseAtomId && pulseToken !== 0
    ? { atomId: pulseAtomId, token: pulseToken }
    : null;
  const pulseItem = inspectedItem || !activePulse
    ? null
    : itemForAtomId(itemByAtomId, activePulse.atomId);
  const activeHighlightItem = inspectedItem ?? pulseItem;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || !batch) {
      pickRegistryRef.current = createBatchPickRegistry<AtomRenderItem>();
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

    const pickRegistry = createBatchPickRegistry<AtomRenderItem>();
    populateBatchedAtomMesh(mesh, batch, pickRegistry);
    pickRegistryRef.current = pickRegistry;
    populatedBatchMeshRef.current = mesh;
    populatedBatchKeyRef.current = batch.key;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [batch, invalidate]);

  const atomForEvent = useCallback(
    (event: ThreeEvent<MouseEvent>) =>
      itemForBatchId(pickRegistryRef.current, event.batchId)?.atom ?? null,
    [],
  );

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      event.stopPropagation();
      if (interactionLocked) {
        return;
      }

      onPulse?.(atom.id);
    },
    [atomForEvent, interactionLocked, onPulse],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      event.stopPropagation();
      if (interactionLocked) {
        onLockedInteractionAttempt?.();
        return;
      }

      onInspect?.(atom.id);
    },
    [atomForEvent, interactionLocked, onInspect, onLockedInteractionAttempt],
  );

  if (!batch) {
    return null;
  }

  return (
    <>
      <batchedMesh
        key={batch.key}
        ref={meshRef}
        args={[batch.itemCount, batch.maxVertexCount, batch.maxIndexCount]}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        renderOrder={STRUCTURE_RENDER_ORDER.atomMesh}
      >
        <StructureMaterial
          color="#ffffff"
          // BatchedMesh sorts atoms within this draw list. Depth writes stay on
          // so atoms keep stable structure-layer occlusion against bonds.
          depthWrite={true}
          materialFamily={materialFamily}
          opacity={opacity}
          transparent={isTransparent}
        />
      </batchedMesh>
      {activeHighlightItem ? (
        <AtomHighlightAnimator
          key={[
            activeHighlightItem.id,
            inspectedItem ? "selected" : "pulse",
            inspectedItem ? "" : pulseToken,
            activeHighlightItem.color,
          ].join(":")}
          baseColor={activeHighlightItem.baseColor}
          inspected={inspectedItem !== null}
          itemId={activeHighlightItem.id}
          meshRef={meshRef}
          pickRegistryRef={pickRegistryRef}
        />
      ) : null}
      {inspectedItem ? (
        <AtomSelectionRingAnimator
          key={inspectedItem.id}
          position={inspectedItem.position}
          radius={inspectedItem.radius}
        />
      ) : null}
    </>
  );
}

function createAtomBatchBuild({
  items,
  sphereHeightSegments,
  sphereWidthSegments,
}: {
  items: AtomRenderItem[];
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}): AtomBatchBuild | null {
  if (items.length === 0) {
    return null;
  }

  const widthSegments = Math.max(3, Math.floor(sphereWidthSegments));
  const heightSegments = Math.max(2, Math.floor(sphereHeightSegments));
  const geometry = atomSphereGeometry(widthSegments, heightSegments);
  const maxVertexCount = geometry.getAttribute("position").count;
  const maxIndexCount = geometry.getIndex()?.count ?? maxVertexCount;
  geometry.dispose();

  return {
    itemCount: items.length,
    items,
    key: atomBatchKey({
      items,
      sphereHeightSegments: heightSegments,
      sphereWidthSegments: widthSegments,
    }),
    maxIndexCount,
    maxVertexCount,
    sphereHeightSegments: heightSegments,
    sphereWidthSegments: widthSegments,
  };
}

function populateBatchedAtomMesh(
  mesh: BatchedMesh,
  batch: AtomBatchBuild,
  pickRegistry: BatchPickRegistry<AtomRenderItem>,
) {
  const matrix = new Matrix4();
  const position = new Vector3();
  const scale = new Vector3();
  const quaternion = new Quaternion();
  const geometry = prepareBatchGeometry(
    atomSphereGeometry(batch.sphereWidthSegments, batch.sphereHeightSegments),
  );
  const geometryId = mesh.addGeometry(geometry);

  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = true;

  for (const item of batch.items) {
    const batchId = mesh.addInstance(geometryId);
    position.fromArray(item.position);
    scale.setScalar(item.radius);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(batchId, matrix);
    mesh.setColorAt(batchId, item.baseColor);
    registerBatchPickItem(pickRegistry, batchId, item);
  }

  geometry.dispose();
}

function itemForAtomId(
  itemByAtomId: Map<string, AtomRenderItem>,
  atomId: string | null,
): AtomRenderItem | null {
  if (!atomId) {
    return null;
  }

  return itemByAtomId.get(atomId) ?? null;
}

function setAtomBatchColor(
  mesh: BatchedMesh,
  batchId: number,
  color: Color,
) {
  mesh.setColorAt(batchId, color);
}

function AtomHighlightAnimator({
  baseColor,
  inspected,
  itemId,
  meshRef,
  pickRegistryRef,
}: {
  baseColor: Color;
  inspected: boolean;
  itemId: string;
  meshRef: { current: BatchedMesh | null };
  pickRegistryRef: { current: BatchPickRegistry<AtomRenderItem> };
}) {
  const invalidate = useThree((state) => state.invalidate);
  const startTimeRef = useRef(performance.now());
  const activeBatchRef = useRef<{ batchId: number; mesh: BatchedMesh } | null>(null);
  const isActiveRef = useRef(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    activeBatchRef.current = resolveActiveBatch(meshRef, pickRegistryRef, itemId);
    isActiveRef.current = true;
    invalidate();

    return () => {
      const activeBatch = activeBatchRef.current;
      if (activeBatch && meshRef.current === activeBatch.mesh) {
        setAtomBatchColor(activeBatch.mesh, activeBatch.batchId, baseColor);
        invalidate();
      }
    };
  }, [baseColor, invalidate, itemId, meshRef, pickRegistryRef]);

  useFrame(() => {
    if (!isActiveRef.current) {
      return;
    }

    let activeBatch = activeBatchRef.current;
    if (!activeBatch || meshRef.current !== activeBatch.mesh) {
      activeBatch = resolveActiveBatch(meshRef, pickRegistryRef, itemId);
      activeBatchRef.current = activeBatch;
    }
    if (!activeBatch) {
      return;
    }

    const elapsedMs = performance.now() - startTimeRef.current;
    const targetMix = inspected
      ? ATOM_HIGHLIGHT_SELECTED_COLOR_MIX
      : ATOM_HIGHLIGHT_PULSE_COLOR_MIX;
    const durationMs = inspected ? ATOM_HIGHLIGHT_SELECT_MS : ATOM_HIGHLIGHT_PULSE_MS;
    const progress = Math.min(1, elapsedMs / durationMs);
    const fade = inspected ? easeOutCubic(progress) : atomPulseFade(progress);
    const color = baseColor.clone().lerp(ATOM_HIGHLIGHT_TARGET_COLOR, targetMix * fade);
    setAtomBatchColor(activeBatch.mesh, activeBatch.batchId, color);

    if (progress >= 1) {
      if (!inspected) {
        setAtomBatchColor(activeBatch.mesh, activeBatch.batchId, baseColor);
      }
      isActiveRef.current = false;
      return;
    }

    invalidate();
  });

  return null;
}

function resolveActiveBatch(
  meshRef: { current: BatchedMesh | null },
  pickRegistryRef: { current: BatchPickRegistry<AtomRenderItem> },
  itemId: string,
): { batchId: number; mesh: BatchedMesh } | null {
  const mesh = meshRef.current;
  const batchId = pickRegistryRef.current.batchIdByItemId.get(itemId);
  if (!mesh || batchId === undefined) {
    return null;
  }

  return { batchId, mesh };
}

function AtomSelectionRingAnimator({
  position,
  radius,
}: {
  position: VectorTuple;
  radius: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const ringGroupRef = useRef<Group | null>(null);
  const ringMaterialRef = useRef<SpriteMaterial | null>(null);
  const startTimeRef = useRef(performance.now());
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    setIsActive(true);
    invalidate();
  }, [invalidate]);

  useFrame(() => {
    if (!isActive) {
      return;
    }

    const ringGroup = ringGroupRef.current;
    const ringMaterial = ringMaterialRef.current;
    if (!ringGroup || !ringMaterial) {
      return;
    }

    const progress = Math.min(
      1,
      (performance.now() - startTimeRef.current) / ATOM_HIGHLIGHT_SELECT_MS,
    );
    const easedProgress = easeOutCubic(progress);
    const scale =
      ATOM_SELECTION_RING_PULSE_MIN_SCALE +
      (ATOM_SELECTION_RING_SELECTED_SCALE - ATOM_SELECTION_RING_PULSE_MIN_SCALE) *
        easedProgress;
    ringGroup.scale.setScalar(scale);
    ringMaterial.opacity = ATOM_SELECTION_RING_SELECTED_OPACITY * easedProgress;

    if (progress >= 1) {
      setIsActive(false);
      return;
    }

    invalidate();
  });

  return (
    <AtomSelectionRing
      materialRef={ringMaterialRef}
      opacity={0}
      position={position}
      radius={radius}
      ringRef={ringGroupRef}
      scale={ATOM_SELECTION_RING_PULSE_MIN_SCALE}
    />
  );
}

function atomSphereGeometry(widthSegments: number, heightSegments: number): SphereGeometry {
  return new SphereGeometry(1, widthSegments, heightSegments);
}

function prepareBatchGeometry<TGeometry extends BufferGeometry>(geometry: TGeometry): TGeometry {
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function atomBatchKey({
  items,
  sphereHeightSegments,
  sphereWidthSegments,
}: {
  items: AtomRenderItem[];
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}): string {
  let hash = hashString(`${sphereWidthSegments}:${sphereHeightSegments}`);
  for (const item of items) {
    hash = hashString(
      [
        hash,
        item.id,
        item.position.join(","),
        item.radius,
        item.color,
      ].join(":"),
    );
  }
  return `atoms:${items.length}:${hash.toString(36)}`;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
