import { type ComponentProps, type KeyboardEvent, useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CompactNumberInputProps = Omit<
  ComponentProps<typeof Input>,
  "onBlur" | "onChange" | "onFocus" | "onKeyDown" | "type" | "value"
> & {
  onCancel?: () => void;
  onCommit?: (valueText: string) => void;
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onEscape?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onStep?: (direction: 1 | -1) => void;
  onValueTextChange: (valueText: string) => void;
  valueText: string;
};

export function CompactNumberInput({
  className,
  onCancel,
  onCommit,
  onEnter,
  onEscape,
  onStep,
  onValueTextChange,
  valueText,
  ...props
}: CompactNumberInputProps) {
  const [hasEdited, setHasEdited] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cancelCommitRef = useRef(false);
  const displayedValue = isFocused && !hasEdited ? "" : valueText;

  return (
    <Input
      {...props}
      type="text"
      value={displayedValue}
      className={cn(
        "h-[22px] rounded-md py-0 font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]",
        className,
      )}
      onBlur={(event) => {
        setIsFocused(false);
        setHasEdited(false);
        if (cancelCommitRef.current || !hasEdited) {
          cancelCommitRef.current = false;
          return;
        }
        onCommit?.(event.currentTarget.value);
      }}
      onChange={(event) => {
        setHasEdited(true);
        onValueTextChange(event.currentTarget.value);
      }}
      onFocus={() => {
        cancelCommitRef.current = false;
        setIsFocused(true);
        setHasEdited(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          if (onEnter) onEnter(event);
          else event.currentTarget.blur();
          return;
        }
        if (event.key === "Escape") {
          cancelCommitRef.current = true;
          onCancel?.();
          if (onEscape) onEscape(event);
          else event.currentTarget.blur();
          return;
        }
        if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
          event.preventDefault();
          setHasEdited(true);
          onStep(event.key === "ArrowUp" ? 1 : -1);
        }
      }}
    />
  );
}

export function CompactNumberCell({
  ariaLabel,
  clampValue,
  className,
  formatValue,
  inputMode,
  onCommit,
  parseValue,
  step,
  value,
}: {
  ariaLabel: string;
  clampValue: (value: number) => number;
  className?: string;
  formatValue: (value: number) => string;
  inputMode: "decimal" | "numeric";
  onCommit: (value: number) => void;
  parseValue: (valueText: string) => number | null;
  step: number;
  value: number;
}) {
  const [valueText, setValueText] = useState(formatValue(value));

  useEffect(() => {
    setValueText(formatValue(value));
  }, [formatValue, value]);

  function commitValueText(text: string) {
    const parsedValue = parseValue(text);
    if (parsedValue === null) {
      setValueText(formatValue(value));
      return;
    }
    const nextValue = clampValue(parsedValue);
    setValueText(formatValue(nextValue));
    onCommit(nextValue);
  }

  return (
    <CompactNumberInput
      inputMode={inputMode}
      aria-label={ariaLabel}
      valueText={valueText}
      className={className}
      onCancel={() => setValueText(formatValue(value))}
      onCommit={commitValueText}
      onStep={(direction) => {
        const nextValue = clampValue(value + direction * step);
        setValueText(formatValue(nextValue));
        onCommit(nextValue);
      }}
      onValueTextChange={setValueText}
    />
  );
}

export function parseFiniteNumber(valueText: string): number | null {
  const value = Number(valueText.trim());
  return Number.isFinite(value) ? value : null;
}

export function parsePositiveNumber(valueText: string): number | null {
  const value = parseFiniteNumber(valueText);
  return value !== null && value > 0 ? value : null;
}
