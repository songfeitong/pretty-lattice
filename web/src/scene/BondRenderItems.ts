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

const BOND_UP_AXIS = new Vector3(0, 1, 0);

export interface BondRenderItem {
  center: Vector3;
  endAtomIndex: number;
  endColor: string;
  length: number;
  quaternion: Quaternion;
  startAtomIndex: number;
  startColor: string;
}

export function createBondRenderItems({
  atoms,
  bondColor,
  bonds,
  colorMode,
  colorScheme,
  colorOverrides,
  style,
}: {
  atoms: AtomSpec[];
  bondColor: string;
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
      center: start.clone().add(end).multiplyScalar(0.5),
      endAtomIndex: bond.endAtomIndex,
      endColor,
      length,
      quaternion: new Quaternion().setFromUnitVectors(
        BOND_UP_AXIS,
        direction.clone().normalize(),
      ),
      startAtomIndex: bond.startAtomIndex,
      startColor,
    });
  }

  return items;
}
