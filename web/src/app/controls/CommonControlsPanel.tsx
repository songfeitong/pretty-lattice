import {
  AlertTriangleIcon,
  ImageDown,
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
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

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
  COLOR_SCHEME_OPTIONS,
  type ColorScheme,
} from "../colorSchemes";
import {
  COMPONENT_OPACITY_MAX,
  EXPORT_FORMAT_OPTIONS,
  EXPORT_MESH_QUALITY_OPTIONS,
  EXPORT_SUPERSAMPLING_OPTIONS,
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
const RESET_OPACITY_FEEDBACK_ANIMATION_MS = 150;
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
    "linear-gradient(90deg, #ffffff 0 22%, #909090 22% 44%, #3050f8 44% 66%, #ff0d0d 66% 100%)",
} as const;
const JMOL_SOFT_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #dedede 0 22%, #919191 22% 44%, #506dc2 44% 66%, #d2685a 66% 100%)",
} as const;
const VESTA_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #ffcccc 0 22%, #814929 22% 44%, #b0bae6 44% 66%, #ff0300 66% 100%)",
} as const;
const VESTA_SOFT_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, #f2c0c0 0 22%, #8d5434 22% 44%, #a9b3df 44% 66%, #d16759 66% 100%)",
} as const;

export function CommonControlsPanel({
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
  onExport,
  onExportSettingsChange,
  onStyleChange,
  style,
}: {
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  exportError: string | null;
  exportProjectedSize?: ExportProjectedSize;
  exportSettings: ExportSettingsState;
  hasPolyhedra: boolean;
  isExporting: boolean;
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
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
            <TabsContent value="camera" className="pt-1.5">
              <ReservedTabContent />
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
    }, RESET_OPACITY_FEEDBACK_ANIMATION_MS);
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
          <h2
            id="export-quality-label"
            className="text-xs font-bold leading-tight text-muted-foreground"
          >
            Quality
          </h2>
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

      <Separator className="my-0.5" />

      <div className="mb-1.5 flex min-h-7 items-center justify-between gap-2 px-0">
        <Select
          value={settings.format}
          onValueChange={(value) =>
            onSettingsChange(setExportFormat(settings, value as ExportFormat))
          }
        >
          <SelectTrigger
            size="sm"
            aria-label="Format"
            className="!h-7 w-24 !px-2 !py-0 text-xs"
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

        <div className="flex items-center gap-1.5">
          {statusMessage ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  role="status"
                  tabIndex={0}
                  aria-label={statusMessage}
                  className="inline-flex size-6 items-center justify-center rounded-md text-amber-600 outline-none focus-visible:ring-[3px] focus-visible:ring-amber-400/40 [&_svg]:size-4"
                >
                  <AlertTriangleIcon aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-52">
                {statusMessage}
              </TooltipContent>
            </Tooltip>
          ) : null}

          <Button
            size="sm"
            aria-label={actionLabel}
            className="h-7 gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-150 ease-out active:bg-primary/80 [&_svg]:size-3.5"
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
    }, RESET_OPACITY_FEEDBACK_ANIMATION_MS);
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

      <div className="flex flex-col gap-0.5">
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
    }, RESET_OPACITY_FEEDBACK_ANIMATION_MS);
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
  label,
  max,
  min,
  onValueChange,
  value,
}: {
  accessibleLabel: string;
  label: ReactNode;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  value: number;
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
    const nextValue = parsePercentInput(valueText);
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
        data-disabled="false"
        style={sliderStyle}
      >
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={clampPercentValue(value, min, max)}
          aria-label={`${accessibleLabel} scale`}
          aria-valuetext={`${formatPercentValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          ref={sliderBlur.ref}
          onChange={(event) =>
            onValueChange(snapSliderPercentValue(Number(event.target.value), min, max))
          }
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
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled="false"
      >
        <span className="sr-only">{accessibleLabel} scale value</span>
        <input
          type="text"
          inputMode="numeric"
          value={valueText}
          aria-label={`${accessibleLabel} scale value`}
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

function parsePercentInput(value: string): number | null {
  return parsePercentNumberInput(value);
}

function parsePercentNumberInput(value: string): number | null {
  const trimmedValue = value.trim().replace(/%$/, "").trim();
  if (trimmedValue === "") {
    return null;
  }

  const parsedValue = Number(trimmedValue);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
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
