import type {
  AtomRadiusModel,
  AtomSpec,
  BondSpec,
  PolyhedronSpec,
  SceneSpec,
} from "../api/scene";
import {
  atomColorForScheme,
  type ColorScheme,
  type ElementColorOverrides,
} from "./colorSchemes";
import { atomRadiusForModel } from "./elementRadii";

export const CUSTOM_ATOM_RADIUS_MODEL = "custom";

export type AtomRadiusStyleModel =
  | AtomRadiusModel
  | typeof CUSTOM_ATOM_RADIUS_MODEL;

export interface AtomObjectStyleOverride {
  color?: string;
  opacity?: number;
  radius?: number;
  visible?: boolean;
}

export interface ElementObjectStyleOverride {
  opacity?: number;
  radius?: number;
  visible?: boolean;
}

export interface ObjectStyleState {
  atomOverrides: Record<string, AtomObjectStyleOverride>;
  customAtomRadii: Record<string, number>;
  customRadiusBaseModel: AtomRadiusModel | null;
  customRadiusPreviousScale: number | null;
  elementOverrides: Record<string, ElementObjectStyleOverride>;
}

export interface AtomAppearance {
  color: string;
  opacity: number;
  radius: number;
  visible: boolean;
}

export interface AtomAppearanceStyleContext {
  atomOpacity?: number;
  atomRadius: number;
  atomRadiusModel: AtomRadiusStyleModel;
  globalAtomsVisible?: boolean;
  objectStyles: ObjectStyleState;
}

export type ObjectStyleProperty = "color" | "opacity" | "radius" | "visible";

const MIN_ATOM_RADIUS = 0.01;
const MIN_ATOM_OPACITY = 0;
const MAX_ATOM_OPACITY = 100;

export function createDefaultObjectStyleState(): ObjectStyleState {
  return {
    atomOverrides: {},
    customAtomRadii: {},
    customRadiusBaseModel: null,
    customRadiusPreviousScale: null,
    elementOverrides: {},
  };
}

export function resolveAtomAppearance({
  atom,
  colorOverrides,
  colorScheme,
  style,
}: {
  atom: AtomSpec;
  colorOverrides?: ElementColorOverrides;
  colorScheme: ColorScheme;
  style: AtomAppearanceStyleContext;
}): AtomAppearance {
  const elementOverride = style.objectStyles.elementOverrides[atom.element];
  const atomOverride = atomOverrideForAtom(style.objectStyles, atom);

  return {
    color:
      atomOverride?.color ??
      atomColorForScheme(atom, colorScheme, colorOverrides),
    opacity: resolveAtomOpacityForStyle(
      atom,
      style.objectStyles,
      style.atomOpacity,
    ),
    radius: clampAtomRadius(
      atomOverride?.radius ??
        elementOverride?.radius ??
        baseAtomRadiusForStyle(atom, style),
    ),
    visible:
      (atomOverride?.visible ?? elementOverride?.visible ?? true) &&
      (style.globalAtomsVisible ?? true),
  };
}

export function resolveAtomRadiusForStyle(
  atom: AtomSpec,
  style: AtomAppearanceStyleContext,
): number {
  const elementOverride = style.objectStyles.elementOverrides[atom.element];
  const atomOverride = atomOverrideForAtom(style.objectStyles, atom);

  return clampAtomRadius(
    atomOverride?.radius ??
      elementOverride?.radius ??
      baseAtomRadiusForStyle(atom, style),
  );
}

export function resolveAtomVisibleForStyle(
  atom: AtomSpec,
  objectStyles: ObjectStyleState,
  globalAtomsVisible = true,
): boolean {
  const atomOverride = atomOverrideForAtom(objectStyles, atom);
  const elementOverride = objectStyles.elementOverrides[atom.element];
  return (atomOverride?.visible ?? elementOverride?.visible ?? true) && globalAtomsVisible;
}

export function resolveAtomOpacityForStyle(
  atom: AtomSpec,
  objectStyles: ObjectStyleState,
  atomOpacity = 100,
): number {
  const atomOverride = atomOverrideForAtom(objectStyles, atom);
  const elementOverride = objectStyles.elementOverrides[atom.element];
  return clampAtomOpacity(
    atomOverride?.opacity ?? elementOverride?.opacity ?? atomOpacity,
  );
}

export function baseAtomRadiusForStyle(
  atom: AtomSpec,
  style: AtomAppearanceStyleContext,
): number {
  if (style.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
    const atomStyleKey = atomObjectStyleKey(atom);
    return clampAtomRadius(
      style.objectStyles.customAtomRadii[atomStyleKey] ??
        style.objectStyles.customAtomRadii[atom.id] ??
        atomRadiusForModel(
          atom,
          style.objectStyles.customRadiusBaseModel ?? "uniform",
        ) *
          ((style.objectStyles.customRadiusPreviousScale ?? style.atomRadius) / 100),
    );
  }

  return clampAtomRadius(
    atomRadiusForModel(atom, style.atomRadiusModel) * (style.atomRadius / 100),
  );
}

