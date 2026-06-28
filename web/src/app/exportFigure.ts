import type { SceneSpec } from "../api/scene";
import { deriveElementLegendEntries, type ElementLegendEntry } from "./elementLegend";
import { createCameraPoseSnapshot, type CameraPoseSnapshot } from "../scene/cameraPose";
import type { RasterExportImage, RasterExportTextItem } from "../scene/exportRenderer";
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
  scene: SceneSpec;
  settings: ExportSettingsState;
  style: StyleState;
}

export interface FigureExportFile {
  blob: Blob;
  fileName: string;
  format: ExportFormat;
}

const LEGEND_FONT_FAMILY = "Geist, Helvetica Neue, Arial, sans-serif";
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
const LATTICE_VECTOR_EXPORT_SIZE_RATIO = 0.5;
const JPG_EXPORT_QUALITY = 0.95;
const EXPORT_BACKGROUND_COLORS: Record<Exclude<ExportBackground, "transparent">, string> = {
  black: "#111111",
  white: "#ffffff",
};
const DARK_BACKGROUND_TEXT_COLOR = "#eeeeee";
const LIGHT_BACKGROUND_TEXT_COLOR = "#202020";
const DARK_BACKGROUND_TEXT_HALO_COLOR = "#111111";
const LIGHT_BACKGROUND_TEXT_HALO_COLOR = "#fafafa";
const DARK_BACKGROUND_UNIT_CELL_LINE_COLOR = "#bbbbbb";

