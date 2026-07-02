import type { SceneSpec } from "../api/scene";
import type { CameraPoseSnapshot } from "../scene/cameraPose";
import type { RasterExportImage } from "../scene/exportRenderer";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
  ExportSettingsState,
  StyleState,
  UnitCellLineStyle,
} from "../model";
import {
  exportBackgroundColor,
  rasterFormatForExportFormat,
} from "./rasterCanvas";

const DARK_BACKGROUND_UNIT_CELL_LINE_COLOR = "#bbbbbb";

export async function renderExportRaster({
  cameraPose,
  componentOpacity,
  componentVisibility,
  lightStrength,
  settings,
  style,
  unitCellLineStyle,
  visibleScene,
}: {
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  lightStrength: number;
  settings: ExportSettingsState;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
  visibleScene: SceneSpec;
}): Promise<RasterExportImage> {
  const { renderStructureRasterImage } = await import("../scene/exportRenderer");
  const atomLabelSettings = componentVisibility.atomLabels.enabled
    ? componentVisibility.atomLabels
    : null;

  return renderStructureRasterImage({
    atomLabelSettings,
    backgroundColor: exportBackgroundColor(settings.background),
    cameraPose,
    componentOpacity,
    height: settings.height,
    imageFormat: rasterFormatForExportFormat(settings.format),
    lightStrength,
    meshQuality: settings.meshQuality,
    scene: visibleScene,
    showAtoms: componentVisibility.atoms,
    showUnitCell: componentVisibility.unitCell,
    style,
    supersampling: settings.supersampling,
    unitCellLineColor:
      settings.background === "black" ? DARK_BACKGROUND_UNIT_CELL_LINE_COLOR : undefined,
    unitCellLineStyle,
    width: settings.width,
  });
}