export function createCustomAtomRadii(
  atoms: readonly AtomSpec[],
  style: AtomAppearanceStyleContext,
): Record<string, number> {
  const customAtomRadii: Record<string, number> = {};

  for (const atom of atoms) {
    customAtomRadii[atomObjectStyleKey(atom)] = resolveAtomRadiusForStyle(atom, style);
  }

  return customAtomRadii;
}

export function canonicalAtomsForObjectStyles(
  atoms: readonly AtomSpec[],
): AtomSpec[] {
  return atoms.filter((atom) => !atom.isPeriodicImage);
}

export function clearObjectStyleProperty(
  objectStyles: ObjectStyleState,
  property: ObjectStyleProperty,
): ObjectStyleState {
  return cleanObjectStyleState({
    ...objectStyles,
    atomOverrides: clearAtomOverrideProperty(
      objectStyles.atomOverrides,
      property,
    ),
    elementOverrides:
      property === "color"
        ? objectStyles.elementOverrides
        : clearElementOverrideProperty(objectStyles.elementOverrides, property),
    customAtomRadii:
      property === "radius" ? {} : objectStyles.customAtomRadii,
    customRadiusBaseModel:
      property === "radius" ? null : objectStyles.customRadiusBaseModel,
    customRadiusPreviousScale:
      property === "radius" ? null : objectStyles.customRadiusPreviousScale,
  });
}

export function clearAtomOverridePropertyForElement(
  objectStyles: ObjectStyleState,
  atoms: readonly AtomSpec[],
  element: string,
  property: ObjectStyleProperty,
): ObjectStyleState {
  const atomIds = new Set(
    atoms
      .filter((atom) => atom.element === element)
      .flatMap((atom) => [atom.id, atomObjectStyleKey(atom)]),
  );

  const atomOverrides: Record<string, AtomObjectStyleOverride> = {};
  for (const [atomId, override] of Object.entries(objectStyles.atomOverrides)) {
    const nextOverride = atomIds.has(atomId)
      ? removeAtomOverrideProperty(override, property)
      : override;
    if (hasAtomOverride(nextOverride)) {
      atomOverrides[atomId] = nextOverride;
    }
  }

  return {
    ...objectStyles,
    atomOverrides,
  };
}

export function clearAtomOverridePropertyForAtom(
  objectStyles: ObjectStyleState,
  atom: AtomSpec,
  property: ObjectStyleProperty,
): ObjectStyleState {
  const atomIds = new Set([atom.id, atomObjectStyleKey(atom)]);
  const atomOverrides: Record<string, AtomObjectStyleOverride> = {};

  for (const [atomId, override] of Object.entries(objectStyles.atomOverrides)) {
    const nextOverride = atomIds.has(atomId)
      ? removeAtomOverrideProperty(override, property)
      : override;
    if (hasAtomOverride(nextOverride)) {
      atomOverrides[atomId] = nextOverride;
    }
  }

  return {
    ...objectStyles,
    atomOverrides,
  };
}

export function atomHasExplicitHiddenOverride(
  objectStyles: ObjectStyleState,
  atom: AtomSpec,
): boolean {
  return atomOverrideForAtom(objectStyles, atom)?.visible === false;
}

export function setAtomOverrideProperty(
  objectStyles: ObjectStyleState,
  atomId: string,
  property: ObjectStyleProperty,
  value: string | number | boolean,
): ObjectStyleState {
  const currentOverride = objectStyles.atomOverrides[atomId] ?? {};
  const atomOverrides = {
    ...objectStyles.atomOverrides,
    [atomId]: {
      ...currentOverride,
      [property]: clampObjectStyleValue(property, value),
    },
  };

  return {
    ...objectStyles,
    atomOverrides,
  };
}

export function setElementOverrideProperty(
  objectStyles: ObjectStyleState,
  element: string,
  property: Exclude<ObjectStyleProperty, "color">,
  value: number | boolean,
): ObjectStyleState {
  const currentOverride = objectStyles.elementOverrides[element] ?? {};
  const elementOverrides = {
    ...objectStyles.elementOverrides,
    [element]: {
      ...currentOverride,
      [property]: clampObjectStyleValue(property, value),
    },
  };

  return {
    ...objectStyles,
    elementOverrides,
  };
}

export function visibleSceneForObjectStyles(
  scene: SceneSpec,
  objectStyles: ObjectStyleState,
): SceneSpec {
  const atomIndexMap = new Map<number, number>();
  const atoms: AtomSpec[] = [];

  scene.atoms.forEach((atom, atomIndex) => {
    if (!resolveAtomVisibleForStyle(atom, objectStyles)) {
      return;
    }

    atomIndexMap.set(atomIndex, atoms.length);
    atoms.push(atom);
  });

  return {
    ...scene,
    atoms,
    bonds: scene.bonds.flatMap((bond) => remapBond(bond, atomIndexMap)),
    polyhedra: scene.polyhedra.flatMap((polyhedron) =>
      remapPolyhedron(polyhedron, atomIndexMap),
    ),
  };
}

