import type { PDFDocument, PDFFont } from "pdf-lib";

import type { SceneSpec } from "../api/scene";
import { deriveElementLegendEntries, type ElementLegendEntry } from "./elementLegend";
import { createCameraPoseSnapshot, type CameraPoseSnapshot } from "../scene/cameraPose";
import type {
  RasterExportBounds,
  RasterExportImage,
  RasterExportTextItem,
} from "../scene/exportRenderer";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
  AtomRenderingMode,
  BondRenderingMode,
  ExportBackground,
  ExportFormat,
  ExportSettingsState,
  ExportSupersampling,
  StyleState,
  UnitCellLineStyle,
} from "./settings";
import {
  EXPORT_RENDER_DIMENSION_MAX,
  EXPORT_RENDER_PIXEL_MAX,
  validateExportSettings,
  visibleSceneForComponents,
} from "./settings";
import type { CameraOrientationRef } from "../scene/LatticeScene";

export interface CreateFigureExportOptions {
  cameraOrientationRef: CameraOrientationRef;
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  fileName: string | null;
  lightStrength: number;
  scene: SceneSpec;
  settings: ExportSettingsState;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
}

export interface FigureExportFile {
  blob: Blob;
  fileName: string;
  format: ExportFormat;
}

const LEGEND_FONT_FAMILY = "Geist, Helvetica Neue, Arial, sans-serif";
const GEIST_PDF_REGULAR_FONT_URL = new URL("../assets/fonts/Geist-Regular.ttf", import.meta.url).href;
const GEIST_PDF_ITALIC_FONT_URL = new URL("../assets/fonts/Geist-MediumItalic.ttf", import.meta.url).href;
type RasterExportFileFormat = Exclude<ExportFormat, "pdf">;
interface LegendExportStyle {
  fontSize: number;
  horizontalGap: number;
  paddingX: number;
  paddingY: number;
  rowGap: number;
  swatchSize: number;
  textGap: number;
}

const LEGEND_EXPORT_FONT_RATIO = 0.045;
const LEGEND_SWATCH_STROKE_RATIO = 0.1;
const CRYSTAL_AXIS_EXPORT_SIZE_RATIO = 1;
const EXPORT_ACCESSORY_PADDING_RATIO = 0.08;
const EXPORT_ACCESSORY_LONG_SIDE_WEIGHT = 0.25;
const JPG_EXPORT_QUALITY = 0.95;
const EXPORT_BACKGROUND_COLORS: Record<Exclude<ExportBackground, "transparent">, string> = {
  black: "#111111",
  white: "#ffffff",
};
const DARK_BACKGROUND_TEXT_COLOR = "#eeeeee";
const LIGHT_BACKGROUND_TEXT_COLOR = "#202020";
const DARK_BACKGROUND_TEXT_HALO_COLOR = "#111111";
const LIGHT_BACKGROUND_TEXT_HALO_COLOR = "#fafafa";
const CRYSTAL_AXIS_LABEL_HALO_COLOR = "#ffffff";
const DARK_BACKGROUND_UNIT_CELL_LINE_COLOR = "#bbbbbb";

interface CombinedExportRasterOptions {
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  lightStrength: number;
  scene: SceneSpec;
  settings: ExportSettingsState;
  showCrystalAxisLabels: boolean;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
  visibleScene: SceneSpec | null;
}

interface CombinedExportLayer {
  image: RasterExportImage;
  textItems: RasterExportTextItem[];
  x: number;
  y: number;
}

