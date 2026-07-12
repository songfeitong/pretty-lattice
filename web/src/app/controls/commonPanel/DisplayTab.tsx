import { RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  COMPONENT_OPACITY_MAX,
  type ComponentOpacityState,
  type ComponentVisibilityState,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import { TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS } from "./controlFeedback";
import {
  clampOpacityValue,
  formatOpacityValue,
  parseOpacityInput,
  snapSliderOpacityValue,
  useAutoBlurSlider,
} from "./sharedControls";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_ROW_STACK_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";

export function DisplayTabContent({
  connectivityIntent,
  connectivityStatus,
  hasPolyhedra,
  onOpacityChange,
  onOpacityReset,
  onVisibilityChange,
  opacity,
  visibility,
}: {
  connectivityIntent: string | null;
  connectivityStatus: "deferred" | "loading" | "ready" | "error";
  hasPolyhedra: boolean;
  onOpacityChange: (key: keyof ComponentOpacityState, value: number) => void;
  onOpacityReset: () => void;
  onVisibilityChange: (key: keyof ComponentVisibilityState, value: boolean) => void;
  opacity: ComponentOpacityState;
  visibility: ComponentVisibilityState;
}) {
  const { t } = useTranslation();

  function setVisibility(key: keyof ComponentVisibilityState, value: boolean) {
    onVisibilityChange(key, value);
  }

  function setOpacity(key: keyof ComponentOpacityState, value: number) {
    onOpacityChange(
      key,
      clampOpacityValue(value, COMPONENT_OPACITY_MAX[key]),
    );
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
    onOpacityReset();

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
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            {t("display.visibleObjects")}
          </h2>
          <span className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "text-right leading-tight text-muted-foreground")}>
            {t("display.opacity")}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("actions.resetOpacity")}
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
            <TooltipContent side="top">{t("actions.resetOpacity")}</TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS)}>
          <ComponentOpacityRow
            checked={visibility.atoms}
            label={t("display.atoms")}
            max={COMPONENT_OPACITY_MAX.atoms}
            value={opacity.atoms}
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
            onOpacityChange={(value) => setOpacity("atoms", value)}
          />
          <ComponentOpacityRow
            checked={visibility.bonds}
            label={t("display.bonds")}
            max={COMPONENT_OPACITY_MAX.bonds}
            value={opacity.bonds}
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
            onOpacityChange={(value) => setOpacity("bonds", value)}
            checkboxDisabled={connectivityStatus === "loading"}
            loading={connectivityStatus === "loading" && connectivityIntent === "bonds"}
          />
          <ComponentOpacityRow
            checked={visibility.unitCell}
            label={t("display.unitCell")}
            max={COMPONENT_OPACITY_MAX.unitCell}
            value={opacity.unitCell}
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
            onOpacityChange={(value) => setOpacity("unitCell", value)}
          />
          <ComponentOpacityRow
            checked={hasPolyhedra && visibility.polyhedra}
            checkboxDisabled={connectivityStatus === "loading" || (connectivityStatus === "ready" && !hasPolyhedra)}
            label={t("display.polyhedra")}
            max={COMPONENT_OPACITY_MAX.polyhedra}
            value={opacity.polyhedra}
            onCheckedChange={(checked) => setVisibility("polyhedra", checked)}
            onOpacityChange={(value) => setOpacity("polyhedra", value)}
            loading={connectivityStatus === "loading" && connectivityIntent === "polyhedra"}
          />
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "px-1.5 leading-tight text-muted-foreground")}
        >
          {t("display.periodicImages")}
        </h2>
        <div className="mt-1.5 flex flex-col gap-1">
          <ImageSwitchRow
            checked={visibility.boundaryAtoms}
            label={t("display.boundaryAtoms")}
            onCheckedChange={(checked) => setVisibility("boundaryAtoms", checked)}
          />
          <ImageSwitchRow
            checked={visibility.oneHopBondedAtoms}
            label={t("display.oneHopBondedAtoms")}
            onCheckedChange={(checked) => setVisibility("oneHopBondedAtoms", checked)}
            disabled={connectivityStatus === "loading"}
            loading={connectivityStatus === "loading" && connectivityIntent === "oneHopBondedAtoms"}
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
  loading = false,
  max,
  onCheckedChange,
  onOpacityChange,
  value,
}: {
  checked: boolean;
  checkboxDisabled?: boolean;
  label: string;
  loading?: boolean;
  max: number;
  onCheckedChange: (checked: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  value: number;
}) {
  const { t } = useTranslation();
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
        "grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 transition-colors",
        COMMON_PANEL_BODY_TEXT_CLASS,
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
        {loading ? <LoadingSpinner className="shrink-0 text-muted-foreground" /> : null}
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
          aria-label={t("display.opacityControl", { target: label })}
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
        <span className="sr-only">
          {t("display.opacityValue", { target: label })}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={opacityText}
          disabled={inputDisabled}
          aria-label={t("display.opacityValue", { target: label })}
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

function ImageSwitchRow({
  checked,
  label,
  disabled = false,
  loading = false,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-6 items-center justify-between gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent/60",
        COMMON_PANEL_BODY_TEXT_CLASS,
      )}
    >
      <span className="flex min-w-0 items-center gap-2"><span className="truncate leading-tight">{label}</span>{loading ? <LoadingSpinner className="shrink-0 text-muted-foreground" /> : null}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}
