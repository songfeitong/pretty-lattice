import type { SceneSpec } from "../api/scene";
import type { MeshQuality } from "./exportSettings";

export type AtomRenderingMode = "mesh" | "instanced";
export type BondRenderingMode = "mesh" | "batched";

export const DEFAULT_ATOM_RENDERING_MODE: AtomRenderingMode = "instanced";
export const DEFAULT_BOND_RENDERING_MODE: BondRenderingMode = "batched";
export const DEFAULT_PREVIEW_MESH_QUALITY: MeshQuality = "medium";
export const LARGE_SCENE_PREVIEW_MESH_QUALITY: MeshQuality = "low";
export const PREVIEW_PERFORMANCE_ATOM_COUNT_THRESHOLD = 1000;

export function hasLargePreviewAtomCount(
  scene: Pick<SceneSpec, "summary"> | null,
): boolean {
  return (scene?.summary.atomCount ?? 0) > PREVIEW_PERFORMANCE_ATOM_COUNT_THRESHOLD;
}

export function defaultAtomRenderingModeForScene(
  scene: Pick<SceneSpec, "summary"> | null,
): AtomRenderingMode {
  return DEFAULT_ATOM_RENDERING_MODE;
}

export function defaultBondRenderingModeForScene(
  scene: Pick<SceneSpec, "summary"> | null,
): BondRenderingMode {
  return DEFAULT_BOND_RENDERING_MODE;
}

export function defaultPreviewMeshQualityForScene(
  scene: Pick<SceneSpec, "summary"> | null,
): MeshQuality {
  if (hasLargePreviewAtomCount(scene)) {
    return LARGE_SCENE_PREVIEW_MESH_QUALITY;
  }

  return DEFAULT_PREVIEW_MESH_QUALITY;
}
