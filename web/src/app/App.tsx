import { AlertTriangleIcon, FolderOpen, ImageDown, RefreshCw, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { MotionProvider, useMotion } from "@/motion/MotionProvider";
import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AtomInspectorCard } from "./AtomInspectorCard";
import { BondInspectorCard } from "./BondInspectorCard";
import type { BondCutoffRange, SceneSpec } from "../api/scene";
import {
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  CommonControlsPanel,
  type CommonPanelTab,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { createCameraInteractionStore } from "./cameraInteractionStore";
import {
  ColorPickerRegistryProvider,
  useColorPickerRegistry,
} from "./colorPickerRegistry";
import { createPreviewFpsStore } from "../model/previewFpsStore";
import { useFigureAppearanceController } from "./hooks/useFigureAppearanceController";
import { useFigureExportController } from "./hooks/useFigureExportController";
import { useLockedInteractionFeedback } from "./hooks/useLockedInteractionFeedback";
import { usePreviewCameraCommands } from "./hooks/usePreviewCameraCommands";
import { useSceneObjectInteractionController } from "./hooks/useSceneObjectInteractionController";
import { useStructurePreview } from "./hooks/useStructurePreview";
import type { StructurePreviewErrorKind } from "./hooks/useStructurePreview";
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
} from "./inspector/InspectorSidebar";
import {
  hasPolyhedra,
  previewSafeAreaForInspector,
  sceneOffsetXForInspector,
} from "../model";
const EMPTY_BOND_CUTOFF_OVERRIDES: Record<string, BondCutoffRange> = {};

interface ResetLoadedPreviewOptions {
  preserveActiveCommonPanelTab?: boolean;
  preserveInspectorOpen?: boolean;
}

type ResetLoadedPreviewState = (
  nextScene: SceneSpec | null,
  options?: ResetLoadedPreviewOptions,
) => void;

