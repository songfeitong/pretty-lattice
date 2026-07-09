import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { AngleSlider } from "@/components/ui/angle-slider";
import { cn } from "@/lib/utils";

import {
  formatRollValue,
  parseRollInput,
  rollDisplayAnimationProgress,
  rollValueInputWidth,
  shortestRollDelta,
  toPositiveRollDegrees,
} from "./orientationControlMath";

const ROLL_DISPLAY_ANIMATION_MS = 180;

export function RollControl({
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
  const { t } = useTranslation();
  const committedValue = toPositiveRollDegrees(value);
  const [isDragging, setIsDragging] = useState(false);
  const [draftValue, setDraftValue] = useState(committedValue);
  const [animatedValue, setAnimatedValue] = useState(committedValue);
  const displayedValue = isDragging ? draftValue : animatedValue;
  const [valueText, setValueText] = useState(formatRollValue(committedValue));
  const [isValueFocused, setIsValueFocused] = useState(false);
  const [hasValueEdited, setHasValueEdited] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const animatedValueRef = useRef(committedValue);
  const lastPreviewValueRef = useRef<number | null>(null);
  const valueTextAtFocusRef = useRef(valueText);
  const displayedValueText = isValueFocused && !hasValueEdited ? "" : valueText;

  function cancelDisplayAnimation() {
    if (animationFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
  }

  function setDisplayedRollValue(nextValue: number) {
    const normalizedValue = toPositiveRollDegrees(nextValue);
    animatedValueRef.current = normalizedValue;
    setAnimatedValue(normalizedValue);
  }

  useEffect(() => {
    return () => {
      cancelDisplayAnimation();
    };
  }, []);

  useEffect(() => {
    cancelDisplayAnimation();
    if (isDragging) {
      return;
    }

    setDraftValue(committedValue);

    const startValue = animatedValueRef.current;
    const delta = shortestRollDelta(startValue, committedValue);
    if (Math.abs(delta) < 0.001) {
      setDisplayedRollValue(committedValue);
      return;
    }

    const startedAt = performance.now();
    const step = (now: number) => {
      const progress = (now - startedAt) / ROLL_DISPLAY_ANIMATION_MS;
      const easedProgress = rollDisplayAnimationProgress(progress);
      const nextValue = startValue + delta * easedProgress;

      if (progress >= 1) {
        setDisplayedRollValue(committedValue);
        animationFrameRef.current = null;
        return;
      }

      setDisplayedRollValue(nextValue);
      animationFrameRef.current = window.requestAnimationFrame(step);
    };

    animationFrameRef.current = window.requestAnimationFrame(step);
  }, [committedValue, isDragging]);

  useEffect(() => {
    if (isDragging || (isValueFocused && hasValueEdited)) {
      return;
    }

    setValueText(formatRollValue(displayedValue));
  }, [displayedValue, hasValueEdited, isDragging, isValueFocused]);

  function commitValueText(nextText = valueText) {
    const nextValue = parseRollInput(nextText);
    if (nextValue === null) {
      setValueText(formatRollValue(displayedValue));
      return;
    }

    const normalizedValue = toPositiveRollDegrees(nextValue);
    cancelDisplayAnimation();
    setDisplayedRollValue(normalizedValue);
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
    cancelDisplayAnimation();
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
    setDisplayedRollValue(normalizedValue);
    onPreviewValueChange(normalizedValue);
  }

  function handleSliderCommit(nextValue: number) {
    const normalizedValue = toPositiveRollDegrees(nextValue);
    cancelDisplayAnimation();
    setDisplayedRollValue(normalizedValue);
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
      cancelDisplayAnimation();
      setDisplayedRollValue(normalizedValue);
      setHasValueEdited(true);
      setValueText(formatRollValue(normalizedValue));
      onValueChange(normalizedValue);
    }
  }

  return (
    <section
      aria-labelledby="camera-roll-label"
      className={cn(
        "relative flex min-h-[116px] min-w-0 items-center justify-center",
        className,
      )}
    >
      <h2 id="camera-roll-label" className="sr-only">
        {t("orientation.roll")}
      </h2>
      <AngleSlider
        aria-label={t("orientation.roll")}
        className="size-[116px]"
        value={displayedValue}
        onInteractionStart={handleSliderInteractionStart}
        onValueChange={handleSliderPreviewChange}
        onValueCommit={handleSliderCommit}
      />
      <label className="absolute left-1/2 top-1/2 z-10 inline-flex h-5 min-w-[1.45rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[4px] border border-transparent bg-transparent px-1 transition-[background-color,border-color,box-shadow] duration-150 hover:border-foreground/8 hover:bg-background/55 focus-within:border-ring/15 focus-within:bg-background/70 focus-within:shadow-[0_0_0_0.5px_color-mix(in_srgb,var(--ring)_14%,transparent)]">
        <span className="sr-only">{t("orientation.rollValue")}</span>
        <input
          type="text"
          inputMode="decimal"
          value={displayedValueText}
          aria-label={t("orientation.rollValue")}
          className="h-full min-w-[1ch] border-0 bg-transparent px-0 text-right font-mono text-xs font-normal leading-none tabular-nums outline-none focus-visible:ring-0"
          style={{ width: rollValueInputWidth(displayedValueText) }}
          onBlur={handleValueBlur}
          onChange={handleValueChange}
          onFocus={handleValueFocus}
          onKeyDown={handleValueKeyDown}
        />
        <span
          aria-hidden="true"
          data-slot="roll-degree-symbol"
          className="pointer-events-none -ml-px select-none font-mono text-xs font-normal leading-none text-foreground"
        >
          °
        </span>
      </label>
    </section>
  );
}
