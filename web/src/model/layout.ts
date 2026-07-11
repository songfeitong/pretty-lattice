export interface PreviewSafeArea {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const INSPECTOR_PREVIEW_SAFE_AREA: PreviewSafeArea = {
  bottom: 116,
  left: 420,
  right: 176,
  top: 40,
};
export const INSPECTOR_OPEN_SCENE_OFFSET_X_PX = -116;
export const INSPECTOR_SCENE_OFFSET_BREAKPOINT_PX = 760;

export function previewSafeAreaForInspector(): PreviewSafeArea {
  return INSPECTOR_PREVIEW_SAFE_AREA;
}

export function sceneOffsetXForInspector(
  isInspectorOpen: boolean,
  viewportWidth: number,
): number {
  if (!isInspectorOpen || viewportWidth <= INSPECTOR_SCENE_OFFSET_BREAKPOINT_PX) {
    return 0;
  }

  return INSPECTOR_OPEN_SCENE_OFFSET_X_PX;
}