export function App() {
  return (
    <MotionProvider>
      <ThemeProvider>
        <ColorPickerRegistryProvider>
          <AppContent />
        </ColorPickerRegistryProvider>
      </ThemeProvider>
    </MotionProvider>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const { reducedMotion } = useMotion();
  const { closeActiveColorPicker } = useColorPickerRegistry();
  const [activeCommonPanelTab, setActiveCommonPanelTab] =
    useState<CommonPanelTab>("display");
  const [cameraInteractionStore] = useState(createCameraInteractionStore);
  const [previewFpsStore] = useState(createPreviewFpsStore);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(true);
  const [workspaceResetRequest, setWorkspaceResetRequest] = useState<{
    options: ResetLoadedPreviewOptions;
    scene: SceneSpec | null;
    token: number;
  }>({ options: {}, scene: null, token: 0 });
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resetLoadedPreviewState = useCallback<ResetLoadedPreviewState>(
    (nextScene, options = {}) => {
      closeActiveColorPicker();
      setWorkspaceResetRequest((currentRequest) => ({
        options,
        scene: nextScene,
        token: currentRequest.token + 1,
      }));
    },
    [closeActiveColorPicker],
  );
  const handlePreviewCleared = useCallback(() => {
    resetLoadedPreviewState(null);
  }, [resetLoadedPreviewState]);
  const handleBondAlgorithmSceneLoaded = useCallback(() => {
    closeActiveColorPicker();
  }, [closeActiveColorPicker]);
  const {
    bondAlgorithm,
    customBondingProfile,
    connectivityIntent,
    connectivityRetryable,
    connectivityStatus,
    errorKind,
    errorMessage,
    errorTitle,
    handleBondAlgorithmChange,
    handleBondCutoffOverridesChange,
    handleFileChange,
    handleResetAllSettings,
    requestConnectivity,
    previewStatus,
    scene,
    selectedFileName,
    setErrorMessage,
  } = useStructurePreview({
    onBondAlgorithmSceneLoaded: handleBondAlgorithmSceneLoaded,
    onPreviewCleared: handlePreviewCleared,
    resetLoadedPreviewState,
  });
  const appearance = useFigureAppearanceController({
    closeActiveColorPicker,
    connectivityStatus,
    requestConnectivity,
    scene,
  });
  const interaction = useSceneObjectInteractionController({
    closeActiveColorPicker,
    componentVisibility: appearance.componentVisibility,
    connectivityStatus,
    hideAtom: appearance.hideAtom,
    requestConnectivity,
    setBondVisible: appearance.setBondVisible,
    visibleScene: appearance.visibleScene,
  });
  const {
    bondVisibilityOverrides,
    componentOpacity,
    componentVisibility,
    elementColorOverrides,
    handleBondFamilyVisibilityChange,
    handleComponentOpacityChange,
    handleComponentOpacityReset,
    handleComponentVisibilityChange,
    handleDistinguishSimilarColorsChange,
    handleFogAffectsUnitCellChange,
    handleLegendElementColorChange,
    legendColorScheme,
    legendEntries,
    objectStyleAtoms,
    previewMeshQuality,
    resetAppearance,
    setPreviewMeshQuality,
    setShowCrystalAxisLabels,
    setStructureLineWidth,
    setStyle,
    setUnitCellLineStyle,
    showCrystalAxisLabels,
    structureLineWidth,
    style,
    unitCellLineStyle,
    visibleScene,
  } = appearance;
  const {
    activeInspectorTab,
    activeObjectsTab,
    atomLocateRequest,
    bondLocateRequest,
    bondObjectsResetToken,
    clearSelection,
    handleActiveInspectorTabChange,
    handleActiveObjectsTabChange,
    handleAtomInspect,
    handleAtomLocateRequestHandled,
    handleAtomPulse,
    handleBondInspect,
    handleBondLocateRequestHandled,
    handleBondPulse,
    handleBondVisibilityChange,
    handleHideAtom,
    handleHideBond,
    handleInspectorOpenChange,
    handleLocateAtomInObjects,
    handleLocateBondInObjects,
    handleSelectionActivationChange,
    inspectedAtomId,
    inspectedAtomInfo,
    inspectedBondId,
    inspectedBondInfo,
    isInspectorOpen,
    pulsedSceneObject,
    resetInteraction,
    selectionActivation,
  } = interaction;
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
    handleMouseInertiaChange,
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
    bondVisibilityOverrides,
    cameraOrientationRef,
    componentOpacity,
    componentVisibility,
    lightStrength: viewState.lightStrength,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    structureLineWidth,
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

  useLayoutEffect(() => {
    if (workspaceResetRequest.token === 0) {
      return;
    }
    resetAppearance(workspaceResetRequest.scene);
    resetInteraction(workspaceResetRequest.options.preserveInspectorOpen);
    if (!workspaceResetRequest.options.preserveActiveCommonPanelTab) {
      setActiveCommonPanelTab("display");
    }
    setIsStructureSummaryCollapsed(true);
    resetExportState();
    resetLockedInteractionFeedback();
    resetCameraForScene(workspaceResetRequest.scene);
  }, [
    resetCameraForScene,
    resetAppearance,
    resetExportState,
    resetInteraction,
    resetLockedInteractionFeedback,
    workspaceResetRequest,
  ]);

  const handleActiveCommonPanelTabChange = useCallback((tab: CommonPanelTab) => {
    closeActiveColorPicker();
    setActiveCommonPanelTab(tab);
  }, [closeActiveColorPicker]);
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
          {t("actions.resetView")}
        </ContextMenuItem>
      </ContextMenuGroup>
      <ContextMenuSeparator />
      <ContextMenuGroup>
        <ContextMenuItem onSelect={() => fileInputRef.current?.click()}>
          <FolderOpen aria-hidden="true" />
          {t("actions.openFile")}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!scene || isExporting || previewStatus === "loading"}
          onSelect={() => {
            void handleExportFigure();
          }}
        >
          <ImageDown aria-hidden="true" />
          {t("actions.exportFigure")}
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
          {t("actions.resetAll")}
        </ContextMenuItem>
      </ContextMenuGroup>
    </ContextMenuContent>
  );

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
        aria-label={t("preview.structureFile")}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => void handleFileChange(event)}
      />

      <ContextMenu>
        <ContextMenuTrigger asChild>
          <section
            className="scene-stage absolute inset-0 transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none"
            style={{ transform: `translateX(${sceneOffsetX}px)` }}
            aria-label={t("preview.crystalStructurePreview")}
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
                onBondInspect={handleBondInspect}
                onBondPulse={handleBondPulse}
                onLockedInteractionAttempt={triggerLockedInteractionFeedback}
                cameraInteractionStore={cameraInteractionStore}
                suspendCameraOrientationUpdates={
                  isCameraCommandAnimationActive ||
                  isCameraControlsInteractionActive ||
                  isCameraRollInteractionActive
                }
                interactionLocked={viewState.interactionLocked}
                interactionMode={viewState.interactionMode}
                selectionActivation={selectionActivation}
                mouseInertia={viewState.mouseInertia}
                layoutScene={scene ?? visibleScene}
                resetCounter={viewState.resetCounter}
                safeArea={previewSafeArea}
                scene={visibleScene}
                inspectedAtomId={inspectedAtomId}
                inspectedBondId={inspectedBondId}
                pulseAtomId={
                  pulsedSceneObject?.kind === "atom"
                    ? pulsedSceneObject.id
                    : null
                }
                pulseToken={
                  pulsedSceneObject?.kind === "atom"
                    ? pulsedSceneObject.token
                    : 0
                }
                pulseBondId={
                  pulsedSceneObject?.kind === "bond"
                    ? pulsedSceneObject.id
                    : null
                }
                pulseBondToken={
                  pulsedSceneObject?.kind === "bond"
                    ? pulsedSceneObject.token
                    : 0
                }
                previewMeshQuality={previewMeshQuality}
                reducedMotion={reducedMotion}
                componentOpacity={componentOpacity}
                dragSensitivity={viewState.dragSensitivity}
                lightStrength={viewState.lightStrength}
                previewFpsStore={previewFpsStore}
                style={style}
                structureLineWidth={structureLineWidth}
                theme={resolvedTheme}
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
                      className="inline-flex size-3 shrink-0 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground motion-enabled:animate-spin motion-enabled:[animation-duration:450ms]"
                    />
                    {t("preview.loadingStructure")}
                  </span>
                ) : (
                  t("preview.noStructureLoaded")
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
          theme={resolvedTheme}
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
          onClose={clearSelection}
          onHide={handleHideAtom}
          onLocateInObjects={handleLocateAtomInObjects}
          style={style}
        />
      ) : null}

      {inspectedBondInfo ? (
        <BondInspectorCard
          colorScheme={legendColorScheme}
          colorOverrides={elementColorOverrides}
          info={inspectedBondInfo}
          isInspectorOpen={isInspectorOpen}
          onClose={clearSelection}
          onHide={handleHideBond}
          onLocateInObjects={handleLocateBondInObjects}
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
              connectivityIntent={connectivityIntent}
              connectivityStatus={connectivityStatus}
              exportError={exportError}
              exportSettings={exportSettings}
              hasPolyhedra={hasPolyhedra(scene)}
              isExporting={isExporting}
              onActiveTabChange={handleActiveCommonPanelTabChange}
              onCameraPrimaryChange={handleCameraPrimaryChange}
              onCameraRollPreviewChange={handleCameraRollPreviewChange}
              onCameraRollPreviewStart={handleCameraRollPreviewStart}
              onCameraRollChange={handleCameraRollChange}
              onCameraSecondaryChange={handleCameraSecondaryChange}
              onCameraStateChange={handleCameraStateChange}
              onComponentOpacityChange={handleComponentOpacityChange}
              onComponentOpacityReset={handleComponentOpacityReset}
              onExport={handleExportFigure}
              onExportSettingsChange={handleExportSettingsChange}
              onStyleChange={setStyle}
              onComponentVisibilityChange={handleComponentVisibilityChange}
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
          <AlertTitle className="font-semibold">
            {localizedPreviewErrorTitle(errorKind, errorTitle, t)}
          </AlertTitle>
          <AlertDescription>
            {localizedPreviewErrorMessage(errorKind, errorMessage, t)}
            {errorKind === "bonding-error" && connectivityRetryable ? (
              <Button className="mt-2 h-7 px-2 text-xs" variant="outline" disabled={connectivityStatus === "loading"} onClick={() => void requestConnectivity(connectivityIntent ?? "preserve")}>Retry</Button>
            ) : null}
          </AlertDescription>
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
            onOpenChange={handleInspectorOpenChange}
          />

          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div className="contents">
                <InspectorSidebar
                  activeObjectsTab={activeObjectsTab}
                  activeTab={activeInspectorTab}
                  atomLocateRequest={atomLocateRequest}
                  atomOpacity={componentOpacity.atoms}
                  atomsVisible={componentVisibility.atoms}
                  bondAlgorithm={bondAlgorithm}
                  bondLocateRequest={bondLocateRequest}
                  bondObjectsResetToken={bondObjectsResetToken}
                  bondsVisible={componentVisibility.bonds}
                  bondVisibilityOverrides={bondVisibilityOverrides}
                  cutoffOverrides={
                    customBondingProfile?.cutoffOverrides ??
                    EMPTY_BOND_CUTOFF_OVERRIDES
                  }
                  hasCustomBondingProfile={customBondingProfile !== null}
                  dragSensitivity={viewState.dragSensitivity}
                  interactionMode={viewState.interactionMode}
                  selectionActivation={selectionActivation}
                  lightStrength={viewState.lightStrength}
                  mouseInertia={viewState.mouseInertia}
                  isCustomColorScheme={style.colorSchemeMode === "custom"}
                  isOpen={isInspectorOpen}
                  isSceneLoading={previewStatus === "loading" || connectivityStatus === "loading"}
                  previewMeshQuality={previewMeshQuality}
                  fogAffectsUnitCell={style.fogAffectsUnitCell}
                  distinguishSimilarColors={style.distinguishSimilarColors}
                  scene={scene}
                  selectedAtomId={inspectedAtomId}
                  selectedBondId={inspectedBondId}
                  showFpsOverlay={viewState.showFpsOverlay}
                  showCrystalAxisLabels={showCrystalAxisLabels}
                  style={style}
                  structureLineWidth={structureLineWidth}
                  unitCellLineStyle={unitCellLineStyle}
                  onActiveObjectsTabChange={handleActiveObjectsTabChange}
                  onActiveTabChange={handleActiveInspectorTabChange}
                  onAtomLocateRequestHandled={handleAtomLocateRequestHandled}
                  onBondLocateRequestHandled={handleBondLocateRequestHandled}
                  onBondVisibilityChange={handleBondVisibilityChange}
                  onBondCutoffChange={handleBondCutoffOverridesChange}
                  onBondCutoffEditingStart={() => handleBondInspect(null)}
                  bondOpacity={componentOpacity.bonds}
                  onBondFamilyVisibilityChange={handleBondFamilyVisibilityChange}
                  onBondAlgorithmChange={(nextBondAlgorithm) => {
                    void handleBondAlgorithmChange(nextBondAlgorithm);
                  }}
                  onDragSensitivityChange={handleDragSensitivityChange}
                  onInteractionModeChange={handleInteractionModeChange}
                  onSelectionActivationChange={handleSelectionActivationChange}
                  onLightStrengthChange={handleLightStrengthChange}
                  onMouseInertiaChange={handleMouseInertiaChange}
                  onPreviewMeshQualityChange={setPreviewMeshQuality}
                  onFogAffectsUnitCellChange={handleFogAffectsUnitCellChange}
                  onDistinguishSimilarColorsChange={handleDistinguishSimilarColorsChange}
                  onElementColorChange={handleLegendElementColorChange}
                  onShowFpsOverlayChange={handleShowFpsOverlayChange}
                  onShowCrystalAxisLabelsChange={setShowCrystalAxisLabels}
                  onStyleChange={setStyle}
                  onStructureLineWidthChange={setStructureLineWidth}
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

function localizedPreviewErrorTitle(
  kind: StructurePreviewErrorKind | null,
  fallbackTitle: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (kind === "backend-unavailable") {
    return t("validation.pythonBackendUnavailable");
  }
  if (kind === "bonding-error") {
    return t("validation.bondingFailed");
  }
  if (kind) {
    return t("validation.unsupportedFile");
  }
  return fallbackTitle;
}

function localizedPreviewErrorMessage(
  kind: StructurePreviewErrorKind | null,
  fallbackMessage: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (kind === "backend-unavailable") {
    return t("validation.startLocalBackend");
  }
  if (kind === "file-too-large") {
    return t("validation.fileTooLarge");
  }
  if (kind === "parse-error") {
    return t("validation.parseError");
  }
  if (kind === "bonding-error") {
    return fallbackMessage;
  }
  if (kind === "static-example") {
    return t("validation.staticExampleFailed");
  }
  return fallbackMessage;
}
