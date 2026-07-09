import type { useTranslation } from "react-i18next";

import type {
  ExportSettingsValidation,
  MeshQuality,
} from "../model";

type TranslationFunction = ReturnType<typeof useTranslation>["t"];
type MeshQualityLabelKey =
  | "exportPanel.meshQualityLabels.high"
  | "exportPanel.meshQualityLabels.low"
  | "exportPanel.meshQualityLabels.medium"
  | "exportPanel.meshQualityLabels.xhigh";

export const MESH_QUALITY_LABEL_KEYS: Record<MeshQuality, MeshQualityLabelKey> = {
  high: "exportPanel.meshQualityLabels.high",
  low: "exportPanel.meshQualityLabels.low",
  medium: "exportPanel.meshQualityLabels.medium",
  xhigh: "exportPanel.meshQualityLabels.xhigh",
};

export function translateExportSettingsValidation(
  validation: ExportSettingsValidation,
  t: TranslationFunction,
): string | null {
  switch (validation.code) {
    case "jpg-needs-opaque-background":
      return t("exportPanel.jpgNeedsOpaqueBackground");
    case "no-components":
      return t("exportPanel.selectComponent");
    case "size-range":
      return t("exportPanel.sizeRange", {
        max: validation.max,
        min: validation.min,
      });
    case "size-too-large":
      return t("exportPanel.sizeTooLarge");
    case "supersampling-invalid":
      return t("exportPanel.supersamplingInvalid");
    case null:
      return null;
  }
}
