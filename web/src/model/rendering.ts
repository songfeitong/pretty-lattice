import type { SceneSpec } from "../api/scene";
import type { MeshQuality } from "./exportSettings";
import { STRUCTURE_ATOM_COUNT_THRESHOLD } from "./structureLimits";

export type UnitCellLineStyle = "solid" | "dashed";

export interface StructureLineWidthState {
  polyhedra: number;
  unitCell: number;
}

export const DEFAULT_PREVIEW_MESH_QUALITY: MeshQuality = "medium";
export const DEFAULT_UNIT_CELL_LINE_STYLE: UnitCellLineStyle = "solid";
export const DEFAULT_STRUCTURE_LINE_WIDTH: StructureLineWidthState = {
  polyhedra: 1,
  unitCell: 1,
};
export const STRUCTURE_LINE_WIDTH_MIN = 0.5;
export const STRUCTURE_LINE_WIDTH_MAX = 5;
export const STRUCTURE_LINE_WIDTH_STEP = 0.5;
export const DEFAULT_SHOW_CRYSTAL_AXIS_LABELS = true;
export const LARGE_SCENE_PREVIEW_MESH_QUALITY: MeshQuality = "low";

export function hasLargePreviewAtomCount(
  scene: Pick<SceneSpec, "summary"> | null,
): boolean {
  return (scene?.summary.atomCount ?? 0) >= STRUCTURE_ATOM_COUNT_THRESHOLD;
}

export function defaultPreviewMeshQualityForScene(
  scene: Pick<SceneSpec, "summary"> | null,
): MeshQuality {
  if (hasLargePreviewAtomCount(scene)) {
    return LARGE_SCENE_PREVIEW_MESH_QUALITY;
  }

  return DEFAULT_PREVIEW_MESH_QUALITY;
}
