import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { COMMON_PANEL_BODY_TEXT_CLASS } from "./styles";

const COMMON_SLIDER_BLUR_DELAY_MS = 500;
const OPAQUE_OPACITY_VALUE = 100;
const OPAQUE_SLIDER_SNAP_DISTANCE = 2;

export function PercentSliderRow({
  accessibleLabel,
  allowZero = false,
  disabled = false,
  label,
  max,
  min,
  onValueChange,
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
  value: number;
  valueLabel?: string;
}) {
  const { t } = useTranslation();
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
    <div
      className={cn(
        "grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5",
        COMMON_PANEL_BODY_TEXT_CLASS,
      )}
    >
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
          aria-label={t("style.value", { target: accessibleLabel, valueLabel })}
          aria-valuetext={`${formatPercentValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          disabled={disabled}
          ref={sliderBlur.ref}
          onChange={(event) =>
            onValueChange(clampPercentValue(Number(event.target.value), min, max))
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
        data-disabled={disabled ? "true" : "false"}
      >
        <span className="sr-only">
          {t("style.valueInput", { target: accessibleLabel, valueLabel })}
        </span>
        <input
          type="text"
          inputMode="numeric"
          value={valueText}
          aria-label={t("style.valueInput", { target: accessibleLabel, valueLabel })}
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

export function useAutoBlurSlider() {
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

export function clampOpacityValue(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(max, Math.max(0, Math.round(value)));
}

export function snapSliderOpacityValue(value: number, max: number): number {
  const clampedValue = clampOpacityValue(value, max);
  if (
    max === OPAQUE_OPACITY_VALUE &&
    clampedValue >= OPAQUE_OPACITY_VALUE - OPAQUE_SLIDER_SNAP_DISTANCE
  ) {
    return OPAQUE_OPACITY_VALUE;
  }

  return clampedValue;
}

export function formatOpacityValue(value: number): string {
  return String(Math.round(value));
}

export function parseOpacityInput(value: string): number | null {
  return parsePercentNumberInput(value);
}

export function clampPercentValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}

export function percentValueToLinearSliderPosition(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return (clampPercentValue(value, min, max) - min) / (max - min);
}

export function formatPercentValue(value: number): string {
  return String(Math.round(value));
}

export function parsePercentInput(
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
