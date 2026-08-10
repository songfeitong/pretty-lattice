import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

interface CommittedInputOptions<T> {
  clearOnFocus?: boolean;
  formatValue: (value: T) => string;
  onCommit: (value: T) => void;
  onDraftChange?: (valueText: string) => void;
  onEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onEscape?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onStep?: (direction: 1 | -1) => void;
  parseValue: (valueText: string) => T | null;
  value: T;
}

/** Keeps uncommitted text local and makes blur the single commit boundary. */
export function useCommittedInput<T>({
  clearOnFocus = false,
  formatValue,
  onCommit,
  onDraftChange,
  onEnter,
  onEscape,
  onStep,
  parseValue,
  value,
}: CommittedInputOptions<T>) {
  const [valueText, setValueText] = useState(() => formatValue(value));
  const cancelBlurRef = useRef(false);
  const [hasEdited, setHasEdited] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    setValueText(formatValue(value));
  }, [formatValue, value]);

  function reset() {
    setValueText(formatValue(value));
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);
    if (clearOnFocus && !hasEdited) {
      cancelBlurRef.current = false;
      return;
    }
    if (cancelBlurRef.current) {
      cancelBlurRef.current = false;
      reset();
      return;
    }

    const nextValue = parseValue(event.currentTarget.value);
    if (nextValue === null) {
      reset();
      return;
    }

    setValueText(formatValue(nextValue));
    onCommit(nextValue);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasEdited(true);
    setValueText(event.currentTarget.value);
    onDraftChange?.(event.currentTarget.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (onEnter) onEnter(event);
      else event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelBlurRef.current = true;
      reset();
      if (onEscape) onEscape(event);
      else event.currentTarget.blur();
      return;
    }

    if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      setHasEdited(true);
      onStep(event.key === "ArrowUp" ? 1 : -1);
    }
  }

  return {
    inputProps: {
      onBlur: handleBlur,
      onChange: handleChange,
      onFocus: () => {
        cancelBlurRef.current = false;
        setIsFocused(true);
        setHasEdited(false);
      },
      onKeyDown: handleKeyDown,
      value: clearOnFocus && isFocused && !hasEdited ? "" : valueText,
    },
    reset,
    setValueText,
    valueText,
  };
}
