import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import {
  BatchedMesh,
  BufferGeometry,
  CylinderGeometry,
  Matrix4,
  Vector3,
} from "three";

import type {
  BondColorMode,
} from "../model";
import { DEFAULT_BOND_COLOR } from "../model";
import { BOND_RADIUS } from "./sceneGeometry";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import { twoToneBondCylinderGeometry } from "./structureGeometry";
import type { SceneMeshDetail } from "./StructureSceneObjects";
import { StructureMaterial } from "./StructureMaterial";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import type { BondRenderItem } from "./BondRenderItems";

interface BondBatchBuild {
  itemCount: number;
  items: BondRenderItem[];
  key: string;
  maxIndexCount: number;
  maxVertexCount: number;
  mode: BondColorMode;
  radialSegments: number;
  radius: number;
}

export function BatchedBonds({
  bondRenderItems,
  colorMode,
  materialFamily,
  meshDetail,
  opacity,
  thicknessScale,
}: {
  bondRenderItems: BondRenderItem[];
  colorMode: BondColorMode;
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
        bondRenderItems,
        colorMode,
        radialSegments: meshDetail.bondRadialSegments,
        radius: BOND_RADIUS * thicknessScale,
      }),
    [
      bondRenderItems,
      colorMode,
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
  const unicolorBondColor = batch.items[0]?.startColor ?? DEFAULT_BOND_COLOR;

  return (
    <batchedMesh
      key={batch.key}
      ref={meshRef}
      args={[batch.itemCount, batch.maxVertexCount, batch.maxIndexCount]}
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

function populateBatchedBondMesh(mesh: BatchedMesh, batch: BondBatchBuild) {
  const matrix = new Matrix4();
  const unicolorGeometry =
    batch.mode === "unicolor" ? unicolorBondGeometry(batch.radius, batch.radialSegments) : null;
  const unicolorGeometryId = unicolorGeometry
    ? mesh.addGeometry(prepareBatchGeometry(unicolorGeometry))
    : null;

  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = true;

  for (const item of batch.items) {
    const geometryId = unicolorGeometryId ?? addTwoToneBondGeometry(mesh, item, batch);
    const batchId = mesh.addInstance(geometryId);
    const scale =
      batch.mode === "unicolor" ? new Vector3(1, item.length, 1) : new Vector3(1, 1, 1);
    matrix.compose(item.center, item.quaternion, scale);
    mesh.setMatrixAt(batchId, matrix);
  }

  unicolorGeometry?.dispose();
}

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
