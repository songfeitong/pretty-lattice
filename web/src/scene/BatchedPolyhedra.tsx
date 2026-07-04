import { useThree } from "@react-three/fiber";
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  BatchedMesh,
  BufferGeometry,
  Color,
  DoubleSide,
  EdgesGeometry,
  Matrix4,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import type {
  AtomSpec,
  PolyhedronSpec,
} from "../api/scene";
import {
  atomColorForScheme,
  type ElementColorOverrides,
} from "../model/colorSchemes";
import type { StyleState } from "../model";
import { StructureMaterial } from "./StructureMaterial";
import type { ResolvedStructureMaterialFamily } from "./materialPresetResolver";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import { polyhedronGeometryFromAtoms } from "./structureGeometry";

export const POLYHEDRON_SURFACE_OPACITY = 0.5;
export const POLYHEDRON_EDGE_COLOR = "#cfd6e2";
export const POLYHEDRON_EDGE_LINE_WIDTH_PIXELS = 1;
export const POLYHEDRON_EDGE_OPACITY = 0.6;
const POLYHEDRON_EDGE_OPACITY_RATIO =
  POLYHEDRON_EDGE_OPACITY / POLYHEDRON_SURFACE_OPACITY;

export interface PolyhedronSurfaceBatchBuild {
  edgeItems: PolyhedronEdgeRenderItem[];
  itemCount: number;
  items: PolyhedronSurfaceRenderItem[];
  key: string;
  maxIndexCount: number;
  maxVertexCount: number;
}

export interface PolyhedronSurfaceRenderItem {
  color: Color;
  geometry: BufferGeometry;
  polyhedron: PolyhedronSpec;
  polyhedronIndex: number;
}

export interface PolyhedronEdgeRenderItem {
  polyhedron: PolyhedronSpec;
  polyhedronIndex: number;
}

export function BatchedPolyhedra({
  atoms,
  colorScheme,
  colorOverrides,
  lineWidthScale,
  materialFamily,
  opacity,
  polyhedra,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  lineWidthScale: number;
  materialFamily: ResolvedStructureMaterialFamily;
  opacity: number;
  polyhedra: PolyhedronSpec[];
}) {
  const meshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchMeshRef = useRef<BatchedMesh | null>(null);
  const populatedBatchKeyRef = useRef<string | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  const batch = useMemo(
    () =>
      createPolyhedronSurfaceBatchBuild({
        atoms,
        colorScheme,
        colorOverrides,
        polyhedra,
      }),
    [atoms, colorScheme, colorOverrides, polyhedra],
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

    populateBatchedPolyhedraSurfaces(mesh, batch);
    populatedBatchMeshRef.current = mesh;
    populatedBatchKeyRef.current = batch.key;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    invalidate();
  }, [batch, invalidate]);

  useEffect(() => {
    return () => {
      disposePolyhedronSurfaceBatchBuild(batch);
    };
  }, [batch]);

  if (!batch) {
    return null;
  }

  return (
    <group>
      {batch.itemCount > 0 ? (
        <batchedMesh
          key={batch.key}
          ref={meshRef}
          args={[batch.itemCount, batch.maxVertexCount, batch.maxIndexCount]}
          renderOrder={STRUCTURE_RENDER_ORDER.polyhedronSurface}
        >
          <StructureMaterial
            color="#ffffff"
            depthWrite
            materialFamily={materialFamily}
            opacity={opacity}
            polygonOffset
            polygonOffsetFactor={3}
            side={DoubleSide}
            transparent
          />
        </batchedMesh>
      ) : null}
      {batch.edgeItems.map((item) => (
        <MemoizedPolyhedronEdges
          key={item.polyhedronIndex}
          atoms={atoms}
          lineWidthScale={lineWidthScale}
          opacity={opacity}
          polyhedron={item.polyhedron}
        />
      ))}
    </group>
  );
}

export const MemoizedBatchedPolyhedra = memo(BatchedPolyhedra);

