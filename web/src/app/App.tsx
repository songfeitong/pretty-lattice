import { AlertTriangleIcon, FolderOpen, ImageDown, RefreshCw, RotateCcw } from "lucide-react";
import { Quaternion } from "three";
import {
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AtomInspectorCard } from "./AtomInspectorCard";
import {
  DEFAULT_BOND_ALGORITHM,
  BACKEND_UNAVAILABLE_TITLE,
  BACKEND_UNAVAILABLE_MESSAGE,
  STATIC_SCENE_PREVIEW_NAME,
  defaultBondAlgorithmForScene,
  hasStaticScenePreview,
  isBackendUnavailablePreviewError,
  loadStaticScenePreview,
  uploadStructurePreview,
  type BondAlgorithm,
  type SceneSpec,
} from "../api/scene";
import { inspectedAtomInfoForId } from "./atomInspector";
import {
  LatticeScene,
  previewSafeAreaForViewport,
} from "../scene/LatticeScene";
import { ATOM_HIGHLIGHT_PULSE_MS } from "../scene/atomHighlight";
import { createCameraPoseSnapshot } from "../scene/cameraPose";
import {
  applyCrystalCameraRoll,
  secondaryDirectionForPrimaryChange,
  stateFromViewVectors,
  stateWithDirectAxis,
  stateWithPrimaryDirection,
  vectorsFromCameraQuaternion,
  type CrystalAxisLabel,
  type CrystalCameraPrimaryDirection,
  type CrystalCameraScreenDirection,
  type CrystalCameraState,
} from "../scene/crystalCamera";
import { computeStructureExportProjectedSize } from "../scene/exportFrame";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  CommonControlsPanel,
  type CommonPanelTab,
} from "./controls/CommonControlsPanel";
import { ViewControlRail } from "./controls/ViewControlRail";
import { createCameraInteractionStore } from "./cameraInteractionStore";
import { createPreviewFpsStore } from "../model/previewFpsStore";
import { autoDistinctElementColorOverrides } from "./colorSchemes";
import { deriveElementLegendEntries } from "./elementLegend";
import {
  downloadFigureExportFiles,
  createFigureExportFiles,
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
  DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  DEFAULT_UNIT_CELL_LINE_STYLE,
  defaultAtomRenderingModeForScene,
  defaultBondRenderingModeForScene,
  defaultPreviewMeshQualityForScene,
  type AtomRenderingMode,
  type BondRenderingMode,
  type ExportProjectedSize,
  type ExportSettingsState,
  type MeshQuality,
  type UnitCellLineStyle,
  hasPolyhedra,
  previewSafeAreaForInspector,
  sceneOffsetXForInspector,
  syncExportSettingsProjectedSize,
  visibleSceneForComponents,
} from "./settings";
import {
  DEFAULT_VIEW_SCALE,
  createPreviewViewState,
  resetPreviewViewState,
  setPreviewCameraState,
  setPreviewDragSensitivity,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewLightStrength,
  setPreviewShowFpsOverlay,
  type InteractionMode,
} from "./viewState";

const LOCKED_INTERACTION_DRAG_THRESHOLD_PX = 4;
const LOCKED_INTERACTION_WHEEL_IDLE_MS = 150;
const MAX_STRUCTURE_UPLOAD_BYTES = 1 * 1024 * 1024;
const STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview.";
const STRUCTURE_PARSE_ERROR_MESSAGE = "pymatgen could not parse this file.";
const REDISPATCHED_CONTEXT_MENU_EVENT = "__prettyLatticeRedispatchedContextMenu";

interface LockedInteractionPointer {
  pointerId: number;
  startX: number;
  startY: number;
  triggered: boolean;
}

type RedispatchedContextMenuEvent = MouseEvent & {
  [REDISPATCHED_CONTEXT_MENU_EVENT]?: boolean;
};

function isRedispatchedContextMenuEvent(event: MouseEvent): boolean {
  return Boolean((event as RedispatchedContextMenuEvent)[REDISPATCHED_CONTEXT_MENU_EVENT]);
}

function isCanvasContextMenuTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("canvas") !== null;
}

