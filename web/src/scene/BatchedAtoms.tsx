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
  type DataTexture,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";

import type { AtomSpec } from "../api/scene";
import type { ElementColorOverrides } from "../model/colorSchemes";
import type { StyleState } from "../model";
import type { SelectionActivation } from "../selection/selectionActivationPreference";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import { StructureMaterial } from "./StructureMaterial";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import {
  ATOM_HIGHLIGHT_PULSE_COLOR_MIX,
  ATOM_HIGHLIGHT_PULSE_MS,
  ATOM_HIGHLIGHT_SELECTED_COLOR_MIX,
  ATOM_HIGHLIGHT_TARGET_COLOR,
  SELECTION_HANDOFF_MS,
  SELECTION_HANDOFF_WHITE_MIX,
  SELECTION_HIGHLIGHT_COLOR,
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
import { selectionPointerAction } from "./selectionActivation";
import {
  batchedAtomOpacityProgramCacheKey,
  enableBatchedAtomOpacity,
} from "./batchedAtomOpacity";

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
  atomOpacity,
  atoms,
  colorScheme,
  colorOverrides,
  inspectedAtomId,
  interactionLocked,
  selectionActivation,
  materialFamily,
  meshDetail,
  onInspect,
  onPulse,
  onLockedInteractionAttempt,
  pulseAtomId,
  pulseToken,
  selectionHighlightColor = SELECTION_HIGHLIGHT_COLOR,
  style,
}: {
  atomOpacity: number;
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  inspectedAtomId: string | null;
  interactionLocked: boolean;
  selectionActivation: SelectionActivation;
  materialFamily: ResolvedStructureMaterialFamily;
  meshDetail: SceneMeshDetail;
  onInspect?: (atomId: string | null) => void;
  onPulse?: (atomId: string) => void;
  onLockedInteractionAttempt?: () => void;
  pulseAtomId: string | null;
  pulseToken: number;
  selectionHighlightColor?: string;
  style: StyleState;
}) {
  const meshRef = useRef<BatchedMesh | null>(null);
  const pickRegistryRef = useRef<BatchPickRegistry<AtomRenderItem>>(
    createBatchPickRegistry<AtomRenderItem>(),
  );
  const populatedBatchMeshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchKeyRef = useRef<string | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const atomRenderItems = useMemo(
    () =>
      createAtomRenderItems({
        atomOpacity,
        atoms,
        colorScheme,
        colorOverrides,
        style,
      }),
    [atomOpacity, atoms, colorOverrides, colorScheme, style],
  );
  const isTransparent = atomRenderItems.some((item) => item.opacity < 1);
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
  const activePulse =
    pulseAtomId && pulseToken !== 0
      ? { atomId: pulseAtomId, token: pulseToken }
      : null;
  const pulseItem =
    inspectedItem || !activePulse
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
      const action = selectionPointerAction({
        activation: selectionActivation,
        event: "click",
        interactionLocked,
        selected: atom.id === inspectedAtomId,
      });
      if (action === "locked-feedback") {
        onLockedInteractionAttempt?.();
      } else if (action === "select") {
        onInspect?.(atom.id);
      } else if (action === "pulse") {
        onPulse?.(atom.id);
      }
    },
    [
      atomForEvent,
      inspectedAtomId,
      interactionLocked,
      onInspect,
      onLockedInteractionAttempt,
      onPulse,
      selectionActivation,
    ],
  );

  const handleDoubleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const atom = atomForEvent(event);
      if (!atom) {
        return;
      }

      event.stopPropagation();
      const action = selectionPointerAction({
        activation: selectionActivation,
        event: "double-click",
        interactionLocked,
        selected: atom.id === inspectedAtomId,
      });
      if (action === "locked-feedback") {
        onLockedInteractionAttempt?.();
      } else if (action === "select") {
        onInspect?.(atom.id);
      }
    },
    [
      atomForEvent,
      inspectedAtomId,
      interactionLocked,
      onInspect,
      onLockedInteractionAttempt,
      selectionActivation,
    ],
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
          onBeforeCompile={enableBatchedAtomOpacity}
          opacity={1}
          transparent={isTransparent}
          customProgramCacheKey={batchedAtomOpacityProgramCacheKey}
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
        <AtomSelectionRimAnimator
          key={inspectedItem.id}
          position={inspectedItem.position}
          radius={inspectedItem.radius}
          selectionHighlightColor={selectionHighlightColor}
          sphereHeightSegments={meshDetail.sphereHeightSegments}
          sphereWidthSegments={meshDetail.sphereWidthSegments}
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
    setAtomBatchOpacity(mesh, batchId, item.opacity);
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

