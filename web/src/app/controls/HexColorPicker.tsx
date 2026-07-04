import { type ComponentProps, type CSSProperties, useEffect, useState } from "react";
import { clampChroma, formatHex, type Oklch } from "culori";

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

import {
  type ColorPickerId,
  useOptionalColorPickerRegistry,
} from "../colorPickerRegistry";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";

type ColorFormat = "hex" | "rgb" | "hsl" | "oklch";

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
  pickerId,
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
  pickerId?: ColorPickerId;
  side?: ComponentProps<typeof ColorPickerContent>["side"];
  sideOffset?: ComponentProps<typeof ColorPickerContent>["sideOffset"];
  swatchClassName?: string;
  swatchStyle?: CSSProperties;
  triggerClassName?: string;
  value: string;
}) {
  const [format, setFormat] = useState<ColorFormat>("hex");
  const colorPickerRegistry = useOptionalColorPickerRegistry();
  const hexValue = normalizeHexColor(value, fallbackValue);
  const closeColorPicker = colorPickerRegistry?.closeColorPicker;
  const isGloballyControlled = pickerId !== undefined;
  const resolvedOpen = isGloballyControlled
    ? colorPickerRegistry?.activeColorPickerId === pickerId
    : open;

  if (isGloballyControlled && !colorPickerRegistry) {
    throw new Error("HexColorPicker with pickerId must be rendered inside ColorPickerRegistryProvider");
  }

  useEffect(() => {
    if (!pickerId || !closeColorPicker) {
      return;
    }

    return () => closeColorPicker(pickerId);
  }, [closeColorPicker, pickerId]);

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
      onOpenChange={(nextOpen) => {
        if (pickerId) {
          colorPickerRegistry?.setColorPickerOpen(pickerId, nextOpen);
        }
        onOpenChange?.(nextOpen);
      }}
      onValueChange={handleValueChange}
      open={resolvedOpen}
      value={hexValue}
    >
      <ColorPickerTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          data-color-picker-trigger=""
          className={cn(
            "inline-flex size-[18px] shrink-0 items-center justify-center rounded-md bg-transparent p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            triggerClassName,
          )}
          onClick={(event) => {
            if (resolvedOpen === undefined) {
              return;
            }

            event.preventDefault();
            if (pickerId) {
              colorPickerRegistry?.setColorPickerOpen(pickerId, !resolvedOpen);
            }
            onOpenChange?.(!resolvedOpen);
          }}
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
          "w-[15.5rem] gap-2.5 rounded-xl p-2.5 duration-0",
          contentClassName,
        )}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (isColorPickerTriggerEvent(event)) {
            event.preventDefault();
          }
        }}
        onFocusOutside={(event) => {
          if (isColorPickerTriggerEvent(event)) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isColorPickerTriggerEvent(event)) {
            event.preventDefault();
          }
        }}
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
            contentClassName="!bg-background !text-foreground data-[state=closed]:!animate-none data-[state=open]:!animate-none"
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

function isColorPickerTriggerEvent(event: Event) {
  return (
    event.target instanceof Element &&
    event.target.closest("[data-color-picker-trigger]") !== null
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

  const oklchMatch = color.match(
    /^oklch\(\s*([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+)?\s*\)$/,
  );
  if (oklchMatch) {
    return oklchToHex(
      Number.parseFloat(oklchMatch[1] ?? "0"),
      Number.parseFloat(oklchMatch[2] ?? "0"),
      Number.parseFloat(oklchMatch[3] ?? "0"),
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

function oklchToHex(l: number, c: number, h: number) {
  const color: Oklch = {
    mode: "oklch",
    l: clamp(l, 0, 100) / 100,
    c: (clamp(c, 0, 100) * 0.4) / 100,
    h: normalizeHue(h),
  };
  return formatHex(clampChroma(color, "oklch"));
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
