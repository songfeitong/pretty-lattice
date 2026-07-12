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
import {
  DEFAULT_SELECTION_ACTIVATION,
  readSelectionActivation,
  type SelectionActivation,
  writeSelectionActivation,
} from "@/selection/selectionActivationPreference";
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
import {
  ColorPickerRegistryProvider,
  useColorPickerRegistry,
} from "./colorPickerRegistry";
import { createPreviewFpsStore } from "../model/previewFpsStore";
import { deriveElementLegendEntries } from "./elementLegend";
import { useFigureExportController } from "./hooks/useFigureExportController";
import { useLockedInteractionFeedback } from "./hooks/useLockedInteractionFeedback";
import { usePreviewCameraCommands } from "./hooks/usePreviewCameraCommands";
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
  type InspectorSidebarTab,
} from "./inspector/InspectorSidebar";
import type { ObjectsPanelTab } from "./inspector/ObjectsPanel";
import {
  createDefaultComponentOpacity,
  createDefaultComponentVisibility,
  createDefaultBondVisibilityOverrides,
  createDefaultStyle,
  baseColorSchemeForStyle,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  canonicalAtomsForObjectStyles,
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_STRUCTURE_LINE_WIDTH,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  createCustomColormapFromStyle,
  defaultPreviewMeshQualityForScene,
  elementColorOverridesForStyle,
  type MeshQuality,
  type StructureLineWidthState,
  type UnitCellLineStyle,
  hasPolyhedra,
  previewSafeAreaForInspector,
  sceneOffsetXForInspector,
  setAtomOverrideProperty,
  visibleSceneForComponents,
  inspectedBondInfoForId,
  setBondFamilyVisible,
  setBondRelationVisible,
  type BondVisibilityOverrides,
  type ComponentOpacityState,
  type ComponentVisibilityState,
} from "../model";

type InspectedSceneObject =
  | { kind: "atom"; id: string }
  | { kind: "bond"; id: string }
  | null;

