import bundledMaterialPresetData from "../data/material-presets/bundled.json";

export type MaterialPresetId = string;
export type MaterialPresetKind = "basic" | "lambert" | "standard";

interface MaterialPresetBase {
  description?: string;
  id: MaterialPresetId;
  label: string;
  lighting: MaterialPresetLighting;
  material: MaterialPresetMaterial;
}

export interface MaterialPresetCatalog {
  defaultPresetId: MaterialPresetId;
  presets: MaterialPreset[];
  version: 1;
}

export interface MaterialPresetLighting {
  ambientIntensity: number;
  cameraLights: MaterialPresetCameraLight[];
}

export interface MaterialPresetCameraLight {
  intensity: number;
  offset: readonly [number, number, number];
}

export type MaterialPresetMaterial =
  | BasicMaterialPresetMaterial
  | LambertMaterialPresetMaterial
  | StandardMaterialPresetMaterial;

export interface BasicMaterialPresetMaterial {
  kind: "basic";
}

export interface LambertMaterialPresetMaterial {
  flatShading: boolean;
  kind: "lambert";
}

export interface StandardMaterialPresetMaterial {
  flatShading: boolean;
  kind: "standard";
  metalness: number;
  roughness: number;
}

export type MaterialPreset = MaterialPresetBase;

export interface MaterialPresetOption {
  label: string;
  value: MaterialPresetId;
}

const MATERIAL_PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUPPORTED_MATERIAL_KINDS = new Set<MaterialPresetKind>([
  "basic",
  "lambert",
  "standard",
]);

export const MATERIAL_PRESET_CATALOG = validateMaterialPresetData(
  bundledMaterialPresetData,
);
export const MATERIAL_PRESETS = MATERIAL_PRESET_CATALOG.presets;
export const DEFAULT_MATERIAL_PRESET_ID =
  MATERIAL_PRESET_CATALOG.defaultPresetId;
export const MATERIAL_PRESET_OPTIONS: MaterialPresetOption[] = MATERIAL_PRESETS.map(
  ({ id, label }) => ({
    label,
    value: id,
  }),
);

export function materialPresetById(id: MaterialPresetId): MaterialPreset {
  const preset = MATERIAL_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    throw new Error(`Unknown material preset ID "${id}".`);
  }

  return preset;
}

export function validateMaterialPresetData(data: unknown): MaterialPresetCatalog {
  const root = expectRecord(data, "material presets");
  assertKnownKeys(root, "material presets", [
    "defaultPresetId",
    "presets",
    "version",
  ]);

  const version = root.version;
  if (version !== 1) {
    throw new Error("material presets.version must be 1.");
  }

  const defaultPresetId = expectPresetId(
    root.defaultPresetId,
    "material presets.defaultPresetId",
  );
  if (!Array.isArray(root.presets) || root.presets.length === 0) {
    throw new Error("material presets.presets must be a non-empty array.");
  }

  const ids = new Set<string>();
  const presets = root.presets.map((entry, index) => {
    const preset = parseMaterialPreset(entry, `material presets.presets[${index}]`);
    if (ids.has(preset.id)) {
      throw new Error(`Duplicate material preset ID "${preset.id}".`);
    }
    ids.add(preset.id);
    return preset;
  });

  if (!ids.has(defaultPresetId)) {
    throw new Error(
      `material presets.defaultPresetId "${defaultPresetId}" does not match a bundled preset.`,
    );
  }

  return {
    defaultPresetId,
    presets,
    version,
  };
}

function parseMaterialPreset(data: unknown, path: string): MaterialPreset {
  const rawPreset = expectRecord(data, path);
  assertKnownKeys(rawPreset, path, [
    "description",
    "id",
    "label",
    "lighting",
    "material",
  ]);

  const id = expectPresetId(rawPreset.id, `${path}.id`);
  const label = expectNonEmptyString(rawPreset.label, `${path}.label`);
  const description =
    rawPreset.description === undefined
      ? undefined
      : expectNonEmptyString(rawPreset.description, `${path}.description`);

  return {
    ...(description === undefined ? {} : { description }),
    id,
    label,
    lighting: parseLighting(rawPreset.lighting, `${path}.lighting`),
    material: parseMaterial(rawPreset.material, `${path}.material`),
  };
}

function parseLighting(data: unknown, path: string): MaterialPresetLighting {
  const lighting = expectRecord(data, path);
  assertKnownKeys(lighting, path, ["ambientIntensity", "cameraLights"]);

  return {
    ambientIntensity: expectFiniteNumberInRange(
      lighting.ambientIntensity,
      `${path}.ambientIntensity`,
      0,
      5,
    ),
    cameraLights: parseCameraLights(lighting.cameraLights, `${path}.cameraLights`),
  };
}

