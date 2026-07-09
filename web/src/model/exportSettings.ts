export type ExportFormat = "png" | "jpg" | "pdf";
export type ExportBackground = "transparent" | "white" | "black";
export type ExportComponentId = "legend" | "crystalAxes" | "structure";
export type ExportLegendLayout = "horizontal" | "vertical";
export type MeshQuality = "low" | "medium" | "high" | "xhigh";
export type ExportMeshQuality = MeshQuality;
export type ExportSupersampling = 1 | 2 | 4;

export interface ExportComponentSelection {
  legend: boolean;
  crystalAxes: boolean;
  structure: boolean;
}

export interface ExportProjectedSize {
  height: number;
  width: number;
}

export interface ExportSettingsState {
  aspectRatioLocked: boolean;
  background: ExportBackground;
  combineComponents: boolean;
  components: ExportComponentSelection;
  format: ExportFormat;
  height: number;
  legendLayout: ExportLegendLayout;
  meshQuality: ExportMeshQuality;
  pixelsPerProjectedUnit: number | null;
  supersampling: ExportSupersampling;
  width: number;
}

export type ExportSettingsValidationCode =
  | "jpg-needs-opaque-background"
  | "no-components"
  | "size-range"
  | "size-too-large"
  | "supersampling-invalid";

type ExportSettingsValidationSimpleErrorCode = Exclude<
  ExportSettingsValidationCode,
  "size-range"
>;

export type ExportSettingsValidation =
  | {
      code: null;
      valid: true;
    }
  | {
      code: ExportSettingsValidationSimpleErrorCode;
      valid: false;
    }
  | {
      code: "size-range";
      max: number;
      min: number;
      valid: false;
    };

export const EXPORT_DIMENSION_MIN = 64;
export const EXPORT_DIMENSION_MAX = 6000;
export const EXPORT_RENDER_DIMENSION_MAX = 8192;
export const EXPORT_RENDER_PIXEL_MAX = EXPORT_RENDER_DIMENSION_MAX * EXPORT_RENDER_DIMENSION_MAX;
export const EXPORT_SUPERSAMPLING_OPTIONS: readonly ExportSupersampling[] = [1, 2, 4];
const EXPORT_SUPERSAMPLING_MIN: ExportSupersampling = 1;
const EXPORT_SUPERSAMPLING_MAX: ExportSupersampling = 4;
export const EXPORT_FORMAT_OPTIONS: readonly ExportFormat[] = ["png", "jpg", "pdf"];
export const EXPORT_BACKGROUND_OPTIONS: readonly ExportBackground[] = [
  "transparent",
  "white",
  "black",
];
export const EXPORT_LEGEND_LAYOUT_OPTIONS: readonly ExportLegendLayout[] = [
  "horizontal",
  "vertical",
];
export const MESH_QUALITY_OPTIONS: readonly MeshQuality[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];
export const EXPORT_MESH_QUALITY_OPTIONS = MESH_QUALITY_OPTIONS;

export const DEFAULT_EXPORT_SETTINGS: ExportSettingsState = {
  aspectRatioLocked: false,
  background: "transparent",
  combineComponents: true,
  components: {
    legend: false,
    crystalAxes: false,
    structure: true,
  },
  format: "png",
  height: 2000,
  legendLayout: "horizontal",
  meshQuality: "high",
  pixelsPerProjectedUnit: null,
  supersampling: 2,
  width: 2000,
};

export function createDefaultExportSettings(): ExportSettingsState {
  return {
    ...DEFAULT_EXPORT_SETTINGS,
    components: { ...DEFAULT_EXPORT_SETTINGS.components },
  };
}

export function setExportDimension(
  settings: ExportSettingsState,
  dimension: "height" | "width",
  value: number,
  projectedSize?: ExportProjectedSize,
): ExportSettingsState {
  const nextValue = clampExportDimension(value);
  if (!settings.aspectRatioLocked) {
    return {
      ...settings,
      [dimension]: nextValue,
      pixelsPerProjectedUnit: null,
    };
  }

  const safeProjectedSize = normalizeExportProjectedSize(projectedSize);
  const safeAspectRatio = safeProjectedSize
    ? safeProjectedSize.width / safeProjectedSize.height
    : exportAspectRatioFromSettings(settings);
  if (dimension === "width") {
    return {
      ...settings,
      width: nextValue,
      height: clampExportDimension(Math.round(nextValue / safeAspectRatio)),
      pixelsPerProjectedUnit: safeProjectedSize
        ? nextValue / safeProjectedSize.width
        : settings.pixelsPerProjectedUnit,
    };
  }

  return {
    ...settings,
    height: nextValue,
    width: clampExportDimension(Math.round(nextValue * safeAspectRatio)),
    pixelsPerProjectedUnit: safeProjectedSize
      ? nextValue / safeProjectedSize.height
      : settings.pixelsPerProjectedUnit,
  };
}

