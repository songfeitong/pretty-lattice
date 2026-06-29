import { BufferGeometry, Color, Float32BufferAttribute } from "three";

import type { AtomSpec, PolyhedronSpec } from "../api/scene";

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

export function polyhedronGeometryFromAtoms(
  polyhedron: PolyhedronSpec,
  atoms: AtomSpec[],
): BufferGeometry | null {
  const positions: number[] = [];
  for (const atomIndex of polyhedron.hullAtomIndices) {
    const atom = atoms[atomIndex];
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
          vertexIndex >= polyhedron.hullAtomIndices.length,
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