export function createPolyhedronSurfaceBatchBuild({
  atoms,
  colorScheme,
  colorOverrides,
  polyhedra,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  polyhedra: PolyhedronSpec[];
}): PolyhedronSurfaceBatchBuild | null {
  const edgeItems: PolyhedronEdgeRenderItem[] = [];
  const items: PolyhedronSurfaceRenderItem[] = [];
  const seenSurfaceFaceKeys = new Set<string>();
  let maxIndexCount = 0;
  let maxVertexCount = 0;

  polyhedra.forEach((polyhedron, polyhedronIndex) => {
    const centerAtom = atoms[polyhedron.centerAtomIndex];
    if (!centerAtom) {
      return;
    }

    if (!isValidPolyhedronForAtoms(polyhedron, atoms)) {
      return;
    }

    edgeItems.push({
      polyhedron,
      polyhedronIndex,
    });

    const surfacePolyhedron = uniqueSurfacePolyhedron(
      polyhedron,
      atoms,
      seenSurfaceFaceKeys,
    );
    if (!surfacePolyhedron) {
      return;
    }

    const geometry = prepareBatchGeometry(
      polyhedronGeometryFromAtoms(surfacePolyhedron, atoms),
    );
    if (!geometry) {
      return;
    }

    const position = geometry.getAttribute("position");
    const vertexCount = position?.count ?? 0;
    const indexCount = geometry.getIndex()?.count ?? vertexCount;
    if (vertexCount <= 0 || indexCount <= 0) {
      geometry.dispose();
      return;
    }

    items.push({
      color: new Color(atomColorForScheme(centerAtom, colorScheme, colorOverrides)),
      geometry,
      polyhedron,
      polyhedronIndex,
    });
    maxIndexCount += indexCount;
    maxVertexCount += vertexCount;
  });

  if (items.length === 0 && edgeItems.length === 0) {
    return null;
  }

  return {
    edgeItems,
    itemCount: items.length,
    items,
    key: polyhedronSurfaceBatchKey(items),
    maxIndexCount,
    maxVertexCount,
  };
}

function isValidPolyhedronForAtoms(
  polyhedron: PolyhedronSpec,
  atoms: AtomSpec[],
): boolean {
  if (polyhedron.faces.length === 0) {
    return false;
  }

  if (polyhedron.hullAtomIndices.some((atomIndex) => !atoms[atomIndex])) {
    return false;
  }

  return polyhedron.faces.every(
    (face) => polyhedronSurfaceFaceKey(polyhedron, atoms, face) !== null,
  );
}

function uniqueSurfacePolyhedron(
  polyhedron: PolyhedronSpec,
  atoms: AtomSpec[],
  seenSurfaceFaceKeys: Set<string>,
): PolyhedronSpec | null {
  const pendingFaceKeys = new Set<string>();
  const uniqueFaces: PolyhedronSpec["faces"] = [];

  for (const atomIndex of polyhedron.hullAtomIndices) {
    if (!atoms[atomIndex]) {
      return null;
    }
  }

  for (const face of polyhedron.faces) {
    const faceKey = polyhedronSurfaceFaceKey(polyhedron, atoms, face);
    if (!faceKey) {
      return null;
    }

    if (seenSurfaceFaceKeys.has(faceKey) || pendingFaceKeys.has(faceKey)) {
      continue;
    }

    pendingFaceKeys.add(faceKey);
    uniqueFaces.push(face);
  }

  for (const faceKey of pendingFaceKeys) {
    seenSurfaceFaceKeys.add(faceKey);
  }

  if (uniqueFaces.length === polyhedron.faces.length) {
    return polyhedron;
  }

  return {
    ...polyhedron,
    faces: uniqueFaces,
  };
}