export async function createFigureExportFiles({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  componentVisibility,
  fileName,
  scene,
  settings,
  style,
}: CreateFigureExportOptions): Promise<FigureExportFile[]> {
  const validation = validateExportSettings(settings);
  if (!validation.valid) {
    throw new Error(validation.message ?? "Export settings are invalid.");
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
        scene,
        settings,
        style,
      }),
    );
  }

  if (settings.components.latticeVectors) {
    files.push(
      await createLatticeVectorsExportFile({
        cameraPose: createCameraPoseSnapshot(cameraOrientationRef.current),
        fileName: `${stem}-latt-vec.${settings.format}`,
        format: settings.format,
        background: settings.background,
        scene,
        size: latticeVectorExportSize(settings),
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

export async function createFigureExportFile({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  componentVisibility,
  fileName,
  scene,
  settings,
  style,
}: CreateFigureExportOptions): Promise<FigureExportFile> {
  return createStructureExportFile({
    cameraOrientationRef,
    atomRenderingMode,
    bondRenderingMode,
    componentOpacity,
    componentVisibility,
    fileName,
    scene,
    settings,
    style,
  });
}

async function createStructureExportFile({
  cameraOrientationRef,
  atomRenderingMode,
  bondRenderingMode,
  componentOpacity,
  componentVisibility,
  fileName,
  scene,
  settings,
  style,
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
    settings,
    style,
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
}: {
  background: ExportBackground;
  entries: ElementLegendEntry[];
  includeText: boolean;
  layout: "horizontal" | "vertical";
  style: LegendExportStyle;
  supersampling: number;
}) {
  const metrics = measureLegend(entries, layout, style);
  const canvasWidth = Math.max(1, metrics.width * supersampling);
  const canvasHeight = Math.max(1, metrics.height * supersampling);
  assertExportCanvasSize(canvasWidth, canvasHeight, "legend");
  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the legend export canvas.");
  }

  context.scale(supersampling, supersampling);
  fillCanvasBackground(context, metrics.width, metrics.height, background);
  context.font = legendFont(style);
  context.textBaseline = "middle";
  context.fillStyle = exportTextColor(background);

  const textItems: RasterExportTextItem[] = [];
  for (const item of metrics.items) {
    drawLegendSwatch(context, item.entry.color, item.x, item.y, style.swatchSize, background);
    const textX = item.x + style.swatchSize + style.textGap;
    const textY = item.y + style.swatchSize / 2;
    textItems.push({
      fontStyle: "normal",
      fontWeight: 400,
      label: item.entry.element,
      size: style.fontSize * supersampling,
      x: textX * supersampling,
      y: textY * supersampling,
    });

    if (includeText) {
      context.fillStyle = exportTextColor(background);
      context.fillText(item.entry.element, textX, textY);
    }
  }

  return {
    canvas,
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

function legendExportStyle(settings: ExportSettingsState): LegendExportStyle {
  const reference = Math.min(settings.width, settings.height);
  const fontSize = Math.round(reference * LEGEND_EXPORT_FONT_RATIO);

  return {
    fontSize,
    horizontalGap: Math.round(fontSize * 1.05),
    paddingX: Math.round(fontSize * 0.15),
    paddingY: Math.round(fontSize * 0.15),
    rowGap: Math.round(fontSize * 0.6),
    swatchSize: Math.round(fontSize * 0.95),
    textGap: Math.round(fontSize * 0.45),
  };
}

function latticeVectorExportSize(settings: ExportSettingsState): number {
  return Math.round(Math.min(settings.width, settings.height) * LATTICE_VECTOR_EXPORT_SIZE_RATIO);
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
  background: ExportBackground,
) {
  const radius = size / 2;
  const centerX = x + radius;
  const centerY = y + radius;
  const gradient = context.createRadialGradient(
    centerX - radius * 0.32,
    centerY - radius * 0.36,
    radius * 0.1,
    centerX,
    centerY,
    radius,
  );
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.34, color);
  gradient.addColorStop(1, shadeHexColor(color, 0.78));

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = background === "black" ? "rgba(255, 255, 255, 0.28)" : "rgba(0, 0, 0, 0.12)";
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

async function createLatticeVectorsExportFile({
  background,
  cameraPose,
  fileName,
  format,
  scene,
  size,
  supersampling,
}: {
  background: ExportBackground;
  cameraPose: CameraPoseSnapshot;
  fileName: string;
  format: ExportFormat;
  scene: SceneSpec;
  size: number;
  supersampling: ExportSupersampling;
}): Promise<FigureExportFile> {
  const { renderLatticeVectorsRasterImage } = await import("../scene/exportRenderer");
  const rasterImage = await renderLatticeVectorsRasterImage({
    backgroundColor: exportBackgroundColor(background),
    cameraPose,
    cellVectors: scene.cell.vectors,
    imageFormat: rasterFormatForExportFormat(format),
    showLabels: format !== "pdf",
    size,
    supersampling,
  });

  if (format === "pdf") {
    return {
      blob: await encodeRasterTextPdf(rasterImage, { background, halo: true }),
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
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);
  const italicFont = await pdf.embedFont(StandardFonts.HelveticaOblique);
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

function canvasToRasterBlob(
  canvas: HTMLCanvasElement,
  format: RasterExportFileFormat,
): Promise<Blob> {
  return format === "jpg" ? canvasToJpgBlob(canvas) : canvasToPngBlob(canvas);
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

function shadeHexColor(color: string, factor: number): string {
  const normalized = color.trim();
  const match = /^#?([0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return color;
  }

  const value = match[1] ?? "";
  const red = Math.round(Number.parseInt(value.slice(0, 2), 16) * factor);
  const green = Math.round(Number.parseInt(value.slice(2, 4), 16) * factor);
  const blue = Math.round(Number.parseInt(value.slice(4, 6), 16) * factor);
  return `#${hexByte(red)}${hexByte(green)}${hexByte(blue)}`;
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0");
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
  settings,
  style,
  visibleScene,
}: {
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  settings: ExportSettingsState;
  style: StyleState;
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
    meshQuality: settings.meshQuality,
    scene: visibleScene,
    showAtoms: componentVisibility.atoms,
    showUnitCell: componentVisibility.unitCell,
    style,
    supersampling: settings.supersampling,
    unitCellLineColor:
      settings.background === "black" ? DARK_BACKGROUND_UNIT_CELL_LINE_COLOR : undefined,
    width: settings.width,
  });
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
