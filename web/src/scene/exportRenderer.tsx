import { createRoot, type RootState } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { Quaternion, Vector3 } from "three";

import type { SceneSpec } from "../api/scene";
import type {
  ComponentOpacityState,
  AtomRenderingMode,
  BondRenderingMode,
  ExportMeshQuality,
  ExportSupersampling,
  StyleState,
  UnitCellLineStyle,
} from "../model";
import type { CameraPoseSnapshot } from "./cameraPose";
import {
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
} from "./StructureSceneObjects";
import { ExportSceneContent } from "./ExportSceneContent";
import { CameraHeadlight } from "./CameraHeadlight";
import { MaterialPresetLights } from "./MaterialPresetLights";
import { computeSceneLayout } from "./sceneLayout";
import { computeStructureExportFramePlan, type StructureExportFramePlan } from "./exportFrame";
import { resolveStructureMaterialFamilyForStyle } from "./materialPresetResolver";
import { DEFAULT_RENDERER_PARAMETERS } from "./rendererParameters";
import {
  ORIENTATION_GIZMO_CAMERA_POSITION,
  ORIENTATION_GIZMO_LABEL_DISTANCE,
  ORIENTATION_GIZMO_SCALE,
  ORIENTATION_GIZMO_ZOOM_PER_CANVAS_PIXEL,
  StaticOrientationGizmoScene,
} from "./OrientationGizmo";
import {
  computeOrientationGizmoAxes,
  type OrientationGizmoAxisSpec,
} from "./orientationGizmoMath";

export const STRUCTURE_LINE_WIDTH_REFERENCE_RATIO = 0.001;
export const STRUCTURE_LINE_WIDTH_MIN_PIXELS = 1;

export interface RasterExportImage {
  blob: Blob;
  contentBounds?: RasterExportBounds;
  height: number;
  textItems?: RasterExportTextItem[];
  width: number;
}

export type RasterExportImageFormat = "jpg" | "png";

export interface RasterExportBounds {
  height: number;
  maxX: number;
  maxY: number;
  minX: number;
  minY: number;
  width: number;
}

export interface RasterExportTextItem {
  fontStyle?: "italic" | "normal";
  fontWeight?: number;
  label: string;
  size: number;
  x: number;
  y: number;
}

export interface RenderStructureRasterOptions {
  atomRenderingMode: AtomRenderingMode;
  bondRenderingMode: BondRenderingMode;
  backgroundColor: string | null;
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  height: number;
  imageFormat: RasterExportImageFormat;
  lightStrength: number;
  meshQuality: ExportMeshQuality;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  supersampling: ExportSupersampling;
  unitCellLineColor?: string;
  unitCellLineStyle: UnitCellLineStyle;
  width: number;
}

export interface RenderCrystalAxesRasterOptions {
  backgroundColor: string | null;
  cameraPose: CameraPoseSnapshot;
  cellVectors: SceneSpec["cell"]["vectors"];
  cropPaddingRatio?: number;
  imageFormat: RasterExportImageFormat;
  includeLabelTextItems?: boolean;
  labelColor?: string;
  labelHaloColor?: string;
  showLabelHalo?: boolean;
  showLabels?: boolean;
  size: number;
  supersampling: ExportSupersampling;
}

