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

import {
  Atom,
  Monitor,
  Moon,
  MonitorCog,
  MousePointer2,
  Palette,
  PanelRight,
  Settings,
  Sun,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { NumberStepper } from "@/components/ui/number-stepper";
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
import { useMotion } from "@/motion/MotionProvider";
import {
  MOTION_PREFERENCES,
  type MotionPreference,
} from "@/motion/motionPreference";
import { THEME_PREFERENCES, type ThemePreference } from "@/theme/themePreference";
import { useTheme } from "@/theme/ThemeProvider";
import type { SelectionActivation } from "@/selection/selectionActivationPreference";

import { type BondSpec, type SceneSpec } from "../../api/scene";
import {
  currentLanguagePreference,
  setLanguagePreference,
  SUPPORTED_LANGUAGES,
  type LanguagePreference,
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
  STRUCTURE_LINE_WIDTH_MAX,
  STRUCTURE_LINE_WIDTH_MIN,
  STRUCTURE_LINE_WIDTH_STEP,
  type MeshQuality,
  type StyleState,
  type StructureLineWidthState,
  type UnitCellLineStyle,
  type BondingMode,
  type BondVisibilityOverrides,
} from "../../model";
import { ObjectsPanel, type ObjectsPanelTab } from "./ObjectsPanel";

export type InspectorSidebarTab = "settings" | "objects";

const INSPECTOR_BODY_TEXT_CLASS = "text-[13px]";
const INSPECTOR_SECTION_TITLE_CLASS =
  "text-[13px] font-bold leading-tight text-muted-foreground";
const INSPECTOR_SELECT_TRIGGER_CLASS =
  "!h-6 w-full !px-2 !py-0 bg-background text-[13px]";
const INSPECTOR_SELECT_ITEM_CLASS = "min-h-6 py-0.5 text-[13px]";
const INSPECTOR_LANGUAGE_LABEL_KEYS: Record<
  LanguagePreference,
  | "language.system"
  | "language.english"
  | "language.simplifiedChinese"
  | "language.traditionalChinese"
> = {
  system: "language.system",
  en: "language.english",
  "zh-CN": "language.simplifiedChinese",
  "zh-TW": "language.traditionalChinese",
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
const MOTION_PREFERENCE_LABEL_KEYS: Record<
  MotionPreference,
  "settings.system" | "settings.reduced" | "settings.full"
> = {
  system: "settings.system",
  reduce: "settings.reduced",
  full: "settings.full",
};
const INTERACTION_MODE_LABEL_KEYS: Record<InteractionMode, "settings.orbit" | "settings.trackball"> = {
  orbit: "settings.orbit",
  trackball: "settings.trackball",
};
const SELECTION_ACTIVATION_LABEL_KEYS: Record<
  SelectionActivation,
  "settings.singleClick" | "settings.doubleClick"
> = {
  single: "settings.singleClick",
  double: "settings.doubleClick",
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
  atomOpacity,
  atomsVisible,
  bondAlgorithm,
  bondLocateRequest,
  bondOpacity,
  bondObjectsResetToken,
  bondsVisible,
  bondVisibilityOverrides,
  cutoffOverrides,
  hasCustomBondingProfile,
  distinguishSimilarColors,
  dragSensitivity,
  isCustomColorScheme,
  interactionMode,
  selectionActivation,
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
  selectedBondId,
  style,
  structureLineWidth,
  unitCellLineStyle,
  onActiveObjectsTabChange,
  onActiveTabChange,
  onAtomLocateRequestHandled,
  onBondCutoffChange,
  onBondFamilyVisibilityChange,
  onBondLocateRequestHandled,
  onBondVisibilityChange,
  onBondAlgorithmChange,
  onDistinguishSimilarColorsChange,
  onDragSensitivityChange,
  onInteractionModeChange,
  onSelectionActivationChange,
  onLightStrengthChange,
  onMouseInertiaChange,
  onPreviewMeshQualityChange,
  onFogAffectsUnitCellChange,
  onShowFpsOverlayChange,
  onShowCrystalAxisLabelsChange,
  onElementColorChange,
  onStyleChange,
  onStructureLineWidthChange,
  onUnitCellLineStyleChange,
}: {
  activeObjectsTab: ObjectsPanelTab;
  activeTab: InspectorSidebarTab;
  atomLocateRequest: { atomId: string; token: number } | null;
  atomOpacity: number;
  atomsVisible: boolean;
  bondAlgorithm: BondingMode;
  bondLocateRequest: { bondId: string; token: number } | null;
  bondOpacity: number;
  bondObjectsResetToken: number;
  bondsVisible: boolean;
  bondVisibilityOverrides: BondVisibilityOverrides;
  cutoffOverrides: Record<string, number>;
  hasCustomBondingProfile: boolean;
  distinguishSimilarColors: boolean;
  dragSensitivity: number;
  isCustomColorScheme: boolean;
  interactionMode: InteractionMode;
  selectionActivation: SelectionActivation;
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
  selectedBondId: string | null;
  style: StyleState;
  structureLineWidth: StructureLineWidthState;
  unitCellLineStyle: UnitCellLineStyle;
  onActiveObjectsTabChange: (tab: ObjectsPanelTab) => void;
  onActiveTabChange: (tab: InspectorSidebarTab) => void;
  onAtomLocateRequestHandled: (token: number) => void;
  onBondAlgorithmChange: (bondAlgorithm: BondingMode) => void;
  onBondCutoffChange: (familyKey: string, cutoff: number | null) => Promise<boolean>;
  onBondFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  onBondLocateRequestHandled: (token: number) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onDistinguishSimilarColorsChange: (distinguishSimilarColors: boolean) => void;
  onDragSensitivityChange: (dragSensitivity: number) => void;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
  onSelectionActivationChange: (activation: SelectionActivation) => void;
  onLightStrengthChange: (lightStrength: number) => void;
  onMouseInertiaChange: (mouseInertia: boolean) => void;
  onPreviewMeshQualityChange: (meshQuality: MeshQuality) => void;
  onFogAffectsUnitCellChange: (fogAffectsUnitCell: boolean) => void;
  onShowFpsOverlayChange: (showFpsOverlay: boolean) => void;
  onShowCrystalAxisLabelsChange: (showCrystalAxisLabels: boolean) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  onStructureLineWidthChange: Dispatch<SetStateAction<StructureLineWidthState>>;
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
        "absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card text-foreground",
        "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none",
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
              <Settings aria-hidden="true" />
              {t("nav.settings")}
            </TabsTrigger>
            <TabsTrigger
              value="objects"
              className="h-8 flex-none px-0 text-[0.875rem] font-semibold"
            >
              <Atom aria-hidden="true" />
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
              distinguishSimilarColors={distinguishSimilarColors}
              dragSensitivity={dragSensitivity}
              isCustomColorScheme={isCustomColorScheme}
              interactionMode={interactionMode}
              selectionActivation={selectionActivation}
              lightStrength={lightStrength}
              mouseInertia={mouseInertia}
              isSceneLoading={isSceneLoading}
              previewMeshQuality={previewMeshQuality}
              fogAffectsUnitCell={fogAffectsUnitCell}
              showFpsOverlay={showFpsOverlay}
              showCrystalAxisLabels={showCrystalAxisLabels}
              structureLineWidth={structureLineWidth}
              unitCellLineStyle={unitCellLineStyle}
              onDistinguishSimilarColorsChange={onDistinguishSimilarColorsChange}
              onDragSensitivityChange={onDragSensitivityChange}
              onInteractionModeChange={onInteractionModeChange}
              onSelectionActivationChange={onSelectionActivationChange}
              onLightStrengthChange={onLightStrengthChange}
              onMouseInertiaChange={onMouseInertiaChange}
              onPreviewMeshQualityChange={onPreviewMeshQualityChange}
              onFogAffectsUnitCellChange={onFogAffectsUnitCellChange}
              onShowFpsOverlayChange={onShowFpsOverlayChange}
              onShowCrystalAxisLabelsChange={onShowCrystalAxisLabelsChange}
              onStructureLineWidthChange={onStructureLineWidthChange}
              onUnitCellLineStyleChange={onUnitCellLineStyleChange}
            />
          </TabsContent>
          <TabsContent value="objects" className="-mt-2 min-h-0">
            <ObjectsPanel
              activeTab={activeObjectsTab}
              atomLocateRequest={atomLocateRequest}
              atomOpacity={atomOpacity}
              atomsVisible={atomsVisible}
              bondLocateRequest={bondLocateRequest}
              bondOpacity={bondOpacity}
              bondAlgorithm={bondAlgorithm}
              bondObjectsResetToken={bondObjectsResetToken}
              bondsVisible={bondsVisible}
              bondVisibilityOverrides={bondVisibilityOverrides}
              cutoffOverrides={cutoffOverrides}
              hasCustomBondingProfile={hasCustomBondingProfile}
              isSceneLoading={isSceneLoading}
              onActiveTabChange={onActiveObjectsTabChange}
              onAtomLocateRequestHandled={onAtomLocateRequestHandled}
              onBondLocateRequestHandled={onBondLocateRequestHandled}
              onBondAlgorithmChange={onBondAlgorithmChange}
              onBondVisibilityChange={onBondVisibilityChange}
              onCutoffChange={onBondCutoffChange}
              onElementColorChange={onElementColorChange}
              onFamilyVisibilityChange={onBondFamilyVisibilityChange}
              onStyleChange={onStyleChange}
              scene={scene}
              selectedAtomId={selectedAtomId}
              selectedBondId={selectedBondId}
              style={style}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function SettingsPanel({
  distinguishSimilarColors,
  dragSensitivity,
  isCustomColorScheme,
  interactionMode,
  selectionActivation,
  lightStrength,
  mouseInertia,
  isSceneLoading,
  previewMeshQuality,
  fogAffectsUnitCell,
  showFpsOverlay,
  showCrystalAxisLabels,
  structureLineWidth,
  unitCellLineStyle,
  onDistinguishSimilarColorsChange,
  onDragSensitivityChange,
  onInteractionModeChange,
  onSelectionActivationChange,
  onLightStrengthChange,
  onMouseInertiaChange,
  onPreviewMeshQualityChange,
  onFogAffectsUnitCellChange,
  onShowFpsOverlayChange,
  onShowCrystalAxisLabelsChange,
  onStructureLineWidthChange,
  onUnitCellLineStyleChange,
}: {
  distinguishSimilarColors: boolean;
  dragSensitivity: number;
  isCustomColorScheme: boolean;
  interactionMode: InteractionMode;
  selectionActivation: SelectionActivation;
  lightStrength: number;
  mouseInertia: boolean;
  isSceneLoading: boolean;
  previewMeshQuality: MeshQuality;
  fogAffectsUnitCell: boolean;
  showFpsOverlay: boolean;
  showCrystalAxisLabels: boolean;
  structureLineWidth: StructureLineWidthState;
  unitCellLineStyle: UnitCellLineStyle;
  onDistinguishSimilarColorsChange: (distinguishSimilarColors: boolean) => void;
  onDragSensitivityChange: (dragSensitivity: number) => void;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
  onSelectionActivationChange: (activation: SelectionActivation) => void;
  onLightStrengthChange: (lightStrength: number) => void;
  onMouseInertiaChange: (mouseInertia: boolean) => void;
  onPreviewMeshQualityChange: (meshQuality: MeshQuality) => void;
  onFogAffectsUnitCellChange: (fogAffectsUnitCell: boolean) => void;
  onShowFpsOverlayChange: (showFpsOverlay: boolean) => void;
  onShowCrystalAxisLabelsChange: (showCrystalAxisLabels: boolean) => void;
  onStructureLineWidthChange: Dispatch<SetStateAction<StructureLineWidthState>>;
  onUnitCellLineStyleChange: (lineStyle: UnitCellLineStyle) => void;
}) {
  const { t } = useTranslation();
  const [languagePreference, setLocalLanguagePreference] = useState(
    currentLanguagePreference,
  );
  const { setTheme, theme } = useTheme();
  const { motion, reducedMotion, setMotion } = useMotion();

  return (
    <div className="flex flex-col gap-3">
      <InspectorSettingsSection
        id="inspector-general-settings"
        icon={UserRoundCog}
        title={t("settings.general")}
      >
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
            value={languagePreference}
            onValueChange={(value) => {
              const preference = value as LanguagePreference;
              setLocalLanguagePreference(preference);
              void setLanguagePreference(preference);
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
                <SelectItem value="system" className={INSPECTOR_SELECT_ITEM_CLASS}>
                  {t(INSPECTOR_LANGUAGE_LABEL_KEYS.system)}
                </SelectItem>
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

        <InspectorSelectRow label={t("settings.motion")}>
          <Select
            value={motion}
            onValueChange={(value) => setMotion(value as MotionPreference)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.motion")}
              className={INSPECTOR_SELECT_TRIGGER_CLASS}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                {MOTION_PREFERENCES.map((preference) => (
                  <SelectItem
                    key={preference}
                    value={preference}
                    className={INSPECTOR_SELECT_ITEM_CLASS}
                  >
                    {t(MOTION_PREFERENCE_LABEL_KEYS[preference])}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </InspectorSelectRow>
      </InspectorSettingsSection>

      <Separator />

      <InspectorSettingsSection
        id="inspector-appearance-settings"
        icon={Palette}
        title={t("settings.appearance")}
      >
        <InspectorSwitchRow
          checked={showCrystalAxisLabels}
          label={t("settings.showCrystalAxisLabels")}
          onCheckedChange={onShowCrystalAxisLabelsChange}
        />

        <InspectorSwitchRow
          checked={fogAffectsUnitCell}
          label={t("settings.applyDepthFadingToUnitCell")}
          onCheckedChange={onFogAffectsUnitCellChange}
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

        <InspectorSelectRow label={t("settings.unitCellLineWidth")}>
          <NumberStepper
            aria-label={t("settings.unitCellLineWidth")}
            className="justify-self-end"
            min={STRUCTURE_LINE_WIDTH_MIN}
            max={STRUCTURE_LINE_WIDTH_MAX}
            step={STRUCTURE_LINE_WIDTH_STEP}
            suffix="px"
            value={structureLineWidth.unitCell}
            onValueChange={(unitCell) =>
              onStructureLineWidthChange((current) => ({ ...current, unitCell }))
            }
          />
        </InspectorSelectRow>

        <InspectorSelectRow label={t("settings.polyhedraEdgeWidth")}>
          <NumberStepper
            aria-label={t("settings.polyhedraEdgeWidth")}
            className="justify-self-end"
            min={STRUCTURE_LINE_WIDTH_MIN}
            max={STRUCTURE_LINE_WIDTH_MAX}
            step={STRUCTURE_LINE_WIDTH_STEP}
            suffix="px"
            value={structureLineWidth.polyhedra}
            onValueChange={(polyhedra) =>
              onStructureLineWidthChange((current) => ({ ...current, polyhedra }))
            }
          />
        </InspectorSelectRow>

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

      <InspectorSettingsSection
        id="inspector-rendering-settings"
        icon={MonitorCog}
        title={t("settings.rendering")}
      >
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

      <InspectorSettingsSection
        id="inspector-interaction-settings"
        icon={MousePointer2}
        title={t("settings.interaction")}
      >
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
          checked={mouseInertia && !reducedMotion}
          disabled={interactionMode !== "trackball" || reducedMotion}
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

        <InspectorSelectRow label={t("settings.selection")}>
          <ToggleGroup
            type="single"
            variant="primary"
            size="sm"
            spacing={1}
            value={selectionActivation}
            aria-label={t("settings.selection")}
            className="grid h-6 w-full grid-cols-2"
            onValueChange={(value) => {
              if (value) {
                onSelectionActivationChange(value as SelectionActivation);
              }
            }}
          >
            {(["single", "double"] as const).map((activation) => {
              const label = t(SELECTION_ACTIVATION_LABEL_KEYS[activation]);
              return (
                <ToggleGroupItem
                  key={activation}
                  value={activation}
                  aria-label={label}
                  className="h-6 w-full px-1 text-[11px]"
                >
                  {label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </InspectorSelectRow>
      </InspectorSettingsSection>

    </div>
  );
}

function InspectorSettingsSection({
  children,
  icon: Icon,
  id,
  title,
}: {
  children: ReactNode;
  icon: LucideIcon;
  id: string;
  title: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2
        id={id}
        className={cn(INSPECTOR_SECTION_TITLE_CLASS, "flex items-center gap-1.5")}
      >
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
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
