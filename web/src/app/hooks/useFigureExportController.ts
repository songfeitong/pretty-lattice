import {
  type RefObject,
  useCallback,
  useState,
} from "react";
import type { Quaternion } from "three";

import type { SceneSpec } from "../../api/scene";
import { createCameraPoseSnapshot } from "../../scene/cameraPose";
import { computeStructureExportProjectedSize } from "../../scene/exportFrame";
import {
  createFigureExportFiles,
  downloadFigureExportFiles,
} from "../exportFigure";
import {
  createDefaultExportSettings,
  syncExportSettingsProjectedSize,
  type ComponentOpacityState,
  type ComponentVisibilityState,
  type ExportProjectedSize,
  type ExportSettingsState,
  type StyleState,
  type UnitCellLineStyle,
} from "../../model";

interface UseFigureExportControllerOptions {
  cameraOrientationRef: RefObject<Quaternion>;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  lightStrength: number;
  scene: SceneSpec | null;
  selectedFileName: string | null;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
  visibleScene: SceneSpec | null;
}

export function useFigureExportController({
  cameraOrientationRef,
  componentOpacity,
  componentVisibility,
  lightStrength,
  scene,
  selectedFileName,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
  visibleScene,
}: UseFigureExportControllerOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProjectedSize, setExportProjectedSize] =
    useState<ExportProjectedSize | null>(null);
  const [exportSettings, setExportSettings] = useState(createDefaultExportSettings);

  const resetExportState = useCallback(() => {
    setExportError(null);
    setExportProjectedSize(null);
    setExportSettings(createDefaultExportSettings());
  }, []);

  const computeCurrentExportProjectedSize = useCallback(() => {
    if (!visibleScene) {
      return null;
    }

    return computeStructureExportProjectedSize({
      atomLabelSettings: componentVisibility.atomLabels.enabled
        ? componentVisibility.atomLabels
        : null,
      cameraPose: createCameraPoseSnapshot(cameraOrientationRef.current),
      componentOpacity,
      scene: visibleScene,
      showAtoms: componentVisibility.atoms,
      showUnitCell: componentVisibility.unitCell,
      style,
    });
  }, [
    cameraOrientationRef,
    componentOpacity,
    componentVisibility.atomLabels,
    componentVisibility.atoms,
    componentVisibility.unitCell,
    style,
    visibleScene,
  ]);

  const refreshExportProjectedSize = useCallback(() => {
    const projectedSize = computeCurrentExportProjectedSize();
    setExportProjectedSize(projectedSize);
    return projectedSize;
  }, [computeCurrentExportProjectedSize]);

  const prepareExportSettings = useCallback(() => {
    const projectedSize = refreshExportProjectedSize();
    if (projectedSize === null) {
      return exportSettings;
    }

    const nextExportSettings = syncExportSettingsProjectedSize(
      exportSettings,
      projectedSize,
    );
    if (nextExportSettings !== exportSettings) {
      setExportSettings(nextExportSettings);
    }
    return nextExportSettings;
  }, [exportSettings, refreshExportProjectedSize]);

  const visibleExportProjectedSize = visibleScene ? exportProjectedSize : null;

  const syncProjectedSizeForExportTab = useCallback(() => {
    const projectedSize = refreshExportProjectedSize();
    if (projectedSize === null) {
      return;
    }

    setExportSettings((currentSettings) =>
      syncExportSettingsProjectedSize(currentSettings, projectedSize),
    );
  }, [refreshExportProjectedSize]);

  const handleExportSettingsChange = useCallback(
    (nextExportSettings: ExportSettingsState) => {
      setExportSettings(nextExportSettings);
      setExportError(null);
    },
    [],
  );

  const handleExportFigure = useCallback(async () => {
    if (!scene || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const settingsForExport = prepareExportSettings();
      const exportFiles = await createFigureExportFiles({
        cameraOrientationRef,
        componentOpacity,
        componentVisibility,
        fileName: selectedFileName,
        lightStrength,
        scene,
        settings: settingsForExport,
        showCrystalAxisLabels,
        style,
        unitCellLineStyle,
      });
      await downloadFigureExportFiles(exportFiles, selectedFileName);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not export this structure figure.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    cameraOrientationRef,
    componentOpacity,
    componentVisibility,
    isExporting,
    lightStrength,
    prepareExportSettings,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
  ]);

  return {
    exportError,
    exportProjectedSize: visibleExportProjectedSize,
    exportSettings,
    handleExportFigure,
    handleExportSettingsChange,
    isExporting,
    resetExportState,
    setExportError,
    setExportSettings,
    syncProjectedSizeForExportTab,
  };
}
