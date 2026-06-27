import { createRoot, type RootState } from "@react-three/fiber";
import { useLayoutEffect } from "react";

import type { SceneSpec } from "../api/scene";
import type {
  ComponentOpacityState,
  ExportMeshQuality,
  ExportSupersampling,
  StyleState,
} from "../app/settings";
import type { CameraPoseSnapshot } from "./cameraPose";
import {
  EXPORT_SCENE_MESH_DETAIL_PRESETS,
  ExportSceneContent,
  computeSceneLayout,
} from "./LatticeScene";
import { CameraHeadlight } from "./CameraHeadlight";
import { computeStructureExportFramePlan } from "./exportFrame";
import { resolveStructureMaterialFamilyForStyle } from "./materialPresetResolver";
import { DEFAULT_RENDERER_PARAMETERS } from "./renderBackend";

export interface RasterExportImage {
  blob: Blob;
  height: number;
  width: number;
}

export interface RenderStructureRasterOptions {
  cameraPose: CameraPoseSnapshot;
  componentOpacity: ComponentOpacityState;
  height: number;
  meshQuality: ExportMeshQuality;
  scene: SceneSpec;
  showAtoms: boolean;
  showUnitCell: boolean;
  style: StyleState;
  supersampling: ExportSupersampling;
  width: number;
}

export async function renderStructureRasterPng({
  cameraPose,
  componentOpacity,
  height,
  meshQuality,
  scene,
  showAtoms,
  showUnitCell,
  style,
  supersampling,
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
        <ambientLight intensity={materialFamily.lighting.ambientIntensity} />
        {materialFamily.lighting.cameraLights.map((light, index) => (
          <CameraHeadlight
            key={`${index}:${light.intensity}:${light.offset.join(",")}`}
            intensity={light.intensity}
            offset={light.offset}
          />
        ))}
        <ExportSceneContent
          cameraPose={cameraPose}
          componentOpacity={componentOpacity}
          exportFramePlan={exportFramePlan}
          layout={layout}
          materialFamily={materialFamily}
          meshDetail={meshDetail}
          scene={scene}
          showAtoms={showAtoms}
          showUnitCell={showUnitCell}
          style={style}
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
    const blob = await canvasToPngBlob(outputCanvas);
    return { blob, height, width };
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
