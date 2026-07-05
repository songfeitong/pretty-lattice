import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Quaternion } from "three";

import type { SceneSpec } from "../../api/scene";
import type { CameraInteractionStore } from "../../model/cameraInteractionStore";
import type { PreviewFpsStore } from "../../model/previewFpsStore";
import {
  applyCrystalCameraRoll,
  computeCrystalCameraPose,
  createDefaultCrystalCameraState,
  secondaryDirectionForPrimaryChange,
  stateFromViewVectors,
  stateWithDirectAxis,
  stateWithPrimaryDirection,
  vectorsFromCameraQuaternion,
  type CrystalAxisLabel,
  type CrystalCameraPrimaryDirection,
  type CrystalCameraScreenDirection,
  type CrystalCameraState,
} from "../../scene/crystalCamera";
import {
  DEFAULT_VIEW_SCALE,
  createPreviewViewState,
  resetPreviewViewState,
  setPreviewCameraState,
  setPreviewDragSensitivity,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewLightStrength,
  setPreviewMouseInertia,
  setPreviewShowFpsOverlay,
  type InteractionMode,
} from "../viewState";

interface UsePreviewCameraCommandsOptions {
  cameraInteractionStore: CameraInteractionStore;
  previewFpsStore: PreviewFpsStore;
  scene: SceneSpec | null;
  visibleScene: SceneSpec | null;
}

export function usePreviewCameraCommands({
  cameraInteractionStore,
  previewFpsStore,
  scene,
  visibleScene,
}: UsePreviewCameraCommandsOptions) {
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [cameraCommandVersion, setCameraCommandVersion] = useState(0);
  const [cameraAnimatedCommandVersion, setCameraAnimatedCommandVersion] = useState(0);
  const [cameraOrientationVersion, setCameraOrientationVersion] = useState(0);
  const [isCameraCommandAnimationActive, setIsCameraCommandAnimationActive] = useState(false);
  const [isCameraControlsInteractionActive, setIsCameraControlsInteractionActive] =
    useState(false);
  const [isCameraRollInteractionActive, setIsCameraRollInteractionActive] = useState(false);
  const [cameraControlsFrozenState, setCameraControlsFrozenState] =
    useState<CrystalCameraState | null>(null);
  const cameraOrientationRef = useRef(new Quaternion());
  const orientationGizmoFrameRequestRef = useRef<(() => void) | null>(null);
  const cameraControlFreezeCandidateRef = useRef<CrystalCameraState | null>(null);
  const cameraControlFreezeRequestRef = useRef(0);
  const cameraRollInteractionBaseStateRef = useRef<CrystalCameraState | null>(null);
  const isCameraCommandAnimationActiveRef = useRef(false);
  const isCameraControlsInteractionActiveRef = useRef(false);
  const isCameraRollInteractionActiveRef = useRef(false);

  const cameraControlsPanelState = useMemo<CrystalCameraState>(() => {
    return cameraControlsFrozenState ?? viewState.camera;
  }, [cameraControlsFrozenState, viewState.camera]);

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

  const resetCameraForScene = useCallback(
    (nextScene: SceneSpec | null) => {
      const nextCellVectors = nextScene?.cell.vectors;
      const nextCameraState = createDefaultCrystalCameraState(nextCellVectors);
      cameraOrientationRef.current.copy(
        computeCrystalCameraPose(nextCellVectors ?? [], nextCameraState, 1).quaternion,
      );
      clearCameraDerivedUiFreezeState();
      cameraInteractionStore.requestViewScale(DEFAULT_VIEW_SCALE);
      setCameraCommandVersion((version) => version + 1);
      setCameraOrientationVersion((version) => version + 1);
      setViewState(createPreviewViewState(nextCellVectors));
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

  const handleMouseInertiaChange = useCallback((mouseInertia: boolean) => {
    setViewState((currentViewState) =>
      setPreviewMouseInertia(currentViewState, mouseInertia),
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
    const cellVectors = scene?.cell.vectors;
    const resetCameraState = createDefaultCrystalCameraState(cellVectors);

    clearCameraDerivedUiFreezeState();
    cameraInteractionStore.requestViewScale(DEFAULT_VIEW_SCALE);
    cameraInteractionStore.requestCameraState(resetCameraState);
    cameraOrientationRef.current.copy(
      computeCrystalCameraPose(cellVectors ?? [], resetCameraState, 1).quaternion,
    );
    setViewState((currentViewState) =>
      resetPreviewViewState(currentViewState, cellVectors),
    );
    setCameraCommandVersion((version) => version + 1);
    setCameraOrientationVersion((version) => version + 1);
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

  return {
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
  };
}
