import { createCameraPoseSnapshot } from "../scene/cameraPose";
import { visibleSceneForComponents } from "../model";
import { encodeRasterTextPdf } from "./pdfTextExport";
import { renderCombinedExportRaster } from "./combinedExportRaster";
import type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "./types";
import { exportFileStem } from "./fileNames";

export async function createCombinedExportFile({
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
  const visibleScene = visibleSceneForComponents(
    scene,
    componentVisibility,
    style.objectStyles,
    bondVisibilityOverrides,
  );
  const cameraPose = createCameraPoseSnapshot(cameraOrientationRef.current);
  const rasterImage = await renderCombinedExportRaster({
    cameraPose,
    componentOpacity,
    componentVisibility,
    lightStrength,
    scene,
    settings,
    showCrystalAxisLabels,
    style,
    structureLineWidth,
    unitCellLineStyle,
    visibleScene,
  });

  if (settings.format === "pdf") {
    return {
      blob: await encodeRasterTextPdf(rasterImage, {
        background: settings.background,
        halo: false,
      }),
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
