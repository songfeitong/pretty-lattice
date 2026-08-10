import type { Dispatch, SetStateAction } from "react";

import type { AtomSpec } from "../../api/scene";
import {
  CUSTOM_ATOM_RADIUS_MODEL,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  baseColorSchemeForStyle,
  clearAtomOverridePropertyForAtom,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  createCustomAtomRadii,
  createCustomColormapFromStyle,
  elementColorOverridesForStyle,
  setAtomOverrideProperty,
  setElementOverrideProperty,
  type AtomRadiusStyleModel,
  type StyleState,
} from "../../model";
import { clampPercentValue } from "../controls/commonPanel/sharedControls";
import { elementRowAppearance } from "./atomAppearanceModel";

export interface AtomAppearanceEditor {
  applyElementToAllAtoms: (element: string) => void;
  restoreAtomVisibility: (atom: AtomSpec) => void;
  setAtomColor: (atom: AtomSpec, color: string) => void;
  setAtomOpacity: (atom: AtomSpec, opacity: number) => void;
  setAtomRadius: (atom: AtomSpec, radius: number) => void;
  setAtomRadiusModel: (model: AtomRadiusStyleModel) => void;
  setAtomRadiusScale: (scale: number) => void;
  setAtomVisible: (atom: AtomSpec, visible: boolean) => void;
  setElementColor: (element: string, color: string) => void;
  setElementOpacity: (element: string, opacity: number) => void;
  setElementRadius: (element: string, radius: number) => void;
  setElementVisible: (element: string, visible: boolean) => void;
}

export function createAtomAppearanceEditor({
  atomOpacity,
  atoms,
  atomsVisible,
  onElementColorChange,
  onStyleChange,
  style,
}: {
  atomOpacity: number;
  atoms: readonly AtomSpec[];
  atomsVisible: boolean;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}): AtomAppearanceEditor {
  const updateElementProperty = (
    element: string,
    property: "opacity" | "radius" | "visible",
    value: number | boolean,
  ) => {
    const nextStyle =
      property === "radius" ? ensureCustomRadiusStyle(style, atoms) : style;
    let objectStyles = setElementOverrideProperty(
      nextStyle.objectStyles,
      element,
      property,
      value,
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      atoms,
      element,
      property,
    );
    onStyleChange({ ...nextStyle, objectStyles });
  };

  const updateAtomProperty = (
    atom: AtomSpec,
    property: "color" | "opacity" | "radius" | "visible",
    value: string | number | boolean,
  ) => {
    const nextStyle =
      property === "radius"
        ? ensureCustomRadiusStyle(style, atoms)
        : property === "color"
          ? ensureCustomColorStyle(style, atoms)
          : style;
    onStyleChange({
      ...nextStyle,
      objectStyles: setAtomOverrideProperty(
        nextStyle.objectStyles,
        atom.siteId,
        property,
        value,
      ),
    });
  };

  return {
    setElementColor: onElementColorChange,
    setElementRadius: (element, radius) =>
      updateElementProperty(element, "radius", radius),
    setElementOpacity: (element, opacity) =>
      updateElementProperty(element, "opacity", opacity),
    setElementVisible: (element, visible) =>
      updateElementProperty(element, "visible", visible),
    setAtomRadius: (atom, radius) => updateAtomProperty(atom, "radius", radius),
    setAtomOpacity: (atom, opacity) =>
      updateAtomProperty(atom, "opacity", opacity),
    setAtomVisible: (atom, visible) =>
      updateAtomProperty(atom, "visible", visible),
    setAtomColor: (atom, color) => updateAtomProperty(atom, "color", color),
    restoreAtomVisibility: (atom) => {
      onStyleChange({
        ...style,
        objectStyles: clearAtomOverridePropertyForAtom(
          style.objectStyles,
          atom,
          "visible",
        ),
      });
    },
    setAtomRadiusModel: (atomRadiusModel) => {
      onStyleChange((currentStyle) => {
        if (atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
          return ensureCustomRadiusStyle(currentStyle, atoms);
        }
        return {
          ...currentStyle,
          atomRadius:
            currentStyle.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL &&
            currentStyle.objectStyles.customRadiusPreviousScale !== null
              ? currentStyle.objectStyles.customRadiusPreviousScale
              : currentStyle.atomRadius,
          atomRadiusModel,
          objectStyles: clearObjectStyleProperty(
            currentStyle.objectStyles,
            "radius",
          ),
        };
      });
    },
    setAtomRadiusScale: (atomRadius) => {
      onStyleChange((currentStyle) => ({
        ...currentStyle,
        atomRadius: clampPercentValue(
          atomRadius,
          STYLE_SCALE_MIN.atomRadius,
          STYLE_SCALE_MAX.atomRadius,
        ),
      }));
    },
    applyElementToAllAtoms: (element) => {
      onStyleChange((currentStyle) => {
        const groupAtoms = atoms.filter((atom) => atom.element === element);
        if (groupAtoms.length === 0) return currentStyle;
        const appearance = elementRowAppearance(
          { atoms: groupAtoms, element },
          currentStyle,
          baseColorSchemeForStyle(currentStyle),
          elementColorOverridesForStyle(atoms, currentStyle),
          atomsVisible,
          atomOpacity,
        );
        const customColormap = createCustomColormapFromStyle(
          atoms,
          currentStyle,
        );
        const nextStyle = ensureCustomRadiusStyle(currentStyle, atoms);
        let objectStyles = setElementOverrideProperty(
          nextStyle.objectStyles,
          element,
          "radius",
          appearance.radius,
        );
        objectStyles = setElementOverrideProperty(
          objectStyles,
          element,
          "opacity",
          appearance.opacity,
        );
        objectStyles = setElementOverrideProperty(
          objectStyles,
          element,
          "visible",
          appearance.visible,
        );
        for (const property of [
          "radius",
          "opacity",
          "visible",
          "color",
        ] as const) {
          objectStyles = clearAtomOverridePropertyForElement(
            objectStyles,
            atoms,
            element,
            property,
          );
        }
        return {
          ...nextStyle,
          colorScheme: customColormap.baseColorScheme,
          colorSchemeMode: "custom",
          customColormap: {
            ...customColormap,
            elements: {
              ...customColormap.elements,
              [element]: appearance.color,
            },
          },
          objectStyles,
        };
      });
    },
  };
}

function ensureCustomRadiusStyle(
  style: StyleState,
  atoms: readonly AtomSpec[],
): StyleState {
  if (style.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
    return style;
  }
  const customAtomRadii = createCustomAtomRadii(atoms, style);
  const objectStylesWithoutRadius = clearObjectStyleProperty(
    style.objectStyles,
    "radius",
  );
  return {
    ...style,
    atomRadiusModel: CUSTOM_ATOM_RADIUS_MODEL,
    objectStyles: {
      ...objectStylesWithoutRadius,
      customAtomRadii,
      customRadiusBaseModel: style.atomRadiusModel,
      customRadiusPreviousScale: style.atomRadius,
    },
  };
}

function ensureCustomColorStyle(
  style: StyleState,
  atoms: readonly AtomSpec[],
): StyleState {
  if (style.colorSchemeMode === "custom" && style.customColormap) {
    return style;
  }
  const customColormap = createCustomColormapFromStyle(atoms, style);
  return {
    ...style,
    colorScheme: customColormap.baseColorScheme,
    colorSchemeMode: "custom",
    customColormap,
  };
}
