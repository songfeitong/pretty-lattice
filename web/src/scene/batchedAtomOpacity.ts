import { type Material, ShaderChunk } from "three";

export function enableBatchedAtomOpacity(
  shader: Parameters<Material["onBeforeCompile"]>[0],
) {
  const patched = patchBatchedAtomOpacityShader(
    shader.vertexShader,
    shader.fragmentShader,
  );
  shader.vertexShader = patched.vertexShader;
  shader.fragmentShader = patched.fragmentShader;
}

export function batchedAtomOpacityProgramCacheKey() {
  return "batched-atom-opacity-v1";
}

export function patchBatchedAtomOpacityShader(
  vertexShader: string,
  fragmentShader: string,
): { fragmentShader: string; vertexShader: string } {
  const batchingParsVertex = ShaderChunk.batching_pars_vertex
    .replace("vec3 getBatchingColor", "vec4 getBatchingColor")
    .replace(
      "return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;",
      "return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );",
    );
  const colorVertex = ShaderChunk.color_vertex
    .replace("vec3 batchingColor =", "vec4 batchingColor =")
    .replace(
      "vColor.xyz *= batchingColor.xyz;",
      "vColor.xyz *= batchingColor.xyz;\n\tvColor.a *= batchingColor.a;",
    );

  return {
    vertexShader: `#define USE_COLOR_ALPHA\n${vertexShader}`
      .replace("#include <batching_pars_vertex>", batchingParsVertex)
      .replace("#include <color_vertex>", colorVertex),
    fragmentShader: `#define USE_COLOR_ALPHA\n${fragmentShader}`.replace(
      "#include <color_fragment>",
      "#include <color_fragment>\nif ( diffuseColor.a <= 0.0001 ) discard;",
    ),
  };
}
