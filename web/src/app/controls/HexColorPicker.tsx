import { type ComponentProps, type CSSProperties, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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
import {
  normalizeHexColor,
  parseColorToHex,
  type ColorFormat,
} from "@/components/ui/color-picker/colorModel";
import { cn } from "@/lib/utils";

import {
  type ColorPickerId,
  useOptionalColorPickerRegistry,
} from "../colorPickerRegistry";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";

const DEFAULT_HEX_COLOR = "#808080";

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
  const { t } = useTranslation();
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
    const nextHex = parseColorToHex(nextValue);
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
            "inline-flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-md bg-transparent p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
            aria-label={t("colorPicker.pickFromScreen")}
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

export { normalizeHexColor };
