import {
  type BatchedMesh,
  type Color,
  type DataTexture,
  type Material,
  ShaderChunk,
} from "three";

const ADAPTER_VERSION = "three-r171-v1";
const COLOR_TEXEL_STRIDE = 4;

interface BatchedMeshColorTextureAccess {
  _colorsTexture: DataTexture | null;
}

export function enableBatchedInstanceRgba(
  shader: Parameters<Material["onBeforeCompile"]>[0],
) {
  const patched = patchBatchedInstanceRgbaShader(
    shader.vertexShader,
    shader.fragmentShader,
  );
  shader.vertexShader = patched.vertexShader;
  shader.fragmentShader = patched.fragmentShader;
}

export function batchedInstanceRgbaProgramCacheKey() {
  return `batched-instance-rgba-${ADAPTER_VERSION}`;
}

export function setBatchedInstanceRgba(
  mesh: BatchedMesh,
  batchId: number,
  color: Color,
  opacity: number,
) {
  mesh.setColorAt(batchId, color);
  const colorTexture = getBatchedColorTexture(mesh);
  const alphaIndex = batchId * COLOR_TEXEL_STRIDE + 3;
  if (alphaIndex >= colorTexture.image.data.length) {
    throw new Error(
      `Batched instance ${batchId} exceeds the ${ADAPTER_VERSION} color texture.`,
    );
  }

  colorTexture.image.data[alphaIndex] = opacity;
  colorTexture.needsUpdate = true;
}

export function patchBatchedInstanceRgbaShader(
  vertexShader: string,
  fragmentShader: string,
): { fragmentShader: string; vertexShader: string } {
  const batchingParsVertex = replaceRequired(
    replaceRequired(
      ShaderChunk.batching_pars_vertex,
      "vec3 getBatchingColor",
      "vec4 getBatchingColor",
    ),
    "return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;",
    "return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );",
  );
  const colorVertex = replaceRequired(
    replaceRequired(
      replaceRequired(
        ShaderChunk.color_vertex,
        "vColor *= color;",
        "vColor.rgb *= color;",
      ),
      "vec3 batchingColor =",
      "vec4 batchingColor =",
    ),
    "vColor.xyz *= batchingColor.xyz;",
    "vColor.rgb *= batchingColor.rgb;\n\tvColor.a *= batchingColor.a;",
  );

  return {
    vertexShader: `#define USE_COLOR_ALPHA\n${replaceRequired(
      replaceRequired(
        vertexShader,
        "#include <batching_pars_vertex>",
        batchingParsVertex,
      ),
      "#include <color_vertex>",
      colorVertex,
    )}`,
    fragmentShader: `#define USE_COLOR_ALPHA\n${replaceRequired(
      fragmentShader,
      "#include <color_fragment>",
      "#include <color_fragment>\nif ( diffuseColor.a <= 0.0001 ) discard;",
    )}`,
  };
}

function getBatchedColorTexture(mesh: BatchedMesh): DataTexture {
  const colorTexture = (mesh as BatchedMesh & BatchedMeshColorTextureAccess)
    ._colorsTexture;
  if (
    !colorTexture ||
    colorTexture.image.data.length % COLOR_TEXEL_STRIDE !== 0
  ) {
    throw new Error(
      `Three.js BatchedMesh color texture no longer matches ${ADAPTER_VERSION}.`,
    );
  }

  return colorTexture;
}

function replaceRequired(source: string, search: string, replacement: string): string {
  if (!source.includes(search)) {
    throw new Error(
      `Three.js shader no longer matches the ${ADAPTER_VERSION} RGBA adapter.`,
    );
  }
  return source.replace(search, replacement);
}