export function setExportAspectRatioLocked(
  settings: ExportSettingsState,
  aspectRatioLocked: boolean,
  projectedSize?: ExportProjectedSize,
): ExportSettingsState {
  const nextSettings = {
    ...settings,
    aspectRatioLocked,
    pixelsPerProjectedUnit: aspectRatioLocked ? settings.pixelsPerProjectedUnit : null,
  };

  return aspectRatioLocked
    ? fitExportSettingsInsideProjectedSize(nextSettings, projectedSize)
    : nextSettings;
}

export function syncExportSettingsProjectedSize(
  settings: ExportSettingsState,
  projectedSize?: ExportProjectedSize,
): ExportSettingsState {
  if (!settings.aspectRatioLocked) {
    return settings;
  }

  const safeProjectedSize = normalizeExportProjectedSize(projectedSize);
  if (safeProjectedSize && hasExportProjectedScale(settings.pixelsPerProjectedUnit)) {
    return applyExportProjectedScale(
      settings,
      safeProjectedSize,
      settings.pixelsPerProjectedUnit,
    );
  }

  const nextHeight = clampExportDimension(
    Math.round(settings.width / exportAspectRatioFromSettings(settings)),
  );

  if (nextHeight === settings.height) {
    return settings;
  }

  return {
    ...settings,
    height: nextHeight,
  };
}

export function syncExportSettingsAspectRatio(
  settings: ExportSettingsState,
  aspectRatio: number,
): ExportSettingsState {
  return syncExportSettingsProjectedSize(settings, projectedSizeFromAspectRatio(aspectRatio));
}

export function setExportFormat(
  settings: ExportSettingsState,
  format: ExportFormat,
): ExportSettingsState {
  return {
    ...settings,
    background: normalizeExportBackgroundForFormat(format, settings.background),
    format,
  };
}

export function setExportBackground(
  settings: ExportSettingsState,
  background: ExportBackground,
): ExportSettingsState {
  return {
    ...settings,
    background: normalizeExportBackgroundForFormat(settings.format, background),
  };
}

export function isExportBackgroundAllowed(
  format: ExportFormat,
  background: ExportBackground,
): boolean {
  return format !== "jpg" || background !== "transparent";
}

export function setExportCombineComponents(
  settings: ExportSettingsState,
  combineComponents: boolean,
): ExportSettingsState {
  return {
    ...settings,
    combineComponents,
  };
}

export function setExportComponentSelected(
  settings: ExportSettingsState,
  component: ExportComponentId,
  selected: boolean,
): ExportSettingsState {
  return {
    ...settings,
    components: {
      ...settings.components,
      [component]: selected,
    },
  };
}

export function setExportLegendLayout(
  settings: ExportSettingsState,
  legendLayout: ExportLegendLayout,
): ExportSettingsState {
  return {
    ...settings,
    legendLayout,
  };
}

export function setExportMeshQuality(
  settings: ExportSettingsState,
  meshQuality: ExportMeshQuality,
): ExportSettingsState {
  return {
    ...settings,
    meshQuality,
  };
}

export function setExportSupersampling(
  settings: ExportSettingsState,
  supersampling: number,
): ExportSettingsState {
  return {
    ...settings,
    supersampling: clampExportSupersampling(supersampling),
  };
}

export function parseExportDimensionInput(value: string): number | null {
  const parsedValue = parsePositiveIntegerInput(value);
  if (parsedValue === null) {
    return null;
  }

  return clampExportDimension(parsedValue);
}

export function validateExportSettings(
  settings: ExportSettingsState,
): ExportSettingsValidation {
  if (!Object.values(settings.components).some(Boolean)) {
    return {
      valid: false,
      code: "no-components",
    };
  }

  if (
    !Number.isInteger(settings.width) ||
    !Number.isInteger(settings.height) ||
    settings.width < EXPORT_DIMENSION_MIN ||
    settings.height < EXPORT_DIMENSION_MIN ||
    settings.width > EXPORT_DIMENSION_MAX ||
    settings.height > EXPORT_DIMENSION_MAX
  ) {
    return {
      valid: false,
      code: "size-range",
      max: EXPORT_DIMENSION_MAX,
      min: EXPORT_DIMENSION_MIN,
    };
  }

  if (!EXPORT_SUPERSAMPLING_OPTIONS.includes(settings.supersampling)) {
    return {
      valid: false,
      code: "supersampling-invalid",
    };
  }

  if (!isExportBackgroundAllowed(settings.format, settings.background)) {
    return {
      valid: false,
      code: "jpg-needs-opaque-background",
    };
  }

  const renderWidth = settings.width * settings.supersampling;
  const renderHeight = settings.height * settings.supersampling;
  if (
    renderWidth > EXPORT_RENDER_DIMENSION_MAX ||
    renderHeight > EXPORT_RENDER_DIMENSION_MAX ||
    renderWidth * renderHeight > EXPORT_RENDER_PIXEL_MAX
  ) {
    return {
      valid: false,
      code: "size-too-large",
    };
  }

  return {
    valid: true,
    code: null,
  };
}