export async function renderStructureRasterImage({
  atomRenderingMode,
  bondRenderingMode,
  backgroundColor,
  cameraPose,
  componentOpacity,
  height,
  imageFormat,
  lightStrength,
  meshQuality,
  scene,
  showAtoms,
  showUnitCell,
  style,
  supersampling,
  unitCellLineColor,
  unitCellLineStyle,
  width,
}: RenderStructureRasterOptions): Promise<RasterExportImage> {
  const renderWidth = width * supersampling;
  const renderHeight = height * supersampling;
  const canvas = document.createElement("canvas");
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  canvas.style.cssText = [
    "position: fixed",
    "left: -10000px",
    "top: -10000px",
    `width: ${renderWidth}px`,
    `height: ${renderHeight}px`,
    "pointer-events: none",
  ].join(";");
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const layout = computeSceneLayout(scene, style.atomRadiusModel);
  const materialFamily = resolveStructureMaterialFamilyForStyle(style);
  const exportFramePlan = computeStructureExportFramePlan({
    cameraPose,
    componentOpacity,
    height: renderHeight,
    groupPosition: layout.groupPosition,
    scene,
    showAtoms,
    showUnitCell,
    style,
    width: renderWidth,
  });
  const meshDetail = EXPORT_SCENE_MESH_DETAIL_PRESETS[meshQuality];
  const lineWidthScale = structureLineWidthScale(exportFramePlan, supersampling);
  const root = createRoot(canvas);
  let rootState: RootState | null = null;
  let resolveMounted: (() => void) | null = null;
  const mounted = new Promise<void>((resolve) => {
    resolveMounted = resolve;
  });

  try {
    await root.configure({
      camera: {
        far: Math.max(1000, layout.standardPose.distance + layout.span * 8),
        near: 0.01,
        position: layout.standardPose.cameraPosition,
        zoom: 1,
      },
      dpr: 1,
      frameloop: "never",
      gl: DEFAULT_RENDERER_PARAMETERS,
      onCreated: (state) => {
        rootState = state;
        state.gl.setClearColor(backgroundColor ?? "#000000", backgroundColor ? 1 : 0);
      },
      orthographic: true,
      size: {
        height: renderHeight,
        left: 0,
        top: 0,
        width: renderWidth,
      },
    });

    const store = root.render(
      <>
        <MaterialPresetLights
          intensityScale={lightStrength}
          lighting={materialFamily.lighting}
        />
        <ExportSceneContent
          atomRenderingMode={atomRenderingMode}
          bondRenderingMode={bondRenderingMode}
          cameraPose={cameraPose}
          componentOpacity={componentOpacity}
          exportFramePlan={exportFramePlan}
          layout={layout}
          materialFamily={materialFamily}
          meshDetail={meshDetail}
          polyhedronEdgeLineWidthScale={lineWidthScale}
          scene={scene}
          showAtoms={showAtoms}
          showUnitCell={showUnitCell}
          style={style}
          unitCellLineColor={unitCellLineColor}
          unitCellLineStyle={unitCellLineStyle}
          unitCellLineWidthScale={lineWidthScale}
        />
        <RenderReady onReady={() => resolveMounted?.()} />
      </>,
    );

    await mounted;
    const state = rootState ?? store.getState();
    state.advance(performance.now(), true);
    state.advance(performance.now() + 16, true);

    const outputCanvas =
      supersampling === 1 ? canvas : downsampleCanvas(canvas, width, height);
    const blob = await canvasToRasterBlob(outputCanvas, imageFormat, backgroundColor);
    return {
      blob,
      contentBounds: structureFrameContentBounds(exportFramePlan, supersampling),
      height,
      width,
    };
  } finally {
    root.unmount();
    canvas.remove();
  }
}

export function structureLineWidthScale(
  framePlan: StructureExportFramePlan,
  supersampling: number,
): number {
  const referenceSize = structureFrameReferenceSize(framePlan, supersampling);
  const finalLineWidth = referenceSize
    ? Math.max(
        STRUCTURE_LINE_WIDTH_MIN_PIXELS,
        referenceSize * STRUCTURE_LINE_WIDTH_REFERENCE_RATIO,
      )
    : 2;

  return finalLineWidth * Math.max(1, supersampling);
}

function structureFrameContentBounds(
  framePlan: StructureExportFramePlan,
  supersampling: number,
): RasterExportBounds | undefined {
  const bounds = framePlan.bounds;
  if (!bounds) {
    return undefined;
  }

  const minX =
    ((bounds.minX - framePlan.centerX) * framePlan.zoom + framePlan.width / 2) / supersampling;
  const maxX =
    ((bounds.maxX - framePlan.centerX) * framePlan.zoom + framePlan.width / 2) / supersampling;
  const minY =
    (framePlan.height / 2 - (bounds.maxY - framePlan.centerY) * framePlan.zoom) /
    supersampling;
  const maxY =
    (framePlan.height / 2 - (bounds.minY - framePlan.centerY) * framePlan.zoom) /
    supersampling;

  return {
    height: Math.max(0, maxY - minY),
    maxX,
    maxY,
    minX,
    minY,
    width: Math.max(0, maxX - minX),
  };
}

function structureFrameReferenceSize(
  framePlan: StructureExportFramePlan,
  supersampling: number,
): number | null {
  const bounds = structureFrameContentBounds(framePlan, supersampling);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  return Math.sqrt(bounds.width * bounds.height);
}

