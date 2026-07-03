import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import {
  ColorPicker,
  ColorPickerContent,
  ColorPickerInput,
  ColorPickerTrigger,
} from "../src/components/ui/color-picker";

describe("ColorPicker", () => {
  test("does not emit open changes while syncing a controlled open prop", () => {
    const handleOpenChange = mock();
    const { rerender } = render(
      <ControlledColorPicker open={false} onOpenChange={handleOpenChange} />,
    );

    handleOpenChange.mockClear();
    rerender(<ControlledColorPicker open onOpenChange={handleOpenChange} />);
    expect(handleOpenChange).not.toHaveBeenCalled();

    rerender(
      <ControlledColorPicker open={false} onOpenChange={handleOpenChange} />,
    );
    expect(handleOpenChange).not.toHaveBeenCalled();
  });

  test("allows draft hex input before the value is valid", () => {
    const handleValueChange = mock();
    render(<InputColorPicker onValueChange={handleValueChange} />);

    const input = screen.getByLabelText("Hex color value") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "#" } });
    expect(input.value).toBe("#");
    expect(handleValueChange).not.toHaveBeenCalled();

    fireEvent.blur(input);
    expect(input.value).toBe("#112233");
  });

  test("keeps hex input prefixed and capped to six digits", () => {
    const handleValueChange = mock();
    render(<InputColorPicker onValueChange={handleValueChange} />);

    const input = screen.getByLabelText("Hex color value") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("#");
    expect(handleValueChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "#abc" } });
    expect(input.value).toBe("#abc");
    expect(handleValueChange).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "a1b2c3d4" } });
    expect(input.value).toBe("#a1b2c3");
    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange).toHaveBeenLastCalledWith("#a1b2c3");

    fireEvent.change(input, { target: { value: "#zz44-55-66" } });
    expect(input.value).toBe("#445566");
    expect(handleValueChange).toHaveBeenCalledTimes(2);
    expect(handleValueChange).toHaveBeenLastCalledWith("#445566");
  });

  test("emits once when committing a valid hex input", () => {
    const handleValueChange = mock();
    render(<InputColorPicker onValueChange={handleValueChange} />);

    const input = screen.getByLabelText("Hex color value") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "#445566" } });

    expect(input.value).toBe("#445566");
    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange).toHaveBeenLastCalledWith("#445566");
  });
});

function ControlledColorPicker({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <ColorPicker open={open} value="#112233" onOpenChange={onOpenChange}>
      <ColorPickerTrigger>Open picker</ColorPickerTrigger>
    </ColorPicker>
  );
}

function InputColorPicker({
  onValueChange,
}: {
  onValueChange: (value: string) => void;
}) {
  return (
    <ColorPicker
      defaultFormat="hex"
      defaultValue="#112233"
      inline
      onValueChange={onValueChange}
    >
      <ColorPickerContent>
        <ColorPickerInput withoutAlpha aria-label="Hex color value" />
      </ColorPickerContent>
    </ColorPicker>
  );
}