function redispatchContextMenuEvent(
  event: ReactMouseEvent<HTMLElement>,
  nativeEvent: MouseEvent,
) {
  const redispatchedEvent = new MouseEvent("contextmenu", {
    bubbles: true,
    button: nativeEvent.button,
    buttons: nativeEvent.buttons,
    cancelable: true,
    clientX: nativeEvent.clientX,
    clientY: nativeEvent.clientY,
    ctrlKey: nativeEvent.ctrlKey,
    metaKey: nativeEvent.metaKey,
    shiftKey: nativeEvent.shiftKey,
  }) as RedispatchedContextMenuEvent;
  redispatchedEvent[REDISPATCHED_CONTEXT_MENU_EVENT] = true;
  event.currentTarget.dispatchEvent(redispatchedEvent);
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
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [componentOpacity, setComponentOpacity] = useState(createDefaultComponentOpacity);
  const [style, setStyle] = useState(createDefaultStyle);
  const [exportSettings, setExportSettings] = useState(createDefaultExportSettings);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportProjectedSize, setExportProjectedSize] =
    useState<ExportProjectedSize | null>(null);
  const [atomRenderingMode, setAtomRenderingMode] = useState<AtomRenderingMode>(
    () => defaultAtomRenderingModeForScene(null),
  );
  const [bondRenderingMode, setBondRenderingMode] = useState<BondRenderingMode>(
    () => defaultBondRenderingModeForScene(null),
  );
  const [previewMeshQuality, setPreviewMeshQuality] = useState<MeshQuality>(
    () => defaultPreviewMeshQualityForScene(null),
  );
  const [unitCellLineStyle, setUnitCellLineStyle] = useState<UnitCellLineStyle>(
    DEFAULT_UNIT_CELL_LINE_STYLE,
  );
  const [showCrystalAxisLabels, setShowCrystalAxisLabels] = useState(
    DEFAULT_SHOW_CRYSTAL_AXIS_LABELS,
  );
  const [cameraCommandVersion, setCameraCommandVersion] = useState(0);
  const [cameraAnimatedCommandVersion, setCameraAnimatedCommandVersion] = useState(0);
  const [cameraOrientationVersion, setCameraOrientationVersion] = useState(0);
  const [isCameraCommandAnimationActive, setIsCameraCommandAnimationActive] = useState(false);
  const [isCameraControlsInteractionActive, setIsCameraControlsInteractionActive] =
    useState(false);
  const [isCameraRollInteractionActive, setIsCameraRollInteractionActive] = useState(false);
  const [inspectedAtomId, setInspectedAtomId] = useState<string | null>(null);
  const [pulseAtom, setPulseAtom] = useState<{ atomId: string; token: number } | null>(null);
  const [cameraControlsFrozenState, setCameraControlsFrozenState] =
    useState<CrystalCameraState | null>(null);
  const [activeCommonPanelTab, setActiveCommonPanelTab] =
    useState<CommonPanelTab>("display");
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [cameraInteractionStore] = useState(createCameraInteractionStore);
  const [previewFpsStore] = useState(createPreviewFpsStore);
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const [isStructureSummaryCollapsed, setIsStructureSummaryCollapsed] = useState(true);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraOrientationRef = useRef(new Quaternion());
  const orientationGizmoFrameRequestRef = useRef<(() => void) | null>(null);
  const cameraControlFreezeCandidateRef = useRef<CrystalCameraState | null>(null);
  const cameraControlFreezeRequestRef = useRef(0);
  const cameraRollInteractionBaseStateRef = useRef<CrystalCameraState | null>(null);
  const inspectedAtomIdRef = useRef<string | null>(null);
  const isCameraCommandAnimationActiveRef = useRef(false);
  const isCameraControlsInteractionActiveRef = useRef(false);
  const isCameraRollInteractionActiveRef = useRef(false);
  const lockedInteractionPointerRef = useRef<LockedInteractionPointer | null>(null);
  const lockedInteractionWheelIdleTimeoutRef = useRef<number | null>(null);
  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
  const inspectedAtomInfo = useMemo(
    () => inspectedAtomInfoForId(visibleScene, inspectedAtomId),
    [inspectedAtomId, visibleScene],
  );
  const cameraControlsPanelState = useMemo<CrystalCameraState>(() => {
    return cameraControlsFrozenState ?? viewState.camera;
  }, [cameraControlsFrozenState, viewState.camera]);

  useEffect(() => {
    inspectedAtomIdRef.current = inspectedAtomId;
  }, [inspectedAtomId]);

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

  const syncCameraOrientationToViewState = useCallback(() => {
    setCameraOrientationVersion((version) => version + 1);
    setViewState((currentViewState) => {
      if (!visibleScene) {
        return currentViewState;
      }

      const poseVectors = vectorsFromCameraQuaternion(cameraOrientationRef.current);
      return setPreviewCameraState(
        currentViewState,
        stateFromViewVectors(
          visibleScene.cell.vectors,
          currentViewState.camera.primary,
          currentViewState.camera.secondary,
          poseVectors.up,
          poseVectors.outward,
        ),
      );
    });
  }, [visibleScene]);

  const clearCameraDerivedUiFreezeState = useCallback(() => {
    cameraControlFreezeRequestRef.current += 1;
    cameraControlFreezeCandidateRef.current = null;
    cameraRollInteractionBaseStateRef.current = null;
    isCameraCommandAnimationActiveRef.current = false;
    isCameraControlsInteractionActiveRef.current = false;
    isCameraRollInteractionActiveRef.current = false;
    setIsCameraCommandAnimationActive(false);
    setIsCameraControlsInteractionActive(false);
    setIsCameraRollInteractionActive(false);
    setCameraControlsFrozenState(null);
  }, []);

  const resetLoadedPreviewState = useCallback(
    (
      nextScene: SceneSpec | null,
      options: {
        preserveActiveCommonPanelTab?: boolean;
        preserveInspectorOpen?: boolean;
      } = {},
    ) => {
      setErrorMessage(null);
      setExportError(null);
      setInspectedAtomId(null);
      setPulseAtom(null);
      if (!options.preserveInspectorOpen) {
        setIsInspectorOpen(false);
      }
      setComponentVisibility(createDefaultComponentVisibility(nextScene));
      setComponentOpacity(createDefaultComponentOpacity());
      setStyle(createDefaultStyle());
      setAtomRenderingMode(defaultAtomRenderingModeForScene(nextScene));
      setBondRenderingMode(defaultBondRenderingModeForScene(nextScene));
      setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
      setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
      setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
      setExportSettings(createDefaultExportSettings());
      if (!options.preserveActiveCommonPanelTab) {
        setActiveCommonPanelTab("display");
      }
      setLockedInteractionFeedbackCount(0);
      setIsStructureSummaryCollapsed(true);

      cameraOrientationRef.current.identity();
      clearCameraDerivedUiFreezeState();
      cameraInteractionStore.requestViewScale(DEFAULT_VIEW_SCALE);
      setCameraCommandVersion((version) => version + 1);
      setCameraOrientationVersion((version) => version + 1);
      setViewState(createPreviewViewState(nextScene?.cell.vectors));
    },
    [cameraInteractionStore, clearCameraDerivedUiFreezeState],
  );

  const startAnimatedCameraCommand = useCallback((cameraState: CrystalCameraState) => {
    const frozenCameraState = cameraControlsPanelState;
    const freezeRequest = cameraControlFreezeRequestRef.current + 1;
    cameraControlFreezeRequestRef.current = freezeRequest;
    cameraControlFreezeCandidateRef.current = frozenCameraState;
    setCameraControlsFrozenState(frozenCameraState);
    queueMicrotask(() => {
      if (
        cameraControlFreezeRequestRef.current !== freezeRequest ||
        isCameraCommandAnimationActiveRef.current ||
        isCameraControlsInteractionActiveRef.current
      ) {
        return;
      }

      cameraControlFreezeCandidateRef.current = null;
      setCameraControlsFrozenState(null);
    });
    setViewState((currentViewState) => setPreviewCameraState(currentViewState, cameraState));
    setCameraCommandVersion((version) => version + 1);
    setCameraAnimatedCommandVersion((version) => version + 1);
  }, [cameraControlsPanelState]);

  const handleInteractionModeChange = useCallback((interactionMode: InteractionMode) => {
    setViewState((currentViewState) =>
      setPreviewInteractionMode(currentViewState, interactionMode),
    );
  }, []);

  const handleDragSensitivityChange = useCallback((dragSensitivity: number) => {
    setViewState((currentViewState) =>
      setPreviewDragSensitivity(currentViewState, dragSensitivity),
    );
  }, []);

  const handleLightStrengthChange = useCallback((lightStrength: number) => {
    setViewState((currentViewState) =>
      setPreviewLightStrength(currentViewState, lightStrength),
    );
  }, []);

  const handleInteractionLockedChange = useCallback((interactionLocked: boolean) => {
    setViewState((currentViewState) =>
      setPreviewInteractionLocked(currentViewState, interactionLocked),
    );
  }, []);

  const handleResetView = useCallback(() => {
    clearCameraDerivedUiFreezeState();
    cameraInteractionStore.requestViewScale(DEFAULT_VIEW_SCALE);
    setViewState((currentViewState) =>
      resetPreviewViewState(currentViewState, scene?.cell.vectors),
    );
    setCameraCommandVersion((version) => version + 1);
  }, [cameraInteractionStore, clearCameraDerivedUiFreezeState, scene?.cell.vectors]);

  const handleCameraOrientationChange = useCallback(() => {
    if (
      isCameraCommandAnimationActiveRef.current ||
      isCameraControlsInteractionActiveRef.current ||
      isCameraRollInteractionActiveRef.current
    ) {
      return;
    }

    syncCameraOrientationToViewState();
  }, [syncCameraOrientationToViewState]);

  const requestOrientationGizmoFrame = useCallback(() => {
    orientationGizmoFrameRequestRef.current?.();
  }, []);

  const handleCameraStateChange = useCallback((cameraState: CrystalCameraState) => {
    startAnimatedCameraCommand(cameraState);
  }, [startAnimatedCameraCommand]);

  const handleShowFpsOverlayChange = useCallback((nextShowFpsOverlay: boolean) => {
    setViewState((currentViewState) =>
      setPreviewShowFpsOverlay(currentViewState, nextShowFpsOverlay),
    );
    if (!nextShowFpsOverlay) {
      previewFpsStore.setFpsSnapshot(0);
    }
  }, [previewFpsStore]);

  const handleAtomRenderingModeChange = useCallback((nextMode: AtomRenderingMode) => {
    setPulseAtom(null);
    setAtomRenderingMode(nextMode);
  }, []);

  const handleBondRenderingModeChange = useCallback((nextMode: BondRenderingMode) => {
    setBondRenderingMode(nextMode);
  }, []);

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

  const handleAtomInspect = useCallback((atomId: string | null) => {
    inspectedAtomIdRef.current = atomId;
    setInspectedAtomId(atomId);
  }, []);

  const handleCameraPrimaryChange = useCallback(
    (primary: CrystalCameraPrimaryDirection) => {
      if (!visibleScene) {
        return;
      }

      clearCameraDerivedUiFreezeState();
      setViewState((currentViewState) => {
        const secondary = secondaryDirectionForPrimaryChange(
          currentViewState.camera.primary,
          currentViewState.camera.secondary,
          primary,
        );

        return setPreviewCameraState(
          currentViewState,
          stateWithPrimaryDirection(
            visibleScene.cell.vectors,
            cameraOrientationRef.current,
            primary,
            secondary,
          ),
        );
      });
    },
    [clearCameraDerivedUiFreezeState, visibleScene],
  );

  const handleCameraSecondaryChange = useCallback(
    (secondary: CrystalCameraScreenDirection) => {
      if (!visibleScene) {
        return;
      }

      clearCameraDerivedUiFreezeState();
      setViewState((currentViewState) => {
        if (secondary === currentViewState.camera.primary) {
          return currentViewState;
        }

        return setPreviewCameraState(
          currentViewState,
          stateWithPrimaryDirection(
            visibleScene.cell.vectors,
            cameraOrientationRef.current,
            currentViewState.camera.primary,
            secondary,
          ),
        );
      });
    },
    [clearCameraDerivedUiFreezeState, visibleScene],
  );

  const handleCameraRollPreviewStart = useCallback(() => {
    if (!visibleScene) {
      return;
    }

    cameraRollInteractionBaseStateRef.current = cameraControlsPanelState;
    isCameraRollInteractionActiveRef.current = true;
    setIsCameraRollInteractionActive(true);
  }, [cameraControlsPanelState, visibleScene]);

  const handleCameraRollPreviewChange = useCallback(
    (rollDegrees: number) => {
      if (!visibleScene) {
        return;
      }

      const baseCameraState =
        cameraRollInteractionBaseStateRef.current ?? cameraControlsPanelState;
      cameraInteractionStore.requestCameraState(
        applyCrystalCameraRoll(visibleScene.cell.vectors, baseCameraState, rollDegrees),
      );
    },
    [cameraControlsPanelState, cameraInteractionStore, visibleScene],
  );

  const handleCameraRollChange = useCallback(
    (rollDegrees: number) => {
      if (!visibleScene) {
        return;
      }

      const baseCameraState = cameraRollInteractionBaseStateRef.current ?? viewState.camera;
      const nextCameraState = applyCrystalCameraRoll(
        visibleScene.cell.vectors,
        baseCameraState,
        rollDegrees,
      );
      cameraRollInteractionBaseStateRef.current = null;
      isCameraRollInteractionActiveRef.current = false;
      setIsCameraRollInteractionActive(false);
      setViewState((currentViewState) =>
        setPreviewCameraState(
          currentViewState,
          nextCameraState,
        ),
      );
      setCameraCommandVersion((version) => version + 1);
    },
    [viewState.camera, visibleScene],
  );

  const handleGizmoAxisClick = useCallback(
    (axis: CrystalAxisLabel) => {
      if (!visibleScene) {
        return;
      }

      startAnimatedCameraCommand(
        stateWithDirectAxis(visibleScene.cell.vectors, viewState.camera, axis),
      );
    },
    [startAnimatedCameraCommand, viewState.camera, visibleScene],
  );

  const handleCameraCommandAnimationActiveChange = useCallback((isActive: boolean) => {
    isCameraCommandAnimationActiveRef.current = isActive;
    setIsCameraCommandAnimationActive(isActive);

    if (isActive) {
      setCameraControlsFrozenState(cameraControlFreezeCandidateRef.current);
      return;
    }

    cameraControlFreezeRequestRef.current += 1;
    cameraControlFreezeCandidateRef.current = null;
    if (
      !isCameraControlsInteractionActiveRef.current &&
      !isCameraRollInteractionActiveRef.current
    ) {
      setCameraControlsFrozenState(null);
      setCameraOrientationVersion((version) => version + 1);
    }
  }, []);

  const handleCameraControlsInteractionActiveChange = useCallback(
    (isActive: boolean, quaternionSnapshot?: Quaternion) => {
      isCameraControlsInteractionActiveRef.current = isActive;
      setIsCameraControlsInteractionActive(isActive);

      if (isActive) {
        cameraControlFreezeRequestRef.current += 1;
        cameraControlFreezeCandidateRef.current = cameraControlsPanelState;
        setCameraControlsFrozenState(cameraControlsPanelState);
        return;
      }

      cameraControlFreezeRequestRef.current += 1;
      cameraControlFreezeCandidateRef.current = null;
      if (quaternionSnapshot) {
        cameraOrientationRef.current.copy(quaternionSnapshot);
      }
      syncCameraOrientationToViewState();
      if (!isCameraCommandAnimationActiveRef.current) {
        setCameraControlsFrozenState(null);
      }
    },
    [cameraControlsPanelState, syncCameraOrientationToViewState],
  );

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
        setBondAlgorithm(defaultBondAlgorithmForScene(nextScene));
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } catch {
        if (!isCurrent) {
          return;
        }

        setScene(null);
        setInspectedAtomId(null);
        setPulseAtom(null);
        setSelectedFileName(null);
        setPreviewStatus("error");
        setErrorMessage("Static example could not be loaded.");
      }
    }

    void loadExampleScene();

    return () => {
      isCurrent = false;
    };
  }, [isStaticScenePreview, resetLoadedPreviewState]);

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
      setInspectedAtomId(null);
      setPulseAtom(null);
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
    setBondAlgorithm(DEFAULT_BOND_ALGORITHM);
    resetLoadedPreviewState(null);

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setBondAlgorithm(defaultBondAlgorithmForScene(nextScene));
      resetLoadedPreviewState(nextScene);
      setPreviewStatus("ready");
    } catch (error) {
      setScene(null);
      setInspectedAtomId(null);
      setPulseAtom(null);
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
        setInspectedAtomId(null);
        setPulseAtom(null);
        setAtomRenderingMode(defaultAtomRenderingModeForScene(nextScene));
        setBondRenderingMode(defaultBondRenderingModeForScene(nextScene));
        setPreviewMeshQuality(defaultPreviewMeshQualityForScene(nextScene));
        setUnitCellLineStyle(DEFAULT_UNIT_CELL_LINE_STYLE);
        setShowCrystalAxisLabels(DEFAULT_SHOW_CRYSTAL_AXIS_LABELS);
        setPreviewStatus("ready");
      } catch (error) {
        if (isBackendUnavailablePreviewError(error)) {
          setPreviewStatus(scene ? "ready" : "error");
          setErrorMessage(error.message);
          return;
        }

        setScene(null);
        setInspectedAtomId(null);
        setPulseAtom(null);
        setCurrentFile(null);
        setSelectedFileName(null);
        setIsInspectorOpen(false);
        setPreviewStatus("error");
        setErrorMessage(STRUCTURE_PARSE_ERROR_MESSAGE);
      }
    },
    [currentFile, scene],
  );

  const computeCurrentExportProjectedSize = useCallback(() => {
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
    componentOpacity,
    componentVisibility.atoms,
    componentVisibility.unitCell,
    style,
    visibleScene,
  ]);
  const refreshExportProjectedSize = useCallback(() => {
    const projectedSize = computeCurrentExportProjectedSize();
    setExportProjectedSize(projectedSize);
    return projectedSize;
  }, [computeCurrentExportProjectedSize]);
  const prepareExportSettings = useCallback(() => {
    const projectedSize = refreshExportProjectedSize();
    if (projectedSize === null) {
      return exportSettings;
    }

    const nextExportSettings = syncExportSettingsProjectedSize(
      exportSettings,
      projectedSize,
    );
    if (nextExportSettings !== exportSettings) {
      setExportSettings(nextExportSettings);
    }
    return nextExportSettings;
  }, [exportSettings, refreshExportProjectedSize]);
  const elementColorOverrides = useMemo(
    () =>
      scene
        ? autoDistinctElementColorOverrides(
            scene.atoms,
            style.colorScheme,
            style.distinguishSimilarColors,
          )
        : undefined,
    [scene, style.colorScheme, style.distinguishSimilarColors],
  );
  const legendEntries = useMemo(
    () => deriveElementLegendEntries(scene, style.colorScheme, elementColorOverrides),
    [elementColorOverrides, scene, style.colorScheme],
  );
  const hasVisibleScene = visibleScene !== null;
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
    if (!inspectedAtomId) {
      return;
    }

    if (!visibleScene || !componentVisibility.atoms || !inspectedAtomInfo) {
      setInspectedAtomId(null);
    }
  }, [componentVisibility.atoms, inspectedAtomId, inspectedAtomInfo, visibleScene]);

  useEffect(() => {
    if (visibleScene) {
      return;
    }

    setExportProjectedSize(null);
  }, [visibleScene]);

  useEffect(() => {
    if (activeCommonPanelTab !== "export") {
      return;
    }

    const projectedSize = refreshExportProjectedSize();
    if (projectedSize === null) {
      return;
    }

    setExportSettings((currentSettings) =>
      syncExportSettingsProjectedSize(currentSettings, projectedSize),
    );
  }, [activeCommonPanelTab, cameraOrientationVersion, refreshExportProjectedSize]);

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
      const settingsForExport = prepareExportSettings();
      const exportFiles = await createFigureExportFiles({
        cameraOrientationRef,
        componentOpacity,
        componentVisibility,
        atomRenderingMode,
        bondRenderingMode,
        fileName: selectedFileName,
        lightStrength: viewState.lightStrength,
        scene,
        settings: settingsForExport,
        showCrystalAxisLabels,
        style,
        unitCellLineStyle,
      });
      await downloadFigureExportFiles(exportFiles, selectedFileName);
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
    atomRenderingMode,
    bondRenderingMode,
    isExporting,
    prepareExportSettings,
    scene,
    selectedFileName,
    showCrystalAxisLabels,
    style,
    unitCellLineStyle,
    viewState.lightStrength,
  ]);

  const handleResetAllSettings = useCallback(async () => {
    if (!scene || previewStatus === "loading") {
      return;
    }

    const defaultBondAlgorithm = defaultBondAlgorithmForScene(scene);

    if (bondAlgorithm === defaultBondAlgorithm || !currentFile) {
      setBondAlgorithm(defaultBondAlgorithm);
      setPreviewStatus("ready");
      resetLoadedPreviewState(scene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
      return;
    }

    setPreviewStatus("loading");
    setErrorMessage(null);

    try {
      const nextScene = await uploadStructurePreview(currentFile);
      setBondAlgorithm(defaultBondAlgorithmForScene(nextScene));
      setScene(nextScene);
      resetLoadedPreviewState(nextScene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
      setPreviewStatus("ready");
    } catch (error) {
      setPreviewStatus(scene ? "ready" : "error");
      setErrorMessage(
        isBackendUnavailablePreviewError(error)
          ? error.message
          : STRUCTURE_PARSE_ERROR_MESSAGE,
      );
    }
  }, [
    bondAlgorithm,
    currentFile,
    previewStatus,
    resetLoadedPreviewState,
    scene,
  ]);

  const clearLockedInteractionWheelGate = useCallback(() => {
    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    lockedInteractionWheelIdleTimeoutRef.current = null;
  }, []);

  useEffect(() => () => clearLockedInteractionWheelGate(), [clearLockedInteractionWheelGate]);

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

  const handleSceneContextMenuCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    const nativeEvent = event.nativeEvent;
    if (isRedispatchedContextMenuEvent(nativeEvent)) {
      return;
    }

    if (!isCanvasContextMenuTarget(event.target)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    redispatchContextMenuEvent(event, nativeEvent);
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
                atomRenderingMode={atomRenderingMode}
                bondRenderingMode={bondRenderingMode}
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
          safeArea={previewSafeArea}
        />
      ) : null}

      {inspectedAtomInfo ? (
        <AtomInspectorCard
          colorScheme={style.colorScheme}
          colorOverrides={elementColorOverrides}
          info={inspectedAtomInfo}
          isInspectorOpen={isInspectorOpen}
          onClose={() => setInspectedAtomId(null)}
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
              onAtomRadiusModelChange={(atomRadiusModel) => {
                setStyle((currentStyle) => ({ ...currentStyle, atomRadiusModel }));
              }}
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

          <InspectorSidebar
            atomRenderingMode={atomRenderingMode}
            bondRenderingMode={bondRenderingMode}
            bondAlgorithm={bondAlgorithm}
            dragSensitivity={viewState.dragSensitivity}
            interactionMode={viewState.interactionMode}
            lightStrength={viewState.lightStrength}
            isOpen={isInspectorOpen}
            isSceneLoading={previewStatus === "loading"}
            previewMeshQuality={previewMeshQuality}
            fogAffectsUnitCell={style.fogAffectsUnitCell}
            distinguishSimilarColors={style.distinguishSimilarColors}
            showFpsOverlay={viewState.showFpsOverlay}
            showCrystalAxisLabels={showCrystalAxisLabels}
            unitCellLineStyle={unitCellLineStyle}
            onAtomRenderingModeChange={handleAtomRenderingModeChange}
            onBondRenderingModeChange={handleBondRenderingModeChange}
            onBondAlgorithmChange={(nextBondAlgorithm) => {
              void handleBondAlgorithmChange(nextBondAlgorithm);
            }}
            onDragSensitivityChange={handleDragSensitivityChange}
            onInteractionModeChange={handleInteractionModeChange}
            onLightStrengthChange={handleLightStrengthChange}
            onPreviewMeshQualityChange={handlePreviewMeshQualityChange}
            onFogAffectsUnitCellChange={handleFogAffectsUnitCellChange}
            onDistinguishSimilarColorsChange={handleDistinguishSimilarColorsChange}
            onShowFpsOverlayChange={handleShowFpsOverlayChange}
            onShowCrystalAxisLabelsChange={setShowCrystalAxisLabels}
            onUnitCellLineStyleChange={setUnitCellLineStyle}
          />
        </>
      ) : null}
    </main>
  );
}
