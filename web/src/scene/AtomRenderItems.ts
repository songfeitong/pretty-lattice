import { Color } from "three";

import type { AtomRadiusModel, AtomSpec } from "../api/scene";
import { atomColorForScheme, type ElementColorOverrides } from "../model/colorSchemes";
import type { StyleState } from "../model";
import { atomRadiusForModel } from "./sceneGeometry";
import type { VectorTuple } from "./viewMath";

export interface AtomRenderItem {
  atom: AtomSpec;
  baseColor: Color;
  color: string;
  id: string;
  position: VectorTuple;
  radius: number;
}

export function createAtomRenderItems({
  atoms,
  colorScheme,
  colorOverrides,
  radiusModel,
  radiusScale,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  radiusModel: AtomRadiusModel;
  radiusScale: number;
}): AtomRenderItem[] {
  return atoms.map((atom) => {
    const color = atomColorForScheme(atom, colorScheme, colorOverrides);
    return {
      atom,
      baseColor: new Color(color),
      color,
      id: atom.id,
      position: atom.position,
      radius: atomRadiusForModel(atom, radiusModel) * radiusScale,
    };
  });
}

export function atomRenderItemById(items: AtomRenderItem[]): Map<string, AtomRenderItem> {
  const itemById = new Map<string, AtomRenderItem>();
  for (const item of items) {
    itemById.set(item.id, item);
  }
  return itemById;
}
