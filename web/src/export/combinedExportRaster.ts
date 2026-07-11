import type { SceneSpec } from "../api/scene";
import type { CameraPoseSnapshot } from "../scene/cameraPose";
import type {
  RasterExportBounds,
  RasterExportImage,
  RasterExportTextItem,
} from "../scene/exportRenderer";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
  ExportSettingsState,
  StyleState,
  StructureLineWidthState,
  UnitCellLineStyle,
} from "../model";
import {
  baseColorSchemeForStyle,
  elementColorOverridesForStyle,
} from "../model";
import { deriveElementLegendEntries } from "../app/elementLegend";
import {
  canvasToPngBlob,
  canvasToRasterBlob,
  exportTextColor,
  fillCanvasBackground,
  rasterFormatForExportFormat,
} from "./rasterCanvas";
import {
  legendExportStyle,
  renderLegendCanvas,
} from "./legendExport";
import { renderExportRaster } from "./structureRasterExport";
import {
  CRYSTAL_AXIS_LABEL_HALO_COLOR,
  crystalAxisExportSize,
} from "./crystalAxesExport";

const EXPORT_ACCESSORY_PADDING_RATIO = 0.08;

interface CombinedExportRasterOptions {
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  lightStrength: number;
  scene: SceneSpec;
  settings: ExportSettingsState;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  structureLineWidth: StructureLineWidthState;
  unitCellLineStyle: UnitCellLineStyle;
  visibleScene: SceneSpec | null;
}

interface CombinedExportLayer {
  image: RasterExportImage;
  textItems: RasterExportTextItem[];
  x: number;
  y: number;
}

export async function renderCombinedExportRaster({
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
}: CombinedExportRasterOptions): Promise<RasterExportImage> {
  const layers: CombinedExportLayer[] = [];
  let structureBounds: RasterExportBounds = fullLayerBounds(settings.width, settings.height);

  if (settings.components.structure) {
    if (!visibleScene) {
      throw new Error("No structure is available to export.");
    }

    const structureImage = await renderExportRaster({
      cameraPose,
      componentOpacity,
      componentVisibility,
      lightStrength,
      settings,
      style,
      structureLineWidth,
      unitCellLineStyle,
      visibleScene,
    });
    structureBounds = structureImage.contentBounds ?? structureBounds;
    layers.push({
      image: structureImage,
      textItems: [],
      x: 0,
      y: 0,
    });
  }

  const accessoryReferenceSize = exportAccessoryReferenceSizeFromBounds(structureBounds);
  const accessoryPadding = Math.round(accessoryReferenceSize * EXPORT_ACCESSORY_PADDING_RATIO);

  if (settings.components.legend) {
    const colorScheme = baseColorSchemeForStyle(style);
    const elementColorOverrides = elementColorOverridesForStyle(scene.atoms, style);
    const renderedLegend = renderLegendCanvas({
      background: "transparent",
      entries: deriveElementLegendEntries(scene, colorScheme, elementColorOverrides),
      includeText: settings.format !== "pdf",
      layout: settings.legendLayout,
      style: legendExportStyle(settings, accessoryReferenceSize),
      supersampling: settings.supersampling,
      textBackground: settings.background,
    });
    const position = combinedLegendPosition(
      settings.legendLayout,
      structureBounds,
      renderedLegend.canvas.width,
      renderedLegend.canvas.height,
      accessoryPadding,
    );
    layers.push({
      image: {
        blob: await canvasToPngBlob(renderedLegend.canvas),
        height: renderedLegend.canvas.height,
        width: renderedLegend.canvas.width,
      },
      textItems: settings.format === "pdf" ? renderedLegend.textItems : [],
      x: position.x,
      y: position.y,
    });
  }

  if (settings.components.crystalAxes) {
    const { renderCrystalAxesRasterImage } = await import("../scene/exportRenderer");
    const crystalAxesImage = await renderCrystalAxesRasterImage({
      backgroundColor: null,
      cameraPose,
      cellVectors: scene.cell.vectors,
      imageFormat: "png",
      includeLabelTextItems: settings.format === "pdf" && showCrystalAxisLabels,
      labelColor: exportTextColor(settings.background),
      labelHaloColor: CRYSTAL_AXIS_LABEL_HALO_COLOR,
      showLabelHalo:
        settings.format !== "pdf" &&
        settings.background !== "black" &&
        showCrystalAxisLabels,
      showLabels: settings.format !== "pdf" && showCrystalAxisLabels,
      size: crystalAxisExportSize(settings, accessoryReferenceSize),
      supersampling: settings.supersampling,
    });
    const position = combinedCrystalAxesPosition(
      structureBounds,
      crystalAxesImage.width,
      crystalAxesImage.height,
      accessoryPadding,
    );
    layers.push({
      image: crystalAxesImage,
      textItems: settings.format === "pdf" ? crystalAxesImage.textItems ?? [] : [],
      x: position.x,
      y: position.y,
    });
  }

  const outputBounds = combinedLayerBounds(layers, settings.width, settings.height);
  const canvas = document.createElement("canvas");
  canvas.width = outputBounds.width;
  canvas.height = outputBounds.height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the combined export canvas.");
  }

  fillCanvasBackground(context, outputBounds.width, outputBounds.height, settings.background);
  const textItems: RasterExportTextItem[] = [];
  const shiftX = -outputBounds.minX;
  const shiftY = -outputBounds.minY;
  for (const layer of layers) {
    const x = layer.x + shiftX;
    const y = layer.y + shiftY;
    await drawRasterExportImage(context, layer.image, x, y);
    textItems.push(...offsetTextItems(layer.textItems, x, y));
  }

  const blob =
    settings.format === "pdf"
      ? await canvasToPngBlob(canvas)
      : await canvasToRasterBlob(canvas, rasterFormatForExportFormat(settings.format));
  return {
    blob,
    height: outputBounds.height,
    textItems,
    width: outputBounds.width,
  };
}

