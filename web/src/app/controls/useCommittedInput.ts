import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";

interface CommittedInputOptions<T> {
  formatValue: (value: T) => string;
  onCommit: (value: T) => void;
  onStep?: (direction: 1 | -1) => void;
  parseValue: (valueText: string) => T | null;
  value: T;
}

/** Keeps uncommitted text local and makes blur the single commit boundary. */
export function useCommittedInput<T>({
  formatValue,
  onCommit,
  onStep,
  parseValue,
  value,
}: CommittedInputOptions<T>) {
  const [valueText, setValueText] = useState(() => formatValue(value));
  const cancelBlurRef = useRef(false);

  useEffect(() => {
    setValueText(formatValue(value));
  }, [formatValue, value]);

  function reset() {
    setValueText(formatValue(value));
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
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
    setValueText(event.currentTarget.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelBlurRef.current = true;
      reset();
      event.currentTarget.blur();
      return;
    }

    if (onStep && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      onStep(event.key === "ArrowUp" ? 1 : -1);
    }
  }

  return {
    inputProps: {
      onBlur: handleBlur,
      onChange: handleChange,
      onKeyDown: handleKeyDown,
      value: valueText,
    },
    reset,
    setValueText,
    valueText,
  };
}
