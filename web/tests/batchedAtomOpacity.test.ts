import { describe, expect, test } from "bun:test";
import { ShaderLib } from "three";

import { patchBatchedAtomOpacityShader } from "../src/scene/batchedAtomOpacity";

describe("batched atom opacity shader", () => {
  test("uses the batched color alpha as the per-atom material alpha", () => {
    const patched = patchBatchedAtomOpacityShader(
      ShaderLib.standard.vertexShader,
      ShaderLib.standard.fragmentShader,
    );

    expect(patched.vertexShader).toContain("vec4 getBatchingColor");
    expect(patched.vertexShader).toContain("vColor.a *= batchingColor.a;");
    expect(patched.fragmentShader).toContain("#define USE_COLOR_ALPHA");
    expect(patched.fragmentShader).toContain(
      "if ( diffuseColor.a <= 0.0001 ) discard;",
    );
  });
});
