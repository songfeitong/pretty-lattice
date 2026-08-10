import { type ComponentProps, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useCommittedInput } from "../controls/useCommittedInput";

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
  const committedInput = useCommittedInput({
    clearOnFocus: true,
    value: valueText,
    formatValue: String,
    parseValue: String,
    onCommit: (nextValueText) => onCommit?.(nextValueText),
    onDraftChange: onValueTextChange,
    onEnter,
    onEscape:
      onCancel || onEscape
        ? (event) => {
            onCancel?.();
            onEscape?.(event);
          }
        : undefined,
    onStep,
  });

  return (
    <Input
      {...props}
      type="text"
      {...committedInput.inputProps}
      className={cn(
        "h-[22px] rounded-md py-0 text-center font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]",
        className,
      )}
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
  const committedInput = useCommittedInput({
    clearOnFocus: true,
    value,
    formatValue,
    parseValue: (text) => {
      const parsedValue = parseValue(text);
      return parsedValue === null ? null : clampValue(parsedValue);
    },
    onCommit,
    onStep: (direction) => onCommit(clampValue(value + direction * step)),
  });

  return (
    <Input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      {...committedInput.inputProps}
      className={cn(
        "h-[22px] rounded-md py-0 text-center font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]",
        className,
      )}
    />
  );
}

export function parseFiniteNumber(valueText: string): number | null {
  const normalizedValue = valueText.trim();
  if (normalizedValue === "") {
    return null;
  }

  const value = Number(normalizedValue);
  return Number.isFinite(value) ? value : null;
}

export function parsePositiveNumber(valueText: string): number | null {
  const value = parseFiniteNumber(valueText);
  return value !== null && value > 0 ? value : null;
}
