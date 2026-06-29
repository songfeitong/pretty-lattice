import type { AtomRadiusModel } from "../api/scene";
import {
  DEFAULT_COLOR_SCHEME_ID,
  type ColorScheme,
} from "./colorSchemes";
import {
  DEFAULT_MATERIAL_PRESET_ID,
  type MaterialPresetId,
} from "./materialPresets";

export const DEFAULT_BOND_COLOR = "#d2d2d2";

export type BondColorMode = "unicolor" | "bicolor";

export interface StyleState {
  atomRadius: number;
  atomRadiusModel: AtomRadiusModel;
  bondColor: string;
  bondColorMode: BondColorMode;
  bondThickness: number;
  colorScheme: ColorScheme;
  distinguishSimilarColors: boolean;
  fogAffectsUnitCell: boolean;
  fogAmount: number;
  fogEnabled: boolean;
  fogStart: number;
  materialPreset: MaterialPresetId;
}

export const DEFAULT_STYLE: StyleState = {
  atomRadius: 40,
  atomRadiusModel: "uniform",
  bondColor: DEFAULT_BOND_COLOR,
  bondColorMode: "bicolor",
  bondThickness: 100,
  colorScheme: DEFAULT_COLOR_SCHEME_ID,
  distinguishSimilarColors: true,
  fogAffectsUnitCell: false,
  fogAmount: 50,
  fogEnabled: true,
  fogStart: 50,
  materialPreset: DEFAULT_MATERIAL_PRESET_ID,
};

export const STYLE_SCALE_MIN: Pick<StyleState, "atomRadius" | "bondThickness"> = {
  atomRadius: 0,
  bondThickness: 0,
};

export const STYLE_SCALE_MAX: Pick<StyleState, "atomRadius" | "bondThickness"> = {
  atomRadius: 100,
  bondThickness: 200,
};

export const STYLE_FOG_AMOUNT_MIN = 0;
export const STYLE_FOG_AMOUNT_MAX = 100;
export const STYLE_FOG_START_MIN = 0;
export const STYLE_FOG_START_MAX = 100;

export function createDefaultStyle(): StyleState {
  return { ...DEFAULT_STYLE };
}
