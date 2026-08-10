import materialPresetCatalogData from "../data/material-presets/catalog.json";
import twoDPresetData from "../data/material-presets/presets/2d.json";
import twoPointFiveDPresetData from "../data/material-presets/presets/2-5d.json";
import classicMattePresetData from "../data/material-presets/presets/classic-matte.json";
import glossyPresetData from "../data/material-presets/presets/glossy.json";
import metallicPresetData from "../data/material-presets/presets/metallic.json";
import modernMattePresetData from "../data/material-presets/presets/modern-matte.json";

export type MaterialPresetId = string;
export type MaterialPresetMaterialType =
  | "MeshBasicMaterial"
  | "MeshLambertMaterial"
  | "MeshPhysicalMaterial"
  | "MeshStandardMaterial";
export type MaterialPresetLightType =
  | "AmbientLight"
  | "HemisphereLight"
  | "cameraDirectional";
export type MaterialPresetJsonValue =
  | boolean
  | number
  | string
  | null
  | MaterialPresetJsonValue[]
  | { [key: string]: MaterialPresetJsonValue };
export type MaterialPresetProps = Record<string, MaterialPresetJsonValue>;

interface MaterialPresetBase {
  description?: string;
  id: MaterialPresetId;
  label: string;
  lighting: MaterialPresetLight[];
  material: MaterialPresetMaterial;
  overrides?: MaterialPresetOverrides;
}

export interface MaterialPresetCatalog {
  defaultPresetId: MaterialPresetId;
  presets: MaterialPreset[];
  version: 1;
}

export interface MaterialPresetCatalogIndex {
  defaultPresetId: MaterialPresetId;
  presetOrder: MaterialPresetId[];
  version: 1;
}

export interface MaterialPresetMaterial {
  props: MaterialPresetProps;
  type: MaterialPresetMaterialType;
}

export interface MaterialPresetLight {
  props: MaterialPresetProps;
  type: MaterialPresetLightType;
}

export type MaterialPreset = MaterialPresetBase;

export type MaterialPresetOverrideTarget = "atom" | "bond" | "polyhedron";

export interface MaterialPresetOverrides {
  atom?: MaterialPresetTargetOverride;
  bond?: MaterialPresetTargetOverride;
  polyhedron?: MaterialPresetTargetOverride;
}

export interface MaterialPresetTargetOverride {
  material?: MaterialPresetMaterial;
}

export interface MaterialPresetOption {
  label: string;
  value: MaterialPresetId;
}

const STATIC_MATERIAL_PRESET_MODULES: Record<string, unknown> = {
  "../data/material-presets/presets/2-5d.json": twoPointFiveDPresetData,
  "../data/material-presets/presets/2d.json": twoDPresetData,
  "../data/material-presets/presets/classic-matte.json": classicMattePresetData,
  "../data/material-presets/presets/glossy.json": glossyPresetData,
  "../data/material-presets/presets/metallic.json": metallicPresetData,
  "../data/material-presets/presets/modern-matte.json": modernMattePresetData,
};
const MATERIAL_PRESET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUPPORTED_MATERIAL_TYPES = new Set<MaterialPresetMaterialType>([
  "MeshBasicMaterial",
  "MeshLambertMaterial",
  "MeshPhysicalMaterial",
  "MeshStandardMaterial",
]);
const SUPPORTED_LIGHT_TYPES = new Set<MaterialPresetLightType>([
  "AmbientLight",
  "HemisphereLight",
  "cameraDirectional",
]);
const MATERIAL_PROP_ALLOWLIST: Record<
  MaterialPresetMaterialType,
  ReadonlySet<string>
> = {
  MeshBasicMaterial: new Set(),
  MeshLambertMaterial: new Set([
    "emissive",
    "emissiveIntensity",
    "flatShading",
  ]),
  MeshPhysicalMaterial: new Set([
    "attenuationColor",
    "attenuationDistance",
    "clearcoat",
    "clearcoatRoughness",
    "emissive",
    "emissiveIntensity",
    "flatShading",
    "ior",
    "iridescence",
    "iridescenceIOR",
    "metalness",
    "reflectivity",
    "roughness",
    "sheen",
    "sheenColor",
    "sheenRoughness",
    "specularColor",
    "specularIntensity",
    "thickness",
    "transmission",
  ]),
  MeshStandardMaterial: new Set([
    "emissive",
    "emissiveIntensity",
    "flatShading",
    "metalness",
    "roughness",
  ]),
};

