import { describe, expect, test } from "bun:test";

import {
  DEFAULT_MATERIAL_PRESET_ID,
  MATERIAL_PRESET_OPTIONS,
  MATERIAL_PRESETS,
  materialPresetById,
  validateMaterialPresetData,
} from "../src/app/materialPresets";

describe("material presets", () => {
  test("loads bundled material presets from JSON data", () => {
    expect(DEFAULT_MATERIAL_PRESET_ID).toBe("classic-matte");
    expect(MATERIAL_PRESETS.map((preset) => preset.id)).toEqual([
      "classic-matte",
      "modern-matte",
      "glossy",
      "flat-2d",
    ]);
    expect(MATERIAL_PRESET_OPTIONS).toEqual([
      { label: "Classic Matte", value: "classic-matte" },
      { label: "Modern Matte", value: "modern-matte" },
      { label: "Glossy", value: "glossy" },
      { label: "Flat 2D", value: "flat-2d" },
    ]);
    expect(materialPresetById("glossy").material).toMatchObject({
      kind: "standard",
      roughness: 0.32,
    });
    expect(materialPresetById("glossy").lighting.cameraLights).toEqual([
      {
        intensity: 2.05,
        offset: [0.32, 0.22, 0],
      },
      {
        intensity: 0.85,
        offset: [-0.08, 0.38, 0.12],
      },
    ]);
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
