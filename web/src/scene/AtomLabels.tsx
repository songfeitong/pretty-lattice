import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  CanvasTexture,
  LinearFilter,
  Sprite,
  Vector3,
  type Texture,
} from "three";

import type { AtomSpec } from "../api/scene";
import {
  atomLabelsForAtoms,
  type AtomLabelSettings,
} from "../model";
import { atomRadiusForModel } from "./sceneGeometry";

const LABEL_FONT = "600 44px Geist, Arial, sans-serif";
const LABEL_PADDING_X = 18;
const LABEL_PADDING_Y = 10;
const LABEL_TEXTURE_SCALE = 0.012;
const LABEL_SURFACE_OFFSET_RATIO = 1.04;
const LABEL_SIZE_NORMALIZATION = 100;

export function AtomLabels({
  atoms,
  settings,
  radiusModel,
  radiusScale,
}: {
  atoms: AtomSpec[];
  settings: AtomLabelSettings;
  radiusModel: Parameters<typeof atomRadiusForModel>[1];
  radiusScale: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const labels = useMemo(
    () =>
      atomLabelsForAtoms({
        atoms,
        kind: settings.kind,
        mode: settings.mode,
        selectedAtomIds: settings.atomIds,
        selectedElements: settings.elements,
      }),
    [atoms, settings.atomIds, settings.elements, settings.kind, settings.mode],
  );
  const textures = useMemo(
    () => labels.map((label) => createAtomLabelTexture(label.label)),
    [labels],
  );
  const sizeScale = settings.size / LABEL_SIZE_NORMALIZATION;

  useLayoutEffect(() => {
    invalidate();
    return () => {
      textures.forEach((texture) => texture.dispose());
      invalidate();
    };
  }, [invalidate, textures]);

  return (
    <group>
      {labels.map((label, index) => {
        const texture = textures[index];
        if (!texture) {
          return null;
        }

        const position = label.atom.position;
        const width = texture.image.width * LABEL_TEXTURE_SCALE * sizeScale;
        const height = texture.image.height * LABEL_TEXTURE_SCALE * sizeScale;
        const radius = atomRadiusForModel(label.atom, radiusModel) * radiusScale;

        return (
          <AtomLabelSprite
            key={`${label.atom.id}-label`}
            height={height}
            position={position}
            radius={radius}
            texture={texture}
            width={width}
          />
        );
      })}
    </group>
  );
}

function AtomLabelSprite({
  height,
  position,
  radius,
  texture,
  width,
}: {
  height: number;
  position: AtomSpec["position"];
  radius: number;
  texture: Texture;
  width: number;
}) {
  const spriteRef = useRef<Sprite | null>(null);
  const camera = useThree((state) => state.camera);
  const cameraDirection = useMemo(() => new Vector3(), []);
  const updatePosition = useCallback(() => {
    const sprite = spriteRef.current;
    if (!sprite) {
      return;
    }

    camera.getWorldDirection(cameraDirection);
    sprite.position
      .set(position[0], position[1], position[2])
      .addScaledVector(cameraDirection, -radius * LABEL_SURFACE_OFFSET_RATIO);
  }, [camera, cameraDirection, position, radius]);

  useLayoutEffect(() => {
    updatePosition();
  }, [updatePosition]);
  useFrame(updatePosition);

  return (
    <sprite ref={spriteRef} scale={[width, height, 1]}>
      <spriteMaterial
        attach="material"
        map={texture}
        transparent
        alphaTest={0.05}
        depthTest
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

function createAtomLabelTexture(label: string): Texture {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to create atom label canvas.");
  }

  context.font = LABEL_FONT;
  const metrics = context.measureText(label);
  canvas.width = Math.ceil(metrics.width + LABEL_PADDING_X * 2);
  canvas.height = 64;

  context.font = LABEL_FONT;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = LABEL_PADDING_Y * 0.65;
  context.strokeStyle = "rgba(255, 255, 255, 0.92)";
  context.fillStyle = "rgba(17, 24, 39, 0.95)";
  context.strokeText(label, canvas.width / 2, canvas.height / 2 + 1);
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