function exportAccessoryReferenceSizeFromBounds(bounds: RasterExportBounds): number {
  return Math.sqrt(bounds.width * bounds.height);
}

function combinedLegendPosition(
  legendLayout: "horizontal" | "vertical",
  structureBounds: RasterExportBounds,
  layerWidth: number,
  layerHeight: number,
  padding: number,
) {
  const centerY = (structureBounds.minY + structureBounds.maxY) / 2;
  if (legendLayout === "vertical") {
    return {
      x: structureBounds.maxX + padding,
      y: Math.round(centerY - layerHeight / 2),
    };
  }

  const centerX = (structureBounds.minX + structureBounds.maxX) / 2;
  return {
    x: Math.round(centerX - layerWidth / 2),
    y: structureBounds.maxY + padding,
  };
}

function combinedCrystalAxesPosition(
  structureBounds: RasterExportBounds,
  layerWidth: number,
  layerHeight: number,
  padding: number,
) {
  return {
    x: structureBounds.minX - layerWidth - padding,
    y: structureBounds.maxY - layerHeight,
  };
}

function fullLayerBounds(width: number, height: number): RasterExportBounds {
  return {
    height,
    maxX: width,
    maxY: height,
    minX: 0,
    minY: 0,
    width,
  };
}

export function combinedLayerBounds(
  layers: CombinedExportLayer[],
  baseWidth: number,
  baseHeight: number,
) {
  const bounds = layers.reduce(
    (current, layer) => ({
      maxX: Math.max(current.maxX, layer.x + layer.image.width),
      maxY: Math.max(current.maxY, layer.y + layer.image.height),
      minX: Math.min(current.minX, layer.x),
      minY: Math.min(current.minY, layer.y),
    }),
    {
      maxX: baseWidth,
      maxY: baseHeight,
      minX: 0,
      minY: 0,
    },
  );
  const minX = Math.floor(bounds.minX);
  const minY = Math.floor(bounds.minY);
  const maxX = Math.ceil(bounds.maxX);
  const maxY = Math.ceil(bounds.maxY);
  return {
    height: Math.max(1, maxY - minY),
    maxX,
    maxY,
    minX,
    minY,
    width: Math.max(1, maxX - minX),
  };
}

export function offsetTextItems(
  textItems: RasterExportTextItem[],
  offsetX: number,
  offsetY: number,
): RasterExportTextItem[] {
  return textItems.map((item) => ({
    ...item,
    x: item.x + offsetX,
    y: item.y + offsetY,
  }));
}

async function drawRasterExportImage(
  context: CanvasRenderingContext2D,
  image: RasterExportImage,
  x: number,
  y: number,
) {
  const bitmap = await createImageBitmap(image.blob);
  try {
    context.drawImage(bitmap, x, y, image.width, image.height);
  } finally {
    bitmap.close();
  }
}
