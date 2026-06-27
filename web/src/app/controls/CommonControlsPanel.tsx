import {
  AlertTriangleIcon,
  Check,
  ImageDown,
  Info,
  Link,
  Palette,
  RotateCcw,
  Rotate3d as CameraIcon,
  Unlink,
  View as DisplayIcon,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AngleSlider } from "@/components/ui/angle-slider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomRadiusModel } from "../../api/scene";
import {
  computeCrystalCameraVectors,
  normalizeRollDegrees,
  parseVectorCoefficients,
  stateFromViewVectors,
  type CrystalCameraPrimaryDirection,
  type CrystalCameraState,
} from "../../scene/crystalCamera";
import type { VectorTuple } from "../../scene/viewMath";
import {
  COLOR_SCHEME_OPTIONS,
  type ColorScheme,
} from "../colorSchemes";
import {
  MATERIAL_PRESET_OPTIONS,
  materialPresetById,
  type MaterialPresetId,
} from "../materialPresets";
import {
  COMPONENT_OPACITY_MAX,
  EXPORT_FORMAT_OPTIONS,
  EXPORT_MESH_QUALITY_OPTIONS,
  EXPORT_SUPERSAMPLING_OPTIONS,
  STYLE_FOG_START_MAX,
  STYLE_FOG_START_MIN,
  STYLE_FOG_STRENGTH_MAX,
  STYLE_FOG_STRENGTH_MIN,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  createDefaultComponentOpacity,
  createDefaultExportSettings,
  createDefaultStyle,
  parseExportDimensionInput,
  setExportAspectRatioLocked,
  setExportDimension,
  setExportFormat,
  setExportMeshQuality,
  setExportSupersampling,
  validateExportSettings,
  type BondColorMode,
  type ComponentOpacityState,
  type ComponentVisibilityState,
  type ExportFormat,
  type ExportMeshQuality,
  type ExportProjectedSize,
  type ExportSettingsState,
  type ExportSupersampling,
  type StyleState,
} from "../settings";
import {
  GLASS_SURFACE_CLASS,
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../surface";

type CommonPanelTab = "camera" | "display" | "style" | "export";
type ToolButtonFeedbackPhase = "a" | "b" | null;
type ManualButtonFeedbackTarget = "apply" | "reset";

interface TabIndicatorRect {
  left: number;
  width: number;
}

const COMMON_PANEL_TABS: {
  Icon: LucideIcon;
  label: string;
  value: CommonPanelTab;
}[] = [
  { Icon: DisplayIcon, label: "Display", value: "display" },
  { Icon: CameraIcon, label: "Camera", value: "camera" },
  { Icon: Palette, label: "Style", value: "style" },
  { Icon: ImageDown, label: "Export", value: "export" },
];
const TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS = 150;
const OPAQUE_OPACITY_VALUE = 100;
const OPAQUE_SLIDER_SNAP_DISTANCE = 2;
const STYLE_SCALE_DEFAULT_VALUE = 100;
const STYLE_SCALE_SLIDER_SNAP_DISTANCE = 4;
const COMMON_SLIDER_BLUR_DELAY_MS = 500;
const BOND_COLOR_OPTIONS: { label: string; value: BondColorMode }[] = [
  { label: "By atom", value: "by-atom" },
  { label: "Uniform", value: "neutral" },
  { label: "Uniform (2D)", value: "unicolor-2d" },
];
const ATOM_RADIUS_MODEL_OPTIONS: {
  menuLabel: string;
  triggerLabel: string;
  value: AtomRadiusModel;
}[] = [
  { menuLabel: "Uniform", triggerLabel: "Uniform", value: "uniform" },
  { menuLabel: "Atomic", triggerLabel: "Atomic", value: "atomic" },
  { menuLabel: "Van der Waals", triggerLabel: "vdW", value: "vdw" },
  { menuLabel: "Ionic", triggerLabel: "Ionic", value: "ionic" },
];
const EXPORT_MESH_QUALITY_LABELS: Record<ExportMeshQuality, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
};
const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  pdf: "PDF",
  png: "PNG",
};
const UNICOLOR_TOKEN_STYLE = {
  background:
    "linear-gradient(145deg, rgba(255, 255, 255, 0.72) 0 18%, rgba(255, 255, 255, 0.2) 19% 34%, rgba(255, 255, 255, 0) 35%), linear-gradient(180deg, #dbe0e8 0%, #aeb5c0 42%, #7d8795 100%)",
} as const;
const BY_ATOM_TOKEN_STYLE = {
  background:
    "linear-gradient(145deg, rgba(255, 255, 255, 0.74) 0 18%, rgba(255, 255, 255, 0.18) 19% 34%, rgba(255, 255, 255, 0) 35%), linear-gradient(90deg, #f58c9a 0 50%, #78a7ff 50% 100%)",
} as const;
const UNICOLOR_2D_TOKEN_STYLE = {
  background: "linear-gradient(180deg, #a8afbb 0%, #8f96a3 100%)",
} as const;
const JMOL_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #ffffff 0 25%, #909090 25% 50%, #3050f8 50% 75%, #ff0d0d 75% 100%)",
} as const;
const JMOL_SOFT_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #dedede 0 25%, #919191 25% 50%, #4c6cca 50% 75%, #d86254 75% 100%)",
} as const;
const VESTA_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #ffcccc 0 25%, #814929 25% 50%, #b0bae6 50% 75%, #ff0300 75% 100%)",
} as const;
const VESTA_SOFT_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #f2c0c0 0 25%, #8d5434 25% 50%, #a9b3df 50% 75%, #d86253 75% 100%)",
} as const;