export async function createFigureExportFiles({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile[]> {
  const validation = validateExportSettings(settings);
  if (!validation.valid) {
    throw new Error(validation.message ?? "Export settings are invalid.");
  }

  if (settings.combineComponents) {
    return [
      await createCombinedExportFile({
        cameraOrientationRef,
        atomRenderingMode,
        bondRenderingMode,
        componentOpacity,
        componentVisibility,
        fileName,
        lightStrength,
        scene,
        settings,
        showCrystalAxisLabels,
        style,
        unitCellLineStyle,
      }),
    ];
  }

  const files: FigureExportFile[] = [];
  const stem = exportFileStem(fileName);

  if (settings.components.structure) {
    files.push(
      await createStructureExportFile({
        cameraOrientationRef,
        atomRenderingMode,
        bondRenderingMode,
        componentOpacity,
        componentVisibility,
        fileName,
        lightStrength,
        scene,
        settings,
        showCrystalAxisLabels,
        style,
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
        size: crystalAxisExportSize(settings),
        supersampling: settings.supersampling,
      }),
    );
  }

  if (settings.components.legend) {
    files.push(
      await createLegendExportFile({
        entries: deriveElementLegendEntries(scene, style.colorScheme),
        fileName: `${stem}-legend.${settings.format}`,
        format: settings.format,
        background: settings.background,
        layout: settings.legendLayout,
        style: legendExportStyle(settings),
        supersampling: settings.supersampling,
      }),
    );
  }

  return files;
}

async function createCombinedExportFile({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile> {
  const visibleScene = visibleSceneForComponents(scene, componentVisibility);
  const cameraPose = createCameraPoseSnapshot(cameraOrientationRef.current);
  const rasterImage = await renderCombinedExportRaster({
    atomRenderingMode,
    bondRenderingMode,
    cameraPose,
    componentOpacity,
    componentVisibility,
    lightStrength,
    scene,
    settings,
    showCrystalAxisLabels,
    style,
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

export async function createFigureExportFile({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  componentVisibility,
  fileName,
  lightStrength,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
  unitCellLineStyle,
}: CreateFigureExportOptions): Promise<FigureExportFile> {
  return createStructureExportFile({
    cameraOrientationRef,
    atomRenderingMode,
    bondRenderingMode,
    componentOpacity,
    componentVisibility,
    fileName,
    lightStrength,
    scene,
    settings,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
  });
}

async function createStructureExportFile({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
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

  const visibleScene = visibleSceneForComponents(scene, componentVisibility);
  if (!visibleScene) {
    throw new Error("No structure is available to export.");
  }

  const cameraPose = createCameraPoseSnapshot(cameraOrientationRef.current);
  const rasterImage = await renderExportRaster({
    atomRenderingMode,
    bondRenderingMode,
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

export async function downloadFigureExportZip(files: FigureExportFile[], sourceFileName: string | null) {
  if (files.length === 0) {
    throw new Error("No export files were generated.");
  }

  const stem = exportFileStem(sourceFileName);
  const zipBlob = await createFigureExportZipBlob(files, stem);
  downloadBlob(zipBlob, `${stem}.zip`);
}

export async function downloadFigureExportFiles(files: FigureExportFile[], sourceFileName: string | null) {
  if (files.length === 0) {
    throw new Error("No export files were generated.");
  }

  if (files.length === 1) {
    const file = files[0]!;
    downloadBlob(file.blob, file.fileName);
    return;
  }

  await downloadFigureExportZip(files, sourceFileName);
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function createLegendExportFile({
  background,
  entries,
  fileName,
  format,
  layout,
  style,
  supersampling,
}: {
  background: ExportBackground;
  entries: ElementLegendEntry[];
  fileName: string;
  format: ExportFormat;
  layout: "horizontal" | "vertical";
  style: LegendExportStyle;
  supersampling: number;
}): Promise<FigureExportFile> {
  const renderedLegend = renderLegendCanvas({
    background,
    entries,
    includeText: format !== "pdf",
    layout,
    style,
    supersampling,
  });

  if (format === "pdf") {
    return {
      blob: await encodeRasterTextPdf(
        {
          blob: await canvasToPngBlob(renderedLegend.canvas),
          height: renderedLegend.canvas.height,
          textItems: renderedLegend.textItems,
          width: renderedLegend.canvas.width,
        },
        { background, halo: false },
      ),
      fileName,
      format,
    };
  }

  return {
    blob: await canvasToRasterBlob(renderedLegend.canvas, rasterFormatForExportFormat(format)),
    fileName,
    format,
  };
}

function renderLegendCanvas({
  background,
  entries,
  includeText,
  layout,
  style,
  supersampling,
  textBackground = background,
}: {
  background: ExportBackground;
  entries: ElementLegendEntry[];
  includeText: boolean;
  layout: "horizontal" | "vertical";
  style: LegendExportStyle;
  supersampling: number;
  textBackground?: ExportBackground;
}) {
  const metrics = measureLegend(entries, layout, style);
  const outputWidth = Math.max(1, metrics.width);
  const outputHeight = Math.max(1, metrics.height);
  const renderWidth = outputWidth * supersampling;
  const renderHeight = outputHeight * supersampling;
  assertExportCanvasSize(renderWidth, renderHeight, "legend");
  const canvas = document.createElement("canvas");
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the legend export canvas.");
  }

  context.scale(supersampling, supersampling);
  fillCanvasBackground(context, metrics.width, metrics.height, background);
  context.font = legendFont(style);
  context.textBaseline = "middle";
  context.fillStyle = exportTextColor(textBackground);

  const textItems: RasterExportTextItem[] = [];
  for (const item of metrics.items) {
    drawLegendSwatch(context, item.entry.color, item.x, item.y, style.swatchSize, background);
    const textX = item.x + style.swatchSize + style.textGap;
    const textY = item.y + style.swatchSize / 2;
    textItems.push({
      fontStyle: "normal",
      fontWeight: 400,
      label: item.entry.element,
      size: style.fontSize,
      x: textX,
      y: textY,
    });

    if (includeText) {
      context.fillStyle = exportTextColor(textBackground);
      context.fillText(item.entry.element, textX, textY);
    }
  }

  return {
    canvas: supersampling === 1 ? canvas : downsampleCanvas(canvas, outputWidth, outputHeight),
    textItems,
  };
}

function measureLegend(
  entries: ElementLegendEntry[],
  layout: "horizontal" | "vertical",
  style: LegendExportStyle,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not measure the legend export.");
  }

  context.font = legendFont(style);
  const itemSizes = entries.map((entry) => ({
    entry,
    width:
      style.swatchSize +
      style.textGap +
      Math.ceil(context.measureText(entry.element).width),
  }));
  const itemHeight = Math.max(style.swatchSize, style.fontSize);

  if (layout === "vertical") {
    const maxItemWidth = Math.max(1, ...itemSizes.map((item) => item.width));
    return {
      height:
        style.paddingY * 2 +
        itemSizes.length * itemHeight +
        Math.max(0, itemSizes.length - 1) * style.rowGap,
      items: itemSizes.map(({ entry }, index) => ({
        entry,
        x: style.paddingX,
        y: style.paddingY + index * (itemHeight + style.rowGap),
      })),
      width: style.paddingX * 2 + maxItemWidth,
    };
  }

  let x = style.paddingX;
  const items = itemSizes.map(({ entry, width }) => {
    const item = {
      entry,
      x,
      y: style.paddingY,
    };
    x += width + style.horizontalGap;
    return item;
  });
  return {
    height: style.paddingY * 2 + itemHeight,
    items,
    width: Math.max(1, x - style.horizontalGap + style.paddingX),
  };
}

function legendFont(style: LegendExportStyle) {
  return `400 ${style.fontSize}px ${LEGEND_FONT_FAMILY}`;
}

function legendExportStyle(
  settings: ExportSettingsState,
  referenceSize = exportAccessoryReferenceSize(settings),
): LegendExportStyle {
  const reference = referenceSize;
  const fontSize = Math.round(reference * LEGEND_EXPORT_FONT_RATIO);

  return {
    fontSize,
    horizontalGap: Math.round(fontSize * 1.05),
    paddingX: Math.round(fontSize * 0.15),
    paddingY: Math.round(fontSize * 0.15),
    rowGap: Math.round(fontSize * 0.85),
    swatchSize: Math.round(fontSize * 0.95),
    textGap: Math.round(fontSize * 0.45),
  };
}

function crystalAxisExportSize(
  settings: ExportSettingsState,
  referenceSize = exportAccessoryReferenceSize(settings),
): number {
  return Math.round(referenceSize * CRYSTAL_AXIS_EXPORT_SIZE_RATIO);
}

function exportAccessoryReferenceSize(settings: ExportSettingsState): number {
  const shortSide = Math.min(settings.width, settings.height);
  const longSide = Math.max(settings.width, settings.height);
  return (
    shortSide ** (1 - EXPORT_ACCESSORY_LONG_SIDE_WEIGHT) *
    longSide ** EXPORT_ACCESSORY_LONG_SIDE_WEIGHT
  );
}

function exportAccessoryReferenceSizeFromBounds(bounds: RasterExportBounds): number {
  return Math.sqrt(bounds.width * bounds.height);
}

function assertExportCanvasSize(width: number, height: number, label: string) {
  if (
    width > EXPORT_RENDER_DIMENSION_MAX ||
    height > EXPORT_RENDER_DIMENSION_MAX ||
    width * height > EXPORT_RENDER_PIXEL_MAX
  ) {
    throw new Error(
      `The ${label} export is too large to render. Reduce the export size or supersampling.`,
    );
  }
}

function drawLegendSwatch(
  context: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  size: number,
  _background: ExportBackground,
) {
  const radius = size / 2;
  const centerX = x + radius;
  const centerY = y + radius;
  const highlight = context.createLinearGradient(
    x + size,
    y,
    x,
    y + size,
  );
  highlight.addColorStop(0, "rgba(255, 255, 255, 0.38)");
  highlight.addColorStop(0.14, "rgba(255, 255, 255, 0.38)");
  highlight.addColorStop(0.42, "rgba(255, 255, 255, 0)");

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
  context.fillStyle = highlight;
  context.fill();
  context.strokeStyle = "rgba(0, 0, 0, 0.1)";
  context.lineWidth = size * LEGEND_SWATCH_STROKE_RATIO;
  context.stroke();
  context.restore();
}

async function createCrystalAxesExportFile({
  background,
  cameraPose,
  fileName,
  format,
  scene,
  showCrystalAxisLabels,
  size,
  supersampling,
}: {
  background: ExportBackground;
  cameraPose: CameraPoseSnapshot;
  fileName: string;
  format: ExportFormat;
  scene: SceneSpec;
  showCrystalAxisLabels: boolean;
  size: number;
  supersampling: ExportSupersampling;
}): Promise<FigureExportFile> {
  const { renderCrystalAxesRasterImage } = await import("../scene/exportRenderer");
  const rasterImage = await renderCrystalAxesRasterImage({
    backgroundColor: exportBackgroundColor(background),
    cameraPose,
    cellVectors: scene.cell.vectors,
    imageFormat: rasterFormatForExportFormat(format),
    includeLabelTextItems: format === "pdf" && showCrystalAxisLabels,
    labelColor: exportTextColor(background),
    labelHaloColor: CRYSTAL_AXIS_LABEL_HALO_COLOR,
    showLabelHalo: format !== "pdf" && background !== "black" && showCrystalAxisLabels,
    showLabels: format !== "pdf" && showCrystalAxisLabels,
    size,
    supersampling,
  });

  if (format === "pdf") {
    return {
      blob: await encodeRasterTextPdf(rasterImage, { background, halo: false }),
      fileName,
      format,
    };
  }

  return {
    blob: rasterImage.blob,
    fileName,
    format,
  };
}

async function encodeRasterTextPdf(
  rasterImage: RasterExportImage,
  options: { background: ExportBackground; halo: boolean },
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([rasterImage.width, rasterImage.height]);
  const imageBytes = new Uint8Array(await rasterImage.blob.arrayBuffer());
  const image = await pdf.embedPng(imageBytes);
  const { regularFont, italicFont } = await embedPdfTextFonts(pdf, StandardFonts);
  const textColor = rgb(...hexColorToRgbComponents(exportTextColor(options.background)));
  const textHaloColor = rgb(...hexColorToRgbComponents(exportTextHaloColor(options.background)));

  page.drawImage(image, {
    height: rasterImage.height,
    width: rasterImage.width,
    x: 0,
    y: 0,
  });

  for (const item of rasterImage.textItems ?? []) {
    const font = item.fontStyle === "italic" ? italicFont : regularFont;
    const width = font.widthOfTextAtSize(item.label, item.size);
    const x = item.fontStyle === "italic" ? item.x - width / 2 : item.x;
    const y = rasterImage.height - item.y - item.size * 0.36;

    if (options.halo) {
      const haloOffset = Math.max(0.75, item.size / 96);
      for (const [offsetX, offsetY] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        page.drawText(item.label, {
          color: textHaloColor,
          font,
          size: item.size,
          x: x + offsetX * haloOffset,
          y: y + offsetY * haloOffset,
        });
      }
    }

    page.drawText(item.label, {
      color: textColor,
      font,
      size: item.size,
      x,
      y,
    });
  }

  const pdfBytes = await pdf.save();
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

async function embedPdfTextFonts(
  pdf: PDFDocument,
  standardFonts: typeof import("pdf-lib").StandardFonts,
): Promise<{ regularFont: PDFFont; italicFont: PDFFont }> {
  type PdfFontkit = Parameters<PDFDocument["registerFontkit"]>[0];
  type PdfFontkitModule = typeof import("@pdf-lib/fontkit") & { default?: PdfFontkit };
  const fallbackFonts = async () => ({
    italicFont: await pdf.embedFont(standardFonts.HelveticaOblique),
    regularFont: await pdf.embedFont(standardFonts.Helvetica),
  });

  try {
    const fontkitModule = (await import("@pdf-lib/fontkit")) as PdfFontkitModule;
    const fontkit = fontkitModule.default ?? fontkitModule;
    pdf.registerFontkit(fontkit);
    const [regularFontBytes, italicFontBytes] = await Promise.all([
      fetchFontBytes(GEIST_PDF_REGULAR_FONT_URL),
      fetchFontBytes(GEIST_PDF_ITALIC_FONT_URL),
    ]);

    return {
      italicFont: await pdf.embedFont(italicFontBytes),
      regularFont: await pdf.embedFont(regularFontBytes),
    };
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("Falling back to PDF standard fonts because Geist embedding failed.", error);
    }
    return fallbackFonts();
  }
}

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load PDF font asset: ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function canvasToRasterBlob(
  canvas: HTMLCanvasElement,
  format: RasterExportFileFormat,
): Promise<Blob> {
  return format === "jpg" ? canvasToJpgBlob(canvas) : canvasToPngBlob(canvas);
}

function downsampleCanvas(sourceCanvas: HTMLCanvasElement, width: number, height: number) {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const context = outputCanvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the legend export downsampling canvas.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return outputCanvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not encode the exported PNG image."));
        return;
      }

      resolve(blob);
    }, "image/png");
  });
}

function canvasToJpgBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const context = outputCanvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the exported JPG image.");
  }

  context.fillStyle = EXPORT_BACKGROUND_COLORS.white;
  context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  context.drawImage(canvas, 0, 0);

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode the exported JPG image."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      JPG_EXPORT_QUALITY,
    );
  });
}

