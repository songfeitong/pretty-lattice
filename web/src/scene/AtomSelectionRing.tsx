import { type Ref, useMemo } from "react";
import {
  CanvasTexture,
  Group,
  LinearFilter,
  SpriteMaterial,
  SRGBColorSpace,
} from "three";

import {
  PREVIEW_THEME_COLORS,
  type PreviewThemeColors,
} from "../theme/previewTheme";
import {
  ATOM_SELECTION_RING_SELECTED_OPACITY,
  ATOM_SELECTION_RING_SELECTED_SCALE,
  ATOM_SELECTION_RING_WORLD_SCALE,
} from "./atomHighlight";
import { STRUCTURE_RENDER_ORDER } from "./renderOrder";
import type { VectorTuple } from "./viewMath";

const cachedSelectionRingTextures = new Map<string, CanvasTexture | null>();

export function AtomSelectionRing({
  materialRef,
  opacity = ATOM_SELECTION_RING_SELECTED_OPACITY,
  position,
  radius,
  ringColors = PREVIEW_THEME_COLORS.light.atomSelectionRing,
  ringRef,
  scale = ATOM_SELECTION_RING_SELECTED_SCALE,
}: {
  materialRef?: Ref<SpriteMaterial>;
  opacity?: number;
  position?: VectorTuple;
  radius: number;
  ringColors?: PreviewThemeColors["atomSelectionRing"];
  ringRef?: Ref<Group>;
  scale?: number;
}) {
  const texture = useMemo(
    () => selectionRingTexture(ringColors),
    [ringColors.edge, ringColors.halo, ringColors.highlight],
  );
  if (!texture) {
    return null;
  }

  const spriteScale = Math.max(0.01, radius * ATOM_SELECTION_RING_WORLD_SCALE);

  return (
    <group ref={ringRef} position={position} scale={scale}>
      <sprite
        raycast={ignoreSelectionRingRaycast}
        renderOrder={STRUCTURE_RENDER_ORDER.atomSelectionRing}
        scale={[spriteScale, spriteScale, 1]}
      >
        <spriteMaterial
          ref={materialRef}
          map={texture}
          depthWrite={false}
          opacity={opacity}
          transparent
        />
      </sprite>
    </group>
  );
}

function selectionRingTexture(
  colors: PreviewThemeColors["atomSelectionRing"],
): CanvasTexture | null {
  const cacheKey = `${colors.halo}|${colors.highlight}|${colors.edge}`;
  if (cachedSelectionRingTextures.has(cacheKey)) {
    return cachedSelectionRingTextures.get(cacheKey) ?? null;
  }
  if (typeof document === "undefined") {
    cachedSelectionRingTextures.set(cacheKey, null);
    return null;
  }

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    cachedSelectionRingTextures.set(cacheKey, null);
    return null;
  }

  const center = size / 2;
  const radius = 206;
  context.clearRect(0, 0, size, size);
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = colors.halo;
  context.lineWidth = 60;
  context.stroke();

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = colors.highlight;
  context.lineWidth = 14;
  context.stroke();

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = colors.edge;
  context.lineWidth = 4;
  context.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  cachedSelectionRingTextures.set(cacheKey, texture);
  return texture;
}

function ignoreSelectionRingRaycast() {}