export const MATERIAL_PRESET_CATALOG = buildMaterialPresetCatalog(
  materialPresetCatalogData,
  collectBundledMaterialPresetData(),
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

export function buildMaterialPresetCatalog(
  catalogData: unknown,
  presetDataByPath: Record<string, unknown>,
): MaterialPresetCatalog {
  const catalogIndex = validateMaterialPresetCatalogIndex(catalogData);
  const parsedPresets = Object.entries(presetDataByPath).map(([path, data]) =>
    parseMaterialPreset(data, path),
  );
  const presetsById = new Map<string, MaterialPreset>();
  for (const preset of parsedPresets) {
    if (presetsById.has(preset.id)) {
      throw new Error(`Duplicate material preset ID "${preset.id}".`);
    }
    presetsById.set(preset.id, preset);
  }

  const orderedPresets = catalogIndex.presetOrder.map((presetId, index) => {
    const preset = presetsById.get(presetId);
    if (!preset) {
      throw new Error(
        `material presets.presetOrder[${index}] "${presetId}" does not match a bundled preset file.`,
      );
    }
    return preset;
  });

  if (orderedPresets.length !== presetsById.size) {
    const orderedPresetIds = new Set(catalogIndex.presetOrder);
    const unlistedPreset = parsedPresets.find(
      (preset) => !orderedPresetIds.has(preset.id),
    );
    throw new Error(
      `Bundled material preset "${unlistedPreset?.id ?? "unknown"}" is not listed in material presets.presetOrder.`,
    );
  }

  return validateMaterialPresetData({
    defaultPresetId: catalogIndex.defaultPresetId,
    presets: orderedPresets,
    version: catalogIndex.version,
  });
}

export function validateMaterialPresetCatalogIndex(
  data: unknown,
): MaterialPresetCatalogIndex {
  const root = expectRecord(data, "material presets");
  assertKnownKeys(root, "material presets", [
    "defaultPresetId",
    "presetOrder",
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
  if (!Array.isArray(root.presetOrder) || root.presetOrder.length === 0) {
    throw new Error("material presets.presetOrder must be a non-empty array.");
  }

  const ids = new Set<string>();
  const presetOrder = root.presetOrder.map((entry, index) => {
    const presetId = expectPresetId(entry, `material presets.presetOrder[${index}]`);
    if (ids.has(presetId)) {
      throw new Error(`Duplicate material preset ID "${presetId}".`);
    }
    ids.add(presetId);
    return presetId;
  });

  if (!ids.has(defaultPresetId)) {
    throw new Error(
      `material presets.defaultPresetId "${defaultPresetId}" does not match a bundled preset.`,
    );
  }

  return {
    defaultPresetId,
    presetOrder,
    version,
  };
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

function collectBundledMaterialPresetData(): Record<string, unknown> {
  if (typeof import.meta.glob === "function") {
    return import.meta.glob("../data/material-presets/presets/*.json", {
      eager: true,
      import: "default",
    });
  }

  return STATIC_MATERIAL_PRESET_MODULES;
}

function parseMaterialPreset(data: unknown, path: string): MaterialPreset {
  const rawPreset = expectRecord(data, path);
  assertKnownKeys(rawPreset, path, [
    "description",
    "id",
    "label",
    "lighting",
    "material",
    "overrides",
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
    ...(rawPreset.overrides === undefined
      ? {}
      : { overrides: parseOverrides(rawPreset.overrides, `${path}.overrides`) }),
  };
}

function parseOverrides(data: unknown, path: string): MaterialPresetOverrides {
  const overrides = expectRecord(data, path);
  assertKnownKeys(overrides, path, ["atom", "bond", "polyhedron"]);

  return {
    ...parseOptionalTargetOverride(overrides.atom, `${path}.atom`, "atom"),
    ...parseOptionalTargetOverride(overrides.bond, `${path}.bond`, "bond"),
    ...parseOptionalTargetOverride(
      overrides.polyhedron,
      `${path}.polyhedron`,
      "polyhedron",
    ),
  };
}

function parseOptionalTargetOverride(
  data: unknown,
  path: string,
  target: MaterialPresetOverrideTarget,
): MaterialPresetOverrides {
  if (data === undefined) {
    return {};
  }

  return {
    [target]: parseTargetOverride(data, path),
  };
}

function parseTargetOverride(
  data: unknown,
  path: string,
): MaterialPresetTargetOverride {
  const override = expectRecord(data, path);
  assertKnownKeys(override, path, ["material"]);

  return {
    ...(override.material === undefined
      ? {}
      : { material: parseMaterial(override.material, `${path}.material`) }),
  };
}

function parseLighting(data: unknown, path: string): MaterialPresetLight[] {
  if (!Array.isArray(data)) {
    throw new Error(`${path} must be an array.`);
  }
  if (data.length === 0) {
    return [];
  }

  return data.map((entry, index) => parseLight(entry, `${path}[${index}]`));
}

function parseLight(data: unknown, path: string): MaterialPresetLight {
  const light = expectRecord(data, path);
  assertKnownKeys(light, path, ["props", "type"]);

  return {
    props: expectProps(light.props, `${path}.props`),
    type: expectLightType(light.type, `${path}.type`),
  };
}

function parseMaterial(data: unknown, path: string): MaterialPresetMaterial {
  const material = expectRecord(data, path);
  assertKnownKeys(material, path, ["props", "type"]);
  const type = expectMaterialType(material.type, `${path}.type`);

  return {
    props: expectMaterialProps(material.props, `${path}.props`, type),
    type,
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

function expectMaterialType(data: unknown, path: string): MaterialPresetMaterialType {
  if (
    typeof data !== "string" ||
    !SUPPORTED_MATERIAL_TYPES.has(data as MaterialPresetMaterialType)
  ) {
    throw new Error(
      `${path} must be one of ${Array.from(SUPPORTED_MATERIAL_TYPES).join(", ")}.`,
    );
  }

  return data as MaterialPresetMaterialType;
}

function expectLightType(data: unknown, path: string): MaterialPresetLightType {
  if (
    typeof data !== "string" ||
    !SUPPORTED_LIGHT_TYPES.has(data as MaterialPresetLightType)
  ) {
    throw new Error(
      `${path} must be one of ${Array.from(SUPPORTED_LIGHT_TYPES).join(", ")}.`,
    );
  }

  return data as MaterialPresetLightType;
}

function expectProps(data: unknown, path: string): MaterialPresetProps {
  const props = expectRecord(data, path);
  for (const [key, value] of Object.entries(props)) {
    expectJsonValue(value, `${path}.${key}`);
  }

  return props as MaterialPresetProps;
}

function expectMaterialProps(
  data: unknown,
  path: string,
  type: MaterialPresetMaterialType,
): MaterialPresetProps {
  const props = expectProps(data, path);
  const allowedProps = MATERIAL_PROP_ALLOWLIST[type];
  for (const key of Object.keys(props)) {
    if (!allowedProps.has(key)) {
      throw new Error(`${path}.${key} is not supported for ${type}.`);
    }
  }

  return props;
}

function expectJsonValue(data: unknown, path: string): MaterialPresetJsonValue {
  if (
    data === null ||
    typeof data === "boolean" ||
    typeof data === "number" ||
    typeof data === "string"
  ) {
    if (typeof data === "number" && !Number.isFinite(data)) {
      throw new Error(`${path} must be a finite number.`);
    }
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((entry, index) => expectJsonValue(entry, `${path}[${index}]`));
  }

  if (typeof data === "object") {
    const record = expectRecord(data, path);
    const parsed: { [key: string]: MaterialPresetJsonValue } = {};
    for (const [key, value] of Object.entries(record)) {
      parsed[key] = expectJsonValue(value, `${path}.${key}`);
    }
    return parsed;
  }

  throw new Error(`${path} must be a JSON-compatible value.`);
}