function polyhedronSurfaceFaceKey(
  polyhedron: PolyhedronSpec,
  atoms: AtomSpec[],
  face: number[],
): string | null {
  if (
    face.length !== 3 ||
    new Set(face).size !== 3 ||
    face.some(
      (vertexIndex) =>
        !Number.isInteger(vertexIndex) ||
        vertexIndex < 0 ||
        vertexIndex >= polyhedron.hullAtomIndices.length,
    )
  ) {
    return null;
  }

  const vertexKeys: string[] = [];
  for (const vertexIndex of face) {
    const atomIndex = polyhedron.hullAtomIndices[vertexIndex];
    if (atomIndex === undefined) {
      return null;
    }

    const atom = atoms[atomIndex];
    if (
      !atom ||
      atom.position.some((coordinate: number) => !Number.isFinite(coordinate))
    ) {
      return null;
    }

    vertexKeys.push(
      atom.position.map((coordinate: number) => String(coordinate)).join(","),
    );
  }

  return vertexKeys.sort().join("|");
}

export function disposePolyhedronSurfaceBatchBuild(
  batch: PolyhedronSurfaceBatchBuild | null,
) {
  for (const item of batch?.items ?? []) {
    item.geometry.dispose();
  }
}

function populateBatchedPolyhedraSurfaces(
  mesh: BatchedMesh,
  batch: PolyhedronSurfaceBatchBuild,
) {
  const identity = new Matrix4();
  mesh.perObjectFrustumCulled = true;
  mesh.sortObjects = true;

  for (const item of batch.items) {
    const geometryId = mesh.addGeometry(item.geometry);
    const batchId = mesh.addInstance(geometryId);
    mesh.setMatrixAt(batchId, identity);
    mesh.setColorAt(batchId, item.color);
  }

  disposePolyhedronSurfaceBatchBuild(batch);
}

function PolyhedronEdges({
  atoms,
  lineWidthScale,
  opacity,
  polyhedron,
}: {
  atoms: AtomSpec[];
  lineWidthScale: number;
  opacity: number;
  polyhedron: PolyhedronSpec;
}) {
  const centerAtom = atoms[polyhedron.centerAtomIndex];
  const geometry = useMemo(
    () => (centerAtom ? polyhedronGeometryFromAtoms(polyhedron, atoms) : null),
    [atoms, centerAtom, polyhedron],
  );
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
      side: DoubleSide,
      transparent: true,
      worldUnits: false,
    });

    const line = new LineSegments2(lineGeometry, material);
    line.renderOrder = STRUCTURE_RENDER_ORDER.polyhedronEdge;
    return line;
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

  if (!edgeLine) {
    return null;
  }

  return <primitive object={edgeLine} />;
}

const MemoizedPolyhedronEdges = memo(PolyhedronEdges);

function prepareBatchGeometry(
  geometry: BufferGeometry | null,
): BufferGeometry | null {
  if (!geometry) {
    return null;
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function polyhedronSurfaceBatchKey(items: PolyhedronSurfaceRenderItem[]): string {
  let hash = hashString("polyhedra");
  for (const item of items) {
    hash = hashNumber(hash, item.polyhedronIndex);
    hash = hashString(item.color.getHexString(), hash);
    hash = hashGeometryAttribute(item.geometry, "position", hash);
    hash = hashIndexAttribute(item.geometry, hash);
  }
  return `polyhedra:${items.length}:${hash.toString(36)}`;
}

function hashGeometryAttribute(
  geometry: BufferGeometry,
  name: string,
  initialHash: number,
): number {
  const attribute = geometry.getAttribute(name);
  let hash = hashNumber(initialHash, attribute.itemSize);
  hash = hashNumber(hash, attribute.count);
  for (let index = 0; index < attribute.array.length; index += 1) {
    hash = hashNumber(hash, attribute.array[index] ?? 0);
  }
  return hash;
}

function hashIndexAttribute(
  geometry: BufferGeometry,
  initialHash: number,
): number {
  const index = geometry.getIndex();
  if (!index) {
    return hashNumber(initialHash, 0);
  }

  let hash = hashNumber(initialHash, index.count);
  for (let arrayIndex = 0; arrayIndex < index.array.length; arrayIndex += 1) {
    hash = hashNumber(hash, index.array[arrayIndex] ?? 0);
  }
  return hash;
}

function hashString(value: string, initialHash = 2166136261): number {
  let hash = initialHash;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashNumber(initialHash: number, value: number): number {
  const safeValue = Number.isFinite(value) ? value : 0;
  return hashString(String(safeValue), initialHash);
}
