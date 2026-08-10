import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "bun:test";
import { useState } from "react";

import { useCommittedInput } from "../src/app/controls/useCommittedInput";
import {
  CompactNumberCell,
  parseFiniteNumber,
} from "../src/app/inspector/CompactNumberInput";

describe("committed numeric inputs", () => {
  test("treats blank text as invalid instead of zero", () => {
    expect(parseFiniteNumber("")).toBeNull();
    expect(parseFiniteNumber("   ")).toBeNull();
    expect(parseFiniteNumber("0")).toBe(0);
  });

  test("uses blur as the only Enter commit boundary", async () => {
    const commits: number[] = [];
    const user = userEvent.setup();
    render(<CommittedInputHarness onCommit={(value) => commits.push(value)} />);

    const input = screen.getByRole("textbox", { name: "Value" });
    await user.clear(input);
    await user.type(input, "42{Enter}");

    expect(commits).toEqual([42]);
    expect(input.getAttribute("value")).toBe("42");
  });

  test("cancels a valid draft on Escape without committing it", async () => {
    const commits: number[] = [];
    const user = userEvent.setup();
    render(<CommittedInputHarness onCommit={(value) => commits.push(value)} />);

    const input = screen.getByRole("textbox", { name: "Value" });
    await user.clear(input);
    await user.type(input, "42{Escape}");

    expect(commits).toEqual([]);
    expect(input.getAttribute("value")).toBe("10");
  });

  test("keeps compact focus-clear display on the shared commit state machine", async () => {
    const commits: number[] = [];
    const user = userEvent.setup();
    render(<CompactInputHarness onCommit={(value) => commits.push(value)} />);

    const input = screen.getByRole("textbox", { name: "Compact value" });
    await user.click(input);
    expect(input.getAttribute("value")).toBe("");
    await user.type(input, "42{Enter}");

    expect(commits).toEqual([42]);
    expect(input.getAttribute("value")).toBe("42");
  });
});

function CommittedInputHarness({
  onCommit,
}: {
  onCommit: (value: number) => void;
}) {
  const [value, setValue] = useState(10);
  const committedInput = useCommittedInput({
    value,
    formatValue: String,
    parseValue: parseFiniteNumber,
    onCommit: (nextValue) => {
      onCommit(nextValue);
      setValue(nextValue);
    },
  });

  return (
    <input aria-label="Value" type="text" {...committedInput.inputProps} />
  );
}

function CompactInputHarness({
  onCommit,
}: {
  onCommit: (value: number) => void;
}) {
  const [value, setValue] = useState(10);
  return (
    <CompactNumberCell
      ariaLabel="Compact value"
      clampValue={(nextValue) => nextValue}
      formatValue={String}
      inputMode="numeric"
      parseValue={parseFiniteNumber}
      step={1}
      value={value}
      onCommit={(nextValue) => {
        onCommit(nextValue);
        setValue(nextValue);
      }}
    />
  );
}
