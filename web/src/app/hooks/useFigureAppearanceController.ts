import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { SceneSpec } from "../../api/scene";
import {
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_STRUCTURE_LINE_WIDTH,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  baseColorSchemeForStyle,
  canonicalAtomsForObjectStyles,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  createCustomColormapFromStyle,
  createDefaultBondVisibilityOverrides,
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  defaultPreviewMeshQualityForScene,
  elementColorOverridesForStyle,
  setAtomOverrideProperty,
  setBondFamilyVisible,
  setBondRelationVisible,
  visibleSceneForComponents,
  type BondVisibilityOverrides,
  type ComponentOpacityState,
  type ComponentVisibilityState,
  type MeshQuality,
  type StructureLineWidthState,
  type StyleState,
  type UnitCellLineStyle,
} from "../../model";
import { deriveElementLegendEntries } from "../elementLegend";
import type {
  ConnectivityIntent,
  ConnectivityStatus,
} from "./useStructurePreview";

interface FigureAppearanceControllerOptions {
  closeActiveColorPicker: () => void;
  connectivityStatus: ConnectivityStatus;
  requestConnectivity: (intent?: ConnectivityIntent) => Promise<boolean>;
  scene: SceneSpec | null;
}

export function useFigureAppearanceController({
  closeActiveColorPicker,
  connectivityStatus,
  requestConnectivity,
  scene,
}: FigureAppearanceControllerOptions) {
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [previewMeshQuality, setPreviewMeshQuality] = useState<MeshQuality>(
    () => defaultPreviewMeshQualityForScene(null),
  );
  const [unitCellLineStyle, setUnitCellLineStyle] = useState<UnitCellLineStyle>(
    DEFAULT_UNIT_CELL_LINE_STYLE,
  );
  const [structureLineWidth, setStructureLineWidth] =
    useState<StructureLineWidthState>(DEFAULT_STRUCTURE_LINE_WIDTH);
  const [showCrystalAxisLabels, setShowCrystalAxisLabels] = useState(
    DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  );
  const [bondVisibilityOverrides, setBondVisibilityOverrides] =
    useState<BondVisibilityOverrides>(createDefaultBondVisibilityOverrides);
  const colorSchemeSelectionRef = useRef({
    colorScheme: style.colorScheme,
    colorSchemeMode: style.colorSchemeMode,
  });

  const visibleScene = useMemo(
    () => visibleSceneForComponents(
      scene,
      componentVisibility,
      style.objectStyles,
      bondVisibilityOverrides,
    ),
    [bondVisibilityOverrides, componentVisibility, scene, style.objectStyles],
  );
  const objectStyleAtoms = useMemo(
    () => (scene ? canonicalAtomsForObjectStyles(scene.atoms) : []),
    [scene],
  );
  const elementColorOverrides = useMemo(
    () => scene ? elementColorOverridesForStyle(scene.atoms, style) : undefined,
    [scene, style],
  );
  const legendColorScheme = baseColorSchemeForStyle(style);
  const legendEntries = useMemo(
    () => deriveElementLegendEntries(scene, legendColorScheme, elementColorOverrides),
    [elementColorOverrides, legendColorScheme, scene],
  );

  useEffect(() => {
    const previousSelection = colorSchemeSelectionRef.current;
    const changedToPreset =
      style.colorSchemeMode === "preset" &&
      (previousSelection.colorSchemeMode !== "preset" ||
        previousSelection.colorScheme !== style.colorScheme);

    colorSchemeSelectionRef.current = {
      colorScheme: style.colorScheme,
      colorSchemeMode: style.colorSchemeMode,
    };
    if (changedToPreset) closeActiveColorPicker();
  }, [closeActiveColorPicker, style.colorScheme, style.colorSchemeMode]);

  const resetAppearance = useCallback((nextScene: SceneSpec | null) => {
    setComponentVisibility(createDefaultComponentVisibility(nextScene));
    setComponentOpacity(createDefaultComponentOpacity());
    setStyle(createDefaultStyle());
    setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
    setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
    setStructureLineWidth(DEFAULT_STRUCTURE_LINE_WIDTH);
    setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
    setBondVisibilityOverrides(createDefaultBondVisibilityOverrides());
  }, []);

  const handleComponentVisibilityChange = useCallback(async (
    key: keyof ComponentVisibilityState,
    value: boolean,
  ) => {
    if (
      value &&
      (key === "bonds" || key === "polyhedra" || key === "oneHopBondedAtoms") &&
      connectivityStatus !== "ready"
    ) {
      const succeeded = await requestConnectivity(key);
      if (!succeeded) return;
    }

    setComponentVisibility((current) => ({ ...current, [key]: value }));
    if (value && key === "atoms") {
      setStyle((current) => ({
        ...current,
        objectStyles: clearObjectStyleProperty(current.objectStyles, "visible"),
      }));
    }
    if (value && key === "bonds") {
      setBondVisibilityOverrides(createDefaultBondVisibilityOverrides());
    }
  }, [connectivityStatus, requestConnectivity]);

  const handleComponentOpacityChange = useCallback((
    key: keyof ComponentOpacityState,
    value: number,
  ) => {
    setComponentOpacity((current) => ({ ...current, [key]: value }));
    if (key === "atoms") {
      setStyle((current) => ({
        ...current,
        objectStyles: clearObjectStyleProperty(current.objectStyles, "opacity"),
      }));
    }
  }, []);

  const handleComponentOpacityReset = useCallback(() => {
    setComponentOpacity(createDefaultComponentOpacity());
    setStyle((current) => ({
      ...current,
      objectStyles: clearObjectStyleProperty(current.objectStyles, "opacity"),
    }));
  }, []);

  const handleFogAffectsUnitCellChange = useCallback((fogAffectsUnitCell: boolean) => {
    setStyle((current) => ({ ...current, fogAffectsUnitCell }));
  }, []);

  const handleDistinguishSimilarColorsChange = useCallback((
    distinguishSimilarColors: boolean,
  ) => {
    setStyle((current) => ({ ...current, distinguishSimilarColors }));
  }, []);

  const handleLegendElementColorChange = useCallback((element: string, color: string) => {
    setStyle((current) => {
      const draft = scene
        ? createCustomColormapFromStyle(scene.atoms, current)
        : current.customColormap ?? createCustomColormapFromStyle([], current);
      const objectStyles = scene
        ? clearAtomOverridePropertyForElement(
            current.objectStyles,
            scene.atoms,
            element,
            "color",
          )
        : current.objectStyles;

      return {
        ...current,
        colorSchemeMode: "custom",
        colorScheme: draft.baseColorScheme,
        customColormap: {
          baseColorScheme: draft.baseColorScheme,
          elements: { ...draft.elements, [element]: color },
        },
        objectStyles,
      };
    });
  }, [scene]);

  const hideAtom = useCallback((atomId: string) => {
    setStyle((current) => ({
      ...current,
      objectStyles: setAtomOverrideProperty(
        current.objectStyles,
        atomId,
        "visible",
        false,
      ),
    }));
  }, []);

  const handleBondFamilyVisibilityChange = useCallback((
    familyKey: string,
    visible: boolean,
  ) => {
    setBondVisibilityOverrides((current) =>
      setBondFamilyVisible(current, familyKey, visible),
    );
  }, []);

  const setBondVisible = useCallback((
    bond: SceneSpec["bonds"][number],
    visible: boolean,
  ) => {
    setBondVisibilityOverrides((current) =>
      setBondRelationVisible(current, bond, visible),
    );
  }, []);

  return {
    bondVisibilityOverrides,
    componentOpacity,
    componentVisibility,
    elementColorOverrides,
    handleBondFamilyVisibilityChange,
    handleComponentOpacityChange,
    handleComponentOpacityReset,
    handleComponentVisibilityChange,
    handleDistinguishSimilarColorsChange,
    handleFogAffectsUnitCellChange,
    handleLegendElementColorChange,
    hideAtom,
    legendColorScheme,
    legendEntries,
    objectStyleAtoms,
    previewMeshQuality,
    resetAppearance,
    setBondVisible,
    setPreviewMeshQuality,
    setShowCrystalAxisLabels,
    setStructureLineWidth,
    setStyle,
    setUnitCellLineStyle,
    showCrystalAxisLabels,
    structureLineWidth,
    style,
    unitCellLineStyle,
    visibleScene,
  };
}