export async function renderCrystalAxesRasterImage({
  backgroundColor,
  cameraPose,
  cellVectors,
  cropPaddingRatio = 0.04,
  imageFormat,
  includeLabelTextItems,
  labelColor,
  labelHaloColor,
  showLabelHalo = true,
  showLabels = true,
  size,
  supersampling,
}: RenderCrystalAxesRasterOptions): Promise<RasterExportImage> {
  const includeProjectedTextItems = includeLabelTextItems ?? !showLabels;
  const renderSize = size * supersampling;
  const canvas = document.createElement("canvas");
  canvas.width = renderSize;
  canvas.height = renderSize;
  canvas.style.cssText = [
    "position: fixed",
    "left: -10000px",
    "top: -10000px",
    `width: ${renderSize}px`,
    `height: ${renderSize}px`,
    "pointer-events: none",
  ].join(";");
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);

  const axes = computeOrientationGizmoAxes(cellVectors);
  const root = createRoot(canvas);
  let rootState: RootState | null = null;
  let resolveMounted: (() => void) | null = null;
  const mounted = new Promise<void>((resolve) => {
    resolveMounted = resolve;
  });

  try {
    await root.configure({
      camera: {
        far: 20,
        near: 0.1,
        position: ORIENTATION_GIZMO_CAMERA_POSITION,
        zoom: renderSize * ORIENTATION_GIZMO_ZOOM_PER_CANVAS_PIXEL,
      },
      dpr: 1,
      frameloop: "never",
      gl: {
        ...DEFAULT_RENDERER_PARAMETERS,
        alpha: true,
      },
      onCreated: (state) => {
        rootState = state;
      },
      orthographic: true,
      size: {
        height: renderSize,
        left: 0,
        top: 0,
        width: renderSize,
      },
    });

    const store = root.render(
      <>
        <ambientLight intensity={0.68} />
        <CameraHeadlight />
        <StaticOrientationGizmoScene
          axes={axes}
          cameraPose={cameraPose}
          labelColor={labelColor}
          labelHaloColor={labelHaloColor}
          showLabelHalo={showLabelHalo}
          showLabels={showLabels}
        />
        <RenderReady onReady={() => resolveMounted?.()} />
      </>,
    );

    await mounted;
    const state = rootState ?? store.getState();
    state.advance(performance.now(), true);
    state.advance(performance.now() + 16, true);

    const projectedTextItems = crystalAxisTextItems({
      axes,
      cameraPose,
      crop: {
        sourceX: 0,
        sourceY: 0,
      },
      renderSize,
      rootState: state,
      supersampling,
    });
    const cropped = cropTransparentCanvas(
      canvas,
      cropPaddingRatio,
      includeProjectedTextItems ? textBounds(projectedTextItems) : [],
    );
    const textItems = includeProjectedTextItems
      ? projectedTextItems.map((item) => ({
          ...item,
          size: item.size / supersampling,
          x: (item.x - cropped.crop.sourceX) / supersampling,
          y: (item.y - cropped.crop.sourceY) / supersampling,
        }))
      : undefined;
    const outputCanvas =
      supersampling === 1
        ? cropped.canvas
        : downsampleCanvas(
            cropped.canvas,
            Math.max(1, Math.round(cropped.canvas.width / supersampling)),
            Math.max(1, Math.round(cropped.canvas.height / supersampling)),
          );
    const blob = await canvasToRasterBlob(outputCanvas, imageFormat, backgroundColor);
    return { blob, height: outputCanvas.height, textItems, width: outputCanvas.width };
  } finally {
    root.unmount();
    canvas.remove();
  }
}

function RenderReady({ onReady }: { onReady: () => void }) {
  useLayoutEffect(() => {
    onReady();
  }, [onReady]);

  return null;
}

function downsampleCanvas(sourceCanvas: HTMLCanvasElement, width: number, height: number) {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = width;
  outputCanvas.height = height;
  const context = outputCanvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the export downsampling canvas.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return outputCanvas;
}

