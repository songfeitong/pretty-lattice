import { type Ref, useMemo } from "react";
import {
  CanvasTexture,
  Group,
  LinearFilter,
  SpriteMaterial,
  SRGBColorSpace,
} from "three";

import type { VectorTuple } from "./viewMath";
import {
  ATOM_SELECTION_RING_SELECTED_OPACITY,
  ATOM_SELECTION_RING_SELECTED_SCALE,
  ATOM_SELECTION_RING_WORLD_SCALE,
} from "./atomHighlight";

let cachedSelectionRingTexture: CanvasTexture | null | undefined;
const ATOM_SELECTION_RING_RENDER_ORDER = 30;

export function AtomSelectionRing({
  materialRef,
  opacity = ATOM_SELECTION_RING_SELECTED_OPACITY,
  position,
  radius,
  ringRef,
  scale = ATOM_SELECTION_RING_SELECTED_SCALE,
}: {
  materialRef?: Ref<SpriteMaterial>;
  opacity?: number;
  position?: VectorTuple;
  radius: number;
  ringRef?: Ref<Group>;
  scale?: number;
}) {
  const texture = useMemo(() => selectionRingTexture(), []);
  if (!texture) {
    return null;
  }

  const spriteScale = Math.max(0.01, radius * ATOM_SELECTION_RING_WORLD_SCALE);

  return (
    <group ref={ringRef} position={position} scale={scale}>
      <sprite
        raycast={ignoreSelectionRingRaycast}
        renderOrder={ATOM_SELECTION_RING_RENDER_ORDER}
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

function selectionRingTexture(): CanvasTexture | null {
  if (cachedSelectionRingTexture !== undefined) {
    return cachedSelectionRingTexture;
  }
  if (typeof document === "undefined") {
    cachedSelectionRingTexture = null;
    return cachedSelectionRingTexture;
  }

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    cachedSelectionRingTexture = null;
    return cachedSelectionRingTexture;
  }

  const center = size / 2;
  const radius = 206;
  context.clearRect(0, 0, size, size);
  context.lineCap = "round";
  context.lineJoin = "round";

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(15, 23, 42, 0.5)";
  context.lineWidth = 60;
  context.stroke();

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(255, 255, 255, 0.98)";
  context.lineWidth = 14;
  context.stroke();

  context.beginPath();
  context.arc(center, center, radius, 0, Math.PI * 2);
  context.strokeStyle = "rgba(15, 23, 42, 0.34)";
  context.lineWidth = 4;
  context.stroke();

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  cachedSelectionRingTexture = texture;
  return cachedSelectionRingTexture;
}

function ignoreSelectionRingRaycast() {}