export function CommonControlsPanel({
  cameraState,
  cellVectors,
  componentOpacity,
  componentVisibility,
  exportError,
  exportProjectedSize,
  exportSettings,
  hasPolyhedra,
  isExporting,
  onComponentOpacityChange,
  onComponentVisibilityChange,
  onAtomRadiusModelChange,
  onCameraPrimaryChange,
  onCameraRollPreviewChange,
  onCameraRollPreviewStart,
  onCameraRollChange,
  onCameraStateChange,
  onExport,
  onExportSettingsChange,
  onStyleChange,
  style,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  exportError: string | null;
  exportProjectedSize?: ExportProjectedSize;
  exportSettings: ExportSettingsState;
  hasPolyhedra: boolean;
  isExporting: boolean;
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
  onCameraPrimaryChange: (primary: CrystalCameraPrimaryDirection) => void;
  onCameraRollPreviewChange: (rollDegrees: number) => void;
  onCameraRollPreviewStart: () => void;
  onCameraRollChange: (rollDegrees: number) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
  onComponentOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onComponentVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  onExport: () => void;
  onExportSettingsChange: (settings: ExportSettingsState) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  const tabTriggerRefs = useRef<Record<CommonPanelTab, HTMLButtonElement | null>>({
    camera: null,
    display: null,
    export: null,
    style: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<CommonPanelTab>("display");
  const [tabIndicatorRect, setTabIndicatorRect] = useState<TabIndicatorRect | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const contentStyle = contentHeight === null
    ? undefined
    : ({ height: `${contentHeight}px` } as CSSProperties);
  const tabListStyle = {
    gridTemplateColumns: COMMON_PANEL_TABS.map(({ value }) =>
      value === activeTab ? "1.65fr" : "0.9fr",
    ).join(" "),
  } as const;

  useEffect(() => {
    const updateIndicatorRect = () => {
      const activeTrigger = tabTriggerRefs.current[activeTab];
      if (!activeTrigger) {
        return;
      }

      setTabIndicatorRect({
        left: activeTrigger.offsetLeft,
        width: activeTrigger.offsetWidth,
      });
    };

    updateIndicatorRect();
    const animationFrame = window.requestAnimationFrame(updateIndicatorRect);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateIndicatorRect);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateIndicatorRect);
      };
    }

    const resizeObserver = new ResizeObserver(updateIndicatorRect);
    for (const trigger of Object.values(tabTriggerRefs.current)) {
      if (trigger) {
        resizeObserver.observe(trigger);
      }
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [activeTab]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    function updateContentHeight() {
      const activeContent = contentElement?.querySelector<HTMLElement>(
        "[data-slot='tabs-content'][data-state='active']",
      );
      const nextHeight = activeContent?.scrollHeight ?? 0;

      setContentHeight(nextHeight > 0 ? nextHeight : null);
    }

    let resizeObserver: ResizeObserver | null = null;
    const animationFrame = window.requestAnimationFrame(() => {
      updateContentHeight();

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      resizeObserver = new ResizeObserver(updateContentHeight);
      const activeContent = contentElement.querySelector<HTMLElement>(
        "[data-slot='tabs-content'][data-state='active']",
      );
      if (activeContent) {
        resizeObserver.observe(activeContent);
      }
    });
    window.addEventListener("resize", updateContentHeight);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateContentHeight);
      };
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateContentHeight);
      resizeObserver?.disconnect();
    };
  }, [activeTab]);

  function handleTabValueChange(value: string) {
    const currentHeight = contentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setContentHeight(currentHeight);
    }

    setActiveTab(value as CommonPanelTab);
  }

  return (
    <TooltipProvider>
      <aside
        aria-label="Common controls"
        className={cn(
          "rounded-xl border px-3 py-2 shadow-xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={handleTabValueChange}
        >
          <TabsList
            className="relative grid !h-8 w-full overflow-hidden rounded-lg bg-muted/70 p-1 transition-[grid-template-columns] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={tabListStyle}
          >
            {tabIndicatorRect ? (
              <span
                aria-hidden="true"
                data-slot="common-controls-active-indicator"
                className="pointer-events-none absolute inset-y-1 left-0 z-0 rounded-md bg-background shadow-sm transition-[transform,width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{
                  transform: `translateX(${tabIndicatorRect.left}px)`,
                  width: tabIndicatorRect.width,
                }}
              />
            ) : null}
            {COMMON_PANEL_TABS.map(({ Icon, label, value }) => {
              const isActive = value === activeTab;
              const trigger = (
                <TabsTrigger
                  ref={(node) => {
                    tabTriggerRefs.current[value] = node;
                  }}
                  key={value}
                  value={value}
                  aria-label={label}
                  className={cn(
                    "z-10 !h-6 min-w-0 rounded-lg !bg-transparent text-xs !shadow-none transition-[color,padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none motion-reduce:transition-none [&_svg]:size-3.5",
                    isActive ? "px-2 text-foreground" : "px-0.5 text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" />
                  <span
                    data-slot="common-controls-tab-label"
                    data-active={isActive ? "true" : "false"}
                    className={cn(
                      "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                      isActive ? "max-w-16 opacity-100" : "max-w-0 opacity-0",
                    )}
                  >
                    {label}
                  </span>
                </TabsTrigger>
              );

              if (isActive) {
                return trigger;
              }

              return (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>

          <div
            ref={contentRef}
            data-slot="common-controls-content"
            className="overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={contentStyle}
          >
            <TabsContent value="camera">
              <CameraTabContent
                cameraState={cameraState}
                cellVectors={cellVectors}
                onCameraPrimaryChange={onCameraPrimaryChange}
                onCameraRollPreviewChange={onCameraRollPreviewChange}
                onCameraRollPreviewStart={onCameraRollPreviewStart}
                onCameraRollChange={onCameraRollChange}
                onCameraStateChange={onCameraStateChange}
              />
            </TabsContent>
            <TabsContent value="display">
              <DisplayTabContent
                hasPolyhedra={hasPolyhedra}
                opacity={componentOpacity}
                onOpacityChange={onComponentOpacityChange}
                visibility={componentVisibility}
                onVisibilityChange={onComponentVisibilityChange}
              />
            </TabsContent>
            <TabsContent value="style">
              <StyleTabContent
                onAtomRadiusModelChange={onAtomRadiusModelChange}
                onStyleChange={onStyleChange}
                style={style}
              />
            </TabsContent>
            <TabsContent value="export" className="pt-1.5">
              <ExportTabContent
                error={exportError}
                exportProjectedSize={exportProjectedSize}
                isExporting={isExporting}
                onExport={onExport}
                onSettingsChange={onExportSettingsChange}
                settings={exportSettings}
              />
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </TooltipProvider>
  );
}

function ExportTabContent({
  error,
  exportProjectedSize,
  isExporting,
  onExport,
  onSettingsChange,
  settings,
}: {
  error: string | null;
  exportProjectedSize?: ExportProjectedSize;
  isExporting: boolean;
  onExport: () => void;
  onSettingsChange: (settings: ExportSettingsState) => void;
  settings: ExportSettingsState;
}) {
  const validation = validateExportSettings(settings);
  const statusMessage = error ?? validation.message;
  const actionLabel = `Export ${EXPORT_FORMAT_LABELS[settings.format]}`;

  function setDimension(dimension: "height" | "width", value: number) {
    onSettingsChange(setExportDimension(settings, dimension, value, exportProjectedSize));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetQualityClick() {
    const defaultSettings = createDefaultExportSettings();
    onSettingsChange({
      ...settings,
      aspectRatioLocked: defaultSettings.aspectRatioLocked,
      height: defaultSettings.height,
      meshQuality: defaultSettings.meshQuality,
      pixelsPerProjectedUnit: defaultSettings.pixelsPerProjectedUnit,
      supersampling: defaultSettings.supersampling,
      width: defaultSettings.width,
    });

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <section aria-labelledby="export-components-label">
        <h2
          id="export-components-label"
          className="px-1.5 text-xs font-bold leading-tight text-muted-foreground"
        >
          Components
        </h2>
      </section>

      <Separator className="my-0.5" />

      <section aria-labelledby="export-quality-label" className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <h2
              id="export-quality-label"
              className="text-xs font-bold leading-tight text-muted-foreground"
            >
              Quality
            </h2>
            <ExportStatusIndicator message={statusMessage} />
          </div>
          <span aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset quality"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetQualityClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset quality</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-end justify-between gap-3 px-1.5">
          <div className="grid grid-cols-[2.75rem_1.25rem_2.75rem] items-end gap-[0.1875rem]">
            <ExportSizeInput
              label="Width"
              accessibleLabel="Export width"
              value={settings.width}
              onCommit={(value) => setDimension("width", value)}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={
                    settings.aspectRatioLocked
                      ? "Unlock aspect ratio"
                      : "Lock aspect ratio"
                  }
                  aria-pressed={settings.aspectRatioLocked}
                  className="mb-0 inline-flex h-6 w-full items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-3.5"
                  onClick={() =>
                    onSettingsChange(
                      setExportAspectRatioLocked(
                        settings,
                        !settings.aspectRatioLocked,
                        exportProjectedSize,
                      ),
                    )}
                >
                  {settings.aspectRatioLocked ? (
                    <Link aria-hidden="true" />
                  ) : (
                    <Unlink aria-hidden="true" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {settings.aspectRatioLocked ? "Unlock ratio" : "Lock ratio"}
              </TooltipContent>
            </Tooltip>

            <ExportSizeInput
              label="Height"
              accessibleLabel="Export height"
              value={settings.height}
              onCommit={(value) => setDimension("height", value)}
            />
          </div>

          <ExportSupersamplingControl
            value={settings.supersampling}
            onCommit={(value) =>
              onSettingsChange(setExportSupersampling(settings, value))
            }
          />
        </div>

        <ExportMeshQualityControl
          value={settings.meshQuality}
          onCommit={(value) =>
            onSettingsChange(setExportMeshQuality(settings, value))
          }
        />
      </section>

      <div className="mb-1.5 flex min-h-8 items-end justify-between gap-2 px-1.5">
        <label className="grid min-w-0 gap-1">
          <span className="truncate px-0.5 text-[0.68rem] font-semibold leading-none text-muted-foreground">
            Format
          </span>
          <Select
            value={settings.format}
            onValueChange={(value) =>
              onSettingsChange(setExportFormat(settings, value as ExportFormat))
            }
          >
            <SelectTrigger
              size="sm"
              aria-label="Format"
              className="!h-6 w-20 !px-2 !py-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {EXPORT_FORMAT_OPTIONS.map((option) => (
                  <SelectItem
                    key={option}
                    value={option}
                    textValue={EXPORT_FORMAT_LABELS[option]}
                    className="min-h-6 py-0.5 text-sm"
                  >
                    {EXPORT_FORMAT_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            aria-label={actionLabel}
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,transform] duration-100 ease-out active:translate-y-[0.5px] active:bg-primary/80 [&_svg]:size-3.5"
            disabled={!validation.valid}
            onClick={onExport}
          >
            <span
              aria-hidden="true"
              data-icon="inline-start"
              className="relative inline-flex size-3.5 shrink-0"
            >
              <ImageDown
                className={cn(
                  "absolute inset-0 transition-[opacity,transform] duration-150 ease-out",
                  isExporting ? "scale-90 opacity-0" : "scale-100 opacity-100",
                )}
              />
              <span
                className={cn(
                  "absolute inset-0 rounded-full border-2 border-primary-foreground/35 border-t-primary-foreground transition-opacity duration-150 ease-out motion-safe:animate-spin motion-safe:[animation-duration:450ms]",
                  isExporting ? "opacity-100" : "opacity-0",
                )}
              />
            </span>
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExportStatusIndicator({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="status"
          tabIndex={0}
          aria-label={message}
          className="inline-flex size-4 items-center justify-center rounded-md text-amber-600 outline-none focus-visible:ring-[3px] focus-visible:ring-amber-400/40 [&_svg]:size-3.5"
        >
          <AlertTriangleIcon aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-52">
        {message}
      </TooltipContent>
    </Tooltip>
  );
}

function ExportSizeInput({
  accessibleLabel,
  label,
  onCommit,
  value,
}: {
  accessibleLabel: string;
  label: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  const [valueText, setValueText] = useState(String(value));

  useEffect(() => {
    setValueText(String(value));
  }, [value]);

  function commitValueText() {
    const nextValue = parseExportDimensionInput(valueText);
    if (nextValue === null) {
      setValueText(String(value));
      return;
    }

    setValueText(String(nextValue));
    onCommit(nextValue);
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitValueText();
      return;
    }

    if (event.key === "Escape") {
      setValueText(String(value));
      event.currentTarget.blur();
    }
  }

  return (
    <label className="grid min-w-0 justify-items-start gap-1">
      <span className="px-0.5 text-[0.68rem] font-semibold leading-none text-muted-foreground">
        {label}
      </span>
      <Input
        type="text"
        inputMode="numeric"
        value={valueText}
        aria-label={accessibleLabel}
        className="h-6 w-11 px-1.5 text-left font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]"
        onBlur={commitValueText}
        onChange={(event) => setValueText(event.target.value)}
        onKeyDown={handleValueKeyDown}
      />
    </label>
  );
}

function ExportSupersamplingControl({
  onCommit,
  value,
}: {
  onCommit: (value: number) => void;
  value: ExportSupersampling;
}) {
  return (
    <label className="ml-auto grid min-w-0 justify-items-end gap-1">
      <span className="truncate px-0.5 text-[0.68rem] font-semibold leading-none text-muted-foreground">
        Super Sampling
      </span>
      <Tabs
        value={String(value)}
        className="w-28 gap-0"
        onValueChange={(nextValue) => onCommit(Number(nextValue))}
      >
        <TabsList
          aria-label="Export supersampling"
          className="!h-6 w-full rounded-md p-0.5"
        >
          {EXPORT_SUPERSAMPLING_OPTIONS.map((option) => (
            <TabsTrigger
              key={option}
              value={String(option)}
              aria-label={`${option}x supersampling`}
              className="!h-5 rounded-[4px] px-0.5 py-0 text-[0.68rem] font-medium md:text-[0.68rem]"
            >
              {option}x
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </label>
  );
}

function ExportMeshQualityControl({
  onCommit,
  value,
}: {
  onCommit: (value: ExportMeshQuality) => void;
  value: ExportMeshQuality;
}) {
  return (
    <label className="mt-0.5 grid min-w-0 gap-1 px-1.5">
      <span className="truncate px-0.5 text-[0.68rem] font-semibold leading-none text-muted-foreground">
        3D mesh
      </span>
      <Tabs
        value={value}
        className="w-full gap-0"
        onValueChange={(nextValue) => onCommit(nextValue as ExportMeshQuality)}
      >
        <TabsList
          aria-label="Export mesh quality"
          className="!h-6 w-full rounded-md p-0.5"
        >
          {EXPORT_MESH_QUALITY_OPTIONS.map((option) => (
            <TabsTrigger
              key={option}
              value={option}
              aria-label={`${EXPORT_MESH_QUALITY_LABELS[option]} mesh quality`}
              className="!h-5 rounded-[4px] px-0.5 py-0 text-[0.68rem] font-medium md:text-[0.68rem]"
            >
              {EXPORT_MESH_QUALITY_LABELS[option]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </label>
  );
}

function StyleTabContent({
  onAtomRadiusModelChange,
  onStyleChange,
  style,
}: {
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  function setStyleScale(key: keyof typeof STYLE_SCALE_MIN, value: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      [key]: clampPercentValue(value, STYLE_SCALE_MIN[key], STYLE_SCALE_MAX[key]),
    }));
  }

  function setAtomRadiusModel(atomRadiusModel: AtomRadiusModel) {
    onAtomRadiusModelChange(atomRadiusModel);
  }

  function setBondColorMode(bondColorMode: BondColorMode) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      bondColorMode,
    }));
  }

  function setColorScheme(colorScheme: ColorScheme) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      colorScheme,
    }));
  }

  function setMaterialPreset(materialPreset: MaterialPresetId) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      materialPreset,
    }));
  }

  function setFogEnabled(fogEnabled: boolean) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogEnabled,
    }));
  }

  function setFogStart(fogStart: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogStart: clampPercentValue(
        fogStart,
        STYLE_FOG_START_MIN,
        STYLE_FOG_START_MAX,
      ),
    }));
  }

  function setFogStrength(fogStrength: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogStrength: clampPercentValue(
        fogStrength,
        STYLE_FOG_STRENGTH_MIN,
        STYLE_FOG_STRENGTH_MAX,
      ),
    }));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const [fogResetFeedbackPhase, setFogResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const fogResetFeedbackTickRef = useRef(0);
  const fogResetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
      if (fogResetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(fogResetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetScaleClick() {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      atomRadius: createDefaultStyle().atomRadius,
      bondThickness: createDefaultStyle().bondThickness,
    }));

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  function handleResetFogClick() {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogStart: createDefaultStyle().fogStart,
      fogStrength: createDefaultStyle().fogStrength,
    }));

    if (fogResetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(fogResetFeedbackTimeoutRef.current);
    }

    fogResetFeedbackTickRef.current += 1;
    setFogResetFeedbackPhase(fogResetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    fogResetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setFogResetFeedbackPhase(null);
      fogResetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <section aria-labelledby="style-size-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="style-size-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Radius
          </h2>
          <span aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset scale"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetScaleClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset scale</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <PercentSliderRow
            accessibleLabel="Atom"
            label={(
              <AtomRadiusModelSelect
                value={style.atomRadiusModel}
                onValueChange={setAtomRadiusModel}
              />
            )}
            max={STYLE_SCALE_MAX.atomRadius}
            min={STYLE_SCALE_MIN.atomRadius}
            value={style.atomRadius}
            onValueChange={(value) => setStyleScale("atomRadius", value)}
          />
          <PercentSliderRow
            accessibleLabel="Bond"
            label="Bond"
            max={STYLE_SCALE_MAX.bondThickness}
            min={STYLE_SCALE_MIN.bondThickness}
            value={style.bondThickness}
            onValueChange={(value) => setStyleScale("bondThickness", value)}
          />
        </div>
      </section>

      <Separator />

      <section aria-labelledby="style-fog-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <h2
              id="style-fog-label"
              className="text-xs font-bold leading-tight text-muted-foreground"
            >
              Fog
            </h2>
            <Switch
              checked={style.fogEnabled}
              aria-label="Fog"
              className="h-4 w-7 p-0.5"
              thumbClassName="size-3 data-[state=checked]:translate-x-3"
              onCheckedChange={setFogEnabled}
            />
          </div>
          <span aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset fog"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    fogResetFeedbackPhase === "a"
                      ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS
                      : null,
                    fogResetFeedbackPhase === "b"
                      ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS
                      : null,
                  )}
                  onClick={handleResetFogClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset fog</TooltipContent>
          </Tooltip>
        </div>
        <div className={cn("mt-1", style.fogEnabled ? null : "opacity-55")}>
          <PercentSliderRow
            accessibleLabel="Fog"
            allowZero
            disabled={!style.fogEnabled}
            label="Start"
            max={STYLE_FOG_START_MAX}
            min={STYLE_FOG_START_MIN}
            showSnapMarker={false}
            value={style.fogStart}
            valueLabel="start"
            onValueChange={setFogStart}
          />
          <PercentSliderRow
            accessibleLabel="Fog"
            allowZero
            disabled={!style.fogEnabled}
            label="Strength"
            max={STYLE_FOG_STRENGTH_MAX}
            min={STYLE_FOG_STRENGTH_MIN}
            showSnapMarker={false}
            value={style.fogStrength}
            valueLabel="strength"
            onValueChange={setFogStrength}
          />
        </div>
      </section>

      <Separator />

      <div className="flex flex-col gap-0.5">
        <div className="grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5 text-sm">
          <span className="min-w-0 truncate leading-tight">Material</span>
          <Select
            value={style.materialPreset}
            onValueChange={(value) => setMaterialPreset(value)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Material"
              className="!h-6 w-full !px-2 !py-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {MATERIAL_PRESET_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    textValue={option.label}
                    className="min-h-6 py-0.5 text-sm"
                  >
                    <MaterialPresetOptionLabel
                      label={option.label}
                      value={option.value}
                    />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5 text-sm">
          <span className="min-w-0 truncate leading-tight">Bond style</span>
          <Select
            value={style.bondColorMode}
            onValueChange={(value) => setBondColorMode(value as BondColorMode)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Bond style"
              className="!h-6 w-full !px-2 !py-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {BOND_COLOR_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    textValue={option.label}
                    className="min-h-6 py-0.5 text-sm"
                  >
                    <BondStyleOptionLabel
                      label={option.label}
                      value={option.value}
                    />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div className="grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5 text-sm">
          <span className="min-w-0 truncate leading-tight">Color scheme</span>
          <Select
            value={style.colorScheme}
            onValueChange={(value) => setColorScheme(value as ColorScheme)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Color scheme"
              className="!h-6 w-full !px-2 !py-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {COLOR_SCHEME_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    textValue={option.label}
                    className="min-h-6 py-0.5 text-sm"
                  >
                    <ColorSchemeOptionLabel
                      label={option.label}
                      value={option.value}
                    />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function AtomRadiusModelSelect({
  onValueChange,
  value,
}: {
  onValueChange: (value: AtomRadiusModel) => void;
  value: AtomRadiusModel;
}) {
  const selectedOption = ATOM_RADIUS_MODEL_OPTIONS.find((option) => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as AtomRadiusModel)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Atom radius model"
        className="-ml-1.5 !h-6 w-20 gap-0.5 !py-0 !pr-0.5 !pl-1.5 [&_svg]:size-3.5"
      >
        <span data-slot="select-value" className="min-w-0 truncate">
          {selectedOption?.triggerLabel}
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="!bg-background !text-foreground"
      >
        <SelectGroup>
          <SelectLabel className="py-1 text-xs font-medium">Atom radius model</SelectLabel>
          {ATOM_RADIUS_MODEL_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              textValue={option.menuLabel}
              className="min-h-6 py-0.5 text-sm"
            >
              {option.menuLabel}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function MaterialPresetOptionLabel({
  label,
  value,
}: {
  label: string;
  value: MaterialPresetId;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={materialPresetTokenStyle(value)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function materialPresetTokenStyle(value: MaterialPresetId): CSSProperties {
  const preset = materialPresetById(value);
  if (preset.material.kind === "basic") {
    return {
      background: "linear-gradient(180deg, #d8dde5 0%, #929aa8 100%)",
    };
  }

  if (preset.material.kind === "lambert") {
    return {
      background:
        "linear-gradient(145deg, rgba(255, 255, 255, 0.56) 0 20%, rgba(255, 255, 255, 0) 42%), linear-gradient(180deg, #d7dce4 0%, #aab2be 100%)",
    };
  }

  const highlightAlpha = Math.round((1 - preset.material.roughness) * 80) / 100;
  return {
    background:
      `linear-gradient(145deg, rgba(255, 255, 255, ${highlightAlpha}) 0 16%, rgba(255, 255, 255, 0.18) 17% 30%, rgba(255, 255, 255, 0) 44%), ` +
      "linear-gradient(180deg, #dde4ed 0%, #a0aebc 52%, #7f8996 100%)",
  };
}

function BondStyleOptionLabel({
  label,
  value,
}: {
  label: string;
  value: BondColorMode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={bondStyleTokenStyle(value)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function bondStyleTokenStyle(value: BondColorMode): CSSProperties | undefined {
  if (value === "neutral") {
    return UNICOLOR_TOKEN_STYLE;
  }
  if (value === "by-atom") {
    return BY_ATOM_TOKEN_STYLE;
  }
  if (value === "unicolor-2d") {
    return UNICOLOR_2D_TOKEN_STYLE;
  }
  return undefined;
}

function ColorSchemeOptionLabel({
  label,
  value,
}: {
  label: string;
  value: ColorScheme;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={colorSchemeTokenStyle(value)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function colorSchemeTokenStyle(value: ColorScheme): CSSProperties {
  if (value === "jmol") {
    return JMOL_TOKEN_STYLE;
  }
  if (value === "jmol-soft") {
    return JMOL_SOFT_TOKEN_STYLE;
  }
  if (value === "vesta-soft") {
    return VESTA_SOFT_TOKEN_STYLE;
  }
  return VESTA_TOKEN_STYLE;
}

function CameraTabContent({
  cameraState,
  cellVectors,
  onCameraPrimaryChange,
  onCameraRollPreviewChange,
  onCameraRollPreviewStart,
  onCameraRollChange,
  onCameraStateChange,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  onCameraPrimaryChange: (primary: CrystalCameraPrimaryDirection) => void;
  onCameraRollPreviewChange: (rollDegrees: number) => void;
  onCameraRollPreviewStart: () => void;
  onCameraRollChange: (rollDegrees: number) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
}) {
  const [rollResetFeedbackPhase, setRollResetFeedbackPhase] =
    useState<ToolButtonFeedbackPhase>(null);
  const rollResetFeedbackTickRef = useRef(0);
  const rollResetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rollResetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(rollResetFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function handleResetRollClick() {
    if (rollResetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(rollResetFeedbackTimeoutRef.current);
    }

    rollResetFeedbackTickRef.current += 1;
    setRollResetFeedbackPhase(rollResetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    rollResetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setRollResetFeedbackPhase(null);
      rollResetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
    onCameraRollChange(0);
  }

  return (
    <div className="flex flex-col">
      <section aria-labelledby="camera-axis-roll-label" className="mb-0.5 grid gap-2 px-1.5">
        <div className="flex h-7 items-center justify-between gap-2">
          <h2
            id="camera-axis-roll-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Fixed-axis rotation
          </h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset roll"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              rollResetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              rollResetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleResetRollClick}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
        </div>
        <div className="grid grid-cols-[max-content_minmax(0,1fr)] items-start gap-3">
          <div className="-mt-2 flex min-h-[96px] min-w-[8.5rem] flex-col items-start justify-center gap-2">
            <h3
              id="camera-primary-label"
              className="whitespace-nowrap px-0.5 text-[0.68rem] font-semibold leading-none text-muted-foreground"
            >
              Primary direction
            </h3>
            <Tabs
              value={cameraState.primary}
              orientation="vertical"
              className="gap-0"
              onValueChange={(value) =>
                onCameraPrimaryChange(value as CrystalCameraPrimaryDirection)
              }
            >
              <TabsList
                aria-labelledby="camera-primary-label"
                className="h-auto w-24 flex-col items-stretch rounded-md p-0.5"
              >
                <TabsTrigger
                  value="outward"
                  className="grid !h-[26px] !min-h-[26px] grid-cols-[1.25rem_minmax(0,1fr)] items-center justify-items-center gap-x-1 rounded-[4px] px-1 py-0 text-center text-xs font-medium leading-none"
                >
                  <PrimaryDirectionToken direction="outward" />
                  <span className="justify-self-start">Outward</span>
                </TabsTrigger>
                <TabsTrigger
                  value="upward"
                  className="grid !h-[26px] !min-h-[26px] grid-cols-[1.25rem_minmax(0,1fr)] items-center justify-items-center gap-x-1 rounded-[4px] px-1 py-0 text-center text-xs font-medium leading-none"
                >
                  <PrimaryDirectionToken direction="upward" />
                  <span className="justify-self-start">Upward</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <RollControl
            className="-translate-x-6"
            value={cameraState.rollDegrees}
            onPreviewValueChange={onCameraRollPreviewChange}
            onPreviewStart={onCameraRollPreviewStart}
            onValueChange={onCameraRollChange}
          />
        </div>
      </section>

      <Separator />

      <VectorEditor
        cameraState={cameraState}
        cellVectors={cellVectors}
        onCameraStateChange={onCameraStateChange}
      />
    </div>
  );
}

function PrimaryDirectionToken({
  direction,
}: {
  direction: CrystalCameraPrimaryDirection;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0 justify-self-center"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
    >
      <rect x="5" y="5.5" width="14" height="13" rx="2.4" />
      {direction === "upward" ? (
        <>
          <path d="M12 15.5v-7" />
          <path d="m9.4 11.1 2.6-2.6 2.6 2.6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="3.35" />
          <path d="M12 12h.01" strokeWidth="2.8" />
        </>
      )}
    </svg>
  );
}

function RollControl({
  className,
  onPreviewStart,
  onPreviewValueChange,
  onValueChange,
  value,
}: {
  className?: string;
  onPreviewStart: () => void;
  onPreviewValueChange: (value: number) => void;
  onValueChange: (value: number) => void;
  value: number;
}) {
  const committedValue = toPositiveRollDegrees(value);
  const [isDragging, setIsDragging] = useState(false);
  const [draftValue, setDraftValue] = useState(committedValue);
  const displayedValue = isDragging ? draftValue : committedValue;
  const [valueText, setValueText] = useState(formatRollValue(committedValue));
  const [isValueFocused, setIsValueFocused] = useState(false);
  const [hasValueEdited, setHasValueEdited] = useState(false);
  const lastPreviewValueRef = useRef<number | null>(null);
  const valueTextAtFocusRef = useRef(valueText);
  const displayedValueText = isValueFocused && !hasValueEdited ? "" : valueText;

  useEffect(() => {
    if (isDragging) {
      return;
    }

    setDraftValue(committedValue);
    setValueText(formatRollValue(committedValue));
  }, [committedValue, isDragging]);

  function commitValueText(nextText = valueText) {
    const nextValue = parseRollInput(nextText);
    if (nextValue === null) {
      setValueText(formatRollValue(displayedValue));
      return;
    }

    const normalizedValue = toPositiveRollDegrees(nextValue);
    setDraftValue(normalizedValue);
    setValueText(formatRollValue(normalizedValue));
    onValueChange(normalizedValue);
  }

  function handleValueFocus() {
    valueTextAtFocusRef.current = valueText;
    setIsValueFocused(true);
    setHasValueEdited(false);
  }

  function handleValueBlur(event: FocusEvent<HTMLInputElement>) {
    const wasEdited = hasValueEdited;
    setIsValueFocused(false);
    setHasValueEdited(false);

    if (!wasEdited) {
      return;
    }

    if (event.currentTarget.value.trim() === "") {
      setValueText(valueTextAtFocusRef.current);
      return;
    }

    commitValueText(event.currentTarget.value);
  }

  function handleValueChange(event: ChangeEvent<HTMLInputElement>) {
    setHasValueEdited(true);
    setValueText(event.target.value);
  }

  function handleSliderInteractionStart() {
    setIsDragging(true);
    setDraftValue(committedValue);
    setValueText(formatRollValue(committedValue));
    lastPreviewValueRef.current = null;
    onPreviewStart();
  }

  function handleSliderPreviewChange(nextValue: number) {
    const normalizedValue = toPositiveRollDegrees(nextValue);
    if (Object.is(normalizedValue, lastPreviewValueRef.current)) {
      return;
    }

    lastPreviewValueRef.current = normalizedValue;
    setDraftValue(normalizedValue);
    setValueText(formatRollValue(normalizedValue));
    onPreviewValueChange(normalizedValue);
  }

  function handleSliderCommit(nextValue: number) {
    const normalizedValue = toPositiveRollDegrees(nextValue);
    setDraftValue(normalizedValue);
    setValueText(formatRollValue(normalizedValue));
    setIsDragging(false);
    lastPreviewValueRef.current = null;
    onValueChange(normalizedValue);
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.currentTarget.value.trim() === "") {
        setValueText(valueTextAtFocusRef.current);
      } else {
        commitValueText(event.currentTarget.value);
      }
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      setValueText(valueTextAtFocusRef.current);
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const normalizedValue = toPositiveRollDegrees(
        displayedValue + (event.key === "ArrowUp" ? 1 : -1),
      );
      setHasValueEdited(true);
      setValueText(formatRollValue(normalizedValue));
      onValueChange(normalizedValue);
    }
  }

  return (
    <section
      aria-labelledby="camera-roll-label"
      className={cn(
        "relative -mt-[28px] flex min-h-[116px] min-w-0 justify-center",
        className,
      )}
    >
      <h2 id="camera-roll-label" className="sr-only">
        Roll
      </h2>
      <AngleSlider
        aria-label="Roll"
        className="size-[116px]"
        value={displayedValue}
        onInteractionStart={handleSliderInteractionStart}
        onValueChange={handleSliderPreviewChange}
        onValueCommit={handleSliderCommit}
      />
      <label className="absolute left-1/2 top-1/2 z-10 inline-flex h-6 min-w-[1.65rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] border border-transparent bg-transparent px-1.5 transition-[background-color,border-color,box-shadow] duration-150 hover:border-foreground/8 hover:bg-background/55 focus-within:border-ring/15 focus-within:bg-background/70 focus-within:shadow-[0_0_0_0.5px_color-mix(in_srgb,var(--ring)_14%,transparent)]">
        <span className="sr-only">Roll value</span>
        <input
          type="text"
          inputMode="decimal"
          value={displayedValueText}
          aria-label="Roll value"
          className="h-full min-w-[1ch] border-0 bg-transparent px-0 text-right font-mono text-sm font-normal leading-none tabular-nums outline-none focus-visible:ring-0"
          style={{ width: rollValueInputWidth(displayedValueText) }}
          onBlur={handleValueBlur}
          onChange={handleValueChange}
          onFocus={handleValueFocus}
          onKeyDown={handleValueKeyDown}
        />
        <span
          aria-hidden="true"
          data-slot="roll-degree-symbol"
          className="pointer-events-none -ml-px select-none font-mono text-sm font-normal leading-none text-foreground"
        >
          °
        </span>
      </label>
    </section>
  );
}

function VectorEditor({
  cameraState,
  cellVectors,
  onCameraStateChange,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
}) {
  const currentDraft = useMemo(() => draftFromCameraState(cameraState), [cameraState]);
  const [draft, setDraft] = useState(currentDraft);
  const [isDirty, setIsDirty] = useState(false);
  const [buttonFeedbackPhase, setButtonFeedbackPhase] = useState<
    Record<ManualButtonFeedbackTarget, ToolButtonFeedbackPhase>
  >({
    apply: null,
    reset: null,
  });
  const buttonFeedbackTickRef = useRef<Record<ManualButtonFeedbackTarget, number>>({
    apply: 0,
    reset: 0,
  });
  const buttonFeedbackTimeoutRef = useRef<
    Record<ManualButtonFeedbackTarget, number | null>
  >({
    apply: null,
    reset: null,
  });

  useEffect(() => {
    if (!isDirty) {
      setDraft(currentDraft);
    }
  }, [currentDraft, isDirty]);

  useEffect(() => {
    return () => {
      for (const timeout of Object.values(buttonFeedbackTimeoutRef.current)) {
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
      }
    };
  }, []);

  function triggerButtonFeedback(target: ManualButtonFeedbackTarget) {
    const currentTimeout = buttonFeedbackTimeoutRef.current[target];
    if (currentTimeout !== null) {
      window.clearTimeout(currentTimeout);
    }

    buttonFeedbackTickRef.current[target] += 1;
    const nextPhase = buttonFeedbackTickRef.current[target] % 2 === 0 ? "b" : "a";
    setButtonFeedbackPhase((currentPhase) => ({
      ...currentPhase,
      [target]: nextPhase,
    }));
    buttonFeedbackTimeoutRef.current[target] = window.setTimeout(() => {
      setButtonFeedbackPhase((currentPhase) => ({
        ...currentPhase,
        [target]: null,
      }));
      buttonFeedbackTimeoutRef.current[target] = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  function updateDraft(row: "direct" | "reciprocal", index: number, value: string) {
    setIsDirty(true);
    setDraft((currentDraftState) => ({
      ...currentDraftState,
      [row]: currentDraftState[row].map((entry, entryIndex) =>
        entryIndex === index ? value : entry,
      ) as [string, string, string],
    }));
  }

  function resetDraft() {
    setDraft(currentDraft);
    setIsDirty(false);
  }

  function handleResetDraftClick() {
    triggerButtonFeedback("reset");
    resetDraft();
  }

  function applyDraft() {
    const direct = parseVectorCoefficients(draft.direct);
    const reciprocal = parseVectorCoefficients(draft.reciprocal);
    if (!direct || !reciprocal) {
      resetDraft();
      return;
    }

    const cameraVectors = computeCrystalCameraVectors(cellVectors, {
      ...cameraState,
      direct,
      reciprocal,
    });
    const nextState = stateFromViewVectors(
      cellVectors,
      cameraState.primary,
      cameraVectors.up,
      cameraVectors.outward,
    );

    setIsDirty(false);
    onCameraStateChange(nextState);
  }

  function handleApplyDraftClick() {
    triggerButtonFeedback("apply");
    applyDraft();
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      applyDraft();
      return;
    }

    if (event.key === "Escape") {
      resetDraft();
      event.currentTarget.blur();
    }
  }

  const upwardRow = {
    basisLabels: cameraState.primary === "upward"
      ? ["a", "b", "c"]
      : ["a*", "b*", "c*"],
    draft: cameraState.primary === "upward" ? draft.direct : draft.reciprocal,
    isPrimaryAxis: cameraState.primary === "upward",
    label: "Upward",
    row: cameraState.primary === "upward" ? "direct" : "reciprocal",
  } as const;
  const outwardRow = {
    basisLabels: cameraState.primary === "outward"
      ? ["a", "b", "c"]
      : ["a*", "b*", "c*"],
    draft: cameraState.primary === "outward" ? draft.direct : draft.reciprocal,
    isPrimaryAxis: cameraState.primary === "outward",
    label: "Outward",
    row: cameraState.primary === "outward" ? "direct" : "reciprocal",
  } as const;
  const vectorRows = [outwardRow, upwardRow];

  return (
    <section aria-labelledby="camera-manual-label" className="mt-1 grid gap-1.5 px-1.5 pb-1">
      <div className="flex h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h2
            id="camera-manual-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Manual input
          </h2>
          <Tooltip delayDuration={650}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Manual input rules"
                className="inline-flex size-4 items-center justify-center rounded-md text-muted-foreground/75 outline-none transition-colors hover:text-foreground focus-visible:ring-[2px] focus-visible:ring-ring/30"
              >
                <Info aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              <div className="grid gap-1">
                <span>
                  Constraint: <strong>out</strong> · <strong>up</strong> = 0
                </span>
                <span>If not, primary direction is kept and the other is orthogonalized.</span>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Reset vectors draft"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              buttonFeedbackPhase.reset === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              buttonFeedbackPhase.reset === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleResetDraftClick}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Apply vectors"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              buttonFeedbackPhase.apply === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              buttonFeedbackPhase.apply === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleApplyDraftClick}
          >
            <Check aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        {vectorRows.map((row) => (
          <VectorEditorRow
            basisLabels={row.basisLabels}
            isPrimaryAxis={row.isPrimaryAxis}
            key={row.label}
            label={row.label}
            values={row.draft}
            onValueChange={(index, value) => updateDraft(row.row, index, value)}
            onKeyDown={handleFieldKeyDown}
          />
        ))}
      </div>
    </section>
  );
}

function VectorEditorRow({
  basisLabels,
  isPrimaryAxis,
  label,
  onKeyDown,
  onValueChange,
  values,
}: {
  basisLabels: string[];
  isPrimaryAxis: boolean;
  label: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onValueChange: (index: number, value: string) => void;
  values: readonly string[];
}) {
  return (
    <div
      className={cn(
        "relative -mx-1 grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-1 rounded-md px-1 py-1 transition-colors",
        isPrimaryAxis
          ? "bg-foreground/[0.035] before:absolute before:bottom-1 before:left-0 before:top-1 before:w-0.5 before:rounded-full before:bg-foreground/70"
          : null,
      )}
      data-camera-vector-row={label.toLowerCase()}
      data-primary-axis={isPrimaryAxis ? "true" : undefined}
    >
      <span
        className={cn(
          "px-0.5 text-[0.68rem] font-semibold leading-none transition-colors",
          isPrimaryAxis ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <div className="grid min-w-0 grid-cols-[2.75rem_0.8rem_0.45rem_2.75rem_0.8rem_0.45rem_2.75rem_0.8rem] items-center gap-x-0.5">
        {basisLabels.map((basisLabel, index) => (
          <Fragment key={basisLabel}>
            <label className="contents">
              <VectorCoefficientInput
                accessibleLabel={`${label} ${basisLabel}`}
                value={values[index] ?? "0.00"}
                onValueChange={(value) => onValueChange(index, value)}
                onKeyDown={onKeyDown}
              />
              <span className="shrink-0 text-[0.68rem] font-semibold italic leading-none text-muted-foreground">
                {basisLabel}
              </span>
            </label>
            {index < basisLabels.length - 1 ? (
              <span
                aria-hidden="true"
                className="text-[0.68rem] font-semibold leading-none text-muted-foreground"
              >
                +
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function VectorCoefficientInput({
  accessibleLabel,
  onKeyDown,
  onValueChange,
  value,
}: {
  accessibleLabel: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const valueAtFocusRef = useRef(value);
  const displayedValue = isFocused && !hasEdited ? "" : value;

  function handleFocus() {
    valueAtFocusRef.current = value;
    setIsFocused(true);
    setHasEdited(false);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);

    if (hasEdited && event.currentTarget.value.trim() === "") {
      onValueChange(valueAtFocusRef.current);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasEdited(true);
    onValueChange(event.target.value);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={displayedValue}
      aria-label={accessibleLabel}
      className="h-[22px] w-[2.75rem] min-w-0 px-1 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]"
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
      onKeyDown={onKeyDown}
    />
  );
}

function draftFromCameraState(cameraState: CrystalCameraState): {
  direct: [string, string, string];
  reciprocal: [string, string, string];
} {
  return {
    direct: cameraState.direct.map(formatVectorCoefficient) as [string, string, string],
    reciprocal: cameraState.reciprocal.map(formatVectorCoefficient) as [string, string, string],
  };
}

function formatVectorCoefficient(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatRollValue(value: number): string {
  return String(displayRollDegrees(value));
}

function rollValueInputWidth(value: string): string {
  return `${Math.min(8, Math.max(1, value.length))}ch`;
}

function toPositiveRollDegrees(value: number): number {
  const signedValue = normalizeRollDegrees(value);
  return signedValue < 0 ? signedValue + 360 : signedValue;
}

function displayRollDegrees(value: number): number {
  const roundedValue = Math.round(toPositiveRollDegrees(value));
  return roundedValue >= 360 ? 0 : roundedValue;
}

function parseRollInput(value: string): number | null {
  const nextValue = Number(value.trim().replace(/°$/, ""));
  return Number.isFinite(nextValue) ? nextValue : null;
}

function ReservedTabContent() {
  return (
    <div className="flex min-h-[64px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 text-xs text-muted-foreground">
      No controls
    </div>
  );
}

function DisplayTabContent({
  hasPolyhedra,
  onOpacityChange,
  onVisibilityChange,
  opacity,
  visibility,
}: {
  hasPolyhedra: boolean;
  onOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  opacity: ComponentOpacityState;
  visibility: ComponentVisibilityState;
}) {
  function setVisibility(key: keyof ComponentVisibilityState, value: boolean) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      [key]: value,
    }));
  }

  function setOpacity(key: keyof ComponentOpacityState, value: number) {
    onOpacityChange((currentOpacity) => ({
      ...currentOpacity,
      [key]: clampOpacityValue(value, COMPONENT_OPACITY_MAX[key]),
    }));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetOpacityClick() {
    onOpacityChange(createDefaultComponentOpacity());

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <section aria-labelledby="display-components-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="display-components-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Components
          </h2>
          <span className="text-right text-xs font-bold leading-tight text-muted-foreground">
            Opacity
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset opacity"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetOpacityClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset opacity</TooltipContent>
          </Tooltip>
        </div>

        <div className="mt-1 flex flex-col gap-1">
          <ComponentOpacityRow
            checked={visibility.atoms}
            label="Atoms"
            max={COMPONENT_OPACITY_MAX.atoms}
            value={opacity.atoms}
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
            onOpacityChange={(value) => setOpacity("atoms", value)}
          />
          <ComponentOpacityRow
            checked={visibility.bonds}
            label="Bonds"
            max={COMPONENT_OPACITY_MAX.bonds}
            value={opacity.bonds}
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
            onOpacityChange={(value) => setOpacity("bonds", value)}
          />
          <ComponentOpacityRow
            checked={visibility.unitCell}
            label="Unit cell"
            max={COMPONENT_OPACITY_MAX.unitCell}
            value={opacity.unitCell}
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
            onOpacityChange={(value) => setOpacity("unitCell", value)}
          />
          <ComponentOpacityRow
            checked={hasPolyhedra && visibility.polyhedra}
            checkboxDisabled={!hasPolyhedra}
            label="Polyhedra"
            max={COMPONENT_OPACITY_MAX.polyhedra}
            value={opacity.polyhedra}
            onCheckedChange={(checked) => setVisibility("polyhedra", checked)}
            onOpacityChange={(value) => setOpacity("polyhedra", value)}
          />
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className="text-xs font-bold leading-tight text-muted-foreground"
        >
          Periodic images
        </h2>
        <div className="mt-1.5 flex flex-col gap-1">
          <ImageSwitchRow
            checked={visibility.boundaryAtoms}
            label="Cell-boundary atoms"
            onCheckedChange={(checked) => setVisibility("boundaryAtoms", checked)}
          />
          <ImageSwitchRow
            checked={visibility.oneHopBondedAtoms}
            label="One-hop bonded atoms"
            onCheckedChange={(checked) => setVisibility("oneHopBondedAtoms", checked)}
          />
        </div>
      </section>
    </div>
  );
}

function ComponentOpacityRow({
  checked,
  checkboxDisabled = false,
  label,
  max,
  onCheckedChange,
  onOpacityChange,
  value,
}: {
  checked: boolean;
  checkboxDisabled?: boolean;
  label: string;
  max: number;
  onCheckedChange: (checked: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  value: number;
}) {
  const [opacityText, setOpacityText] = useState(formatOpacityValue(value));
  const sliderBlur = useAutoBlurSlider();
  const sliderPosition = max > 0 ? value / max : 0;
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;
  const inputDisabled = checkboxDisabled || !checked;

  useEffect(() => {
    setOpacityText(formatOpacityValue(value));
  }, [value]);

  function commitOpacityText() {
    const nextOpacity = parseOpacityInput(opacityText);
    if (nextOpacity === null) {
      setOpacityText(formatOpacityValue(value));
      return;
    }

    const clampedOpacity = clampOpacityValue(nextOpacity, max);
    setOpacityText(formatOpacityValue(clampedOpacity));
    onOpacityChange(clampedOpacity);
  }

  function handleOpacityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitOpacityText();
      return;
    }

    if (event.key === "Escape") {
      setOpacityText(formatOpacityValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onOpacityChange(clampOpacityValue(value + direction, max));
    }
  }

  return (
    <div
      className={cn(
        "grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 text-sm transition-colors",
        checkboxDisabled ? "text-muted-foreground/55" : "hover:bg-accent/60",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 items-center gap-2",
          checkboxDisabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={checkboxDisabled}
          aria-label={label}
          className="size-3.5 rounded-[3px]"
          iconClassName="size-3"
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        />
        <span
          className={cn(
            "min-w-0 truncate leading-tight",
            checkboxDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          {label}
        </span>
      </label>

      <div
        className="opacity-slider-shell relative mr-3 h-5"
        data-disabled={inputDisabled ? "true" : "false"}
        style={sliderStyle}
      >
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={inputDisabled}
          aria-label={`${label} opacity`}
          aria-valuetext={`${formatOpacityValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          ref={sliderBlur.ref}
          onChange={(event) =>
            onOpacityChange(snapSliderOpacityValue(Number(event.target.value), max))
          }
          onMouseDown={sliderBlur.handlePointerDown}
          onMouseUp={sliderBlur.handlePointerEnd}
          onPointerCancel={sliderBlur.handlePointerEnd}
          onPointerDown={sliderBlur.handlePointerDown}
          onPointerUp={sliderBlur.handlePointerEnd}
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled={inputDisabled ? "true" : "false"}
      >
        <span className="sr-only">{label} opacity value</span>
        <input
          type="text"
          inputMode="numeric"
          value={opacityText}
          disabled={inputDisabled}
          aria-label={`${label} opacity value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          onBlur={commitOpacityText}
          onChange={(event) => setOpacityText(event.target.value)}
          onKeyDown={handleOpacityKeyDown}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground",
            inputDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          %
        </span>
      </label>
    </div>
  );
}

function PercentSliderRow({
  accessibleLabel,
  allowZero = false,
  disabled = false,
  label,
  max,
  min,
  onValueChange,
  showSnapMarker = true,
  value,
  valueLabel = "scale",
}: {
  accessibleLabel: string;
  allowZero?: boolean;
  disabled?: boolean;
  label: ReactNode;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  showSnapMarker?: boolean;
  value: number;
  valueLabel?: string;
}) {
  const [valueText, setValueText] = useState(formatPercentValue(value));
  const sliderBlur = useAutoBlurSlider();
  const sliderPosition = percentValueToLinearSliderPosition(value, min, max);
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;

  useEffect(() => {
    setValueText(formatPercentValue(value));
  }, [value]);

  function commitValueText() {
    const nextValue = parsePercentInput(valueText, { allowZero });
    if (nextValue === null) {
      setValueText(formatPercentValue(value));
      return;
    }

    const clampedValue = clampPercentValue(nextValue, min, max);
    setValueText(formatPercentValue(clampedValue));
    onValueChange(clampedValue);
  }

  function handleValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitValueText();
      return;
    }

    if (event.key === "Escape") {
      setValueText(formatPercentValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onValueChange(clampPercentValue(value + direction, min, max));
    }
  }

  return (
    <div className="grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 text-sm">
      <div className="min-w-0 overflow-visible leading-tight">{label}</div>

      <div
        className="opacity-slider-shell relative mr-3 h-5"
        data-disabled={disabled ? "true" : "false"}
        style={sliderStyle}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={clampPercentValue(value, min, max)}
          aria-label={`${accessibleLabel} ${valueLabel}`}
          aria-valuetext={`${formatPercentValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          disabled={disabled}
          ref={sliderBlur.ref}
          onChange={(event) =>
            onValueChange(
              showSnapMarker
                ? snapSliderPercentValue(Number(event.target.value), min, max)
                : clampPercentValue(Number(event.target.value), min, max),
            )
          }
          onMouseDown={sliderBlur.handlePointerDown}
          onMouseUp={sliderBlur.handlePointerEnd}
          onPointerCancel={sliderBlur.handlePointerEnd}
          onPointerDown={sliderBlur.handlePointerDown}
          onPointerUp={sliderBlur.handlePointerEnd}
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        {showSnapMarker ? (
          <span aria-hidden="true" className="opacity-slider-snap-marker pointer-events-none" />
        ) : null}
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled={disabled ? "true" : "false"}
      >
        <span className="sr-only">{accessibleLabel} {valueLabel} value</span>
        <input
          type="text"
          inputMode="numeric"
          value={valueText}
          aria-label={`${accessibleLabel} ${valueLabel} value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          disabled={disabled}
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
      </label>
    </div>
  );
}

function useAutoBlurSlider() {
  const sliderRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);
  const isPointerActiveRef = useRef(false);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    },
    [],
  );

  function clearBlurTimeout() {
    if (blurTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = null;
  }

  function scheduleBlur() {
    clearBlurTimeout();
    blurTimeoutRef.current = window.setTimeout(() => {
      sliderRef.current?.blur();
      isPointerActiveRef.current = false;
      blurTimeoutRef.current = null;
    }, COMMON_SLIDER_BLUR_DELAY_MS);
  }

  function handlePointerDown() {
    isPointerActiveRef.current = true;
    clearBlurTimeout();
  }

  function handlePointerEnd() {
    if (isPointerActiveRef.current) {
      scheduleBlur();
    }
  }

  return {
    ref: sliderRef,
    handlePointerDown,
    handlePointerEnd,
  };
}

function clampOpacityValue(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(max, Math.max(0, Math.round(value)));
}

function snapSliderOpacityValue(value: number, max: number): number {
  const clampedValue = clampOpacityValue(value, max);
  if (
    max === OPAQUE_OPACITY_VALUE &&
    clampedValue >= OPAQUE_OPACITY_VALUE - OPAQUE_SLIDER_SNAP_DISTANCE
  ) {
    return OPAQUE_OPACITY_VALUE;
  }

  return clampedValue;
}

function formatOpacityValue(value: number): string {
  return String(Math.round(value));
}

function parseOpacityInput(value: string): number | null {
  return parsePercentNumberInput(value);
}

function clampPercentValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

function snapSliderPercentValue(value: number, min: number, max: number): number {
  const clampedValue = clampPercentValue(value, min, max);
  if (
    min <= STYLE_SCALE_DEFAULT_VALUE &&
    max >= STYLE_SCALE_DEFAULT_VALUE &&
    Math.abs(clampedValue - STYLE_SCALE_DEFAULT_VALUE) <= STYLE_SCALE_SLIDER_SNAP_DISTANCE
  ) {
    return STYLE_SCALE_DEFAULT_VALUE;
  }

  return clampedValue;
}

function percentValueToLinearSliderPosition(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return (clampPercentValue(value, min, max) - min) / (max - min);
}

function formatPercentValue(value: number): string {
  return String(Math.round(value));
}

function parsePercentInput(
  value: string,
  { allowZero = false }: { allowZero?: boolean } = {},
): number | null {
  return parsePercentNumberInput(value, { allowZero });
}

function parsePercentNumberInput(
  value: string,
  { allowZero = false }: { allowZero?: boolean } = {},
): number | null {
  const trimmedValue = value.trim().replace(/%$/, "").trim();
  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue < 0 || (!allowZero && parsedValue <= 0)) {
    return null;
  }

  return parsedValue;
}

function ImageSwitchRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-6 items-center justify-between gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-accent/60">
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Switch
        checked={checked}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}