export function clampAtomRadius(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_ATOM_RADIUS;
  }

  return Math.max(MIN_ATOM_RADIUS, value);
}

export function clampAtomOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return MAX_ATOM_OPACITY;
  }

  return Math.round(
    Math.min(MAX_ATOM_OPACITY, Math.max(MIN_ATOM_OPACITY, value)),
  );
}

export function atomObjectStyleKey(atom: AtomSpec): string {
  return atom.siteId || atom.id;
}

function atomOverrideForAtom(
  objectStyles: ObjectStyleState,
  atom: AtomSpec,
): AtomObjectStyleOverride | undefined {
  return (
    objectStyles.atomOverrides[atomObjectStyleKey(atom)] ??
    objectStyles.atomOverrides[atom.id]
  );
}

function clearAtomOverrideProperty(
  atomOverrides: Record<string, AtomObjectStyleOverride>,
  property: ObjectStyleProperty,
): Record<string, AtomObjectStyleOverride> {
  const nextOverrides: Record<string, AtomObjectStyleOverride> = {};

  for (const [atomId, override] of Object.entries(atomOverrides)) {
    const nextOverride = removeAtomOverrideProperty(override, property);
    if (hasAtomOverride(nextOverride)) {
      nextOverrides[atomId] = nextOverride;
    }
  }

  return nextOverrides;
}

function clearElementOverrideProperty(
  elementOverrides: Record<string, ElementObjectStyleOverride>,
  property: Exclude<ObjectStyleProperty, "color">,
): Record<string, ElementObjectStyleOverride> {
  const nextOverrides: Record<string, ElementObjectStyleOverride> = {};

  for (const [element, override] of Object.entries(elementOverrides)) {
    const nextOverride = { ...override };
    delete nextOverride[property];
    if (hasElementOverride(nextOverride)) {
      nextOverrides[element] = nextOverride;
    }
  }

  return nextOverrides;
}

function removeAtomOverrideProperty(
  override: AtomObjectStyleOverride,
  property: ObjectStyleProperty,
): AtomObjectStyleOverride {
  const nextOverride = { ...override };
  delete nextOverride[property];
  return nextOverride;
}

function hasAtomOverride(override: AtomObjectStyleOverride): boolean {
  return (
    override.color !== undefined ||
    override.opacity !== undefined ||
    override.radius !== undefined ||
    override.visible !== undefined
  );
}

function hasElementOverride(override: ElementObjectStyleOverride): boolean {
  return (
    override.opacity !== undefined ||
    override.radius !== undefined ||
    override.visible !== undefined
  );
}

function clampObjectStyleValue(
  property: ObjectStyleProperty,
  value: string | number | boolean,
): string | number | boolean {
  if (property === "radius") {
    return clampAtomRadius(Number(value));
  }
  if (property === "opacity") {
    return clampAtomOpacity(Number(value));
  }
  return value;
}

function cleanObjectStyleState(objectStyles: ObjectStyleState): ObjectStyleState {
  return {
    ...objectStyles,
    atomOverrides: Object.fromEntries(
      Object.entries(objectStyles.atomOverrides).filter(([, override]) =>
        hasAtomOverride(override),
      ),
    ),
    elementOverrides: Object.fromEntries(
      Object.entries(objectStyles.elementOverrides).filter(([, override]) =>
        hasElementOverride(override),
      ),
    ),
  };
}

function remapBond(
  bond: BondSpec,
  atomIndexMap: Map<number, number>,
): BondSpec[] {
  const startAtomIndex = atomIndexMap.get(bond.startAtomIndex);
  const endAtomIndex = atomIndexMap.get(bond.endAtomIndex);
  if (startAtomIndex === undefined || endAtomIndex === undefined) {
    return [];
  }

  return [{ ...bond, startAtomIndex, endAtomIndex }];
}

function remapPolyhedron(
  polyhedron: PolyhedronSpec,
  atomIndexMap: Map<number, number>,
): PolyhedronSpec[] {
  const hullAtomIndices: number[] = [];
  for (const atomIndex of polyhedron.hullAtomIndices) {
    const visibleAtomIndex = atomIndexMap.get(atomIndex);
    if (visibleAtomIndex === undefined) {
      return [];
    }
    hullAtomIndices.push(visibleAtomIndex);
  }

  const centerAtomIndex = atomIndexMap.get(polyhedron.centerAtomIndex);
  if (centerAtomIndex === undefined) {
    return [];
  }

  return [{ ...polyhedron, centerAtomIndex, hullAtomIndices }];
}