function fitExportSettingsInsideProjectedSize(
  settings: ExportSettingsState,
  projectedSize?: ExportProjectedSize,
): ExportSettingsState {
  const safeProjectedSize = normalizeExportProjectedSize(projectedSize);
  if (safeProjectedSize) {
    const pixelsPerProjectedUnit = Math.min(
      settings.width / safeProjectedSize.width,
      settings.height / safeProjectedSize.height,
    );

    return applyExportProjectedScale(
      {
        ...settings,
        pixelsPerProjectedUnit,
      },
      safeProjectedSize,
      pixelsPerProjectedUnit,
    );
  }

  return fitExportSettingsInsideAspectRatio(
    {
      ...settings,
      pixelsPerProjectedUnit: null,
    },
    exportAspectRatioFromSettings(settings),
  );
}

function fitExportSettingsInsideAspectRatio(
  settings: ExportSettingsState,
  aspectRatio: number,
): ExportSettingsState {
  const safeAspectRatio = normalizeExportAspectRatio(aspectRatio);
  const currentAspectRatio = settings.width / settings.height;

  if (currentAspectRatio > safeAspectRatio) {
    const nextWidth = clampExportDimension(Math.round(settings.height * safeAspectRatio));
    return nextWidth === settings.width
      ? settings
      : {
          ...settings,
          width: nextWidth,
        };
  }

  const nextHeight = clampExportDimension(Math.round(settings.width / safeAspectRatio));
  return nextHeight === settings.height
    ? settings
    : {
        ...settings,
        height: nextHeight,
      };
}

function applyExportProjectedScale(
  settings: ExportSettingsState,
  projectedSize: ExportProjectedSize,
  pixelsPerProjectedUnit: number,
): ExportSettingsState {
  const nextSettings = {
    ...settings,
    height: clampExportDimension(Math.round(projectedSize.height * pixelsPerProjectedUnit)),
    pixelsPerProjectedUnit,
    width: clampExportDimension(Math.round(projectedSize.width * pixelsPerProjectedUnit)),
  };

  if (nextSettings.height === settings.height && nextSettings.width === settings.width) {
    return settings.pixelsPerProjectedUnit === pixelsPerProjectedUnit
      ? settings
      : {
          ...settings,
          pixelsPerProjectedUnit,
        };
  }

  return nextSettings;
}

function clampExportDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EXPORT_SETTINGS.width;
  }

  return Math.min(EXPORT_DIMENSION_MAX, Math.max(EXPORT_DIMENSION_MIN, Math.round(value)));
}

function clampExportSupersampling(value: number): ExportSupersampling {
  const roundedValue = Math.round(value);
  if (EXPORT_SUPERSAMPLING_OPTIONS.includes(roundedValue as ExportSupersampling)) {
    return roundedValue as ExportSupersampling;
  }

  if (roundedValue <= EXPORT_SUPERSAMPLING_MIN) {
    return EXPORT_SUPERSAMPLING_MIN;
  }

  return EXPORT_SUPERSAMPLING_MAX;
}

function normalizeExportBackgroundForFormat(
  format: ExportFormat,
  background: ExportBackground,
): ExportBackground {
  return isExportBackgroundAllowed(format, background) ? background : "white";
}

function exportAspectRatioFromSettings(settings: ExportSettingsState): number {
  if (settings.width > 0 && settings.height > 0) {
    return settings.width / settings.height;
  }

  return DEFAULT_EXPORT_SETTINGS.width / DEFAULT_EXPORT_SETTINGS.height;
}

function normalizeExportAspectRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_EXPORT_SETTINGS.width / DEFAULT_EXPORT_SETTINGS.height;
  }

  return value;
}

function normalizeExportProjectedSize(
  projectedSize?: ExportProjectedSize,
): ExportProjectedSize | null {
  if (
    !projectedSize ||
    !Number.isFinite(projectedSize.width) ||
    !Number.isFinite(projectedSize.height) ||
    projectedSize.width <= 0 ||
    projectedSize.height <= 0
  ) {
    return null;
  }

  return projectedSize;
}

function hasExportProjectedScale(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

function projectedSizeFromAspectRatio(aspectRatio: number): ExportProjectedSize {
  const safeAspectRatio = normalizeExportAspectRatio(aspectRatio);
  return {
    height: 1,
    width: safeAspectRatio,
  };
}

function parsePositiveIntegerInput(value: string): number | null {
  const trimmedValue = value.trim().replace(/px$/, "").trim();
  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return Math.round(parsedValue);
}
