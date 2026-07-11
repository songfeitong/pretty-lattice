import type { SceneSpec } from "../api/scene";
import type { CameraOrientationRef } from "../scene/LatticeScene";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
  BondVisibilityOverrides,
  ExportFormat,
  ExportSettingsState,
  StyleState,
  StructureLineWidthState,
  UnitCellLineStyle,
} from "../model";

export interface CreateFigureExportOptions {
  bondVisibilityOverrides: BondVisibilityOverrides;
  cameraOrientationRef: CameraOrientationRef;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  fileName: string | null;
  lightStrength: number;
  scene: SceneSpec;
  settings: ExportSettingsState;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  structureLineWidth: StructureLineWidthState;
  unitCellLineStyle: UnitCellLineStyle;
}

export interface FigureExportFile {
  blob: Blob;
  fileName: string;
  format: ExportFormat;
}

export type RasterExportFileFormat = Exclude<ExportFormat, "pdf">;
