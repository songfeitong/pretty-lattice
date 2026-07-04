import { fireEvent, render, screen } from "@testing-library/react";
import { clampChroma, formatHex, type Oklch } from "culori";
import * as React from "react";
import { describe, expect, mock, test } from "bun:test";

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerFormatSelect,
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

  test("syncs real controlled value changes that are only one channel apart", () => {
    render(<ExternallyControlledColorPicker />);

    expect(screen.getByLabelText("Color value").textContent).toBe("#112233");

    fireEvent.click(screen.getByRole("button", { name: "Set close color" }));
    expect(screen.getByLabelText("Color value").textContent).toBe("#112234");
  });

  test("caps RGB channel drafts to three digits", () => {
    const handleValueChange = mock();
    render(
      <InputColorPicker defaultFormat="rgb" onValueChange={handleValueChange} />,
    );

    const red = screen.getByLabelText(
      "Red color component (0-255)",
    ) as HTMLInputElement;
    const green = screen.getByLabelText(
      "Green color component (0-255)",
    ) as HTMLInputElement;

    expect(red.className).toContain("w-12");
    expect(green.className).toContain("w-12");

    fireEvent.change(red, { target: { value: "1234" } });
    expect(red.value).toBe("123");
    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange).toHaveBeenLastCalledWith("rgb(123, 34, 51)");

    fireEvent.focus(green);
    fireEvent.change(green, { target: { value: "003" } });
    expect(green.value).toBe("003");
    expect(handleValueChange).toHaveBeenCalledTimes(2);
    expect(handleValueChange).toHaveBeenLastCalledWith("rgb(123, 3, 51)");

    fireEvent.blur(green);
    expect(green.value).toBe("3");
  });

  test("allows HSL channel drafts and renders fixed unit suffixes", () => {
    const handleValueChange = mock();
    render(
      <InputColorPicker
        defaultFormat="hsl"
        defaultValue="#3b82f6"
        onValueChange={handleValueChange}
      />,
    );

    const hue = screen.getByLabelText("Hue degree (0-360)") as HTMLInputElement;
    const saturation = screen.getByLabelText(
      "Saturation percentage (0-100)",
    ) as HTMLInputElement;

    expect(hue.value).toBe("217");
    expect(saturation.value).toBe("91");
    expect(hue.parentElement?.className).toContain("w-12");
    expect(saturation.parentElement?.className).toContain("w-12");
    expect(hue.className).toContain("pr-3");
    expect(saturation.parentElement?.className).toContain("-ms-px");
    expect(saturation.className).not.toContain("-ms-px");
    expect(saturation.className).toContain("border-l-0");
    expect(screen.getByText("°").textContent).toBe("°");
    expect(screen.getAllByText("%")).toHaveLength(2);

    fireEvent.change(hue, { target: { value: "" } });
    expect(hue.value).toBe("");
    expect(handleValueChange).not.toHaveBeenCalled();

    fireEvent.change(saturation, { target: { value: "999" } });
    expect(saturation.value).toBe("999");
    expect(handleValueChange).not.toHaveBeenCalled();

    fireEvent.change(saturation, { target: { value: "100" } });
    expect(saturation.value).toBe("100");
    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange).toHaveBeenLastCalledWith("hsl(217, 100%, 60%)");

    fireEvent.change(saturation, { target: { value: "1234" } });
    expect(saturation.value).toBe("123");
    expect(handleValueChange).toHaveBeenCalledTimes(1);

    fireEvent.blur(hue);
    expect(hue.value).toBe("217");
  });

  test("uses OKLCH input instead of HSB input", () => {
    const handleValueChange = mock();
    render(
      <InputColorPicker
        defaultFormat="oklch"
        defaultValue="#3b82f6"
        onValueChange={handleValueChange}
      />,
    );

    const lightness = screen.getByLabelText(
      "OKLCH lightness percentage (0-100)",
    ) as HTMLInputElement;
    const hue = screen.getByLabelText(
      "OKLCH hue degree (0-360)",
    ) as HTMLInputElement;

    expect(screen.queryByLabelText("Brightness percentage (0-100)")).toBeNull();
    expect(lightness.value).toBe("62");
    expect(hue.value).toBe("260");
    expect(lightness.parentElement?.className).toContain("w-12");
    expect(hue.parentElement?.className).toContain("w-12");
    expect(screen.getByText("°").textContent).toBe("°");
    expect(screen.getAllByText("%")).toHaveLength(2);

    fireEvent.change(hue, { target: { value: "180" } });
    expect(handleValueChange).toHaveBeenCalledTimes(1);
    expect(handleValueChange.mock.calls[0]?.[0]).toMatch(
      /^oklch\([\d.]+% [\d.]+% [\d.]+deg\)$/,
    );
  });

  test("keeps focused OKLCH hue drafts from being overwritten by derived values", () => {
    const handleValueChange = mock();
    render(
      <InputColorPicker
        defaultFormat="oklch"
        defaultValue="#3b82f6"
        onValueChange={handleValueChange}
      />,
    );

    const hue = screen.getByLabelText(
      "OKLCH hue degree (0-360)",
    ) as HTMLInputElement;

    fireEvent.focus(hue);
    fireEvent.change(hue, { target: { value: "3" } });

    expect(hue.value).toBe("3");
    expect(handleValueChange).toHaveBeenCalledTimes(1);

    fireEvent.blur(hue);
    expect(hue.value).toBe("3");
  });

  test("shortens the selected OKLCH format label", () => {
    render(<FormatSelectColorPicker defaultFormat="oklch" />);

    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain("LCH");
    expect(trigger.textContent).not.toContain("OKLCH");
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

  test("preserves hue when OKLCH output round-trips through controlled hex", () => {
    const { container } = render(<ControlledOklchAreaColorPicker />);
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
      clientX: 10,
      clientY: 25,
      pointerId: 1,
    });

    expect(screen.getByLabelText("Color value").textContent).toBe("#acb3bf");
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
  defaultFormat = "hex",
  defaultValue = "#112233",
  onValueChange,
}: {
  defaultFormat?: "hex" | "rgb" | "hsl" | "oklch";
  defaultValue?: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <ColorPicker
      defaultFormat={defaultFormat}
      defaultValue={defaultValue}
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

function ExternallyControlledColorPicker() {
  const [value, setValue] = React.useState("#112233");

  return (
    <>
      <button type="button" onClick={() => setValue("#112234")}>
        Set close color
      </button>
      <ColorPicker value={value} inline onValueChange={setValue}>
        <ColorPickerContent>
          <ColorPickerStateReadout />
        </ColorPickerContent>
      </ColorPicker>
    </>
  );
}

function ControlledOklchAreaColorPicker() {
  const [value, setValue] = React.useState("#3b82f6");

  return (
    <ColorPicker
      value={value}
      format="oklch"
      inline
      onValueChange={(nextValue) => {
        const nextHex = oklchStringToHex(nextValue);
        if (nextHex) {
          setValue(nextHex);
        }
      }}
    >
      <ColorPickerContent>
        <ColorPickerArea />
        <ColorPickerStateReadout />
      </ColorPickerContent>
    </ColorPicker>
  );
}

function oklchStringToHex(value: string) {
  const match = value.match(
    /^oklch\(\s*([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)deg(?:\s*\/\s*[\d.]+)?\s*\)$/,
  );
  if (!match) {
    return null;
  }

  const color: Oklch = {
    mode: "oklch",
    l: Number.parseFloat(match[1] ?? "0") / 100,
    c: (Number.parseFloat(match[2] ?? "0") * 0.4) / 100,
    h: Number.parseFloat(match[3] ?? "0"),
  };
  return formatHex(clampChroma(color, "oklch"));
}

function FormatSelectColorPicker({
  defaultFormat,
}: {
  defaultFormat: "hex" | "rgb" | "hsl" | "oklch";
}) {
  return (
    <ColorPicker defaultFormat={defaultFormat} defaultValue="#3b82f6" inline>
      <ColorPickerContent>
        <ColorPickerFormatSelect />
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
