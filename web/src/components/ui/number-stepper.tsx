import { ChevronDown, ChevronUp } from "lucide-react";
import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

function decimalPlaces(value: number): number {
  const fraction = String(value).split(".")[1];
  return fraction?.length ?? 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function snapValue(value: number, min: number, max: number, step: number): number {
  const precision = Math.max(decimalPlaces(step), decimalPlaces(min));
  const snapped = min + Math.round((value - min) / step) * step;
  return Number(clamp(snapped, min, max).toFixed(precision));
}

function formatValue(value: number, step: number): string {
  return value.toFixed(decimalPlaces(step));
}

export function NumberStepper({
  "aria-label": ariaLabel,
  className,
  max,
  min,
  onValueChange,
  step,
  suffix,
  value,
}: {
  "aria-label": string;
  className?: string;
  max: number;
  min: number;
  onValueChange: (value: number) => void;
  step: number;
  suffix?: string;
  value: number;
}) {
  const [draft, setDraft] = useState(() => formatValue(value, step));
  const [hasEdited, setHasEdited] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cancelCommitRef = useRef(false);
  const displayedValue = isFocused && !hasEdited ? "" : draft;

  useEffect(() => {
    setDraft(formatValue(value, step));
  }, [step, value]);

  function commitDraft(text: string) {
    const normalizedText = text.trim();
    const parsed = normalizedText === "" ? Number.NaN : Number(normalizedText);
    if (!Number.isFinite(parsed)) {
      setDraft(formatValue(value, step));
      return;
    }

    const nextValue = snapValue(parsed, min, max, step);
    setDraft(formatValue(nextValue, step));
    onValueChange(nextValue);
  }

  function adjust(direction: -1 | 1) {
    const normalizedDraft = draft.trim();
    const parsedDraft = normalizedDraft === "" ? Number.NaN : Number(normalizedDraft);
    const currentValue = Number.isFinite(parsedDraft) ? parsedDraft : value;
    const nextValue = snapValue(currentValue + direction * step, min, max, step);
    setHasEdited(true);
    setDraft(formatValue(nextValue, step));
    onValueChange(nextValue);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);

    if (cancelCommitRef.current || !hasEdited) {
      cancelCommitRef.current = false;
      setDraft(formatValue(value, step));
      return;
    }

    commitDraft(event.currentTarget.value);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasEdited(true);
    setDraft(event.currentTarget.value);
  }

  function handleFocus() {
    cancelCommitRef.current = false;
    setIsFocused(true);
    setHasEdited(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      cancelCommitRef.current = true;
      setDraft(formatValue(value, step));
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      adjust(event.key === "ArrowUp" ? 1 : -1);
    }
  }

  return (
    <InputGroup className={cn("h-6 w-[4.75rem] overflow-hidden", className)}>
      <InputGroupInput
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={displayedValue}
        className="min-w-0 px-1 py-0 text-right font-mono text-[0.68rem] tabular-nums md:text-[0.68rem]"
        onBlur={handleBlur}
        onChange={handleChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
      />
      {suffix ? (
        <InputGroupAddon align="inline-end" className="px-1.5">
          <InputGroupText className="font-mono text-[0.68rem]">{suffix}</InputGroupText>
        </InputGroupAddon>
      ) : null}
      <InputGroupAddon
        align="inline-end"
        data-slot="number-stepper-controls"
        className="grid h-full w-[18px] cursor-default grid-cols-1 grid-rows-2 place-items-stretch gap-0 border-l border-input p-0"
        onClick={(event) => event.stopPropagation()}
      >
        <InputGroupButton
          aria-label={`${ariaLabel} +${step}`}
          disabled={value >= max}
          className="!size-full min-h-0 self-stretch justify-self-stretch rounded-none border-0 px-0 text-muted-foreground hover:bg-accent/60 focus-visible:border-0 focus-visible:bg-accent/60 focus-visible:ring-0 [&_svg]:size-2.5"
          onClick={() => adjust(1)}
        >
          <span className="flex size-full -translate-y-0.5 items-center justify-center leading-none">
            <ChevronUp aria-hidden="true" className="block" />
          </span>
        </InputGroupButton>
        <InputGroupButton
          aria-label={`${ariaLabel} -${step}`}
          disabled={value <= min}
          className="!size-full min-h-0 self-stretch justify-self-stretch rounded-none border-0 border-t border-input px-0 text-muted-foreground hover:bg-accent/60 focus-visible:border-t focus-visible:border-input focus-visible:bg-accent/60 focus-visible:ring-0 [&_svg]:size-2.5"
          onClick={() => adjust(-1)}
        >
          <span className="flex size-full -translate-y-0.5 items-center justify-center leading-none">
            <ChevronDown aria-hidden="true" className="block" />
          </span>
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}
