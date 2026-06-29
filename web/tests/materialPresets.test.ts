import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MATERIAL_PRESET_ID,
  MATERIAL_PRESET_OPTIONS,
  MATERIAL_PRESETS,
  buildMaterialPresetCatalog,
  validateMaterialPresetData,
} from "../src/app/materialPresets";

describe("material presets", () => {
  test("loads bundled material presets from JSON data", () => {
    expect(DEFAULT_MATERIAL_PRESET_ID).toBe("classic-matte");
    expect(MATERIAL_PRESETS.map((preset) => preset.id)).toEqual([
      "classic-matte",
      "modern-matte",
      "glossy",
      "metallic",
      "2-5d",
      "2d",
    ]);
    expect(MATERIAL_PRESET_OPTIONS).toEqual([
      { label: "Classic Matte", value: "classic-matte" },
      { label: "Modern Matte", value: "modern-matte" },
      { label: "Glossy", value: "glossy" },
      { label: "Metallic", value: "metallic" },
      { label: "2.5D", value: "2-5d" },
      { label: "2D", value: "2d" },
    ]);
  });

  test("keeps bundled preset materials and lighting inside supported ranges", () => {
    for (const preset of MATERIAL_PRESETS) {
      expect(["basic", "lambert", "standard"]).toContain(preset.material.kind);
      expect(preset.lighting.ambientIntensity).toBeGreaterThanOrEqual(0);
      expect(preset.lighting.ambientIntensity).toBeLessThanOrEqual(5);
      expect(preset.lighting.cameraLights.length).toBeLessThanOrEqual(4);

      for (const light of preset.lighting.cameraLights) {
        expect(light.intensity).toBeGreaterThanOrEqual(0);
        expect(light.intensity).toBeLessThanOrEqual(5);
        expect(light.offset).toHaveLength(3);
        for (const component of light.offset) {
          expect(component).toBeGreaterThanOrEqual(-2);
          expect(component).toBeLessThanOrEqual(2);
        }
      }

      if (preset.material.kind === "standard") {
        expect(preset.material.metalness).toBeGreaterThanOrEqual(0);
        expect(preset.material.metalness).toBeLessThanOrEqual(1);
        expect(preset.material.roughness).toBeGreaterThanOrEqual(0);
        expect(preset.material.roughness).toBeLessThanOrEqual(1);
      }
    }
  });

  test("rejects unsupported material kinds", () => {
    expect(() =>
      validateMaterialPresetData(
        catalogWithPreset({
          material: {
            kind: "toon",
          },
        }),
      ),
    ).toThrow("material presets.presets[0].material.kind must be one of");
  });

  test("rejects duplicate preset IDs", () => {
    expect(() =>
      validateMaterialPresetData({
        defaultPresetId: "classic-matte",
        presets: [
          validPreset({ id: "classic-matte" }),
          validPreset({ id: "classic-matte" }),
        ],
        version: 1,
      }),
    ).toThrow('Duplicate material preset ID "classic-matte".');
  });

  test("rejects missing labels", () => {
    const preset: Record<string, unknown> = validPreset();
    delete preset.label;

    expect(() =>
      validateMaterialPresetData({
        defaultPresetId: "classic-matte",
        presets: [preset],
        version: 1,
      }),
    ).toThrow(
      "material presets.presets[0].label must be a non-empty string.",
    );
  });

  test("rejects out-of-range numeric values", () => {
    expect(() =>
      validateMaterialPresetData(
        catalogWithPreset({
          material: {
            flatShading: false,
            kind: "standard",
            metalness: 0,
            roughness: 1.2,
          },
        }),
      ),
    ).toThrow("material presets.presets[0].material.roughness must be between 0 and 1.");
  });

  test("rejects invalid camera light offsets", () => {
    expect(() =>
      validateMaterialPresetData(
        catalogWithPreset({
          lighting: {
            ambientIntensity: 0.68,
            cameraLights: [
              {
                intensity: 1.78,
                offset: [0.32, 3, 0],
              },
            ],
          },
        }),
      ),
    ).toThrow(
      "material presets.presets[0].lighting.cameraLights[0].offset[1] must be between -2 and 2.",
    );
  });

  test("builds split preset files in catalog order", () => {
    const catalog = buildMaterialPresetCatalog(
      {
        defaultPresetId: "modern-matte",
        presetOrder: ["modern-matte", "classic-matte"],
        version: 1,
      },
      [
        validPreset({ id: "classic-matte", label: "Classic Matte" }),
        validPreset({
          id: "modern-matte",
          label: "Modern Matte",
          material: {
            flatShading: false,
            kind: "standard",
            metalness: 0,
            roughness: 0.58,
          },
        }),
      ],
    );

    expect(catalog.defaultPresetId).toBe("modern-matte");
    expect(catalog.presets.map((preset) => preset.id)).toEqual([
      "modern-matte",
      "classic-matte",
    ]);
  });

  test("rejects preset files not listed in catalog order", () => {
    expect(() =>
      buildMaterialPresetCatalog(
        {
          defaultPresetId: "classic-matte",
          presetOrder: ["classic-matte"],
          version: 1,
        },
        [
          validPreset({ id: "classic-matte" }),
          validPreset({ id: "glossy", label: "Glossy" }),
        ],
      ),
    ).toThrow('Bundled material preset "glossy" is not listed');
  });

});

function catalogWithPreset(presetPatch: Record<string, unknown>) {
  return {
    defaultPresetId: "classic-matte",
    presets: [validPreset(presetPatch)],
    version: 1,
  };
}

function validPreset(patch: Record<string, unknown> = {}) {
  return {
    id: "classic-matte",
    label: "Classic Matte",
    lighting: {
      ambientIntensity: 0.68,
      cameraLights: [
        {
          intensity: 1.78,
          offset: [0.32, 0.22, 0],
        },
      ],
    },
    material: {
      flatShading: false,
      kind: "lambert",
    },
    ...patch,
  };
}
