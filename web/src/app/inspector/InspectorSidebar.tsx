import {
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Monitor, Moon, PanelRight, Sun, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/themePreference";
import { useTheme } from "@/theme/ThemeProvider";

import {
  BOND_ALGORITHM_OPTIONS,
  type BondAlgorithm,
  type SceneSpec,
} from "../../api/scene";
import {
  currentAppLanguage,
  setAppLanguage,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
} from "../../i18n";
import { MESH_QUALITY_LABEL_KEYS } from "../../i18n/exportSettingsText";
import {
  TOOL_ICON_BUTTON_ACTIVE_CLASS,
  TOOL_ICON_BUTTON_CLASS,
} from "../surface";
import {
  clampDragSensitivity,
  clampLightStrength,
  dragSensitivityToSliderPosition,
  formatDragSensitivityPercent,
  formatLightStrengthPercent,
  MAX_DRAG_SENSITIVITY,
  MAX_LIGHT_STRENGTH,
  MIN_DRAG_SENSITIVITY,
  MIN_LIGHT_STRENGTH,
  INTERACTION_MODE_OPTIONS,
  lightStrengthToSliderPosition,
  parseDragSensitivityPercentInput,
  parseLightStrengthPercentInput,
  sliderPositionToDragSensitivity,
  sliderPositionToLightStrength,
  snapDragSensitivitySliderPosition,
  snapLightStrengthSliderPosition,
  type InteractionMode,
} from "../viewState";
import { useAutoBlurSlider } from "../controls/commonPanel/sharedControls";
import {
  MESH_QUALITY_OPTIONS,
  type MeshQuality,
  type StyleState,
  type UnitCellLineStyle,
} from "../../model";
import { ObjectsPanel, type ObjectsPanelTab } from "./ObjectsPanel";

export type InspectorSidebarTab = "settings" | "objects";

const INSPECTOR_BODY_TEXT_CLASS = "text-[13px]";
const INSPECTOR_SECTION_TITLE_CLASS =
  "text-[13px] font-bold leading-tight text-muted-foreground";
const INSPECTOR_SELECT_TRIGGER_CLASS =
  "!h-6 w-full !px-2 !py-0 bg-background text-[13px]";
const INSPECTOR_SELECT_ITEM_CLASS = "min-h-6 py-0.5 text-[13px]";
const INSPECTOR_LANGUAGE_LABEL_KEYS: Record<AppLanguage, "language.english" | "language.simplifiedChinese"> = {
  en: "language.english",
  "zh-CN": "language.simplifiedChinese",
};
const THEME_PREFERENCE_LABEL_KEYS: Record<
  ThemePreference,
  "settings.system" | "settings.light" | "settings.dark"
> = {
  system: "settings.system",
  light: "settings.light",
  dark: "settings.dark",
};
const THEME_PREFERENCE_ICONS: Record<ThemePreference, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
const INTERACTION_MODE_LABEL_KEYS: Record<InteractionMode, "settings.orbit" | "settings.trackball"> = {
  orbit: "settings.orbit",
  trackball: "settings.trackball",
};

export function InspectorToggle({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = t("nav.sidebar");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-controls="inspector-sidebar"
            aria-expanded={isOpen}
            aria-label={label}
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "absolute right-4 top-4 z-30 size-8 rounded-[10px] [&_svg]:size-4",
              isOpen
                ? TOOL_ICON_BUTTON_ACTIVE_CLASS
                : "border-foreground/10 bg-card/80 backdrop-blur-xl backdrop-saturate-150",
            )}
            onClick={() => onOpenChange(!isOpen)}
          >
            <PanelRight aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function InspectorSidebar({
  activeObjectsTab,
  activeTab,
  atomLocateRequest,
  atomsVisible,
  bondAlgorithm,
  distinguishSimilarColors,
  dragSensitivity,
  isCustomColorScheme,
  interactionMode,
  lightStrength,
  mouseInertia,
  isOpen,
  isSceneLoading,
  previewMeshQuality,
  fogAffectsUnitCell,
  showFpsOverlay,
  showCrystalAxisLabels,
  scene,
  selectedAtomId,
  style,
  unitCellLineStyle,
  onActiveObjectsTabChange,
  onActiveTabChange,
  onAtomLocateRequestHandled,
  onAtomSelect,
  onBondAlgorithmChange,
  onDistinguishSimilarColorsChange,
  onDragSensitivityChange,
  onInteractionModeChange,
  onLightStrengthChange,
  onMouseInertiaChange,
  onPreviewMeshQualityChange,
  onFogAffectsUnitCellChange,
  onShowFpsOverlayChange,
  onShowCrystalAxisLabelsChange,
  onElementColorChange,
  onStyleChange,
  onUnitCellLineStyleChange,
}: {
  activeObjectsTab: ObjectsPanelTab;
  activeTab: InspectorSidebarTab;
  atomLocateRequest: { atomId: string; token: number } | null;
  atomsVisible: boolean;
  bondAlgorithm: BondAlgorithm;
  distinguishSimilarColors: boolean;
  dragSensitivity: number;
  isCustomColorScheme: boolean;
  interactionMode: InteractionMode;
  lightStrength: number;
  mouseInertia: boolean;
  isOpen: boolean;
  isSceneLoading: boolean;
  previewMeshQuality: MeshQuality;
  fogAffectsUnitCell: boolean;
  showFpsOverlay: boolean;
  showCrystalAxisLabels: boolean;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
  unitCellLineStyle: UnitCellLineStyle;
  onActiveObjectsTabChange: (tab: ObjectsPanelTab) => void;
  onActiveTabChange: (tab: InspectorSidebarTab) => void;
  onAtomLocateRequestHandled: (token: number) => void;
  onAtomSelect: (atomId: string) => void;
  onBondAlgorithmChange: (bondAlgorithm: BondAlgorithm) => void;
  onDistinguishSimilarColorsChange: (distinguishSimilarColors: boolean) => void;
  onDragSensitivityChange: (dragSensitivity: number) => void;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
  onLightStrengthChange: (lightStrength: number) => void;
  onMouseInertiaChange: (mouseInertia: boolean) => void;
  onPreviewMeshQualityChange: (meshQuality: MeshQuality) => void;
  onFogAffectsUnitCellChange: (fogAffectsUnitCell: boolean) => void;
  onShowFpsOverlayChange: (showFpsOverlay: boolean) => void;
  onShowCrystalAxisLabelsChange: (showCrystalAxisLabels: boolean) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  onUnitCellLineStyleChange: (lineStyle: UnitCellLineStyle) => void;
}) {
  const { t } = useTranslation();

  return (
    <aside
      id="inspector-sidebar"
      aria-label={t("nav.sidebar")}
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={cn(
        "absolute inset-y-0 right-0 z-20 flex w-[372px] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card text-foreground",
        "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) => onActiveTabChange(value as InspectorSidebarTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <header className="flex h-[60px] shrink-0 items-start px-4 pt-3 pr-16">
          <TabsList
            variant="line"
            data-inspector-sidebar-tabs=""
            className="h-8 w-full justify-start gap-4 rounded-none p-0"
          >
            <TabsTrigger
              value="settings"
              className="h-8 flex-none px-0 text-[0.875rem] font-semibold"
            >
              {t("nav.settings")}
            </TabsTrigger>
            <TabsTrigger
              value="objects"
              className="h-8 flex-none px-0 text-[0.875rem] font-semibold"
            >
              {t("nav.objects")}
            </TabsTrigger>
          </TabsList>
        </header>

        <div
          data-slot="inspector-body"
          className="stable-scrollbar-gutter min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          <TabsContent value="settings" className="m-0">
            <SettingsPanel
              bondAlgorithm={bondAlgorithm}
              distinguishSimilarColors={distinguishSimilarColors}
              dragSensitivity={dragSensitivity}
              isCustomColorScheme={isCustomColorScheme}
              interactionMode={interactionMode}
              lightStrength={lightStrength}
              mouseInertia={mouseInertia}
              isSceneLoading={isSceneLoading}
              previewMeshQuality={previewMeshQuality}
              fogAffectsUnitCell={fogAffectsUnitCell}
              showFpsOverlay={showFpsOverlay}
              showCrystalAxisLabels={showCrystalAxisLabels}
              unitCellLineStyle={unitCellLineStyle}
              onBondAlgorithmChange={onBondAlgorithmChange}
              onDistinguishSimilarColorsChange={onDistinguishSimilarColorsChange}
              onDragSensitivityChange={onDragSensitivityChange}
              onInteractionModeChange={onInteractionModeChange}
              onLightStrengthChange={onLightStrengthChange}
              onMouseInertiaChange={onMouseInertiaChange}
              onPreviewMeshQualityChange={onPreviewMeshQualityChange}
              onFogAffectsUnitCellChange={onFogAffectsUnitCellChange}
              onShowFpsOverlayChange={onShowFpsOverlayChange}
              onShowCrystalAxisLabelsChange={onShowCrystalAxisLabelsChange}
              onUnitCellLineStyleChange={onUnitCellLineStyleChange}
            />
          </TabsContent>
          <TabsContent value="objects" className="-mt-2 min-h-0">
            <ObjectsPanel
              activeTab={activeObjectsTab}
              atomLocateRequest={atomLocateRequest}
              atomsVisible={atomsVisible}
              onActiveTabChange={onActiveObjectsTabChange}
              onAtomLocateRequestHandled={onAtomLocateRequestHandled}
              onAtomSelect={onAtomSelect}
              onElementColorChange={onElementColorChange}
              onStyleChange={onStyleChange}
              scene={scene}
              selectedAtomId={selectedAtomId}
              style={style}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function SettingsPanel({
  bondAlgorithm,
  distinguishSimilarColors,
  dragSensitivity,
  isCustomColorScheme,
  interactionMode,
  lightStrength,
  mouseInertia,
  isSceneLoading,
  previewMeshQuality,
  fogAffectsUnitCell,
  showFpsOverlay,
  showCrystalAxisLabels,
  unitCellLineStyle,
  onBondAlgorithmChange,
  onDistinguishSimilarColorsChange,
  onDragSensitivityChange,
  onInteractionModeChange,
  onLightStrengthChange,
  onMouseInertiaChange,
  onPreviewMeshQualityChange,
  onFogAffectsUnitCellChange,
  onShowFpsOverlayChange,
  onShowCrystalAxisLabelsChange,
  onUnitCellLineStyleChange,
}: {
  bondAlgorithm: BondAlgorithm;
  distinguishSimilarColors: boolean;
  dragSensitivity: number;
  isCustomColorScheme: boolean;
  interactionMode: InteractionMode;
  lightStrength: number;
  mouseInertia: boolean;
  isSceneLoading: boolean;
  previewMeshQuality: MeshQuality;
  fogAffectsUnitCell: boolean;
  showFpsOverlay: boolean;
  showCrystalAxisLabels: boolean;
  unitCellLineStyle: UnitCellLineStyle;
  onBondAlgorithmChange: (bondAlgorithm: BondAlgorithm) => void;
  onDistinguishSimilarColorsChange: (distinguishSimilarColors: boolean) => void;
  onDragSensitivityChange: (dragSensitivity: number) => void;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
  onLightStrengthChange: (lightStrength: number) => void;
  onMouseInertiaChange: (mouseInertia: boolean) => void;
  onPreviewMeshQualityChange: (meshQuality: MeshQuality) => void;
  onFogAffectsUnitCellChange: (fogAffectsUnitCell: boolean) => void;
  onShowFpsOverlayChange: (showFpsOverlay: boolean) => void;
  onShowCrystalAxisLabelsChange: (showCrystalAxisLabels: boolean) => void;
  onUnitCellLineStyleChange: (lineStyle: UnitCellLineStyle) => void;
}) {
  const { t } = useTranslation();
  const appLanguage = currentAppLanguage();
  const { setTheme, theme } = useTheme();

  return (
    <div className="flex flex-col gap-3">
      <InspectorSettingsSection id="inspector-preferences-settings" title={t("settings.preferences")}>
        <InspectorSelectRow label={t("settings.theme")}>
          <TooltipProvider>
            <ToggleGroup
              type="single"
              variant="primary"
              size="sm"
              spacing={1}
              value={theme}
              aria-label={t("settings.theme")}
              className="theme-preference-toggle grid h-6 w-full grid-cols-3"
              onValueChange={(value) => {
                if (value) {
                  setTheme(value as ThemePreference);
                }
              }}
            >
              {THEME_PREFERENCES.map((preference) => {
                const Icon = THEME_PREFERENCE_ICONS[preference];
                const label = t(THEME_PREFERENCE_LABEL_KEYS[preference]);

                return (
                  <Tooltip key={preference}>
                    <TooltipTrigger asChild>
                      <span className="block min-w-0">
                        <ToggleGroupItem
                          value={preference}
                          aria-label={label}
                          className="h-6 w-full min-w-0 px-0"
                        >
                          <Icon aria-hidden="true" />
                        </ToggleGroupItem>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </ToggleGroup>
          </TooltipProvider>
        </InspectorSelectRow>

        <InspectorSelectRow label={t("settings.language")}>
          <Select
            value={appLanguage}
            onValueChange={(value) => {
              void setAppLanguage(value as AppLanguage);
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.language")}
              className={INSPECTOR_SELECT_TRIGGER_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                {SUPPORTED_LANGUAGES.map((language) => (
                  <SelectItem
                    key={language}
                    value={language}
                    className={INSPECTOR_SELECT_ITEM_CLASS}
                  >
                    {t(INSPECTOR_LANGUAGE_LABEL_KEYS[language])}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InspectorSelectRow>
      </InspectorSettingsSection>

      <Separator />

      <InspectorSettingsSection id="inspector-appearance-settings" title={t("settings.appearance")}>
        <InspectorSwitchRow
          checked={showCrystalAxisLabels}
          label={t("settings.showCrystalAxisLabels")}
          onCheckedChange={onShowCrystalAxisLabelsChange}
        />

        <InspectorSelectRow label={t("settings.unitCellLineStyle")}>
          <Select
            value={unitCellLineStyle}
            onValueChange={(value) => onUnitCellLineStyleChange(value as UnitCellLineStyle)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.unitCellLineStyle")}
              className={INSPECTOR_SELECT_TRIGGER_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                <SelectItem value="solid" className={INSPECTOR_SELECT_ITEM_CLASS}>
                  {t("settings.solid")}
                </SelectItem>
                <SelectItem value="dashed" className={INSPECTOR_SELECT_ITEM_CLASS}>
                  {t("settings.dashed")}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </InspectorSelectRow>

        <InspectorSwitchRow
          checked={fogAffectsUnitCell}
          label={t("settings.applyDepthCueingToUnitCell")}
          onCheckedChange={onFogAffectsUnitCellChange}
        />

        <InspectorSwitchRow
          checked={isCustomColorScheme ? false : distinguishSimilarColors}
          disabled={isCustomColorScheme}
          label={t("settings.distinguishSimilarColors")}
          onCheckedChange={onDistinguishSimilarColorsChange}
        />

        <InspectorRangeRow
          label={t("settings.lightStrength")}
          value={lightStrength}
          min={MIN_LIGHT_STRENGTH}
          max={MAX_LIGHT_STRENGTH}
          clampValue={clampLightStrength}
          formatPercent={formatLightStrengthPercent}
          onValueChange={onLightStrengthChange}
          parsePercentInput={parseLightStrengthPercentInput}
          sliderPositionToValue={sliderPositionToLightStrength}
          snapSliderPosition={snapLightStrengthSliderPosition}
          valueToSliderPosition={lightStrengthToSliderPosition}
        />
      </InspectorSettingsSection>

      <Separator />

      <InspectorSettingsSection id="inspector-rendering-settings" title={t("settings.rendering")}>
        <InspectorSelectRow label={t("settings.previewQuality")}>
          <Select
            value={previewMeshQuality}
            onValueChange={(value) => onPreviewMeshQualityChange(value as MeshQuality)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.previewQuality")}
              className={INSPECTOR_SELECT_TRIGGER_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                {MESH_QUALITY_OPTIONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    className={INSPECTOR_SELECT_ITEM_CLASS}
                  >
                    {t(MESH_QUALITY_LABEL_KEYS[option])}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InspectorSelectRow>

        <InspectorSwitchRow
          checked={showFpsOverlay}
          label={t("settings.showFps")}
          onCheckedChange={onShowFpsOverlayChange}
        />
      </InspectorSettingsSection>

      <Separator />

      <InspectorSettingsSection id="inspector-interaction-settings" title={t("settings.interaction")}>
        <InspectorSelectRow label={t("settings.mouseControl")}>
          <Select
            value={interactionMode}
            onValueChange={(value) => onInteractionModeChange(value as InteractionMode)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.mouseControl")}
              className={INSPECTOR_SELECT_TRIGGER_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                {INTERACTION_MODE_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={INSPECTOR_SELECT_ITEM_CLASS}
                  >
                    {t(INTERACTION_MODE_LABEL_KEYS[option.value])}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InspectorSelectRow>

        <InspectorSwitchRow
          checked={mouseInertia}
          disabled={interactionMode !== "trackball"}
          label={t("settings.mouseInertia")}
          onCheckedChange={onMouseInertiaChange}
        />

        <InspectorRangeRow
          label={t("settings.dragSensitivity")}
          value={dragSensitivity}
          min={MIN_DRAG_SENSITIVITY}
          max={MAX_DRAG_SENSITIVITY}
          clampValue={clampDragSensitivity}
          formatPercent={formatDragSensitivityPercent}
          onValueChange={onDragSensitivityChange}
          parsePercentInput={parseDragSensitivityPercentInput}
          sliderPositionToValue={sliderPositionToDragSensitivity}
          snapSliderPosition={snapDragSensitivitySliderPosition}
          valueToSliderPosition={dragSensitivityToSliderPosition}
        />
      </InspectorSettingsSection>

      <Separator />

      <InspectorSettingsSection id="inspector-analysis-settings" title={t("settings.analysis")}>
        <InspectorSelectRow label={t("settings.bondingAlgorithm")}>
          <Select
            value={bondAlgorithm}
            disabled={isSceneLoading}
            onValueChange={(value) => onBondAlgorithmChange(value as BondAlgorithm)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.bondingAlgorithm")}
              className={INSPECTOR_SELECT_TRIGGER_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                {BOND_ALGORITHM_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className={INSPECTOR_SELECT_ITEM_CLASS}
                  >
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InspectorSelectRow>
      </InspectorSettingsSection>
    </div>
  );
}

function InspectorSettingsSection({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className={INSPECTOR_SECTION_TITLE_CLASS}>
        {title}
      </h2>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function InspectorRangeRow({
  clampValue,
  formatPercent,
  label,
  max,
  min,
  onValueChange,
  parsePercentInput,
  sliderPositionToValue,
  snapSliderPosition,
  value,
  valueToSliderPosition,
}: {
  clampValue: (value: number) => number;
  formatPercent: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  parsePercentInput: (value: string) => number | null;
  sliderPositionToValue: (position: number) => number;
  snapSliderPosition: (position: number) => number;
  value: number;
  valueToSliderPosition: (value: number) => number;
}) {
  const [valueText, setValueText] = useState(formatPercent(value));
  const sliderBlur = useAutoBlurSlider();
  const sliderPosition = valueToSliderPosition(value);
  const sliderValue = Math.round(sliderPosition * 1000);
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;

  useEffect(() => {
    setValueText(formatPercent(value));
  }, [formatPercent, value]);

  function commitValueText() {
    const nextValue = parsePercentInput(valueText);
    if (nextValue === null) {
      setValueText(formatPercent(value));
      return;
    }

    const clampedValue = clampValue(nextValue);
    setValueText(formatPercent(clampedValue));
    onValueChange(clampedValue);
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitValueText();
      return;
    }

    if (event.key === "Escape") {
      setValueText(formatPercent(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 0.01 : -0.01;
      onValueChange(clampValue(value + direction));
    }
  }

  return (
    <label
      className={cn(
        "grid min-h-8 grid-cols-[minmax(0,1fr)_6.75rem_2.35rem] items-center gap-2",
        INSPECTOR_BODY_TEXT_CLASS,
      )}
    >
      <span className="min-w-0 truncate leading-tight text-foreground">{label}</span>
      <span className="opacity-slider-shell relative mr-3 h-5" style={sliderStyle}>
        <input
          type="range"
          aria-label={label}
          min={0}
          max={1000}
          step={1}
          value={sliderValue}
          aria-valuemin={Math.round(min * 100)}
          aria-valuemax={Math.round(max * 100)}
          aria-valuenow={Math.round(value * 100)}
          aria-valuetext={`${formatPercent(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          ref={sliderBlur.ref}
          onChange={(event) => {
            const nextPosition = snapSliderPosition(Number(event.currentTarget.value) / 1000);
            onValueChange(sliderPositionToValue(nextPosition));
          }}
          onMouseDown={sliderBlur.handlePointerDown}
          onMouseUp={sliderBlur.handlePointerEnd}
          onPointerCancel={sliderBlur.handlePointerEnd}
          onPointerDown={sliderBlur.handlePointerDown}
          onPointerUp={sliderBlur.handlePointerEnd}
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-snap-marker pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </span>
      <span className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150">
        <span className="sr-only">{label} value</span>
        <input
          type="text"
          inputMode="decimal"
          value={valueText}
          aria-label={`${label} value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          onBlur={commitValueText}
          onChange={(event) => setValueText(event.target.value)}
          onKeyDown={handleValueKeyDown}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground"
        >
          %
        </span>
      </span>
    </label>
  );
}

function InspectorSwitchRow({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex min-h-8 items-center justify-between gap-2",
        INSPECTOR_BODY_TEXT_CLASS,
        disabled ? "opacity-55" : null,
      )}
    >
      <span className="leading-tight text-foreground">{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function InspectorSelectRow({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn(
        "grid min-h-8 grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-2",
        INSPECTOR_BODY_TEXT_CLASS,
      )}
    >
      <span className="leading-tight text-foreground">{label}</span>
      {children}
    </div>
  );
}
