import { Color } from "three";

import type { AtomSpec } from "../api/scene";
import type { ElementColorOverrides } from "../model/colorSchemes";
import type { StyleState } from "../model";
import { resolveAtomAppearance } from "../model";
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
  style,
}: {
  atoms: AtomSpec[];
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  style: StyleState;
}): AtomRenderItem[] {
  return atoms.map((atom) => {
    const appearance = resolveAtomAppearance({
      atom,
      colorOverrides,
      colorScheme,
      style,
    });
    return {
      atom,
      baseColor: new Color(appearance.color),
      color: appearance.color,
      id: atom.id,
      position: atom.position,
      radius: appearance.radius,
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
