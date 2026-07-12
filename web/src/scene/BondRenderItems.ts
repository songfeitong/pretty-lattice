import { Quaternion, Vector3 } from "three";

import type {
  AtomSpec,
  BondSpec,
} from "../api/scene";
import {
  type ElementColorOverrides,
} from "../model/colorSchemes";
import type {
  BondColorMode,
  StyleState,
} from "../model";
import { resolveAtomAppearance } from "../model";
import { resolveBondOpacityForStyle, resolveBondRadiusForStyle } from "../model";

const BOND_UP_AXIS = new Vector3(0, 1, 0);

export interface BondRenderItem {
  bond: BondSpec;
  center: Vector3;
  endAtomIndex: number;
  endColor: string;
  id: string;
  length: number;
  opacity: number;
  quaternion: Quaternion;
  radius: number;
  startAtomIndex: number;
  startColor: string;
}

export function createBondRenderItems({
  atoms,
  bondColor,
  bondOpacity,
  bondRadius,
  bonds,
  colorMode,
  colorScheme,
  colorOverrides,
  style,
}: {
  atoms: AtomSpec[];
  bondColor: string;
  bondOpacity: number;
  bondRadius: number;
  bonds: BondSpec[];
  colorMode: BondColorMode;
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  style: StyleState;
}): BondRenderItem[] {
  const items: BondRenderItem[] = [];

  for (const bond of bonds) {
    const startAtom = atoms[bond.startAtomIndex];
    const endAtom = atoms[bond.endAtomIndex];
    if (!startAtom || !endAtom) {
      continue;
    }

    const start = new Vector3(...startAtom.position);
    const end = new Vector3(...endAtom.position);
    const direction = end.clone().sub(start);
    const length = direction.length();
    if (length <= 0) {
      continue;
    }
    const startColor =
      colorMode === "bicolor"
        ? resolveAtomAppearance({
            atom: startAtom,
            colorOverrides,
            colorScheme,
            style,
          }).color
        : bondColor;
    const endColor =
      colorMode === "bicolor"
        ? resolveAtomAppearance({
            atom: endAtom,
            colorOverrides,
            colorScheme,
            style,
          }).color
        : bondColor;

    items.push({
      bond,
      center: start.clone().add(end).multiplyScalar(0.5),
      endAtomIndex: bond.endAtomIndex,
      endColor,
      id: bond.id,
      length,
      opacity: resolveBondOpacityForStyle(
        bond,
        style.objectStyles,
        bondOpacity,
      ),
      quaternion: new Quaternion().setFromUnitVectors(
        BOND_UP_AXIS,
        direction.clone().normalize(),
      ),
      radius: resolveBondRadiusForStyle(
        bond,
        style.objectStyles,
        bondRadius,
      ),
      startAtomIndex: bond.startAtomIndex,
      startColor,
    });
  }

  return items;
}
