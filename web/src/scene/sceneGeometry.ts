import { Vector3 } from "three";

import { PREVIEW_THEME_COLORS } from "../theme/previewTheme";
import { withDefaultCellVectors, type VectorTuple } from "./viewMath";

export { atomRadiusForModel } from "../model/elementRadii";

export const BOND_RADIUS = 0.1;
export const CELL_FRAME_COLOR = PREVIEW_THEME_COLORS.light.unitCell;
export const CELL_FRAME_LINE_WIDTH_PIXELS = 1;

export function cellCenter(vectors: VectorTuple[]): Vector3 {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);

  return new Vector3(...vectorA)
    .add(new Vector3(...vectorB))
    .add(new Vector3(...vectorC))
    .multiplyScalar(0.5);
}

export function cellCorners(vectors: VectorTuple[]): Vector3[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const origin = new Vector3(0, 0, 0);
  const a = new Vector3(...vectorA);
  const b = new Vector3(...vectorB);
  const c = new Vector3(...vectorC);

  return [
    origin,
    a,
    b,
    c,
    a.clone().add(b),
    a.clone().add(c),
    b.clone().add(c),
    a.clone().add(b).add(c),
  ];
}

export function cellFrameLinePositions(vectors: VectorTuple[]): number[] {
  const [vectorA, vectorB, vectorC] = withDefaultCellVectors(vectors);
  const origin = new Vector3(0, 0, 0);
  const a = new Vector3(...vectorA);
  const b = new Vector3(...vectorB);
  const c = new Vector3(...vectorC);
  const ab = a.clone().add(b);
  const ac = a.clone().add(c);
  const bc = b.clone().add(c);
  const abc = a.clone().add(b).add(c);

  return [
    ...vectorEdge(origin, a),
    ...vectorEdge(origin, b),
    ...vectorEdge(origin, c),
    ...vectorEdge(a, ab),
    ...vectorEdge(a, ac),
    ...vectorEdge(b, ab),
    ...vectorEdge(b, bc),
    ...vectorEdge(c, ac),
    ...vectorEdge(c, bc),
    ...vectorEdge(ab, abc),
    ...vectorEdge(ac, abc),
    ...vectorEdge(bc, abc),
  ];
}

export function centeredCellGroupPosition(vectors: VectorTuple[]): VectorTuple {
  const center = cellCenter(vectors);
  return [-center.x, -center.y, -center.z];
}

function vectorEdge(
  start: Vector3,
  end: Vector3,
): [number, number, number, number, number, number] {
  return [start.x, start.y, start.z, end.x, end.y, end.z];
}
