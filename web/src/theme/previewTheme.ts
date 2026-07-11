import type { ResolvedTheme } from "./themePreference";

export interface PreviewThemeColors {
  background: string;
  fog: string;
  gizmoLabel: string;
  gizmoLabelHalo: string;
  gizmoLabelHover: string;
  screenAxis: {
    hover: string;
    muted: string;
    originInner: string;
    originOuter: string;
    selected: string;
  };
  selectionHighlight: string;
  showGizmoLabelHalo: boolean;
  unitCell: string;
}

export const PREVIEW_THEME_COLORS: Record<ResolvedTheme, PreviewThemeColors> = {
  light: {
    background: "#fafafa",
    fog: "#fafafa",
    gizmoLabel: "#343434",
    gizmoLabelHalo: "#ffffff",
    gizmoLabelHover: "#111111",
    screenAxis: {
      hover: "#a0a0a0",
      muted: "#d6d6d6",
      originInner: "#f7f7f5",
      originOuter: "#282828",
      selected: "#505050",
    },
    selectionHighlight: "#e6b800",
    showGizmoLabelHalo: true,
    unitCell: "#444444",
  },
  dark: {
    background: "#181818",
    fog: "#181818",
    gizmoLabel: "#eeeeee",
    gizmoLabelHalo: "#111111",
    gizmoLabelHover: "#eeeeee",
    screenAxis: {
      hover: "#a0a0a0",
      muted: "#4a4a4a",
      originInner: "#181818",
      originOuter: "#eeeeee",
      selected: "#e8e8e8",
    },
    selectionHighlight: "#ffd200",
    showGizmoLabelHalo: false,
    unitCell: "#bbbbbb",
  },
};