interface ZipEntryData {
  data: Uint8Array;
  path: string;
}

export async function createFigureExportZipBlob(
  files: FigureExportFile[],
  folderName: string,
): Promise<Blob> {
  const entries: ZipEntryData[] = [];
  for (const file of files) {
    entries.push({
      data: new Uint8Array(await file.blob.arrayBuffer()),
      path: `${folderName}/${file.fileName}`,
    });
  }

  return createZipBlob(entries);
}

export async function createZipBlob(entries: ZipEntryData[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const fileName = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const localHeader = zipLocalFileHeader(fileName, entry.data.byteLength, crc);
    const centralHeader = zipCentralDirectoryHeader(
      fileName,
      entry.data.byteLength,
      crc,
      offset,
    );

    localParts.push(localHeader, entry.data);
    centralParts.push(centralHeader);
    offset += localHeader.byteLength + entry.data.byteLength;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.byteLength, 0);
  const endRecord = zipEndOfCentralDirectoryRecord(
    entries.length,
    centralDirectorySize,
    centralDirectoryOffset,
  );

  const parts = [...localParts, ...centralParts, endRecord].map(uint8ArrayBlobPart);
  return new Blob(parts, {
    type: "application/zip",
  });
}

function uint8ArrayBlobPart(value: Uint8Array): BlobPart {
  return value as BlobPart;
}

