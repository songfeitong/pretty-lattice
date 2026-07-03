import { type ComponentProps, type CSSProperties, useState } from "react";

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerTrigger,
} from "@/components/ui/color-picker";
import { cn } from "@/lib/utils";

import { TOOL_ICON_BUTTON_CLASS } from "../surface";

type ColorFormat = "hex" | "rgb" | "hsl" | "hsb";

const DEFAULT_HEX_COLOR = "#808080";
const HEX_COLOR_PATTERN = /^#[\da-fA-F]{6}$/;
const SHORT_HEX_COLOR_PATTERN = /^#[\da-fA-F]{3}$/;

export function HexColorPicker({
  align = "center",
  ariaLabel,
  contentClassName,
  fallbackValue = DEFAULT_HEX_COLOR,
  inputLabel,
  onOpenChange,
  onValueChange,
  open,
  side = "top",
  sideOffset = 8,
  swatchClassName,
  swatchStyle,
  triggerClassName,
  value,
}: {
  align?: ComponentProps<typeof ColorPickerContent>["align"];
  ariaLabel: string;
  contentClassName?: string;
  fallbackValue?: string;
  inputLabel: string;
  onOpenChange?: (open: boolean) => void;
  onValueChange: (value: string) => void;
  open?: boolean;
  side?: ComponentProps<typeof ColorPickerContent>["side"];
  sideOffset?: ComponentProps<typeof ColorPickerContent>["sideOffset"];
  swatchClassName?: string;
  swatchStyle?: CSSProperties;
  triggerClassName?: string;
  value: string;
}) {
  const [format, setFormat] = useState<ColorFormat>("hex");
  const hexValue = normalizeHexColor(value, fallbackValue);

  function handleValueChange(nextValue: string) {
    const nextHex = colorStringToHex(nextValue);
    if (nextHex && nextHex !== hexValue) {
      onValueChange(nextHex);
    }
  }

  return (
    <ColorPicker
      className="inline-flex size-[18px] shrink-0 items-center justify-center leading-none"
      defaultFormat="hex"
      format={format}
      onFormatChange={setFormat}
      onOpenChange={onOpenChange}
      onValueChange={handleValueChange}
      open={open}
      value={hexValue}
    >
      <ColorPickerTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex size-[18px] shrink-0 items-center justify-center rounded-md bg-transparent p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            triggerClassName,
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-[18px] shrink-0 rounded-md border border-foreground/10 shadow-sm",
              swatchClassName,
            )}
            style={{ background: hexValue, ...swatchStyle }}
          />
        </button>
      </ColorPickerTrigger>
      <ColorPickerContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "w-[14.5rem] gap-2.5 rounded-xl p-2.5 duration-0",
          contentClassName,
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <ColorPickerArea className="h-40 rounded-xl" />
        <div className="flex items-center gap-2">
          <ColorPickerEyeDropper
            aria-label="Pick color from screen"
            className={cn(TOOL_ICON_BUTTON_CLASS, "border-input")}
          />
          <ColorPickerHueSlider className="flex-1" />
        </div>
        <div className="flex items-center gap-2">
          <ColorPickerFormatSelect
            className="!h-6 w-[4.5rem] !px-2 !py-0 text-[13px]"
            contentClassName="!bg-background !text-foreground"
            itemClassName="min-h-6 py-0.5 text-[13px]"
          />
          <ColorPickerInput
            withoutAlpha
            aria-label={inputLabel}
            className="min-w-0 flex-1"
          />
        </div>
      </ColorPickerContent>
    </ColorPicker>
  );
}

export function normalizeHexColor(value: string, fallbackValue = DEFAULT_HEX_COLOR) {
  if (HEX_COLOR_PATTERN.test(value)) {
    return value.toLowerCase();
  }
  if (SHORT_HEX_COLOR_PATTERN.test(value)) {
    return expandShortHex(value);
  }
  if (HEX_COLOR_PATTERN.test(fallbackValue)) {
    return fallbackValue.toLowerCase();
  }
  return DEFAULT_HEX_COLOR;
}

function colorStringToHex(value: string) {
  const color = value.trim().toLowerCase();
  if (HEX_COLOR_PATTERN.test(color)) {
    return color;
  }
  if (SHORT_HEX_COLOR_PATTERN.test(color)) {
    return expandShortHex(color);
  }

  const rgbMatch = color.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/,
  );
  if (rgbMatch) {
    return rgbToHex(
      Number.parseFloat(rgbMatch[1] ?? "0"),
      Number.parseFloat(rgbMatch[2] ?? "0"),
      Number.parseFloat(rgbMatch[3] ?? "0"),
    );
  }

  const hslMatch = color.match(
    /^hsla?\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/,
  );
  if (hslMatch) {
    return hslToHex(
      Number.parseFloat(hslMatch[1] ?? "0"),
      Number.parseFloat(hslMatch[2] ?? "0"),
      Number.parseFloat(hslMatch[3] ?? "0"),
    );
  }

  const hsbMatch = color.match(
    /^hsba?\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*[\d.]+)?\s*\)$/,
  );
  if (hsbMatch) {
    return hsbToHex(
      Number.parseFloat(hsbMatch[1] ?? "0"),
      Number.parseFloat(hsbMatch[2] ?? "0"),
      Number.parseFloat(hsbMatch[3] ?? "0"),
    );
  }

  return null;
}

function expandShortHex(value: string) {
  const [, r = "0", g = "0", b = "0"] = value.toLowerCase();
  return `#${r}${r}${g}${g}${b}${b}`;
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${hexChannel(r)}${hexChannel(g)}${hexChannel(b)}`;
}

function hslToHex(h: number, s: number, l: number) {
  const hue = normalizeHue(h);
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = lightness - chroma / 2;

  const [r, g, b] = hueToRgbChannels(hue, chroma, x);
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function hsbToHex(h: number, s: number, b: number) {
  const hue = normalizeHue(h);
  const saturation = clamp(s, 0, 100) / 100;
  const brightness = clamp(b, 0, 100) / 100;
  const chroma = brightness * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = brightness - chroma;

  const [r, g, blue] = hueToRgbChannels(hue, chroma, x);
  return rgbToHex((r + m) * 255, (g + m) * 255, (blue + m) * 255);
}

function hueToRgbChannels(hue: number, chroma: number, x: number): [number, number, number] {
  if (hue < 60) return [chroma, x, 0];
  if (hue < 120) return [x, chroma, 0];
  if (hue < 180) return [0, chroma, x];
  if (hue < 240) return [0, x, chroma];
  if (hue < 300) return [x, 0, chroma];
  return [chroma, 0, x];
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function hexChannel(value: number) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
