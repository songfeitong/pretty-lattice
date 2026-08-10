import { describe, expect, test } from "bun:test";
import {
  BatchedMesh,
  BoxGeometry,
  Color,
  MeshBasicMaterial,
  ShaderLib,
  type DataTexture,
} from "three";

import {
  batchedInstanceRgbaProgramCacheKey,
  patchBatchedInstanceRgbaShader,
  setBatchedInstanceRgba,
} from "../src/scene/batchedInstanceRgba";

describe("batched instance RGBA adapter", () => {
  test("uses batched color alpha with both material and vertex colors", () => {
    for (const shader of [
      ShaderLib.basic,
      ShaderLib.lambert,
      ShaderLib.physical,
      ShaderLib.standard,
    ]) {
      const patched = patchBatchedInstanceRgbaShader(
        shader.vertexShader,
        shader.fragmentShader,
      );

      expect(patched.vertexShader).toContain("vec4 getBatchingColor");
      expect(patched.vertexShader).toContain("vColor.rgb *= color;");
      expect(patched.vertexShader).toContain("vColor.a *= batchingColor.a;");
      expect(patched.fragmentShader).toContain("#define USE_COLOR_ALPHA");
      expect(patched.fragmentShader).toContain(
        "if ( diffuseColor.a <= 0.0001 ) discard;",
      );
    }
    expect(batchedInstanceRgbaProgramCacheKey()).toContain("three-r171-v1");
  });

  test("fails loudly when the pinned Three.js shader contract changes", () => {
    expect(() => patchBatchedInstanceRgbaShader("void main() {}", "void main() {}"))
      .toThrow("Three.js shader no longer matches");
  });

  test("writes RGB and alpha into Three r171's batched color texel", () => {
    const mesh = new BatchedMesh(1, 24, 36, new MeshBasicMaterial());
    const geometry = new BoxGeometry();
    const geometryId = mesh.addGeometry(geometry);
    const batchId = mesh.addInstance(geometryId);

    setBatchedInstanceRgba(mesh, batchId, new Color("#336699"), 0.25);

    const texture = (
      mesh as BatchedMesh & { _colorsTexture: DataTexture }
    )._colorsTexture;
    expect(texture.image.data[0]).toBeCloseTo(new Color("#336699").r);
    expect(texture.image.data[1]).toBeCloseTo(new Color("#336699").g);
    expect(texture.image.data[2]).toBeCloseTo(new Color("#336699").b);
    expect(texture.image.data[3]).toBe(0.25);

    geometry.dispose();
    mesh.dispose();
  });
});
