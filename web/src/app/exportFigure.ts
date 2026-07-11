import { deriveElementLegendEntries } from "./elementLegend";
import { createCameraPoseSnapshot } from "../scene/cameraPose";
import type { ExportSettingsState } from "../model";
import {
  baseColorSchemeForStyle,
  elementColorOverridesForStyle,
  validateExportSettings,
} from "../model";
import type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "../export/types";
import {
  createFigureExportZipBlob,
  createZipBlob,
  downloadBlob,
  downloadFigureExportFiles as downloadFigureExportFilesWithStem,
  downloadFigureExportZip as downloadFigureExportZipWithStem,
} from "../export/zipExport";
import {
  createLegendExportFile,
  legendExportStyle,
} from "../export/legendExport";
import {
  createCrystalAxesExportFile,
  crystalAxisExportSize,
} from "../export/crystalAxesExport";
import { createStructureExportFile } from "../export/structureExportFile";
import { createCombinedExportFile } from "../export/combinedExportFile";
import { exportFileStem } from "../export/fileNames";

export type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "../export/types";
export {
  createFigureExportZipBlob,
  createZipBlob,
  downloadBlob,
};

const EXPORT_ACCESSORY_LONG_SIDE_WEIGHT = 0.25;

export async function createFigureExportFiles({
  bondVisibilityOverrides,
  cameraOrientationRef,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
  structureLineWidth,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile[]> {
  const validation = validateExportSettings(settings);
  if (!validation.valid) {
    throw new Error("Export settings are invalid.");
  }

  if (settings.combineComponents) {
    return [
      await createCombinedExportFile({
        bondVisibilityOverrides,
        cameraOrientationRef,
        componentOpacity,
        componentVisibility,
        fileName,
        lightStrength,
        scene,
        settings,
        showCrystalAxisLabels,
        style,
        structureLineWidth,
        unitCellLineStyle,
      }),
    ];
  }

  const files: FigureExportFile[] = [];
  const stem = exportFileStem(fileName);

  if (settings.components.structure) {
    files.push(
      await createStructureExportFile({
        bondVisibilityOverrides,
        cameraOrientationRef,
        componentOpacity,
        componentVisibility,
        fileName,
        lightStrength,
        scene,
        settings,
        showCrystalAxisLabels,
        style,
        structureLineWidth,
        unitCellLineStyle,
      }),
    );
  }

  if (settings.components.crystalAxes) {
    files.push(
      await createCrystalAxesExportFile({
        cameraPose: createCameraPoseSnapshot(cameraOrientationRef.current),
        fileName: `${stem}-crystal-axes.${settings.format}`,
        format: settings.format,
        background: settings.background,
        scene,
        showCrystalAxisLabels,
        size: crystalAxisExportSize(settings, exportAccessoryReferenceSize(settings)),
        supersampling: settings.supersampling,
      }),
    );
  }

  if (settings.components.legend) {
    const colorScheme = baseColorSchemeForStyle(style);
    const elementColorOverrides = elementColorOverridesForStyle(scene.atoms, style);
    files.push(
      await createLegendExportFile({
        entries: deriveElementLegendEntries(scene, colorScheme, elementColorOverrides),
        fileName: `${stem}-legend.${settings.format}`,
        format: settings.format,
        background: settings.background,
        layout: settings.legendLayout,
        style: legendExportStyle(settings, exportAccessoryReferenceSize(settings)),
        supersampling: settings.supersampling,
      }),
    );
  }

  return files;
}

export async function createFigureExportFile({
  bondVisibilityOverrides,
  cameraOrientationRef,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
  structureLineWidth,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile> {
  return createStructureExportFile({
    bondVisibilityOverrides,
    cameraOrientationRef,
    componentOpacity,
    componentVisibility,
    fileName,
    lightStrength,
    scene,
    settings,
    showCrystalAxisLabels,
    style,
    structureLineWidth,
    unitCellLineStyle,
  });
}

export async function downloadFigureExportZip(files: FigureExportFile[], sourceFileName: string | null) {
  await downloadFigureExportZipWithStem(files, sourceFileName, exportFileStem);
}

export async function downloadFigureExportFiles(files: FigureExportFile[], sourceFileName: string | null) {
  await downloadFigureExportFilesWithStem(files, sourceFileName, exportFileStem);
}

function exportAccessoryReferenceSize(settings: ExportSettingsState): number {
  const shortSide = Math.min(settings.width, settings.height);
  const longSide = Math.max(settings.width, settings.height);
  return (
    shortSide ** (1 - EXPORT_ACCESSORY_LONG_SIDE_WEIGHT) *
    longSide ** EXPORT_ACCESSORY_LONG_SIDE_WEIGHT
  );
}
