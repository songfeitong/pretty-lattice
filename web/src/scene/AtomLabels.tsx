import { useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import {
  CanvasTexture,
  LinearFilter,
  SpriteMaterial,
  type Texture,
} from "three";

import type { AtomSpec } from "../api/scene";
import type { StyleState } from "../model";
import { atomRadiusForModel } from "./sceneGeometry";

export interface AtomLabelSpec {
  atom: AtomSpec;
  label: string;
  radius: number;
}

const LABEL_FONT = "600 44px Geist, Arial, sans-serif";
const LABEL_PADDING_X = 18;
const LABEL_PADDING_Y = 10;
const LABEL_TEXTURE_SCALE = 0.012;
const LABEL_WORLD_OFFSET_RATIO = 1.25;

export function AtomLabels({
  atoms,
  radiusModel,
  radiusScale,
}: {
  atoms: AtomSpec[];
  radiusModel: StyleState["atomRadiusModel"];
  radiusScale: number;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const labels = useMemo(
    () => atomLabelsForAtoms(atoms, radiusModel, radiusScale),
    [atoms, radiusModel, radiusScale],
  );
  const textures = useMemo(
    () => labels.map((label) => createAtomLabelTexture(label.label)),
    [labels],
  );

  useLayoutEffect(() => {
    invalidate();
    return () => {
      textures.forEach((texture) => texture.dispose());
      invalidate();
    };
  }, [invalidate, textures]);

  return (
    <group renderOrder={10}>
      {labels.map((label, index) => {
        const texture = textures[index];
        if (!texture) {
          return null;
        }

        const position = label.atom.position;
        const width = texture.image.width * LABEL_TEXTURE_SCALE;
        const height = texture.image.height * LABEL_TEXTURE_SCALE;
        const offset = Math.max(label.radius * LABEL_WORLD_OFFSET_RATIO, height * 0.45);

        return (
          <sprite
            key={`${label.atom.id}-label`}
            position={[position[0], position[1] + offset, position[2]]}
            scale={[width, height, 1]}
          >
            <spriteMaterial
              attach="material"
              map={texture}
              transparent
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        );
      })}
    </group>
  );
}

export function atomLabelsForAtoms(
  atoms: readonly AtomSpec[],
  radiusModel: StyleState["atomRadiusModel"],
  radiusScale: number,
): AtomLabelSpec[] {
  const labelBySiteId = canonicalAtomLabelsBySiteId(atoms);
  return atoms.map((atom) => ({
    atom,
    label: labelBySiteId.get(atom.siteId) ?? fallbackAtomLabel(atom),
    radius: atomRadiusForModel(atom, radiusModel) * radiusScale,
  }));
}

function canonicalAtomLabelsBySiteId(atoms: readonly AtomSpec[]): Map<string, string> {
  const canonicalAtoms = atoms
    .filter((atom) => !atom.isPeriodicImage)
    .slice()
    .sort((firstAtom, secondAtom) => firstAtom.siteIndex - secondAtom.siteIndex);
  const elementCounts = new Map<string, number>();
  const labelBySiteId = new Map<string, string>();

  for (const atom of canonicalAtoms) {
    const nextCount = (elementCounts.get(atom.element) ?? 0) + 1;
    elementCounts.set(atom.element, nextCount);
    labelBySiteId.set(atom.siteId, `${atom.element}${nextCount}`);
  }

  return labelBySiteId;
}

function fallbackAtomLabel(atom: AtomSpec): string {
  return `${atom.element}${atom.siteIndex + 1}`;
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