type PulsedSceneObject = Exclude<InspectedSceneObject, null> & { token: number };
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
  const [structureLineWidth, setStructureLineWidth] =
    useState<StructureLineWidthState>(DEFAULT_STRUCTURE_LINE_WIDTH);
  const [showCrystalAxisLabels, setShowCrystalAxisLabels] = useState(
    DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  );
  const [inspectedSceneObject, setInspectedSceneObject] =
    useState<InspectedSceneObject>(null);
  const [selectionActivation, setSelectionActivationState] =
    useState(readSelectionActivation);
  const [pulsedSceneObject, setPulsedSceneObject] =
    useState<PulsedSceneObject | null>(null);
  const [bondVisibilityOverrides, setBondVisibilityOverrides] =
    useState<BondVisibilityOverrides>(createDefaultBondVisibilityOverrides);
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorSidebarTab>("settings");
  const [activeObjectsTab, setActiveObjectsTab] =
    useState<ObjectsPanelTab>("atoms");
  const [atomLocateRequest, setAtomLocateRequest] =
    useState<{ atomId: string; token: number } | null>(null);
  const [bondLocateRequest, setBondLocateRequest] =
    useState<{ bondId: string; token: number } | null>(null);
  const [bondObjectsResetToken, setBondObjectsResetToken] = useState(0);
  const [activeCommonPanelTab, setActiveCommonPanelTab] =
    useState<CommonPanelTab>("display");
  const [cameraInteractionStore] = useState(createCameraInteractionStore);
  const [previewFpsStore] = useState(createPreviewFpsStore);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(true);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inspectedSceneObjectRef = useRef<InspectedSceneObject>(null);
  const previousAtomsVisibleRef = useRef(componentVisibility.atoms);
  const previousBondsVisibleRef = useRef(componentVisibility.bonds);
  const colorSchemeSelectionRef = useRef({
    colorScheme: style.colorScheme,
    colorSchemeMode: style.colorSchemeMode,
  });
  const resetLoadedPreviewStateRef = useRef<ResetLoadedPreviewState>(() => {});
  const resetLoadedPreviewStateForPreview = useCallback<ResetLoadedPreviewState>(
    (nextScene, options) => {
      resetLoadedPreviewStateRef.current(nextScene, options);
    },
    [],
  );
  const handlePreviewCleared = useCallback(() => {
    closeActiveColorPicker();
    setInspectedSceneObject(null);
    setPulsedSceneObject(null);
    setBondVisibilityOverrides(createDefaultBondVisibilityOverrides());
    setAtomLocateRequest(null);
    setBondLocateRequest(null);
    setIsInspectorOpen(false);
    setIsStructureSummaryCollapsed(true);
  }, [closeActiveColorPicker]);
  const handleBondAlgorithmSceneLoaded = useCallback((nextScene: SceneSpec) => {
    closeActiveColorPicker();
    const inspectedObject = inspectedSceneObjectRef.current;
    if (
      inspectedObject?.kind === "bond" &&
      !nextScene.bonds.some((bond) => bond.id === inspectedObject.id)
    ) {
      inspectedSceneObjectRef.current = null;
      setInspectedSceneObject(null);
    }
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
    resetLoadedPreviewState: resetLoadedPreviewStateForPreview,
  });
  const visibleScene = useMemo(
    () =>
      visibleSceneForComponents(
        scene,
        componentVisibility,
        style.objectStyles,
        bondVisibilityOverrides,
      ),
    [bondVisibilityOverrides, componentVisibility, scene, style.objectStyles],
  );
  const inspectedAtomId =
    inspectedSceneObject?.kind === "atom" ? inspectedSceneObject.id : null;
  const inspectedBondId =
    inspectedSceneObject?.kind === "bond" ? inspectedSceneObject.id : null;
  const objectStyleAtoms = useMemo(
    () => (scene ? canonicalAtomsForObjectStyles(scene.atoms) : []),
    [scene],
  );
  const inspectedAtomInfo = useMemo(
    () => inspectedAtomInfoForId(visibleScene, inspectedAtomId),
    [inspectedAtomId, visibleScene],
  );
  const inspectedBondInfo = useMemo(
    () => inspectedBondInfoForId(visibleScene, inspectedBondId),
    [inspectedBondId, visibleScene],
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

  useEffect(() => {
    inspectedSceneObjectRef.current = inspectedSceneObject;
  }, [inspectedSceneObject]);

  useEffect(() => {
    const previousSelection = colorSchemeSelectionRef.current;
    const changedToPreset =
      style.colorSchemeMode === "preset" &&
      (previousSelection.colorSchemeMode !== "preset" ||
        previousSelection.colorScheme !== style.colorScheme);

    colorSchemeSelectionRef.current = {
      colorScheme: style.colorScheme,
      colorSchemeMode: style.colorSchemeMode,
    };

    if (changedToPreset) {
      closeActiveColorPicker();
    }
  }, [closeActiveColorPicker, style.colorScheme, style.colorSchemeMode]);

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
    if (!previousBondsVisibleRef.current && componentVisibility.bonds) {
      setBondVisibilityOverrides(createDefaultBondVisibilityOverrides());
    }
    previousBondsVisibleRef.current = componentVisibility.bonds;
  }, [componentVisibility.bonds]);

  useEffect(() => {
    if (!pulsedSceneObject) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setPulsedSceneObject((currentPulse) =>
        currentPulse?.token === pulsedSceneObject.token ? null : currentPulse,
      );
    }, ATOM_HIGHLIGHT_PULSE_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [pulsedSceneObject]);

  const resetLoadedPreviewState = useCallback(
    (
      nextScene: SceneSpec | null,
      options: ResetLoadedPreviewOptions = {},
    ) => {
      setErrorMessage(null);
      closeActiveColorPicker();
      resetExportState();
      setInspectedSceneObject(null);
      setPulsedSceneObject(null);
      writeSelectionActivation(DEFAULT_SELECTION_ACTIVATION);
      setSelectionActivationState(DEFAULT_SELECTION_ACTIVATION);
      setBondVisibilityOverrides(createDefaultBondVisibilityOverrides());
      setAtomLocateRequest(null);
      setBondLocateRequest(null);
      setBondObjectsResetToken((token) => token + 1);
      if (!options.preserveInspectorOpen) {
        setIsInspectorOpen(false);
      }
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setComponentOpacity(createDefaultComponentOpacity());
      setStyle(createDefaultStyle());
      setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
      setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
      setStructureLineWidth(DEFAULT_STRUCTURE_LINE_WIDTH);
      setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
      if (!options.preserveActiveCommonPanelTab) {
        setActiveCommonPanelTab("display");
      }
      resetLockedInteractionFeedback();
      setIsStructureSummaryCollapsed(true);
      resetCameraForScene(nextScene);
    },
    [
      closeActiveColorPicker,
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

  const handleInspectorOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      closeActiveColorPicker();
    }
    setIsInspectorOpen(isOpen);
  }, [closeActiveColorPicker]);

  const handleActiveCommonPanelTabChange = useCallback((tab: CommonPanelTab) => {
    closeActiveColorPicker();
    setActiveCommonPanelTab(tab);
  }, [closeActiveColorPicker]);

  const handleActiveInspectorTabChange = useCallback((tab: InspectorSidebarTab) => {
    closeActiveColorPicker();
    setActiveInspectorTab(tab);
  }, [closeActiveColorPicker]);

  const handleActiveObjectsTabChange = useCallback((tab: ObjectsPanelTab) => {
    closeActiveColorPicker();
    setActiveObjectsTab(tab);
    if (tab === "bonds" && connectivityStatus !== "ready") {
      void requestConnectivity("objects");
    }
  }, [closeActiveColorPicker, connectivityStatus, requestConnectivity]);

  const handleComponentVisibilityChange = useCallback(async (
    key: keyof ComponentVisibilityState,
    value: boolean,
  ) => {
    if (value && (key === "bonds" || key === "polyhedra" || key === "oneHopBondedAtoms") && connectivityStatus !== "ready") {
      const succeeded = await requestConnectivity(key);
      if (!succeeded) return;
    }
    setComponentVisibility((current) => ({ ...current, [key]: value }));
  }, [connectivityStatus, requestConnectivity]);

  const handleComponentOpacityChange = useCallback((
    key: keyof ComponentOpacityState,
    value: number,
  ) => {
    setComponentOpacity((currentOpacity) => ({
      ...currentOpacity,
      [key]: value,
    }));
    if (key === "atoms") {
      setStyle((currentStyle) => ({
        ...currentStyle,
        objectStyles: clearObjectStyleProperty(
          currentStyle.objectStyles,
          "opacity",
        ),
      }));
    }
  }, []);

  const handleComponentOpacityReset = useCallback(() => {
    setComponentOpacity(createDefaultComponentOpacity());
    setStyle((currentStyle) => ({
      ...currentStyle,
      objectStyles: clearObjectStyleProperty(
        currentStyle.objectStyles,
        "opacity",
      ),
    }));
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
    const inspected = inspectedSceneObjectRef.current;
    if (inspected?.kind === "atom" && atomId === inspected.id) {
      return;
    }

    inspectedSceneObjectRef.current = null;
    setInspectedSceneObject(null);
    setPulsedSceneObject((currentPulse) => ({
      kind: "atom",
      id: atomId,
      token: (currentPulse?.token ?? 0) + 1,
    }));
  }, []);

  const handleBondPulse = useCallback((bondId: string) => {
    const inspected = inspectedSceneObjectRef.current;
    if (inspected?.kind === "bond" && bondId === inspected.id) {
      return;
    }

    inspectedSceneObjectRef.current = null;
    setInspectedSceneObject(null);
    setPulsedSceneObject((currentPulse) => ({
      kind: "bond",
      id: bondId,
      token: (currentPulse?.token ?? 0) + 1,
    }));
  }, []);

  const handleSelectionActivationChange = useCallback(
    (activation: SelectionActivation) => {
      writeSelectionActivation(activation);
      setSelectionActivationState(activation);
    },
    [],
  );

  const requestAtomLocateInObjects = useCallback((atomId: string) => {
    setAtomLocateRequest((currentRequest) => ({
      atomId,
      token: (currentRequest?.token ?? 0) + 1,
    }));
  }, []);

  const handleAtomLocateRequestHandled = useCallback((token: number) => {
    setAtomLocateRequest((currentRequest) =>
      currentRequest?.token === token ? null : currentRequest,
    );
  }, []);

  const requestBondLocateInObjects = useCallback((bondId: string) => {
    setBondLocateRequest((currentRequest) => ({
      bondId,
      token: (currentRequest?.token ?? 0) + 1,
    }));
  }, []);

  const handleBondLocateRequestHandled = useCallback((token: number) => {
    setBondLocateRequest((currentRequest) =>
      currentRequest?.token === token ? null : currentRequest,
    );
  }, []);

  const handleAtomInspect = useCallback((atomId: string | null) => {
    const nextSelection: InspectedSceneObject = atomId
      ? { kind: "atom", id: atomId }
      : null;
    inspectedSceneObjectRef.current = nextSelection;
    setInspectedSceneObject(nextSelection);
    setPulsedSceneObject(null);
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

  const handleBondInspect = useCallback((bondId: string | null) => {
    const nextSelection: InspectedSceneObject = bondId
      ? { kind: "bond", id: bondId }
      : null;
    inspectedSceneObjectRef.current = nextSelection;
    setInspectedSceneObject(nextSelection);
    setPulsedSceneObject(null);
    if (
      bondId &&
      isInspectorOpen &&
      activeInspectorTab === "objects" &&
      activeObjectsTab === "bonds"
    ) {
      requestBondLocateInObjects(bondId);
    }
  }, [
    activeInspectorTab,
    activeObjectsTab,
    isInspectorOpen,
    requestBondLocateInObjects,
  ]);

  const handleLocateAtomInObjects = useCallback((atomId: string) => {
    closeActiveColorPicker();
    setIsInspectorOpen(true);
    setActiveInspectorTab("objects");
    setActiveObjectsTab("atoms");
    requestAtomLocateInObjects(atomId);
  }, [closeActiveColorPicker, requestAtomLocateInObjects]);

  const handleLocateBondInObjects = useCallback((bondId: string) => {
    closeActiveColorPicker();
    setIsInspectorOpen(true);
    setActiveInspectorTab("objects");
    setActiveObjectsTab("bonds");
    requestBondLocateInObjects(bondId);
  }, [closeActiveColorPicker, requestBondLocateInObjects]);

  const handleHideAtom = useCallback((atomId: string) => {
    setStyle((currentStyle) => ({
      ...currentStyle,
      objectStyles: setAtomOverrideProperty(
        currentStyle.objectStyles,
        atomId,
        "visible",
        false,
      ),
    }));
    inspectedSceneObjectRef.current = null;
    setInspectedSceneObject(null);
  }, []);

  const handleBondFamilyVisibilityChange = useCallback(
    (familyKey: string, visible: boolean) => {
      setBondVisibilityOverrides((current) =>
        setBondFamilyVisible(current, familyKey, visible),
      );
    },
    [],
  );

  const handleBondVisibilityChange = useCallback(
    (bond: SceneSpec["bonds"][number], visible: boolean) => {
      setBondVisibilityOverrides((current) =>
        setBondRelationVisible(current, bond, visible),
      );
      if (!visible) {
        inspectedSceneObjectRef.current = null;
        setInspectedSceneObject(null);
      }
    },
    [],
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
    if (!inspectedSceneObject) {
      return;
    }

    const selectionStillExists =
      inspectedSceneObject.kind === "atom"
        ? componentVisibility.atoms && inspectedAtomInfo !== null
        : componentVisibility.bonds && inspectedBondInfo !== null;
    if (!visibleScene || !selectionStillExists) {
      inspectedSceneObjectRef.current = null;
      setInspectedSceneObject(null);
    }
  }, [
    componentVisibility.atoms,
    componentVisibility.bonds,
    inspectedAtomInfo,
    inspectedBondInfo,
    inspectedSceneObject,
    visibleScene,
  ]);

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
          onClose={() => setInspectedSceneObject(null)}
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
          onClose={() => setInspectedSceneObject(null)}
          onHide={(bond) => handleBondVisibilityChange(bond, false)}
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
                  onPreviewMeshQualityChange={handlePreviewMeshQualityChange}
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
