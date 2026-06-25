import type { SceneSpec } from "../api/scene";
import {
  elementColorForScheme,
  type ColorScheme,
} from "./colorSchemes";

export interface ElementLegendEntry {
  color: string;
  element: string;
}

export function deriveElementLegendEntries(
  scene: SceneSpec | null,
  colorScheme: ColorScheme = "vesta-soft",
): ElementLegendEntry[] {
  if (!scene) {
    return [];
  }

  const entries: ElementLegendEntry[] = [];
  const seenElements = new Set<string>();
  for (const atom of scene.atoms) {
    if (atom.isPeriodicImage) {
      continue;
    }
    if (seenElements.has(atom.element)) {
      continue;
    }

    seenElements.add(atom.element);
    entries.push({
      color: elementColorForScheme(atom.element, colorScheme),
      element: atom.element,
    });
  }

  return entries;
}
