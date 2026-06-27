import {
  materialPresetById,
  type MaterialPreset,
  type MaterialPresetLighting,
  type MaterialPresetMaterial,
} from "../app/materialPresets";
import type { StyleState } from "../app/settings";

export const STRUCTURE_MATERIAL_TARGETS = [
  "atom",
  "bond",
  "polyhedron",
] as const;
export type StructureMaterialTarget = (typeof STRUCTURE_MATERIAL_TARGETS)[number];

export interface ResolvedStructureMaterialFamily {
  id: string;
  label: string;
  lighting: MaterialPresetLighting;
  material: MaterialPresetMaterial;
}

export function resolveStructureMaterialFamilyForStyle(
  style: Pick<StyleState, "materialPreset">,
): ResolvedStructureMaterialFamily {
  return materialPresetToFamily(materialPresetById(style.materialPreset));
}

export function resolveStructureMaterialFamilyForTarget(
  style: Pick<StyleState, "materialPreset">,
  _target: StructureMaterialTarget,
): ResolvedStructureMaterialFamily {
  return resolveStructureMaterialFamilyForStyle(style);
}

function materialPresetToFamily(preset: MaterialPreset): ResolvedStructureMaterialFamily {
  return {
    id: preset.id,
    label: preset.label,
    lighting: preset.lighting,
    material: preset.material,
  };
}
