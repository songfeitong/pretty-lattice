import sceneContract from "../../../src/pretty_lattice/structures/scene_contract.json";

export const MEDIUM_STRUCTURE_ATOM_COUNT =
  sceneContract.structureSizeTiers.mediumFromAtomCount;
export const LARGE_STRUCTURE_ATOM_COUNT =
  sceneContract.structureSizeTiers.largeFromAtomCount;
export const MAX_STRUCTURE_UPLOAD_BYTES = sceneContract.previewLimits.maxUploadBytes;

export type StructureSize = "small" | "medium" | "large";

export function classifyStructureSize(atomCount: number): StructureSize {
  if (atomCount < MEDIUM_STRUCTURE_ATOM_COUNT) return "small";
  if (atomCount < LARGE_STRUCTURE_ATOM_COUNT) return "medium";
  return "large";
}
