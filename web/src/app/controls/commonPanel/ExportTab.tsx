import { AlertTriangleIcon, ImageDown, Link, RotateCcw, Unlink } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  MESH_QUALITY_LABEL_KEYS,
  translateExportSettingsValidation,
} from "../../../i18n/exportSettingsText";
import {
  createDefaultExportSettings,
  EXPORT_BACKGROUND_OPTIONS,
  EXPORT_FORMAT_OPTIONS,
  EXPORT_LEGEND_LAYOUT_OPTIONS,
  EXPORT_SUPERSAMPLING_OPTIONS,
  isExportBackgroundAllowed,
  MESH_QUALITY_OPTIONS,
  parseExportDimensionInput,
  setExportAspectRatioLocked,
  setExportBackground,
  setExportCombineComponents,
  setExportComponentSelected,
  setExportDimension,
  setExportFormat,
  setExportLegendLayout,
  setExportMeshQuality,
  setExportSupersampling,
  validateExportSettings,
  type ExportBackground,
  type ExportComponentId,
  type ExportFormat,
  type ExportLegendLayout,
  type ExportMeshQuality,
  type ExportProjectedSize,
  type ExportSettingsState,
  type ExportSupersampling,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import { TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS } from "./controlFeedback";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_FIELD_LABEL_TEXT_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";

const EXPORT_FORMAT_LABELS: Record<ExportFormat, string> = {
  jpg: "JPG",
  pdf: "PDF",
  png: "PNG",
};
const EXPORT_BACKGROUND_LABEL_KEYS: Record<ExportBackground, "exportPanel.black" | "exportPanel.transparent" | "exportPanel.white"> = {
  black: "exportPanel.black",
  transparent: "exportPanel.transparent",
  white: "exportPanel.white",
};
const EXPORT_LEGEND_LAYOUT_LABEL_KEYS: Record<ExportLegendLayout, "exportPanel.horizontal" | "exportPanel.vertical"> = {
  horizontal: "exportPanel.horizontal",
  vertical: "exportPanel.vertical",
};
const EXPORT_SEGMENTED_TRIGGER_CLASS =
  "!h-5 rounded-[4px] px-0.5 py-0 text-[0.68rem] font-medium transition-[background-color,color,box-shadow] duration-75 ease-out motion-reduce:transition-none md:text-[0.68rem]";

export function ExportTabContent({
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
  const { t } = useTranslation();
  const validation = validateExportSettings(settings);
  const statusMessage = error ?? translateExportSettingsValidation(validation, t);
  const actionLabel = t("actions.exportFormat", {
    format: EXPORT_FORMAT_LABELS[settings.format],
  });

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

  function handleResetRenderSettingsClick() {
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
        <div className="flex items-center justify-between gap-3 px-1.5">
          <h2
            id="export-components-label"
            className={cn("leading-tight text-muted-foreground", COMMON_PANEL_SECTION_TITLE_TEXT_CLASS)}
          >
            {t("exportPanel.components")}
          </h2>
          <ExportCombineSwitch
            checked={settings.combineComponents}
            onSettingsChange={(checked) =>
              onSettingsChange(setExportCombineComponents(settings, checked))
            }
          />
        </div>
        <div className="mt-2 grid gap-1 px-1.5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <ExportComponentCheckbox
              checked={settings.components.structure}
              component="structure"
              label={t("exportPanel.structure")}
              onSettingsChange={(component, checked) =>
                onSettingsChange(setExportComponentSelected(settings, component, checked))
              }
            />
            <ExportComponentCheckbox
              checked={settings.components.crystalAxes}
              component="crystalAxes"
              label={t("exportPanel.crystalAxes")}
              onSettingsChange={(component, checked) =>
                onSettingsChange(setExportComponentSelected(settings, component, checked))
              }
            />
          </div>
          <div className="flex h-7 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent/60">
            <ExportComponentCheckbox
              checked={settings.components.legend}
              className="h-full flex-none px-0 hover:bg-transparent"
              component="legend"
              label={t("exportPanel.legend")}
              onSettingsChange={(component, checked) =>
                onSettingsChange(setExportComponentSelected(settings, component, checked))
              }
            />
            <div className="ml-2 w-26">
              <ExportLegendLayoutControl
                disabled={!settings.components.legend}
                value={settings.legendLayout}
                onCommit={(value) =>
                  onSettingsChange(setExportLegendLayout(settings, value))
                }
              />
            </div>
          </div>
        </div>
      </section>

      <Separator className="my-0.5" />

      <section aria-labelledby="export-output-label" className="flex flex-col gap-2.5">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <div className="flex min-w-0 items-center gap-1">
            <h2
              id="export-output-label"
              className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
            >
              {t("exportPanel.output")}
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
                  aria-label={t("actions.resetOutputSettings")}
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetRenderSettingsClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{t("actions.resetOutputSettings")}</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex items-end justify-between gap-3 px-1.5">
          <div className="grid grid-cols-[2.75rem_1.25rem_2.75rem] items-end gap-[0.1875rem]">
            <ExportSizeInput
              label={t("exportPanel.width")}
              accessibleLabel={t("exportPanel.exportWidth")}
              value={settings.width}
              onCommit={(value) => setDimension("width", value)}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={
                    settings.aspectRatioLocked
                      ? t("exportPanel.unlockAspectRatio")
                      : t("exportPanel.lockAspectRatio")
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
                {settings.aspectRatioLocked ? t("exportPanel.unlockRatio") : t("exportPanel.lockRatio")}
              </TooltipContent>
            </Tooltip>

            <ExportSizeInput
              label={t("exportPanel.height")}
              accessibleLabel={t("exportPanel.exportHeight")}
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

      <div className="mb-1.5 grid min-h-8 grid-cols-[auto_auto] items-end justify-between gap-2 px-1.5">
        <div className="grid min-w-0 gap-1">
          <span className={cn("truncate px-0.5 leading-none text-muted-foreground", COMMON_PANEL_FIELD_LABEL_TEXT_CLASS)}>
            {t("exportPanel.format")}
          </span>
          <div className="flex items-center">
            <Select
              value={settings.format}
              onValueChange={(value) =>
                onSettingsChange(setExportFormat(settings, value as ExportFormat))
              }
            >
              <SelectTrigger
                size="sm"
                aria-label={t("exportPanel.format")}
                className="!h-6 w-[4.25rem] rounded-r-none border-r-0 !px-1.5 !py-0 text-xs"
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
                      className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
                    >
                      {EXPORT_FORMAT_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <ExportBackgroundPopover
              format={settings.format}
              value={settings.background}
              onCommit={(value) => onSettingsChange(setExportBackground(settings, value))}
            />
          </div>
        </div>

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
            {t("actions.exportFigure")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ExportBackgroundPopover({
  format,
  onCommit,
  value,
}: {
  format: ExportFormat;
  onCommit: (value: ExportBackground) => void;
  value: ExportBackground;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = EXPORT_BACKGROUND_OPTIONS.filter((option) =>
    isExportBackgroundAllowed(format, option),
  );
  const currentBackgroundLabel = t(EXPORT_BACKGROUND_LABEL_KEYS[value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("exportPanel.backgroundValue", { value: currentBackgroundLabel })}
          title={t("exportPanel.background")}
          className="-ml-px inline-flex h-6 w-8 items-center justify-center rounded-l-none rounded-r-md border border-input bg-transparent shadow-xs transition-[background-color,border-color,box-shadow] duration-150 hover:bg-accent/60 focus-visible:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <ExportBackgroundToken value={value} className="h-4 w-5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-36"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className={cn("px-2 pb-1 pt-1.5 leading-none text-muted-foreground", COMMON_PANEL_FIELD_LABEL_TEXT_CLASS)}>
          {t("exportPanel.background")}
        </div>
        <div role="listbox" aria-label={t("exportPanel.background")} className="grid gap-0.5">
          {options.map((option) => {
            const label = t(EXPORT_BACKGROUND_LABEL_KEYS[option]);
            return (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === value}
                className={cn(
                  "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                  COMMON_PANEL_BODY_TEXT_CLASS,
                  option === value ? "bg-accent/55 text-foreground" : "text-foreground",
                )}
                onClick={() => {
                  onCommit(option);
                  setOpen(false);
                }}
              >
                <ExportBackgroundToken value={option} />
                <span className="min-w-0 truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ExportBackgroundToken({
  className,
  value,
}: {
  className?: string;
  value: ExportBackground;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("h-3.5 w-5 shrink-0 rounded-[4px] border border-border", className)}
      style={exportBackgroundTokenStyle(value)}
    />
  );
}

function exportBackgroundTokenStyle(value: ExportBackground): CSSProperties {
  if (value === "transparent") {
    return {
      background:
        "conic-gradient(#d9d9d9 0 25%, #ffffff 0 50%, #d9d9d9 0 75%, #ffffff 0)",
      backgroundSize: "6px 6px",
    };
  }

  if (value === "black") {
    return { background: "#111111" };
  }

  return { background: "#ffffff" };
}

function ExportComponentCheckbox({
  checked,
  className,
  component,
  label,
  onSettingsChange,
}: {
  checked: boolean;
  className?: string;
  component: ExportComponentId;
  label: string;
  onSettingsChange: (component: ExportComponentId, checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      className={cn(
        "flex h-7 min-w-0 cursor-pointer items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-accent/60",
        COMMON_PANEL_BODY_TEXT_CLASS,
        className,
      )}
    >
      <Checkbox
        checked={checked}
        aria-label={t("exportPanel.exportComponent", { label })}
        className="size-3.5 rounded-[3px]"
        iconClassName="size-3"
        onCheckedChange={(nextChecked) => onSettingsChange(component, nextChecked === true)}
      />
      <span className="min-w-0 truncate leading-tight">{label}</span>
    </label>
  );
}

function ExportCombineSwitch({
  checked,
  onSettingsChange,
}: {
  checked: boolean;
  onSettingsChange: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <label
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md",
        "text-[12px] font-medium leading-none text-foreground",
      )}
    >
      <span>{t("exportPanel.combined")}</span>
      <Switch
        aria-label={t("exportPanel.combineSelectedComponents")}
        checked={checked}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onSettingsChange}
      />
    </label>
  );
}

function ExportLegendLayoutControl({
  disabled,
  onCommit,
  value,
}: {
  disabled: boolean;
  onCommit: (value: ExportLegendLayout) => void;
  value: ExportLegendLayout;
}) {
  const { t } = useTranslation();
  return (
    <Select
      disabled={disabled}
      value={value}
      onValueChange={(nextValue) => onCommit(nextValue as ExportLegendLayout)}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("exportPanel.legendLayout")}
        className={cn(
          "!h-6 w-full !px-2 !py-0",
          COMMON_PANEL_BODY_TEXT_CLASS,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="!bg-background !text-foreground"
      >
        <SelectGroup>
          {EXPORT_LEGEND_LAYOUT_OPTIONS.map((option) => {
            const label = t(EXPORT_LEGEND_LAYOUT_LABEL_KEYS[option]);
            return (
              <SelectItem
                key={option}
                value={option}
                textValue={label}
                className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
              >
                {label}
              </SelectItem>
            );
          })}
        </SelectGroup>
      </SelectContent>
    </Select>
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
      <span className={cn("px-0.5 leading-none text-muted-foreground", COMMON_PANEL_FIELD_LABEL_TEXT_CLASS)}>
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
  const { t } = useTranslation();
  return (
    <label className="ml-auto grid min-w-0 justify-items-end gap-1">
      <span className={cn("truncate px-0.5 leading-none text-muted-foreground", COMMON_PANEL_FIELD_LABEL_TEXT_CLASS)}>
        {t("exportPanel.supersampling")}
      </span>
      <Tabs
        value={String(value)}
        className="w-28 gap-0"
        onValueChange={(nextValue) => onCommit(Number(nextValue))}
      >
        <TabsList
          aria-label={t("exportPanel.supersampling")}
          className="!h-6 w-full rounded-md p-0.5"
        >
          {EXPORT_SUPERSAMPLING_OPTIONS.map((option) => (
            <TabsTrigger
              key={option}
              value={String(option)}
              aria-label={t("exportPanel.supersamplingOption", { value: option })}
              className={EXPORT_SEGMENTED_TRIGGER_CLASS}
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
  const { t } = useTranslation();
  return (
    <label className="mt-0.5 grid min-w-0 gap-1 px-1.5">
      <span className={cn("truncate px-0.5 leading-none text-muted-foreground", COMMON_PANEL_FIELD_LABEL_TEXT_CLASS)}>
        {t("exportPanel.meshQuality")}
      </span>
      <Tabs
        value={value}
        className="w-full gap-0"
        onValueChange={(nextValue) => onCommit(nextValue as ExportMeshQuality)}
      >
        <TabsList
          aria-label={t("exportPanel.meshQuality")}
          className="!h-6 w-full rounded-md p-0.5"
        >
          {MESH_QUALITY_OPTIONS.map((option) => {
            const label = t(MESH_QUALITY_LABEL_KEYS[option]);
            return (
              <TabsTrigger
                key={option}
                value={option}
                aria-label={t("exportPanel.meshQualityOption", { quality: label })}
                className={EXPORT_SEGMENTED_TRIGGER_CLASS}
              >
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </label>
  );
}
