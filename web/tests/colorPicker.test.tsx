import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, mock, test } from "bun:test";

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerInput,
  ColorPickerTrigger,
  useColorPicker,
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

  test("preserves hue when a controlled value echoes the current color", () => {
    const { container } = render(<ControlledAreaColorPicker />);
    const area = container.querySelector(
      "[data-slot='color-picker-area']",
    ) as HTMLDivElement;

    area.getBoundingClientRect = () =>
      ({
        bottom: 100,
        height: 100,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    area.setPointerCapture = () => {};

    expect(screen.getByLabelText("Hue value").textContent).toBe("217");

    fireEvent.pointerDown(area, {
      clientX: 0,
      clientY: 100,
      pointerId: 1,
    });

    expect(screen.getByLabelText("Color value").textContent).toBe("#000000");
    expect(screen.getByLabelText("Hue value").textContent).toBe("217");
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

function ControlledAreaColorPicker() {
  const [value, setValue] = React.useState("#3b82f6");

  return (
    <ColorPicker value={value} inline onValueChange={setValue}>
      <ColorPickerContent>
        <ColorPickerArea />
        <ColorPickerStateReadout />
      </ColorPickerContent>
    </ColorPicker>
  );
}

function ColorPickerStateReadout() {
  const hue = useColorPicker((state) => state.hsv.h);
  const color = useColorPicker(
    (state) =>
      `#${hexChannel(state.color.r)}${hexChannel(state.color.g)}${hexChannel(
        state.color.b,
      )}`,
  );

  return (
    <>
      <output aria-label="Hue value">{hue}</output>
      <output aria-label="Color value">{color}</output>
    </>
  );
}

function hexChannel(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}
