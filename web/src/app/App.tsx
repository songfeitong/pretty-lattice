import { AlertTriangleIcon } from "lucide-react";
import { Quaternion } from "three";
import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DEFAULT_BOND_ALGORITHM,
  BACKEND_UNAVAILABLE_TITLE,
  BACKEND_UNAVAILABLE_MESSAGE,
  STATIC_SCENE_PREVIEW_NAME,
  hasStaticScenePreview,
  isBackendUnavailablePreviewError,
  loadStaticScenePreview,
  uploadStructurePreview,
  type BondAlgorithm,
  type SceneSpec,
} from "../api/scene";
import {
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { createCameraPoseSnapshot } from "../scene/cameraPose";
import { computeStructureExportProjectedSize } from "../scene/exportFrame";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  detectWebGpuAvailable,
  initialWebGpuAvailability,
  type WebGpuAvailability,
} from "../scene/renderBackend";
import {
  CommonControlsPanel,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { deriveElementLegendEntries } from "./elementLegend";
import {
  createFigureExportFile,
  downloadBlob,
} from "./exportFigure";
import { ElementLegend } from "./legend/ElementLegend";
import {
  orientationGizmoContainerStyle,
  orientationGizmoSizeForViewport,
  useViewportSize,
} from "./layout/overlayLayout";
import { StructureSummaryCard } from "./panels/StructureSummaryCard";
import type { PreviewStatus } from "./previewState";
import {
  InspectorSidebar,
  InspectorToggle,
} from "./inspector/InspectorSidebar";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultExportSettings,
  createDefaultStyle,
  DEFAULT_RENDER_BACKEND,
  type ExportSettingsState,
  hasPolyhedra,
  previewSafeAreaForInspector,
  type RenderBackend,
  sceneOffsetXForInspector,
  syncExportSettingsProjectedSize,
  visibleSceneForComponents,
} from "./settings";
import {
  createPreviewViewState,
  resetPreviewViewState,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewViewScale,
  type InteractionMode,
} from "./viewState";

const LOCKED_INTERACTION_DRAG_THRESHOLD_PX = 4;
const LOCKED_INTERACTION_WHEEL_IDLE_MS = 150;
const MAX_STRUCTURE_UPLOAD_BYTES = 10 * 1024 * 1024;
const STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview.";
const STRUCTURE_PARSE_ERROR_MESSAGE = "pymatgen could not parse this file.";

interface LockedInteractionPointer {
  pointerId: number;
  startX: number;
  startY: number;
  triggered: boolean;
}

