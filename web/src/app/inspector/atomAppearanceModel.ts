import type { AtomSpec, SceneSpec } from "../../api/scene";
import {
  atomHasExplicitHiddenOverride,
  baseAtomRadiusForStyle,
  baseColorSchemeForStyle,
  canonicalAtomsForObjectStyles,
  elementColorOverridesForStyle,
  resolveAtomAppearance,
  type AtomAppearance,
  type StyleState,
} from "../../model";

export interface ElementGroup {
  atoms: AtomSpec[];
  element: string;
}

export interface HiddenAtomRow {
  atom: AtomSpec;
  color: string;
}

export interface AtomAppearanceModel {
  atomById: ReadonlyMap<string, AtomSpec>;
  elementAppearanceByElement: ReadonlyMap<string, AtomAppearance>;
  elementGroups: readonly ElementGroup[];
  hiddenAtoms: readonly HiddenAtomRow[];
  objectAtoms: readonly AtomSpec[];
  resolveAtom: (atom: AtomSpec) => AtomAppearance;
  selectedAtom: AtomSpec | null;
}

export function createAtomAppearanceModel({
  atomOpacity,
  atomsVisible,
  scene,
  selectedAtomId,
  style,
}: {
  atomOpacity: number;
  atomsVisible: boolean;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
}): AtomAppearanceModel {
  const objectAtoms = canonicalAtomsForObjectStyles(scene.atoms);
  const elementGroups = groupAtomsByElement(objectAtoms);
  const colorScheme = baseColorSchemeForStyle(style);
  const colorOverrides = elementColorOverridesForStyle(objectAtoms, style);
  const atomById = atomLookupForScene(scene);
  const selectedAtom = selectedAtomId
    ? (atomById.get(selectedAtomId) ?? null)
    : null;
  const resolveAtom = (atom: AtomSpec) =>
    resolveAtomAppearance({
      atom,
      colorOverrides,
      colorScheme,
      style: { ...style, atomOpacity, globalAtomsVisible: atomsVisible },
    });
  const elementAppearanceByElement = new Map<string, AtomAppearance>();

  for (const group of elementGroups) {
    elementAppearanceByElement.set(
      group.element,
      elementRowAppearance(
        group,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
        atomOpacity,
      ),
    );
  }

  const hiddenAtoms: HiddenAtomRow[] = [];
  for (const atom of objectAtoms) {
    if (
      atom.id !== selectedAtom?.id &&
      atomHasExplicitHiddenOverride(style.objectStyles, atom)
    ) {
      hiddenAtoms.push({ atom, color: resolveAtom(atom).color });
    }
  }

  return {
    atomById,
    elementAppearanceByElement,
    elementGroups,
    hiddenAtoms,
    objectAtoms,
    resolveAtom,
    selectedAtom,
  };
}

export function elementRowAppearance(
  group: ElementGroup,
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
  atomOpacity: number,
): AtomAppearance {
  const representativeAtom = group.atoms[0];
  const elementOverride = style.objectStyles.elementOverrides[group.element];
  if (!representativeAtom) {
    return {
      color: "#808080",
      opacity: elementOverride?.opacity ?? atomOpacity,
      radius: 1,
      visible: (elementOverride?.visible ?? true) && atomsVisible,
    };
  }

  const appearance = resolveAtomAppearance({
    atom: representativeAtom,
    colorOverrides,
    colorScheme,
    style: {
      ...style,
      atomOpacity,
      globalAtomsVisible: atomsVisible,
      objectStyles: { ...style.objectStyles, atomOverrides: {} },
    },
  });
  return {
    ...appearance,
    radius:
      elementOverride?.radius ??
      baseAtomRadiusForStyle(representativeAtom, style),
    visible: (elementOverride?.visible ?? true) && atomsVisible,
  };
}

function groupAtomsByElement(atoms: readonly AtomSpec[]): ElementGroup[] {
  const groups: ElementGroup[] = [];
  const groupByElement = new Map<string, ElementGroup>();

  for (const atom of atoms) {
    let group = groupByElement.get(atom.element);
    if (!group) {
      group = { atoms: [], element: atom.element };
      groupByElement.set(atom.element, group);
      groups.push(group);
    }
    group.atoms.push(atom);
  }
  return groups;
}

function atomLookupForScene(scene: SceneSpec): Map<string, AtomSpec> {
  const canonicalBySiteId = new Map<string, AtomSpec>();
  for (const atom of scene.atoms) {
    if (!atom.isPeriodicImage) {
      canonicalBySiteId.set(atom.siteId, atom);
    }
  }

  const atoms = new Map<string, AtomSpec>();
  for (const atom of scene.atoms) {
    atoms.set(atom.id, canonicalBySiteId.get(atom.siteId) ?? atom);
  }
  return atoms;
}

export function formatAtomSite(atom: AtomSpec): string {
  return `${atom.element}:${atom.siteIndex}`;
}