function setAtomBatchColor(mesh: BatchedMesh, batchId: number, color: Color) {
  mesh.setColorAt(batchId, color);
}

function setAtomBatchOpacity(mesh: BatchedMesh, batchId: number, opacity: number) {
  const colorTexture = (mesh as BatchedMesh & { _colorsTexture: DataTexture | null })
    ._colorsTexture;
  if (!colorTexture) {
    return;
  }

  // Three stores batched colors in RGBA texels but its public setter only writes RGB.
  colorTexture.image.data[batchId * 4 + 3] = opacity;
  colorTexture.needsUpdate = true;
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
  const activeBatchRef = useRef<{ batchId: number; mesh: BatchedMesh } | null>(
    null,
  );
  const isActiveRef = useRef(true);

  useEffect(() => {
    startTimeRef.current = performance.now();
    activeBatchRef.current = resolveActiveBatch(
      meshRef,
      pickRegistryRef,
      itemId,
    );
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
    const durationMs = inspected
      ? SELECTION_HANDOFF_MS
      : ATOM_HIGHLIGHT_PULSE_MS;
    const progress = Math.min(1, elapsedMs / durationMs);
    const fade = inspected ? easeOutCubic(progress) : atomPulseFade(progress);
    const targetMix = inspected
      ? SELECTION_HANDOFF_WHITE_MIX +
        (ATOM_HIGHLIGHT_SELECTED_COLOR_MIX - SELECTION_HANDOFF_WHITE_MIX) * fade
      : ATOM_HIGHLIGHT_PULSE_COLOR_MIX * fade;
    const color = baseColor
      .clone()
      .lerp(ATOM_HIGHLIGHT_TARGET_COLOR, targetMix);
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

function AtomSelectionRimAnimator({
  position,
  radius,
  selectionHighlightColor,
  sphereHeightSegments,
  sphereWidthSegments,
}: {
  position: VectorTuple;
  radius: number;
  selectionHighlightColor: string;
  sphereHeightSegments: number;
  sphereWidthSegments: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const materialRef = useRef<ShaderMaterial | null>(null);
  const startTimeRef = useRef(performance.now());
  const activeRef = useRef(true);
  const uniforms = useMemo(
    () => ({
      selectionColor: { value: new Color(SELECTION_HIGHLIGHT_COLOR) },
      selectionOpacity: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    startTimeRef.current = performance.now();
    activeRef.current = true;
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    uniforms.selectionColor.value.set(selectionHighlightColor);
    invalidate();
  }, [invalidate, selectionHighlightColor, uniforms]);

  useFrame(() => {
    if (!activeRef.current) {
      return;
    }
    const material = materialRef.current;
    if (!material) {
      return;
    }

    const progress = Math.min(
      1,
      (performance.now() - startTimeRef.current) / SELECTION_HANDOFF_MS,
    );
    material.uniforms.selectionOpacity!.value = easeOutCubic(progress);

    if (progress >= 1) {
      activeRef.current = false;
      return;
    }

    invalidate();
  });

  return (
    <mesh
      position={position}
      raycast={ignoreAtomSelectionRimRaycast}
      renderOrder={STRUCTURE_RENDER_ORDER.atomSelectionRim}
      scale={radius * 1.04}
    >
      <sphereGeometry args={[1, sphereWidthSegments, sphereHeightSegments]} />
      <shaderMaterial
        ref={materialRef}
        depthWrite={false}
        fragmentShader={ATOM_SELECTION_RIM_FRAGMENT_SHADER}
        transparent
        uniforms={uniforms}
        vertexShader={ATOM_SELECTION_RIM_VERTEX_SHADER}
      />
    </mesh>
  );
}

function ignoreAtomSelectionRimRaycast() {}

const ATOM_SELECTION_RIM_VERTEX_SHADER = `
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = viewPosition.xyz;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const ATOM_SELECTION_RIM_FRAGMENT_SHADER = `
  uniform vec3 selectionColor;
  uniform float selectionOpacity;
  varying vec3 vViewNormal;
  varying vec3 vViewPosition;

  void main() {
    vec3 viewDirection = normalize(-vViewPosition);
    float facing = abs(dot(normalize(vViewNormal), viewDirection));
    float rim = smoothstep(0.20, 0.75, 1.0 - facing);
    float alpha = rim * selectionOpacity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(selectionColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function atomSphereGeometry(
  widthSegments: number,
  heightSegments: number,
): SphereGeometry {
  return new SphereGeometry(1, widthSegments, heightSegments);
}

function prepareBatchGeometry<TGeometry extends BufferGeometry>(
  geometry: TGeometry,
): TGeometry {
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
      [hash, item.id, item.position.join(","), item.radius, item.color, item.opacity].join(
        ":",
      ),
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