export function App() {
  const isStaticScenePreview = hasStaticScenePreview();
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>(() =>
    isStaticScenePreview ? "loading" : "idle",
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [bondAlgorithm, setBondAlgorithm] =
    useState<BondAlgorithm>(DEFAULT_BOND_ALGORITHM);
  const [renderBackend, setRenderBackend] =
    useState<RenderBackend>(DEFAULT_RENDER_BACKEND);
  const [webGpuAvailability, setWebGpuAvailability] =
    useState<WebGpuAvailability>(initialWebGpuAvailability);
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [exportSettings, setExportSettings] = useState(createDefaultExportSettings);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [cameraOrientationVersion, setCameraOrientationVersion] = useState(0);
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(true);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const leftOverlayRef = useRef<HTMLDivElement>(null);
  const commonControlsPanelRef = useRef<HTMLDivElement>(null);
  const cameraOrientationRef = useRef(new Quaternion());
  const lockedInteractionPointerRef = useRef<LockedInteractionPointer | null>(null);
  const lockedInteractionWheelIdleTimeoutRef = useRef<number | null>(null);

  const handleViewScaleChange = useCallback((viewScale: number) => {
    setViewState((currentViewState) => setPreviewViewScale(currentViewState, viewScale));
  }, []);

  const handleInteractionModeChange = useCallback((interactionMode: InteractionMode) => {
    setViewState((currentViewState) =>
      setPreviewInteractionMode(currentViewState, interactionMode),
    );
  }, []);

  const handleInteractionLockedChange = useCallback((interactionLocked: boolean) => {
    setViewState((currentViewState) =>
      setPreviewInteractionLocked(currentViewState, interactionLocked),
    );
  }, []);

  const handleRenderBackendChange = useCallback(
    (nextRenderBackend: RenderBackend) => {
      if (nextRenderBackend === "webgpu" && webGpuAvailability !== "available") {
        return;
      }

      setRenderBackend(nextRenderBackend);
    },
    [webGpuAvailability],
  );

  const handleResetView = useCallback(() => {
    setViewState(resetPreviewViewState);
  }, []);

  const handleCameraOrientationChange = useCallback(() => {
    setCameraOrientationVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!isStaticScenePreview) {
      return;
    }

    let isCurrent = true;

    async function loadExampleScene() {
      try {
        const nextScene = await loadStaticScenePreview();
        if (!isCurrent || !nextScene) {
          return;
        }

        setScene(nextScene);
        setSelectedFileName(STATIC_SCENE_PREVIEW_NAME);
        setPreviewStatus("ready");
        setErrorMessage(null);
        setComponentVisibility(createDefaultComponentVisibility(nextScene));
      } catch {
        if (!isCurrent) {
          return;
        }

        setScene(null);
        setSelectedFileName(null);
        setPreviewStatus("error");
        setErrorMessage("Static example could not be loaded.");
      }
    }

    void loadExampleScene();

    return () => {
      isCurrent = false;
    };
  }, [isStaticScenePreview]);

  useEffect(() => {
    if (webGpuAvailability !== "checking") {
      return;
    }

    let isCurrent = true;

    async function checkWebGpu() {
      const isAvailable = await detectWebGpuAvailable();
      if (!isCurrent) {
        return;
      }

      setWebGpuAvailability(isAvailable ? "available" : "unavailable");
    }

    void checkWebGpu();

    return () => {
      isCurrent = false;
    };
  }, [webGpuAvailability]);

  useEffect(() => {
    if (renderBackend === "webgpu" && webGpuAvailability === "unavailable") {
      setRenderBackend(DEFAULT_RENDER_BACKEND);
    }
  }, [renderBackend, webGpuAvailability]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    if (isStaticScenePreview) {
      setErrorMessage(BACKEND_UNAVAILABLE_MESSAGE);
      return;
    }

    if (file.size > MAX_STRUCTURE_UPLOAD_BYTES) {
      setSelectedFileName(null);
      setPreviewStatus("error");
      setErrorMessage(STRUCTURE_FILE_TOO_LARGE_MESSAGE);
      setScene(null);
      setCurrentFile(null);
      setIsInspectorOpen(false);
      setIsStructureSummaryCollapsed(true);
      return;
    }

    setSelectedFileName(file.name);
    setPreviewStatus("loading");
    setErrorMessage(null);
    setScene(null);
    setCurrentFile(file);
    setIsInspectorOpen(false);
    setBondAlgorithm(DEFAULT_BOND_ALGORITHM);
    setComponentVisibility(createDefaultComponentVisibility());
    setComponentOpacity(createDefaultComponentOpacity());
    setStyle(createDefaultStyle());
    setExportSettings(createDefaultExportSettings());
    setExportError(null);
    cameraOrientationRef.current.identity();
    setCameraOrientationVersion((version) => version + 1);
    setViewState(createPreviewViewState());
    setIsStructureSummaryCollapsed(true);

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setPreviewStatus("ready");
    } catch (error) {
      setScene(null);
      setCurrentFile(null);
      setSelectedFileName(null);
      setIsInspectorOpen(false);
      setPreviewStatus("error");
      setErrorMessage(
        isBackendUnavailablePreviewError(error)
          ? error.message
          : STRUCTURE_PARSE_ERROR_MESSAGE,
      );
    }
  }

  const handleBondAlgorithmChange = useCallback(
    async (nextBondAlgorithm: BondAlgorithm) => {
      if (!currentFile) {
        if (scene) {
          setErrorMessage(BACKEND_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      setPreviewStatus("loading");
      setErrorMessage(null);

      try {
        const nextScene = await uploadStructurePreview(currentFile, {
          bondAlgorithm: nextBondAlgorithm,
        });
        setBondAlgorithm(nextBondAlgorithm);
        setScene(nextScene);
        setPreviewStatus("ready");
      } catch (error) {
        if (isBackendUnavailablePreviewError(error)) {
          setPreviewStatus(scene ? "ready" : "error");
          setErrorMessage(error.message);
          return;
        }

        setScene(null);
        setCurrentFile(null);
        setSelectedFileName(null);
        setIsInspectorOpen(false);
        setPreviewStatus("error");
        setErrorMessage(STRUCTURE_PARSE_ERROR_MESSAGE);
      }
    },
    [currentFile, scene],
  );

  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
  const exportProjectedSize = useMemo(() => {
    if (!visibleScene) {
      return null;
    }

    return computeStructureExportProjectedSize({
      cameraPose: createCameraPoseSnapshot(cameraOrientationRef.current),
      componentOpacity,
      scene: visibleScene,
      showAtoms: componentVisibility.atoms,
      showUnitCell: componentVisibility.unitCell,
      style,
    });
  }, [
    cameraOrientationVersion,
    componentOpacity,
    componentVisibility.atoms,
    componentVisibility.unitCell,
    style,
    visibleScene,
  ]);
  const legendEntries = useMemo(
    () => deriveElementLegendEntries(scene, style.colorScheme),
    [scene, style.colorScheme],
  );
  const hasVisibleScene = visibleScene !== null;
  const webGpuAvailable = webGpuAvailability === "available";
  const errorTitle =
    errorMessage === BACKEND_UNAVAILABLE_MESSAGE
      ? BACKEND_UNAVAILABLE_TITLE
      : "Unsupported file";
  const previewSafeArea = previewSafeAreaForInspector();
  const sceneOffsetX = sceneOffsetXForInspector(isInspectorOpen, viewportSize.width);
  const effectivePreviewSafeArea = useMemo(
    () => previewSafeAreaForViewport(previewSafeArea, viewportSize.width),
    [previewSafeArea, viewportSize.width],
  );
  const orientationGizmoSize = useMemo(
    () => orientationGizmoSizeForViewport(viewportSize, effectivePreviewSafeArea),
    [effectivePreviewSafeArea, viewportSize],
  );
  const triggerLockedInteractionFeedback = useCallback(() => {
    setLockedInteractionFeedbackCount((count) => count + 1);
  }, []);

  useEffect(() => {
    if (exportProjectedSize === null) {
      return;
    }

    setExportSettings((currentSettings) =>
      syncExportSettingsProjectedSize(currentSettings, exportProjectedSize),
    );
  }, [exportProjectedSize]);

  const handleExportSettingsChange = useCallback(
    (nextExportSettings: ExportSettingsState) => {
      setExportSettings(nextExportSettings);
      setExportError(null);
    },
    [],
  );

  const handleExportFigure = useCallback(async () => {
    if (!scene || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      const exportFile = await createFigureExportFile({
        cameraOrientationRef,
        componentOpacity,
        componentVisibility,
        fileName: selectedFileName,
        scene,
        settings: exportSettings,
        style,
      });
      downloadBlob(exportFile.blob, exportFile.fileName);
    } catch (error) {
      setExportError(
        error instanceof Error
          ? error.message
          : "Could not export this structure figure.",
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    componentOpacity,
    componentVisibility,
    exportSettings,
    isExporting,
    scene,
    selectedFileName,
    style,
  ]);

  const collapseStructureSummaryIfControlsOverflow = useCallback(() => {
    const commonControlsPanelElement = commonControlsPanelRef.current;
    if (!commonControlsPanelElement || isStructureSummaryCollapsed) {
      return;
    }

    const controlsRect = commonControlsPanelElement.getBoundingClientRect();
    const safeBottom = window.innerHeight - 16;
    if (controlsRect.bottom > safeBottom) {
      setIsStructureSummaryCollapsed(true);
    }
  }, [isStructureSummaryCollapsed]);

  const clearLockedInteractionWheelGate = useCallback(() => {
    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    lockedInteractionWheelIdleTimeoutRef.current = null;
  }, []);

  useEffect(() => () => clearLockedInteractionWheelGate(), [clearLockedInteractionWheelGate]);

  useEffect(() => {
    if (!scene || isStructureSummaryCollapsed) {
      return;
    }

    const leftOverlayElement = leftOverlayRef.current;
    const commonControlsPanelElement = commonControlsPanelRef.current;
    if (!leftOverlayElement || !commonControlsPanelElement) {
      return;
    }

    collapseStructureSummaryIfControlsOverflow();
    const animationFrame = window.requestAnimationFrame(collapseStructureSummaryIfControlsOverflow);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", collapseStructureSummaryIfControlsOverflow);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", collapseStructureSummaryIfControlsOverflow);
      };
    }

    const resizeObserver = new ResizeObserver(collapseStructureSummaryIfControlsOverflow);
    resizeObserver.observe(leftOverlayElement);
    resizeObserver.observe(commonControlsPanelElement);
    window.addEventListener("resize", collapseStructureSummaryIfControlsOverflow);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", collapseStructureSummaryIfControlsOverflow);
    };
  }, [collapseStructureSummaryIfControlsOverflow, isStructureSummaryCollapsed, scene]);

  useEffect(() => {
    if (!hasVisibleScene || !viewState.interactionLocked) {
      clearLockedInteractionWheelGate();
    }
  }, [clearLockedInteractionWheelGate, hasVisibleScene, viewState.interactionLocked]);

  const handleSceneWheelCapture = useCallback(() => {
    if (!hasVisibleScene || !viewState.interactionLocked) {
      clearLockedInteractionWheelGate();
      return;
    }

    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      triggerLockedInteractionFeedback();
    } else {
      window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    }

    lockedInteractionWheelIdleTimeoutRef.current = window.setTimeout(() => {
      lockedInteractionWheelIdleTimeoutRef.current = null;
    }, LOCKED_INTERACTION_WHEEL_IDLE_MS);
  }, [
    clearLockedInteractionWheelGate,
    hasVisibleScene,
    triggerLockedInteractionFeedback,
    viewState.interactionLocked,
  ]);

  const handleScenePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!hasVisibleScene || !viewState.interactionLocked || event.button !== 0) {
        lockedInteractionPointerRef.current = null;
        return;
      }

      lockedInteractionPointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        triggered: false,
      };
    },
    [hasVisibleScene, viewState.interactionLocked],
  );

  const handleScenePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const lockedPointer = lockedInteractionPointerRef.current;
      if (
        !hasVisibleScene ||
        !viewState.interactionLocked ||
        !lockedPointer ||
        lockedPointer.pointerId !== event.pointerId ||
        lockedPointer.triggered
      ) {
        return;
      }

      const dragDistance = Math.hypot(
        event.clientX - lockedPointer.startX,
        event.clientY - lockedPointer.startY,
      );
      if (dragDistance < LOCKED_INTERACTION_DRAG_THRESHOLD_PX) {
        return;
      }

      lockedPointer.triggered = true;
      triggerLockedInteractionFeedback();
    },
    [hasVisibleScene, triggerLockedInteractionFeedback, viewState.interactionLocked],
  );

  const handleScenePointerEndCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (lockedInteractionPointerRef.current?.pointerId === event.pointerId) {
      lockedInteractionPointerRef.current = null;
    }
  }, []);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => void handleFileChange(event)}
      />

      <section
        className="scene-stage absolute inset-0 transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
        style={{ transform: `translateX(${sceneOffsetX}px)` }}
        aria-label="Crystal structure preview"
        onPointerCancelCapture={handleScenePointerEndCapture}
        onPointerDownCapture={handleScenePointerDownCapture}
        onPointerMoveCapture={handleScenePointerMoveCapture}
        onPointerUpCapture={handleScenePointerEndCapture}
        onWheelCapture={handleSceneWheelCapture}
      >
        {visibleScene ? (
          <LatticeScene
            cameraOrientationRef={cameraOrientationRef}
            onCameraOrientationChange={handleCameraOrientationChange}
            interactionLocked={viewState.interactionLocked}
            interactionMode={viewState.interactionMode}
            layoutScene={scene ?? visibleScene}
            onViewScaleChange={handleViewScaleChange}
            resetCounter={viewState.resetCounter}
            renderBackend={renderBackend}
            safeArea={previewSafeArea}
            scene={visibleScene}
            componentOpacity={componentOpacity}
            style={style}
            showAtoms={componentVisibility.atoms}
            showUnitCell={componentVisibility.unitCell}
            viewScale={viewState.viewScale}
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground"
            data-state={previewStatus}
          >
            {previewStatus === "loading" ? (
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  data-testid="loading-structure-spinner"
                  className="inline-flex size-3 shrink-0 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-safe:animate-spin motion-safe:[animation-duration:450ms]"
                />
                Loading structure
              </span>
            ) : (
              "No structure loaded"
            )}
          </div>
        )}
      </section>

      {visibleScene ? (
        <OrientationGizmo
          cameraOrientationRef={cameraOrientationRef}
          cellVectors={visibleScene.cell.vectors}
          className="pointer-events-none absolute"
          style={orientationGizmoContainerStyle(effectivePreviewSafeArea, orientationGizmoSize)}
        />
      ) : null}

      {legendEntries.length > 0 ? (
        <ElementLegend
          entries={legendEntries}
          offsetX={sceneOffsetX}
          safeArea={previewSafeArea}
        />
      ) : null}

      <div
        ref={leftOverlayRef}
        className={cn(
          "absolute left-4 top-4 flex w-[296px] max-w-[calc(100vw-2rem)] flex-col gap-4",
          isInspectorOpen ? "max-[760px]:hidden" : null,
        )}
      >
        <StructureSummaryCard
          isCollapsed={isStructureSummaryCollapsed}
          onCollapsedChange={setIsStructureSummaryCollapsed}
          onOpenStructure={() => fileInputRef.current?.click()}
          previewStatus={previewStatus}
          scene={scene}
          selectedFileName={selectedFileName}
        />

        {scene ? (
          <div ref={commonControlsPanelRef}>
            <CommonControlsPanel
              componentOpacity={componentOpacity}
              style={style}
              exportProjectedSize={exportProjectedSize ?? undefined}
              componentVisibility={componentVisibility}
              exportError={exportError}
              exportSettings={exportSettings}
              hasPolyhedra={hasPolyhedra(scene)}
              isExporting={isExporting}
              onAtomRadiusModelChange={(atomRadiusModel) => {
                setStyle((currentStyle) => ({ ...currentStyle, atomRadiusModel }));
              }}
              onComponentOpacityChange={setComponentOpacity}
              onExport={handleExportFigure}
              onExportSettingsChange={handleExportSettingsChange}
              onStyleChange={setStyle}
              onComponentVisibilityChange={setComponentVisibility}
            />
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <Alert
          className={cn(
            "absolute top-4 z-20 w-[320px] rounded-xl shadow-sm shadow-foreground/5",
            scene ? "left-[386px]" : "left-[328px]",
            "max-[760px]:left-4 max-[760px]:right-4 max-[760px]:top-[10rem] max-[760px]:w-auto",
          )}
          onDismiss={() => setErrorMessage(null)}
        >
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle className="font-semibold">{errorTitle}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {scene ? (
        <>
          <ViewControlRail
            className={cn(isInspectorOpen ? "max-[760px]:hidden" : null)}
            interactionLocked={viewState.interactionLocked}
            lockedInteractionFeedbackCount={lockedInteractionFeedbackCount}
            onInteractionLockedChange={handleInteractionLockedChange}
            onResetView={handleResetView}
            onViewScaleChange={handleViewScaleChange}
            viewScale={viewState.viewScale}
          />

          <InspectorToggle
            isOpen={isInspectorOpen}
            onOpenChange={setIsInspectorOpen}
          />

          <InspectorSidebar
            bondAlgorithm={bondAlgorithm}
            interactionMode={viewState.interactionMode}
            isOpen={isInspectorOpen}
            isSceneLoading={previewStatus === "loading"}
            onBondAlgorithmChange={(nextBondAlgorithm) => {
              void handleBondAlgorithmChange(nextBondAlgorithm);
            }}
            onInteractionModeChange={handleInteractionModeChange}
            onRenderBackendChange={handleRenderBackendChange}
            renderBackend={renderBackend}
            webGpuAvailable={webGpuAvailable}
          />
        </>
      ) : null}
    </main>
  );
}
