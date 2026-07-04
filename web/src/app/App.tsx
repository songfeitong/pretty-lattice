import { AlertTriangleIcon, FolderOpen, ImageDown, RefreshCw, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AtomInspectorCard } from "./AtomInspectorCard";
import type { SceneSpec } from "../api/scene";
import { inspectedAtomInfoForId } from "./atomInspector";
import {
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { ATOM_HIGHLIGHT_PULSE_MS } from "../scene/atomHighlight";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  CommonControlsPanel,
  type CommonPanelTab,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { createCameraInteractionStore } from "./cameraInteractionStore";
import { createPreviewFpsStore } from "../model/previewFpsStore";
import { deriveElementLegendEntries } from "./elementLegend";
import { useFigureExportController } from "./hooks/useFigureExportController";
import { useLockedInteractionFeedback } from "./hooks/useLockedInteractionFeedback";
import { usePreviewCameraCommands } from "./hooks/usePreviewCameraCommands";
import { useStructurePreview } from "./hooks/useStructurePreview";
import { ElementLegend } from "./legend/ElementLegend";
import {
  orientationGizmoContainerStyle,
  orientationGizmoSizeForViewport,
  useViewportSize,
} from "./layout/overlayLayout";
import { StructureSummaryCard } from "./panels/StructureSummaryCard";
import {
  InspectorSidebar,
  InspectorToggle,
  type InspectorSidebarTab,
} from "./inspector/InspectorSidebar";
import type { ObjectsPanelTab } from "./inspector/ObjectsPanel";
import {
  CUSTOM_ATOM_RADIUS_MODEL,
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultStyle,
  baseColorSchemeForStyle,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  canonicalAtomsForObjectStyles,
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  createCustomAtomRadii,
  createCustomColormapFromStyle,
  defaultPreviewMeshQualityForScene,
  elementColorOverridesForStyle,
  type AtomRadiusStyleModel,
  type MeshQuality,
  type UnitCellLineStyle,
  hasPolyhedra,
  previewSafeAreaForInspector,
  sceneOffsetXForInspector,
  visibleSceneForComponents,
} from "../model";

interface ResetLoadedPreviewOptions {
  preserveActiveCommonPanelTab?: boolean;
  preserveInspectorOpen?: boolean;
}

type ResetLoadedPreviewState = (
  nextScene: SceneSpec | null,
  options?: ResetLoadedPreviewOptions,
) => void;

export function App() {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [previewMeshQuality, setPreviewMeshQuality] = useState<MeshQuality>(
    () => defaultPreviewMeshQualityForScene(null),
  );
  const [unitCellLineStyle, setUnitCellLineStyle] = useState<UnitCellLineStyle>(
    DEFAULT_UNIT_CELL_LINE_STYLE,
  );
  const [showCrystalAxisLabels, setShowCrystalAxisLabels] = useState(
    DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  );
  const [inspectedAtomId, setInspectedAtomId] = useState<string | null>(null);
  const [pulseAtom, setPulseAtom] = useState<{ atomId: string; token: number } | null>(null);
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorSidebarTab>("settings");
  const [activeObjectsTab, setActiveObjectsTab] =
    useState<ObjectsPanelTab>("atoms");
  const [atomLocateRequest, setAtomLocateRequest] =
    useState<{ atomId: string; token: number } | null>(null);
  const [activeCommonPanelTab, setActiveCommonPanelTab] =
    useState<CommonPanelTab>("display");
  const [cameraInteractionStore] = useState(createCameraInteractionStore);
  const [previewFpsStore] = useState(createPreviewFpsStore);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(true);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inspectedAtomIdRef = useRef<string | null>(null);
  const previousAtomsVisibleRef = useRef(componentVisibility.atoms);
  const resetLoadedPreviewStateRef = useRef<ResetLoadedPreviewState>(() => {});
  const resetLoadedPreviewStateForPreview = useCallback<ResetLoadedPreviewState>(
    (nextScene, options) => {
      resetLoadedPreviewStateRef.current(nextScene, options);
    },
    [],
  );
  const handlePreviewCleared = useCallback(() => {
    setInspectedAtomId(null);
    setPulseAtom(null);
    setIsInspectorOpen(false);
    setIsStructureSummaryCollapsed(true);
  }, []);
  const handleBondAlgorithmSceneLoaded = useCallback((nextScene: SceneSpec) => {
    setInspectedAtomId(null);
    setPulseAtom(null);
    setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
    setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
    setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
  }, []);
  const {
    bondAlgorithm,
    errorMessage,
    errorTitle,
    handleBondAlgorithmChange,
    handleFileChange,
    handleResetAllSettings,
    previewStatus,
    scene,
    selectedFileName,
    setErrorMessage,
  } = useStructurePreview({
    onBondAlgorithmSceneLoaded: handleBondAlgorithmSceneLoaded,
    onPreviewCleared: handlePreviewCleared,
    resetLoadedPreviewState: resetLoadedPreviewStateForPreview,
  });
  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility, style.objectStyles),
    [componentVisibility, scene, style.objectStyles],
  );
  const objectStyleAtoms = useMemo(
    () => (scene ? canonicalAtomsForObjectStyles(scene.atoms) : []),
    [scene],
  );
  const inspectedAtomInfo = useMemo(
    () => inspectedAtomInfoForId(visibleScene, inspectedAtomId),
    [inspectedAtomId, visibleScene],
  );
  const hasVisibleScene = visibleScene !== null;
  const {
    cameraAnimatedCommandVersion,
    cameraCommandVersion,
    cameraControlsPanelState,
    cameraOrientationRef,
    cameraOrientationVersion,
    handleCameraCommandAnimationActiveChange,
    handleCameraControlsInteractionActiveChange,
    handleCameraOrientationChange,
    handleCameraPrimaryChange,
    handleCameraRollChange,
    handleCameraRollPreviewChange,
    handleCameraRollPreviewStart,
    handleCameraSecondaryChange,
    handleCameraStateChange,
    handleDragSensitivityChange,
    handleGizmoAxisClick,
    handleInteractionLockedChange,
    handleInteractionModeChange,
    handleLightStrengthChange,
    handleResetView,
    handleShowFpsOverlayChange,
    isCameraCommandAnimationActive,
    isCameraControlsInteractionActive,
    isCameraRollInteractionActive,
    orientationGizmoFrameRequestRef,
    requestOrientationGizmoFrame,
    resetCameraForScene,
    viewState,
  } = usePreviewCameraCommands({
    cameraInteractionStore,
    previewFpsStore,
    scene,
    visibleScene,
  });
  const {
    exportError,
    exportProjectedSize,
    exportSettings,
    handleExportFigure,
    handleExportSettingsChange,
    isExporting,
    resetExportState,
    setExportError,
    syncProjectedSizeForExportTab,
  } = useFigureExportController({
    cameraOrientationRef,
    componentOpacity,
    componentVisibility,
    lightStrength: viewState.lightStrength,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
    visibleScene,
  });
  const {
    handleSceneContextMenuCapture,
    handleScenePointerDownCapture,
    handleScenePointerEndCapture,
    handleScenePointerMoveCapture,
    handleSceneWheelCapture,
    lockedInteractionFeedbackCount,
    resetLockedInteractionFeedback,
    triggerLockedInteractionFeedback,
  } = useLockedInteractionFeedback({
    hasVisibleScene,
    interactionLocked: viewState.interactionLocked,
  });

  useEffect(() => {
    inspectedAtomIdRef.current = inspectedAtomId;
  }, [inspectedAtomId]);

  useEffect(() => {
    if (!previousAtomsVisibleRef.current && componentVisibility.atoms) {
      setStyle((currentStyle) => ({
        ...currentStyle,
        objectStyles: clearObjectStyleProperty(
          currentStyle.objectStyles,
          "visible",
        ),
      }));
    }

    previousAtomsVisibleRef.current = componentVisibility.atoms;
  }, [componentVisibility.atoms]);

  useEffect(() => {
    if (!pulseAtom) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPulseAtom((currentPulseAtom) =>
        currentPulseAtom?.token === pulseAtom.token ? null : currentPulseAtom,
      );
    }, ATOM_HIGHLIGHT_PULSE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pulseAtom]);

  const resetLoadedPreviewState = useCallback(
    (
      nextScene: SceneSpec | null,
      options: ResetLoadedPreviewOptions = {},
    ) => {
      setErrorMessage(null);
      resetExportState();
      setInspectedAtomId(null);
      setPulseAtom(null);
      if (!options.preserveInspectorOpen) {
        setIsInspectorOpen(false);
      }
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setComponentOpacity(createDefaultComponentOpacity());
      setStyle(createDefaultStyle());
      setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
      setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
      setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
      if (!options.preserveActiveCommonPanelTab) {
        setActiveCommonPanelTab("display");
      }
      resetLockedInteractionFeedback();
      setIsStructureSummaryCollapsed(true);
      resetCameraForScene(nextScene);
    },
    [
      resetCameraForScene,
      resetExportState,
      resetLockedInteractionFeedback,
      setErrorMessage,
    ],
  );

  useLayoutEffect(() => {
    resetLoadedPreviewStateRef.current = resetLoadedPreviewState;
  }, [resetLoadedPreviewState]);

  const handlePreviewMeshQualityChange = useCallback((nextQuality: MeshQuality) => {
    setPreviewMeshQuality(nextQuality);
  }, []);

  const handleFogAffectsUnitCellChange = useCallback((fogAffectsUnitCell: boolean) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      fogAffectsUnitCell,
    }));
  }, []);
  const handleDistinguishSimilarColorsChange = useCallback((distinguishSimilarColors: boolean) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      distinguishSimilarColors,
    }));
  }, []);

  const handleAtomPulse = useCallback((atomId: string) => {
    if (atomId === inspectedAtomIdRef.current) {
      return;
    }

    inspectedAtomIdRef.current = null;
    setInspectedAtomId(null);
    setPulseAtom((currentPulseAtom) => ({
      atomId,
      token: (currentPulseAtom?.token ?? 0) + 1,
    }));
  }, []);

  const requestAtomLocateInObjects = useCallback((atomId: string) => {
    setAtomLocateRequest((currentRequest) => ({
      atomId,
      token: (currentRequest?.token ?? 0) + 1,
    }));
  }, []);

  const handleAtomInspect = useCallback((atomId: string | null) => {
    inspectedAtomIdRef.current = atomId;
    setInspectedAtomId(atomId);
    if (
      atomId &&
      isInspectorOpen &&
      activeInspectorTab === "objects" &&
      activeObjectsTab === "atoms"
    ) {
      requestAtomLocateInObjects(atomId);
    }
  }, [
    activeInspectorTab,
    activeObjectsTab,
    isInspectorOpen,
    requestAtomLocateInObjects,
  ]);

  const handleLocateAtomInObjects = useCallback((atomId: string) => {
    setIsInspectorOpen(true);
    setActiveInspectorTab("objects");
    setActiveObjectsTab("atoms");
    requestAtomLocateInObjects(atomId);
  }, [requestAtomLocateInObjects]);

  const handleAtomRadiusModelChange = useCallback(
    (atomRadiusModel: AtomRadiusStyleModel) => {
      setStyle((currentStyle) => {
        if (atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
          if (currentStyle.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
            return currentStyle;
          }

          const customAtomRadii = createCustomAtomRadii(
            objectStyleAtoms,
            currentStyle,
          );
          const objectStylesWithoutRadius = clearObjectStyleProperty(
            currentStyle.objectStyles,
            "radius",
          );

          return {
            ...currentStyle,
            atomRadiusModel,
            objectStyles: {
              ...objectStylesWithoutRadius,
              customAtomRadii,
              customRadiusBaseModel: currentStyle.atomRadiusModel,
              customRadiusPreviousScale: currentStyle.atomRadius,
            },
          };
        }

        return {
          ...currentStyle,
          atomRadius:
            currentStyle.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL &&
            currentStyle.objectStyles.customRadiusPreviousScale !== null
              ? currentStyle.objectStyles.customRadiusPreviousScale
              : currentStyle.atomRadius,
          atomRadiusModel,
          objectStyles: clearObjectStyleProperty(
            currentStyle.objectStyles,
            "radius",
          ),
        };
      });
    },
    [objectStyleAtoms],
  );

  const elementColorOverrides = useMemo(
    () =>
      scene
        ? elementColorOverridesForStyle(scene.atoms, style)
        : undefined,
    [scene, style],
  );
  const legendColorScheme = baseColorSchemeForStyle(style);
  const legendEntries = useMemo(
    () => deriveElementLegendEntries(scene, legendColorScheme, elementColorOverrides),
    [elementColorOverrides, legendColorScheme, scene],
  );
  const handleLegendElementColorChange = useCallback((element: string, color: string) => {
    setStyle((currentStyle) => {
      const draft = scene
        ? createCustomColormapFromStyle(scene.atoms, currentStyle)
        : (
            currentStyle.customColormap ??
            createCustomColormapFromStyle([], currentStyle)
          );
      const objectStyles = scene
        ? clearAtomOverridePropertyForElement(
            currentStyle.objectStyles,
            scene.atoms,
            element,
            "color",
          )
        : currentStyle.objectStyles;

      return {
        ...currentStyle,
        colorSchemeMode: "custom",
        colorScheme: draft.baseColorScheme,
        customColormap: {
          baseColorScheme: draft.baseColorScheme,
          elements: {
            ...draft.elements,
            [element]: color,
          },
        },
        objectStyles,
      };
    });
  }, [scene]);
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
  const renderPreviewContextMenuContent = () => (
    <ContextMenuContent className="w-36">
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={handleResetView}
        >
          <RotateCcw aria-hidden="true" />
          Reset view
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onSelect={() => fileInputRef.current?.click()}>
          <FolderOpen aria-hidden="true" />
          Open file
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!scene || isExporting || previewStatus === "loading"}
          onSelect={() => {
            void handleExportFigure();
          }}
        >
          <ImageDown aria-hidden="true" />
          Export figure
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem
          disabled={!scene || previewStatus === "loading"}
          onSelect={() => {
            void handleResetAllSettings();
          }}
        >
          <RefreshCw aria-hidden="true" />
          Reset all
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

  useEffect(() => {
    if (!inspectedAtomId) {
      return;
    }

    if (!visibleScene || !componentVisibility.atoms || !inspectedAtomInfo) {
      setInspectedAtomId(null);
    }
  }, [componentVisibility.atoms, inspectedAtomId, inspectedAtomInfo, visibleScene]);

  useEffect(() => {
    if (activeCommonPanelTab !== "export") {
      return;
    }

    syncProjectedSizeForExportTab();
  }, [activeCommonPanelTab, cameraOrientationVersion, syncProjectedSizeForExportTab]);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Structure file"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => void handleFileChange(event)}
      />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <section
            className="scene-stage absolute inset-0 transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(${sceneOffsetX}px)` }}
            aria-label="Crystal structure preview"
            onPointerCancelCapture={handleScenePointerEndCapture}
            onContextMenuCapture={handleSceneContextMenuCapture}
            onPointerDownCapture={handleScenePointerDownCapture}
            onPointerMoveCapture={handleScenePointerMoveCapture}
            onPointerUpCapture={handleScenePointerEndCapture}
            onWheelCapture={handleSceneWheelCapture}
          >
            {visibleScene ? (
              <LatticeScene
                cameraAnimatedCommandVersion={cameraAnimatedCommandVersion}
                cameraCommandVersion={cameraCommandVersion}
                cameraState={viewState.camera}
                cameraOrientationRef={cameraOrientationRef}
                onCameraOrientationFrame={requestOrientationGizmoFrame}
                onCameraOrientationChange={handleCameraOrientationChange}
                onCameraCommandAnimationActiveChange={handleCameraCommandAnimationActiveChange}
                onCameraControlsInteractionActiveChange={
                  handleCameraControlsInteractionActiveChange
                }
                onAtomInspect={handleAtomInspect}
                onAtomPulse={handleAtomPulse}
                onLockedInteractionAttempt={triggerLockedInteractionFeedback}
                cameraInteractionStore={cameraInteractionStore}
                suspendCameraOrientationUpdates={
                  isCameraCommandAnimationActive ||
                  isCameraControlsInteractionActive ||
                  isCameraRollInteractionActive
                }
                interactionLocked={viewState.interactionLocked}
                interactionMode={viewState.interactionMode}
                layoutScene={scene ?? visibleScene}
                resetCounter={viewState.resetCounter}
                safeArea={previewSafeArea}
                scene={visibleScene}
                inspectedAtomId={inspectedAtomId}
                pulseAtomId={pulseAtom?.atomId ?? null}
                pulseToken={pulseAtom?.token ?? 0}
                previewMeshQuality={previewMeshQuality}
                componentOpacity={componentOpacity}
                dragSensitivity={viewState.dragSensitivity}
                lightStrength={viewState.lightStrength}
                previewFpsStore={previewFpsStore}
                style={style}
                showAtoms={componentVisibility.atoms}
                showFpsOverlay={viewState.showFpsOverlay}
                showUnitCell={componentVisibility.unitCell}
                unitCellLineStyle={unitCellLineStyle}
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
        </ContextMenuTrigger>
        {renderPreviewContextMenuContent()}
      </ContextMenu>

      {visibleScene ? (
        <OrientationGizmo
          cameraOrientationRef={cameraOrientationRef}
          cellVectors={visibleScene.cell.vectors}
          className="absolute"
          frameRequestRef={orientationGizmoFrameRequestRef}
          onAxisClick={handleGizmoAxisClick}
          orientationVersion={cameraOrientationVersion}
          showLabels={showCrystalAxisLabels}
          style={orientationGizmoContainerStyle(effectivePreviewSafeArea, orientationGizmoSize)}
        />
      ) : null}

      {legendEntries.length > 0 ? (
        <ElementLegend
          entries={legendEntries}
          offsetX={sceneOffsetX}
          onElementColorChange={handleLegendElementColorChange}
          safeArea={previewSafeArea}
        />
      ) : null}

      {inspectedAtomInfo ? (
        <AtomInspectorCard
          colorScheme={legendColorScheme}
          colorOverrides={elementColorOverrides}
          info={inspectedAtomInfo}
          isInspectorOpen={isInspectorOpen}
          onClose={() => setInspectedAtomId(null)}
          onLocateInObjects={handleLocateAtomInObjects}
          style={style}
        />
      ) : null}

      <div
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
          <div>
            <CommonControlsPanel
              activeTab={activeCommonPanelTab}
              cameraState={cameraControlsPanelState}
              cellVectors={scene.cell.vectors}
              componentOpacity={componentOpacity}
              style={style}
              exportProjectedSize={exportProjectedSize ?? undefined}
              componentVisibility={componentVisibility}
              exportError={exportError}
              exportSettings={exportSettings}
              hasPolyhedra={hasPolyhedra(scene)}
              isExporting={isExporting}
              onActiveTabChange={setActiveCommonPanelTab}
              onAtomRadiusModelChange={handleAtomRadiusModelChange}
              onCameraPrimaryChange={handleCameraPrimaryChange}
              onCameraRollPreviewChange={handleCameraRollPreviewChange}
              onCameraRollPreviewStart={handleCameraRollPreviewStart}
              onCameraRollChange={handleCameraRollChange}
              onCameraSecondaryChange={handleCameraSecondaryChange}
              onCameraStateChange={handleCameraStateChange}
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
            cameraInteractionStore={cameraInteractionStore}
            previewFpsStore={previewFpsStore}
            showFps={viewState.showFpsOverlay}
          />

          <InspectorToggle
            isOpen={isInspectorOpen}
            onOpenChange={setIsInspectorOpen}
          />

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="contents">
                <InspectorSidebar
                  activeObjectsTab={activeObjectsTab}
                  activeTab={activeInspectorTab}
                  atomLocateRequest={atomLocateRequest}
                  atomsVisible={componentVisibility.atoms}
                  bondAlgorithm={bondAlgorithm}
                  dragSensitivity={viewState.dragSensitivity}
                  interactionMode={viewState.interactionMode}
                  lightStrength={viewState.lightStrength}
                  isCustomColorScheme={style.colorSchemeMode === "custom"}
                  isOpen={isInspectorOpen}
                  isSceneLoading={previewStatus === "loading"}
                  previewMeshQuality={previewMeshQuality}
                  fogAffectsUnitCell={style.fogAffectsUnitCell}
                  distinguishSimilarColors={style.distinguishSimilarColors}
                  scene={scene}
                  selectedAtomId={inspectedAtomId}
                  showFpsOverlay={viewState.showFpsOverlay}
                  showCrystalAxisLabels={showCrystalAxisLabels}
                  style={style}
                  unitCellLineStyle={unitCellLineStyle}
                  onActiveObjectsTabChange={setActiveObjectsTab}
                  onActiveTabChange={setActiveInspectorTab}
                  onAtomSelect={handleAtomInspect}
                  onBondAlgorithmChange={(nextBondAlgorithm) => {
                    void handleBondAlgorithmChange(nextBondAlgorithm);
                  }}
                  onDragSensitivityChange={handleDragSensitivityChange}
                  onInteractionModeChange={handleInteractionModeChange}
                  onLightStrengthChange={handleLightStrengthChange}
                  onPreviewMeshQualityChange={handlePreviewMeshQualityChange}
                  onFogAffectsUnitCellChange={handleFogAffectsUnitCellChange}
                  onDistinguishSimilarColorsChange={handleDistinguishSimilarColorsChange}
                  onElementColorChange={handleLegendElementColorChange}
                  onShowFpsOverlayChange={handleShowFpsOverlayChange}
                  onShowCrystalAxisLabelsChange={setShowCrystalAxisLabels}
                  onStyleChange={setStyle}
                  onUnitCellLineStyleChange={setUnitCellLineStyle}
                />
              </div>
            </ContextMenuTrigger>
            {renderPreviewContextMenuContent()}
          </ContextMenu>
        </>
      ) : null}
    </main>
  );
}