function parseCameraLights(data: unknown, path: string): MaterialPresetCameraLight[] {
  if (!Array.isArray(data)) {
    throw new Error(`${path} must be an array.`);
  }
  if (data.length > 4) {
    throw new Error(`${path} must contain at most 4 lights.`);
  }

  return data.map((entry, index) => parseCameraLight(entry, `${path}[${index}]`));
}

function parseCameraLight(data: unknown, path: string): MaterialPresetCameraLight {
  const light = expectRecord(data, path);
  assertKnownKeys(light, path, ["intensity", "offset"]);

  return {
    intensity: expectFiniteNumberInRange(light.intensity, `${path}.intensity`, 0, 5),
    offset: expectVectorTuple(light.offset, `${path}.offset`, -2, 2),
  };
}

function parseMaterial(data: unknown, path: string): MaterialPresetMaterial {
  const material = expectRecord(data, path);
  const kind = expectMaterialKind(material.kind, `${path}.kind`);

  if (kind === "basic") {
    assertKnownKeys(material, path, ["kind"]);
    return { kind };
  }

  if (kind === "lambert") {
    assertKnownKeys(material, path, ["flatShading", "kind"]);
    return {
      flatShading: expectOptionalBoolean(
        material.flatShading,
        `${path}.flatShading`,
        false,
      ),
      kind,
    };
  }

  assertKnownKeys(material, path, [
    "flatShading",
    "kind",
    "metalness",
    "roughness",
  ]);
  return {
    flatShading: expectOptionalBoolean(
      material.flatShading,
      `${path}.flatShading`,
      false,
    ),
    kind,
    metalness: expectFiniteNumberInRange(material.metalness, `${path}.metalness`, 0, 1),
    roughness: expectFiniteNumberInRange(material.roughness, `${path}.roughness`, 0, 1),
  };
}

function expectRecord(data: unknown, path: string): Record<string, unknown> {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${path} must be an object.`);
  }

  return data as Record<string, unknown>;
}

function assertKnownKeys(
  data: Record<string, unknown>,
  path: string,
  knownKeys: string[],
) {
  const allowedKeys = new Set(knownKeys);
  for (const key of Object.keys(data)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`${path}.${key} is not supported.`);
    }
  }
}

function expectNonEmptyString(data: unknown, path: string): string {
  if (typeof data !== "string" || data.trim() === "") {
    throw new Error(`${path} must be a non-empty string.`);
  }

  return data;
}

function expectPresetId(data: unknown, path: string): string {
  const value = expectNonEmptyString(data, path);
  if (!MATERIAL_PRESET_ID_PATTERN.test(value)) {
    throw new Error(
      `${path} must use lowercase letters, numbers, and hyphen separators.`,
    );
  }

  return value;
}

function expectMaterialKind(data: unknown, path: string): MaterialPresetKind {
  if (typeof data !== "string" || !SUPPORTED_MATERIAL_KINDS.has(data as MaterialPresetKind)) {
    throw new Error(
      `${path} must be one of ${Array.from(SUPPORTED_MATERIAL_KINDS).join(", ")}.`,
    );
  }

  return data as MaterialPresetKind;
}

function expectOptionalBoolean(
  data: unknown,
  path: string,
  fallback: boolean,
): boolean {
  if (data === undefined) {
    return fallback;
  }
  if (typeof data !== "boolean") {
    throw new Error(`${path} must be a boolean.`);
  }

  return data;
}

function expectVectorTuple(
  data: unknown,
  path: string,
  min: number,
  max: number,
): readonly [number, number, number] {
  if (!Array.isArray(data) || data.length !== 3) {
    throw new Error(`${path} must be a three-number array.`);
  }

  return [
    expectFiniteNumberInRange(data[0], `${path}[0]`, min, max),
    expectFiniteNumberInRange(data[1], `${path}[1]`, min, max),
    expectFiniteNumberInRange(data[2], `${path}[2]`, min, max),
  ];
}

function expectFiniteNumberInRange(
  data: unknown,
  path: string,
  min: number,
  max: number,
): number {
  if (typeof data !== "number" || !Number.isFinite(data)) {
    throw new Error(`${path} must be a finite number.`);
  }
  if (data < min || data > max) {
    throw new Error(`${path} must be between ${min} and ${max}.`);
  }

  return data;
}