function cropTransparentCanvas(
  sourceCanvas: HTMLCanvasElement,
  paddingRatio: number,
  extraBounds: Array<{ maxX: number; maxY: number; minX: number; minY: number }> = [],
) {
  const readableCanvas = document.createElement("canvas");
  readableCanvas.width = sourceCanvas.width;
  readableCanvas.height = sourceCanvas.height;
  const sourceContext = readableCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    throw new Error("Could not prepare the crystal axes crop canvas.");
  }

  sourceContext.drawImage(sourceCanvas, 0, 0);

  const image = sourceContext.getImageData(0, 0, readableCanvas.width, readableCanvas.height);
  const bounds = mergeBounds([
    alphaBounds(image.data, readableCanvas.width, readableCanvas.height),
    ...extraBounds,
  ]);
  if (!bounds) {
    return {
      canvas: sourceCanvas,
      crop: {
        sourceX: 0,
        sourceY: 0,
      },
    };
  }

  const contentWidth = bounds.maxX - bounds.minX + 1;
  const contentHeight = bounds.maxY - bounds.minY + 1;
  const padding = Math.max(
    1,
    Math.round(Math.max(contentWidth, contentHeight) * paddingRatio),
  );
  const sourceX = Math.max(0, Math.floor(bounds.minX - padding));
  const sourceY = Math.max(0, Math.floor(bounds.minY - padding));
  const sourceRight = Math.min(readableCanvas.width - 1, Math.ceil(bounds.maxX + padding));
  const sourceBottom = Math.min(readableCanvas.height - 1, Math.ceil(bounds.maxY + padding));
  const targetWidth = sourceRight - sourceX + 1;
  const targetHeight = sourceBottom - sourceY + 1;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = targetWidth;
  outputCanvas.height = targetHeight;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) {
    throw new Error("Could not crop the crystal axes export canvas.");
  }

  outputContext.drawImage(
    readableCanvas,
    sourceX,
    sourceY,
    targetWidth,
    targetHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );
  return {
    canvas: outputCanvas,
    crop: {
      sourceX,
      sourceY,
    },
  };
}

function textBounds(textItems: RasterExportTextItem[]) {
  return textItems.map((item) => {
    const approximateWidth = item.label.length * item.size * 0.72;
    const approximateHeight = item.size;
    const minX = item.x - approximateWidth / 2;
    const maxX = item.x + approximateWidth / 2;
    const minY = item.y - approximateHeight / 2;
    const maxY = item.y + approximateHeight / 2;
    return {
      maxX,
      maxY,
      minX,
      minY,
    };
  });
}

function mergeBounds(
  bounds: Array<{ maxX: number; maxY: number; minX: number; minY: number } | null>,
) {
  const presentBounds = bounds.filter(
    (bound): bound is { maxX: number; maxY: number; minX: number; minY: number } =>
      bound !== null,
  );
  if (presentBounds.length === 0) {
    return null;
  }

  return presentBounds.reduce((merged, bound) => ({
    maxX: Math.max(merged.maxX, bound.maxX),
    maxY: Math.max(merged.maxY, bound.maxY),
    minX: Math.min(merged.minX, bound.minX),
    minY: Math.min(merged.minY, bound.minY),
  }));
}

function crystalAxisTextItems({
  axes,
  cameraPose,
  crop,
  renderSize,
  rootState,
  supersampling,
}: {
  axes: OrientationGizmoAxisSpec[];
  cameraPose: CameraPoseSnapshot;
  crop: { sourceX: number; sourceY: number };
  renderSize: number;
  rootState: RootState;
  supersampling: number;
}): RasterExportTextItem[] {
  const inverseRotation = new Quaternion(...cameraPose.quaternion).invert();

  return axes.map((axis) => {
    const worldPosition = new Vector3(...axis.direction)
      .multiplyScalar(ORIENTATION_GIZMO_LABEL_DISTANCE * ORIENTATION_GIZMO_SCALE)
      .applyQuaternion(inverseRotation);
    const projected = worldPosition.project(rootState.camera);
    return {
      fontStyle: "italic",
      fontWeight: 500,
      label: axis.label,
      size: 56 * supersampling,
      x: ((projected.x + 1) / 2) * renderSize - crop.sourceX,
      y: ((1 - projected.y) / 2) * renderSize - crop.sourceY,
    };
  });
}

function alphaBounds(data: Uint8ClampedArray, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * 4 + 3] ?? 0;
      if (alpha === 0) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return maxX >= minX && maxY >= minY
    ? {
        maxX,
        maxY,
        minX,
        minY,
      }
    : null;
}

function canvasToRasterBlob(
  canvas: HTMLCanvasElement,
  imageFormat: RasterExportImageFormat,
  backgroundColor: string | null,
): Promise<Blob> {
  const outputCanvas = canvasWithRasterBackground(canvas, imageFormat, backgroundColor);
  const mimeType = imageFormat === "jpg" ? "image/jpeg" : "image/png";
  const quality = imageFormat === "jpg" ? 0.95 : undefined;

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Could not encode the exported ${imageFormat.toUpperCase()} image.`));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function canvasWithRasterBackground(
  canvas: HTMLCanvasElement,
  imageFormat: RasterExportImageFormat,
  backgroundColor: string | null,
) {
  if (backgroundColor === null && imageFormat === "png") {
    return canvas;
  }

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const context = outputCanvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the raster export background.");
  }

  context.fillStyle = backgroundColor ?? "#ffffff";
  context.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  context.drawImage(canvas, 0, 0);
  return outputCanvas;
}
