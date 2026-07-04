import { createCameraPoseSnapshot } from "../scene/cameraPose";
import {
  validateExportSettings,
  visibleSceneForComponents,
} from "../model";
import { encodeRasterPdf } from "./pdfTextExport";
import { renderExportRaster } from "./structureRasterExport";
import type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "./types";
import { exportFileStem } from "./fileNames";

export async function createStructureExportFile({
  cameraOrientationRef,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  scene,
  settings,
  style,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile> {
  const validation = validateExportSettings(settings);
  if (!validation.valid) {
    throw new Error(validation.message ?? "Export settings are invalid.");
  }

  const visibleScene = visibleSceneForComponents(
    scene,
    componentVisibility,
    style.objectStyles,
  );
  if (!visibleScene) {
    throw new Error("No structure is available to export.");
  }

  const cameraPose = createCameraPoseSnapshot(cameraOrientationRef.current);
  const rasterImage = await renderExportRaster({
    cameraPose,
    componentOpacity,
    componentVisibility,
    lightStrength,
    settings,
    style,
    unitCellLineStyle,
    visibleScene,
  });

  if (settings.format === "pdf") {
    return {
      blob: await encodeRasterPdf(rasterImage),
      fileName: `${exportFileStem(fileName)}.pdf`,
      format: "pdf",
    };
  }

  return {
    blob: rasterImage.blob,
    fileName: `${exportFileStem(fileName)}.${settings.format}`,
    format: settings.format,
  };
}
