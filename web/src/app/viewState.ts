import {
  applyCrystalCameraRoll,
  createDefaultCrystalCameraState,
  secondaryDirectionForPrimaryChange,
} from "../scene/crystalCamera";
import type {
  CrystalCameraPrimaryDirection,
  CrystalCameraState,
  InteractionMode,
  VectorTuple,
} from "../model";
export {
  BASE_ORBIT_DRAG_SENSITIVITY,
  BASE_TRACKBALL_DRAG_SENSITIVITY,
  DEFAULT_DRAG_SENSITIVITY,
  DEFAULT_LIGHT_STRENGTH,
  DEFAULT_VIEW_SCALE,
  DRAG_SENSITIVITY_SLIDER_SNAP_POSITION,
  DRAG_SENSITIVITY_SLIDER_SNAP_THRESHOLD,
  LIGHT_STRENGTH_SLIDER_SNAP_POSITION,
  LIGHT_STRENGTH_SLIDER_SNAP_THRESHOLD,
  MAX_DRAG_SENSITIVITY,
  MAX_LIGHT_STRENGTH,
  INTERACTION_MODE_OPTIONS,
  MAX_VIEW_SCALE,
  MIN_DRAG_SENSITIVITY,
  MIN_LIGHT_STRENGTH,
  MIN_VIEW_SCALE,
  ZOOM_SLIDER_SNAP_POSITION,
  ZOOM_SLIDER_SNAP_THRESHOLD,
  clampDragSensitivity,
  clampLightStrength,
  clampViewScale,
  dragSensitivityToSliderPosition,
  formatDragSensitivityPercent,
  formatLightStrengthPercent,
  formatZoomPercent,
  lightStrengthToSliderPosition,
  parseDragSensitivityPercentInput,
  parseLightStrengthPercentInput,
  parseZoomPercentInput,
  sliderPositionToDragSensitivity,
  sliderPositionToLightStrength,
  sliderPositionToViewScale,
  snapDragSensitivitySliderPosition,
  snapLightStrengthSliderPosition,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
  type InteractionMode,
} from "../model/viewState";
import {
  clampDragSensitivity,
  DEFAULT_DRAG_SENSITIVITY,
  clampLightStrength,
  DEFAULT_LIGHT_STRENGTH,
} from "../model/viewState";

export interface PreviewViewState {
  camera: CrystalCameraState;
  dragSensitivity: number;
  interactionLocked: boolean;
  interactionMode: InteractionMode;
  lightStrength: number;
  resetCounter: number;
  showFpsOverlay: boolean;
}

export function createPreviewViewState(cellVectors: VectorTuple[] = []): PreviewViewState {
  return {
    camera: createDefaultCrystalCameraState(cellVectors),
    dragSensitivity: DEFAULT_DRAG_SENSITIVITY,
    interactionLocked: false,
    interactionMode: "trackball",
    lightStrength: DEFAULT_LIGHT_STRENGTH,
    resetCounter: 0,
    showFpsOverlay: false,
  };
}

export function resetPreviewViewState(
  state: PreviewViewState,
  cellVectors: VectorTuple[] = [],
): PreviewViewState {
  return {
    ...state,
    camera: createDefaultCrystalCameraState(cellVectors),
    resetCounter: state.resetCounter + 1,
  };
}

export function setPreviewCameraState(
  state: PreviewViewState,
  camera: CrystalCameraState,
): PreviewViewState {
  return {
    ...state,
    camera,
  };
}

export function setPreviewCameraPrimaryDirection(
  state: PreviewViewState,
  primary: CrystalCameraPrimaryDirection,
): PreviewViewState {
  return {
    ...state,
    camera: {
      ...state.camera,
      primary,
      secondary: secondaryDirectionForPrimaryChange(
        state.camera.primary,
        state.camera.secondary,
        primary,
      ),
    },
  };
}

export function setPreviewCameraRoll(
  state: PreviewViewState,
  cellVectors: VectorTuple[],
  rollDegrees: number,
): PreviewViewState {
  return {
    ...state,
    camera: applyCrystalCameraRoll(cellVectors, state.camera, rollDegrees),
  };
}

export function setPreviewInteractionMode(
  state: PreviewViewState,
  interactionMode: InteractionMode,
): PreviewViewState {
  return {
    ...state,
    interactionMode,
  };
}

export function setPreviewDragSensitivity(
  state: PreviewViewState,
  dragSensitivity: number,
): PreviewViewState {
  return {
    ...state,
    dragSensitivity: clampDragSensitivity(dragSensitivity),
  };
}

export function setPreviewLightStrength(
  state: PreviewViewState,
  lightStrength: number,
): PreviewViewState {
  return {
    ...state,
    lightStrength: clampLightStrength(lightStrength),
  };
}

export function setPreviewInteractionLocked(
  state: PreviewViewState,
  interactionLocked: boolean,
): PreviewViewState {
  return {
    ...state,
    interactionLocked,
  };
}

export function setPreviewShowFpsOverlay(
  state: PreviewViewState,
  showFpsOverlay: boolean,
): PreviewViewState {
  return {
    ...state,
    showFpsOverlay,
  };
}