function zipLocalFileHeader(fileName: Uint8Array, size: number, crc: number): Uint8Array {
  const header = new Uint8Array(30 + fileName.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, fileName.byteLength, true);
  view.setUint16(28, 0, true);
  header.set(fileName, 30);
  return header;
}

function zipCentralDirectoryHeader(
  fileName: Uint8Array,
  size: number,
  crc: number,
  localHeaderOffset: number,
): Uint8Array {
  const header = new Uint8Array(46 + fileName.byteLength);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, fileName.byteLength, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, localHeaderOffset, true);
  header.set(fileName, 46);
  return header;
}

function zipEndOfCentralDirectoryRecord(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
): Uint8Array {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);
  return record;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  }),
);

async function renderExportRaster({
  atomRenderingMode,
  bondRenderingMode,
  cameraPose,
  componentOpacity,
  componentVisibility,
  lightStrength,
  settings,
  style,
  unitCellLineStyle,
  visibleScene,
}: {
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
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

  return renderStructureRasterImage({
    atomRenderingMode,
    bondRenderingMode,
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

async function renderCombinedExportRaster({
  atomRenderingMode,
  bondRenderingMode,
  cameraPose,
  componentOpacity,
  componentVisibility,
  lightStrength,
  scene,
  settings,
  showCrystalAxisLabels,
  style,
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
      atomRenderingMode,
      bondRenderingMode,
      cameraPose,
      componentOpacity,
      componentVisibility,
      lightStrength,
      settings,
      style,
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
    const renderedLegend = renderLegendCanvas({
      background: "transparent",
      entries: deriveElementLegendEntries(scene, style.colorScheme),
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

function combinedLayerBounds(
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

function offsetTextItems(
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

async function encodeRasterPdf(rasterImage: RasterExportImage): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([rasterImage.width, rasterImage.height]);
  const imageBytes = new Uint8Array(await rasterImage.blob.arrayBuffer());
  const image = await pdf.embedPng(imageBytes);

  page.drawImage(image, {
    height: rasterImage.height,
    width: rasterImage.width,
    x: 0,
    y: 0,
  });

  const pdfBytes = await pdf.save();
  const pdfBuffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

function exportFileStem(fileName: string | null): string {
  const sourceName = fileName?.trim() || "pretty-lattice";
  const stem = sourceName
    .replace(/\.[^./\\]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return stem || "pretty-lattice";
}

function rasterFormatForExportFormat(format: ExportFormat): RasterExportFileFormat {
  return format === "jpg" ? "jpg" : "png";
}

function exportBackgroundColor(background: ExportBackground): string | null {
  return background === "transparent" ? null : EXPORT_BACKGROUND_COLORS[background];
}

function fillCanvasBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: ExportBackground,
) {
  const backgroundColor = exportBackgroundColor(background);
  if (!backgroundColor) {
    context.clearRect(0, 0, width, height);
    return;
  }

  context.fillStyle = backgroundColor;
  context.fillRect(0, 0, width, height);
}

function exportTextColor(background: ExportBackground): string {
  return background === "black" ? DARK_BACKGROUND_TEXT_COLOR : LIGHT_BACKGROUND_TEXT_COLOR;
}

function exportTextHaloColor(background: ExportBackground): string {
  return background === "black" ? DARK_BACKGROUND_TEXT_HALO_COLOR : LIGHT_BACKGROUND_TEXT_HALO_COLOR;
}

function hexColorToRgbComponents(color: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) {
    return [0, 0, 0];
  }

  const value = match[1] ?? "000000";
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
  ];
}
