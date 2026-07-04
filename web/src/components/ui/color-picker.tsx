"use client";

import { cva, type VariantProps } from "class-variance-authority";
import {
  clampChroma,
  converter,
  type Oklch,
  type Rgb,
} from "culori";
import { PipetteIcon } from "lucide-react";
import {
  Direction as DirectionPrimitive,
  Slider as SliderPrimitive,
  Slot as SlotPrimitive,
} from "radix-ui";
import * as React from "react";
import { useComposedRefs } from "@/lib/compose-refs";
import { cn } from "@/lib/utils";
import { VisuallyHiddenInput } from "@/components/visually-hidden-input";
import { useAsRef } from "@/hooks/use-as-ref";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { useLazyRef } from "@/hooks/use-lazy-ref";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROOT_NAME = "ColorPicker";
const ROOT_IMPL_NAME = "ColorPickerImpl";
const TRIGGER_NAME = "ColorPickerTrigger";
const CONTENT_NAME = "ColorPickerContent";
const AREA_NAME = "ColorPickerArea";
const HUE_SLIDER_NAME = "ColorPickerHueSlider";
const ALPHA_SLIDER_NAME = "ColorPickerAlphaSlider";
const SWATCH_NAME = "ColorPickerSwatch";
const EYE_DROPPER_NAME = "ColorPickerEyeDropper";
const FORMAT_SELECT_NAME = "ColorPickerFormatSelect";
const INPUT_NAME = "ColorPickerInput";

const colorFormats = ["hex", "rgb", "hsl", "oklch"] as const;

const OKLCH_CHROMA_PERCENT_SCALE = 0.4;
const convertToOklch = converter("oklch");
const convertToRgb = converter("rgb");
const CHANNEL_INPUT_CLASS = "w-12";

function getFormatMenuLabel(format: ColorFormat) {
  return format === "oklch" ? "OKLCH" : format.toUpperCase();
}

function getFormatTriggerLabel(format: ColorFormat) {
  return format === "oklch" ? "LCH" : getFormatMenuLabel(format);
}

interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean;
}

type RootElement = React.ComponentRef<typeof ColorPicker>;
type AreaElement = React.ComponentRef<typeof ColorPickerArea>;
type InputElement = React.ComponentRef<typeof ColorPickerInput>;

type ColorFormat = (typeof colorFormats)[number];

/**
 * @see https://gist.github.com/bkrmendy/f4582173f50fab209ddfef1377ab31e3
 */
interface EyeDropper {
  open: (options?: { signal?: AbortSignal }) => Promise<{ sRGBHex: string }>;
}

declare global {
  interface Window {
    EyeDropper?: {
      new (): EyeDropper;
    };
  }
}

interface ColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface HSVColorValue {
  h: number;
  s: number;
  v: number;
  a: number;
}

function isSameColorValue(left: ColorValue, right: ColorValue) {
  return (
    left.r === right.r &&
    left.g === right.g &&
    left.b === right.b &&
    left.a === right.a
  );
}

function isSameHsvColorValue(left: HSVColorValue, right: HSVColorValue) {
  return (
    left.h === right.h &&
    left.s === right.s &&
    left.v === right.v &&
    left.a === right.a
  );
}

function hexToRgb(hex: string, alpha?: number): ColorValue {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: Number.parseInt(result[1] ?? "0", 16),
        g: Number.parseInt(result[2] ?? "0", 16),
        b: Number.parseInt(result[3] ?? "0", 16),
        a: alpha ?? 1,
      }
    : { r: 0, g: 0, b: 0, a: alpha ?? 1 };
}

function rgbToHex(color: ColorValue): string {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

function rgbToHsv(color: ColorValue): HSVColorValue {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  if (diff !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / diff) % 6;
        break;
      case g:
        h = (b - r) / diff + 2;
        break;
      case b:
        h = (r - g) / diff + 4;
        break;
    }
  }
  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : diff / max;
  const v = max;

  return {
    h,
    s: Math.round(s * 100),
    v: Math.round(v * 100),
    a: color.a,
  };
}

function hsvToRgb(hsv: HSVColorValue): ColorValue {
  const h = hsv.h / 360;
  const s = hsv.s / 100;
  const v = hsv.v / 100;

  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);

  let r: number;
  let g: number;
  let b: number;

  switch (i % 6) {
    case 0: {
      r = v;
      g = t;
      b = p;
      break;
    }
    case 1: {
      r = q;
      g = v;
      b = p;
      break;
    }
    case 2: {
      r = p;
      g = v;
      b = t;
      break;
    }
    case 3: {
      r = p;
      g = q;
      b = v;
      break;
    }
    case 4: {
      r = t;
      g = p;
      b = v;
      break;
    }
    case 5: {
      r = v;
      g = p;
      b = q;
      break;
    }
    default: {
      r = 0;
      g = 0;
      b = 0;
    }
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
    a: hsv.a,
  };
}

function colorToString(color: ColorValue, format: ColorFormat = "hex"): string {
  switch (format) {
    case "hex":
      return rgbToHex(color);
    case "rgb":
      return color.a < 1
        ? `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`
        : `rgb(${color.r}, ${color.g}, ${color.b})`;
    case "hsl": {
      const hsl = rgbToHsl(color);
      return color.a < 1
        ? `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${color.a})`
        : `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    }
    case "oklch": {
      const oklch = rgbToOklchCssChannels(color);
      return color.a < 1
        ? `oklch(${formatOklchNumber(oklch.l)}% ${formatOklchNumber(
            oklch.c,
          )}% ${formatOklchNumber(oklch.h)}deg / ${color.a})`
        : `oklch(${formatOklchNumber(oklch.l)}% ${formatOklchNumber(
            oklch.c,
          )}% ${formatOklchNumber(oklch.h)}deg)`;
    }
    default:
      return rgbToHex(color);
  }
}

function rgbToHsl(color: ColorValue) {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  const sum = max + min;

  const l = sum / 2;

  let h = 0;
  let s = 0;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - sum) : diff / sum;

    if (max === r) {
      h = (g - b) / diff + (g < b ? 6 : 0);
    } else if (max === g) {
      h = (b - r) / diff + 2;
    } else if (max === b) {
      h = (r - g) / diff + 4;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(
  hsl: { h: number; s: number; l: number },
  alpha = 1,
): ColorValue {
  const h = normalizeHue(hsl.h) / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h >= 0 && h < 1 / 6) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 1 / 6 && h < 2 / 6) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 2 / 6 && h < 3 / 6) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 3 / 6 && h < 4 / 6) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 4 / 6 && h < 5 / 6) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 5 / 6 && h < 1) {
    r = c;
    g = 0;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a: alpha,
  };
}

interface OklchChannelValue {
  c: number;
  h: number;
  l: number;
}

function rgbToOklchChannels(color: ColorValue): OklchChannelValue {
  const oklch = rgbToOklchCssChannels(color);

  return {
    l: Math.round(oklch.l),
    c: Math.round(oklch.c),
    h: Math.round(oklch.h),
  };
}

function rgbToOklchCssChannels(color: ColorValue): OklchChannelValue {
  const oklch = convertToOklch(colorValueToCuloriRgb(color));

  return {
    l: clamp(oklch.l, 0, 1) * 100,
    c: clamp(oklch.c / OKLCH_CHROMA_PERCENT_SCALE, 0, 1) * 100,
    h: normalizeHue(oklch.h ?? 0),
  };
}

function formatOklchNumber(value: number) {
  return Number.parseFloat(value.toFixed(4)).toString();
}

function oklchChannelsToRgb(
  channels: OklchChannelValue,
  alpha = 1,
): ColorValue {
  const oklch: Oklch = {
    mode: "oklch",
    l: clamp(channels.l, 0, 100) / 100,
    c:
      (clamp(channels.c, 0, 100) * OKLCH_CHROMA_PERCENT_SCALE) /
      100,
    h: normalizeHue(channels.h),
    alpha,
  };
  const clamped = clampChroma(oklch, "oklch");
  return culoriRgbToColorValue(convertToRgb(clamped), alpha);
}

function colorValueToCuloriRgb(color: ColorValue): Rgb {
  return {
    mode: "rgb",
    r: clamp(color.r, 0, 255) / 255,
    g: clamp(color.g, 0, 255) / 255,
    b: clamp(color.b, 0, 255) / 255,
    alpha: color.a,
  };
}

function culoriRgbToColorValue(color: Rgb, alpha = 1): ColorValue {
  return {
    r: Math.round(clamp(color.r, 0, 1) * 255),
    g: Math.round(clamp(color.g, 0, 1) * 255),
    b: Math.round(clamp(color.b, 0, 1) * 255),
    a: color.alpha ?? alpha,
  };
}

function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseColorString(value: string): ColorValue | null {
  const trimmed = value.trim();

  // Parse hex colors
  if (trimmed.startsWith("#")) {
    const hexMatch = trimmed.match(/^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/);
    if (hexMatch) {
      const hex = hexMatch[1] ?? "000000";
      const normalizedHex =
        hex.length === 3
          ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
          : `#${hex}`;
      return hexToRgb(normalizedHex);
    }
  }

  // Parse rgb/rgba colors
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/,
  );
  if (rgbMatch) {
    return {
      r: Number.parseInt(rgbMatch[1] ?? "0", 10),
      g: Number.parseInt(rgbMatch[2] ?? "0", 10),
      b: Number.parseInt(rgbMatch[3] ?? "0", 10),
      a: rgbMatch[4] ? Number.parseFloat(rgbMatch[4]) : 1,
    };
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*(?:,\s*([\d.]+))?\s*\)$/,
  );
  if (hslMatch) {
    const h = Number.parseInt(hslMatch[1] ?? "0", 10);
    const s = Number.parseInt(hslMatch[2] ?? "0", 10);
    const l = Number.parseInt(hslMatch[3] ?? "0", 10);
    const a = hslMatch[4] ? Number.parseFloat(hslMatch[4]) : 1;
    return hslToRgb({ h, s, l }, a);
  }

  const oklchMatch = trimmed.match(
    /^oklch\(\s*([+-]?\d*\.?\d+)%\s+([+-]?\d*\.?\d+)%\s+([+-]?\d*\.?\d+)(?:deg)?(?:\s*\/\s*([\d.]+))?\s*\)$/i,
  );
  if (oklchMatch) {
    const l = Number.parseFloat(oklchMatch[1] ?? "0");
    const c = Number.parseFloat(oklchMatch[2] ?? "0");
    const h = Number.parseFloat(oklchMatch[3] ?? "0");
    const a = oklchMatch[4] ? Number.parseFloat(oklchMatch[4]) : 1;

    return oklchChannelsToRgb({ l, c, h }, a);
  }

  return null;
}

type Direction = "ltr" | "rtl";

interface StoreState {
  color: ColorValue;
  hsv: HSVColorValue;
  open: boolean;
  format: ColorFormat;
}

interface Store {
  consumeControlledColorEcho: (value: ColorValue) => boolean;
  subscribe: (cb: () => void) => () => void;
  getState: () => StoreState;
  setColor: (value: ColorValue, options?: { emit?: boolean }) => void;
  setColorAndHsv: (
    color: ColorValue,
    hsv: HSVColorValue,
    options?: { emit?: boolean },
  ) => void;
  setHsv: (value: HSVColorValue, options?: { emit?: boolean }) => void;
  setOpen: (value: boolean, options?: { emit?: boolean }) => void;
  setFormat: (value: ColorFormat) => void;
  notify: () => void;
}

const StoreContext = React.createContext<Store | null>(null);

function useStoreContext(consumerName: string) {
  const context = React.useContext(StoreContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

function useStore<U>(selector: (state: StoreState) => U): U {
  const store = useStoreContext("useStore");

  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector],
  );

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

interface ColorPickerContextValue {
  dir: Direction;
  disabled?: boolean;
  inline?: boolean;
  readOnly?: boolean;
  required?: boolean;
}

const ColorPickerContext = React.createContext<ColorPickerContextValue | null>(
  null,
);

function useColorPickerContext(consumerName: string) {
  const context = React.useContext(ColorPickerContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

interface ColorPickerProps
  extends Omit<DivProps, "onValueChange">,
    Pick<
      React.ComponentProps<typeof Popover>,
      "defaultOpen" | "open" | "onOpenChange" | "modal"
    > {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  dir?: Direction;
  format?: ColorFormat;
  defaultFormat?: ColorFormat;
  onFormatChange?: (format: ColorFormat) => void;
  name?: string;
  asChild?: boolean;
  disabled?: boolean;
  inline?: boolean;
  readOnly?: boolean;
  required?: boolean;
}

function ColorPicker(props: ColorPickerProps) {
  const {
    value: valueProp,
    defaultValue = "#000000",
    onValueChange,
    format: formatProp,
    defaultFormat = "hex",
    onFormatChange,
    defaultOpen,
    open: openProp,
    onOpenChange,
    name,
    disabled,
    inline,
    readOnly,
    required,
    ...rootProps
  } = props;

  const listenersRef = useLazyRef(() => new Set<() => void>());
  const stateRef = useLazyRef<StoreState>(() => {
    const colorString = valueProp ?? defaultValue;
    const color = hexToRgb(colorString);

    return {
      color,
      hsv: rgbToHsv(color),
      open: openProp ?? defaultOpen ?? false,
      format: formatProp ?? defaultFormat,
    };
  });
  const pendingControlledColorEchoRef = useLazyRef<ColorValue | null>(() => null);

  const propsRef = useAsRef({
    onValueChange,
    onOpenChange,
    onFormatChange,
  });

  const store = React.useMemo<Store>(() => {
    return {
      subscribe: (cb) => {
        listenersRef.current.add(cb);
        return () => listenersRef.current.delete(cb);
      },
      consumeControlledColorEcho: (value: ColorValue) => {
        const pendingEcho = pendingControlledColorEchoRef.current;
        pendingControlledColorEchoRef.current = null;
        return pendingEcho ? isSameColorValue(pendingEcho, value) : false;
      },
      getState: () => stateRef.current,
      setColor: (value: ColorValue, options?: { emit?: boolean }) => {
        if (isSameColorValue(stateRef.current.color, value)) return;

        const prevState = { ...stateRef.current };
        stateRef.current.color = value;

        if (options?.emit !== false && propsRef.current.onValueChange) {
          const colorString = colorToString(value, prevState.format);
          pendingControlledColorEchoRef.current =
            parseColorString(colorString) ?? value;
          propsRef.current.onValueChange(colorString);
        }

        store.notify();
      },
      setColorAndHsv: (
        color: ColorValue,
        hsv: HSVColorValue,
        options?: { emit?: boolean },
      ) => {
        if (
          isSameColorValue(stateRef.current.color, color) &&
          isSameHsvColorValue(stateRef.current.hsv, hsv)
        ) {
          return;
        }

        const prevState = { ...stateRef.current };
        stateRef.current.color = color;
        stateRef.current.hsv = hsv;

        if (options?.emit !== false && propsRef.current.onValueChange) {
          const colorString = colorToString(color, prevState.format);
          pendingControlledColorEchoRef.current =
            parseColorString(colorString) ?? color;
          propsRef.current.onValueChange(colorString);
        }

        store.notify();
      },
      setHsv: (value: HSVColorValue, options?: { emit?: boolean }) => {
        if (isSameHsvColorValue(stateRef.current.hsv, value)) return;

        const prevState = { ...stateRef.current };
        stateRef.current.hsv = value;

        if (options?.emit !== false && propsRef.current.onValueChange) {
          const colorValue = hsvToRgb(value);
          const colorString = colorToString(colorValue, prevState.format);
          pendingControlledColorEchoRef.current =
            parseColorString(colorString) ?? colorValue;
          propsRef.current.onValueChange(colorString);
        }

        store.notify();
      },
      setOpen: (value: boolean, options?: { emit?: boolean }) => {
        if (Object.is(stateRef.current.open, value)) return;

        stateRef.current.open = value;

        if (options?.emit !== false && propsRef.current.onOpenChange) {
          propsRef.current.onOpenChange(value);
        }

        store.notify();
      },
      setFormat: (value: ColorFormat) => {
        if (Object.is(stateRef.current.format, value)) return;

        stateRef.current.format = value;

        if (propsRef.current.onFormatChange) {
          propsRef.current.onFormatChange(value);
        }

        store.notify();
      },
      notify: () => {
        for (const cb of listenersRef.current) {
          cb();
        }
      },
    };
  }, [listenersRef, pendingControlledColorEchoRef, stateRef, propsRef]);

  return (
    <StoreContext.Provider value={store}>
      <ColorPickerImpl
        {...rootProps}
        value={valueProp}
        defaultOpen={defaultOpen}
        open={openProp}
        name={name}
        disabled={disabled}
        inline={inline}
        readOnly={readOnly}
        required={required}
      />
    </StoreContext.Provider>
  );
}

interface ColorPickerImplProps
  extends Omit<
    ColorPickerProps,
    | "defaultValue"
    | "onValueChange"
    | "onOpenChange"
    | "format"
    | "defaultFormat"
    | "onFormatChange"
  > {}

function ColorPickerImpl(props: ColorPickerImplProps) {
  const {
    value: valueProp,
    dir: dirProp,
    defaultOpen,
    open: openProp,
    name,
    ref,
    asChild,
    disabled,
    inline,
    modal,
    readOnly,
    required,
    ...rootProps
  } = props;

  const store = useStoreContext(ROOT_IMPL_NAME);

  const dir = DirectionPrimitive.useDirection(dirProp);

  const [formTrigger, setFormTrigger] = React.useState<RootElement | null>(
    null,
  );
  const composedRef = useComposedRefs(ref, (node) => setFormTrigger(node));
  const isFormControl = formTrigger ? !!formTrigger.closest("form") : true;

  useIsomorphicLayoutEffect(() => {
    if (valueProp !== undefined) {
      const currentState = store.getState();
      const color = hexToRgb(valueProp, currentState.color.a);
      if (store.consumeControlledColorEcho(color)) {
        return;
      }

      if (isSameColorValue(currentState.color, color)) {
        return;
      }

      const hsv = rgbToHsv(color);
      store.setColorAndHsv(color, hsv, { emit: false });
    }
  }, [valueProp]);

  useIsomorphicLayoutEffect(() => {
    if (openProp !== undefined) {
      store.setOpen(openProp, { emit: false });
    }
  }, [openProp]);

  const contextValue = React.useMemo<ColorPickerContextValue>(
    () => ({
      dir,
      disabled,
      inline,
      readOnly,
      required,
    }),
    [dir, disabled, inline, readOnly, required],
  );

  const value = useStore((state) => rgbToHex(state.color));
  const open = useStore((state) => state.open);

  const RootPrimitive = asChild ? SlotPrimitive.Slot : "div";

  if (inline) {
    return (
      <ColorPickerContext.Provider value={contextValue}>
        <RootPrimitive {...rootProps} ref={composedRef} />
        {isFormControl && (
          <VisuallyHiddenInput
            type="hidden"
            control={formTrigger}
            name={name}
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
          />
        )}
      </ColorPickerContext.Provider>
    );
  }

  return (
    <ColorPickerContext.Provider value={contextValue}>
      <Popover
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={store.setOpen}
        modal={modal}
      >
        <RootPrimitive {...rootProps} ref={composedRef} />
        {isFormControl && (
          <VisuallyHiddenInput
            type="hidden"
            control={formTrigger}
            name={name}
            value={value}
            disabled={disabled}
            readOnly={readOnly}
            required={required}
          />
        )}
      </Popover>
    </ColorPickerContext.Provider>
  );
}

function ColorPickerTrigger(
  props: React.ComponentProps<typeof PopoverTrigger>,
) {
  const { asChild, disabled, ...triggerProps } = props;

  const context = useColorPickerContext(TRIGGER_NAME);

  const isDisabled = disabled || context.disabled;

  const TriggerPrimitive = asChild ? SlotPrimitive.Slot : Button;

  return (
    <PopoverTrigger asChild disabled={isDisabled}>
      <TriggerPrimitive data-slot="color-picker-trigger" {...triggerProps} />
    </PopoverTrigger>
  );
}

function ColorPickerContent(
  props: React.ComponentProps<typeof PopoverContent>,
) {
  const { asChild, className, children, ...popoverContentProps } = props;

  const context = useColorPickerContext(CONTENT_NAME);

  if (context.inline) {
    const ContentPrimitive = asChild ? SlotPrimitive.Slot : "div";

    return (
      <ContentPrimitive
        data-slot="color-picker-content"
        {...popoverContentProps}
        className={cn("flex w-[340px] flex-col gap-4 p-4", className)}
      >
        {children}
      </ContentPrimitive>
    );
  }

  return (
    <PopoverContent
      data-slot="color-picker-content"
      asChild={asChild}
      {...popoverContentProps}
      className={cn("flex w-[340px] flex-col gap-4 p-4", className)}
    >
      {children}
    </PopoverContent>
  );
}

function ColorPickerArea(props: DivProps) {
  const {
    asChild,
    onPointerDown: onPointerDownProp,
    onPointerMove: onPointerMoveProp,
    onPointerUp: onPointerUpProp,
    className,
    ref,
    ...areaProps
  } = props;

  const propsRef = useAsRef({
    onPointerDown: onPointerDownProp,
    onPointerMove: onPointerMoveProp,
    onPointerUp: onPointerUpProp,
  });

  const context = useColorPickerContext(AREA_NAME);
  const store = useStoreContext(AREA_NAME);

  const hsv = useStore((state) => state.hsv);

  const isDraggingRef = React.useRef(false);
  const areaRef = React.useRef<HTMLDivElement>(null);
  const composedRef = useComposedRefs(ref, areaRef);

  const updateColorFromPosition = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!areaRef.current) return;

      const rect = areaRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(
        0,
        Math.min(1, 1 - (clientY - rect.top) / rect.height),
      );

      const newHsv: HSVColorValue = {
        h: hsv?.h ?? 0,
        s: Math.round(x * 100),
        v: Math.round(y * 100),
        a: hsv?.a ?? 1,
      };

      store.setColorAndHsv(hsvToRgb(newHsv), newHsv);
    },
    [hsv, store],
  );

  const onPointerDown = React.useCallback(
    (event: React.PointerEvent<AreaElement>) => {
      if (context.disabled) return;
      propsRef.current.onPointerDown?.(event);
      if (event.defaultPrevented) return;

      isDraggingRef.current = true;
      areaRef.current?.setPointerCapture(event.pointerId);
      updateColorFromPosition(event.clientX, event.clientY);
    },
    [context.disabled, updateColorFromPosition, propsRef],
  );

  const onPointerMove = React.useCallback(
    (event: React.PointerEvent<AreaElement>) => {
      propsRef.current.onPointerMove?.(event);
      if (event.defaultPrevented) return;

      if (isDraggingRef.current) {
        updateColorFromPosition(event.clientX, event.clientY);
      }
    },
    [updateColorFromPosition, propsRef],
  );

  const onPointerUp = React.useCallback(
    (event: React.PointerEvent<AreaElement>) => {
      propsRef.current.onPointerUp?.(event);
      if (event.defaultPrevented) return;

      isDraggingRef.current = false;
      areaRef.current?.releasePointerCapture(event.pointerId);
    },
    [propsRef],
  );

  const hue = hsv?.h ?? 0;
  const backgroundHue = hsvToRgb({ h: hue, s: 100, v: 100, a: 1 });

  const AreaPrimitive = asChild ? SlotPrimitive.Slot : "div";

  return (
    <AreaPrimitive
      data-slot="color-picker-area"
      {...areaProps}
      className={cn(
        "relative h-40 w-full cursor-crosshair touch-none rounded-sm border",
        context.disabled && "pointer-events-none opacity-50",
        className,
      )}
      ref={composedRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <div className="absolute inset-0 overflow-hidden rounded-[inherit]">
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: `rgb(${backgroundHue.r}, ${backgroundHue.g}, ${backgroundHue.b})`,
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to right, #fff, transparent)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, transparent, #000)",
          }}
        />
      </div>
      <div
        className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
        style={{
          left: `${hsv?.s ?? 0}%`,
          top: `${100 - (hsv?.v ?? 0)}%`,
        }}
      />
    </AreaPrimitive>
  );
}

function ColorPickerHueSlider(
  props: React.ComponentProps<typeof SliderPrimitive.Root>,
) {
  const { className, ...sliderProps } = props;

  const context = useColorPickerContext(HUE_SLIDER_NAME);
  const store = useStoreContext(HUE_SLIDER_NAME);

  const hsv = useStore((state) => state.hsv);

  const onValueChange = React.useCallback(
    (values: number[]) => {
      const newHsv: HSVColorValue = {
        h: values[0] ?? 0,
        s: hsv?.s ?? 0,
        v: hsv?.v ?? 0,
        a: hsv?.a ?? 1,
      };
      store.setColorAndHsv(hsvToRgb(newHsv), newHsv);
    },
    [hsv, store],
  );

  return (
    <SliderPrimitive.Root
      data-slot="color-picker-hue-slider"
      {...sliderProps}
      max={360}
      step={1}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      value={[hsv?.h ?? 0]}
      onValueChange={onValueChange}
      disabled={context.disabled}
    >
      <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-[linear-gradient(to_right,#ff0000_0%,#ffff00_16.66%,#00ff00_33.33%,#00ffff_50%,#0000ff_66.66%,#ff00ff_83.33%,#ff0000_100%)]">
        <SliderPrimitive.Range className="absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
}

function ColorPickerAlphaSlider(
  props: React.ComponentProps<typeof SliderPrimitive.Root>,
) {
  const { className, ...sliderProps } = props;

  const context = useColorPickerContext(ALPHA_SLIDER_NAME);
  const store = useStoreContext(ALPHA_SLIDER_NAME);

  const color = useStore((state) => state.color);
  const hsv = useStore((state) => state.hsv);

  const onValueChange = React.useCallback(
    (values: number[]) => {
      const alpha = (values[0] ?? 0) / 100;
      const newColor = { ...color, a: alpha };
      const newHsv = { ...hsv, a: alpha };
      store.setColorAndHsv(newColor, newHsv);
    },
    [color, hsv, store],
  );

  const gradientColor = `rgb(${color?.r ?? 0}, ${color?.g ?? 0}, ${color?.b ?? 0})`;

  return (
    <SliderPrimitive.Root
      data-slot="color-picker-alpha-slider"
      {...sliderProps}
      max={100}
      step={1}
      disabled={context.disabled}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      value={[Math.round((color?.a ?? 1) * 100)]}
      onValueChange={onValueChange}
    >
      <SliderPrimitive.Track
        className="relative h-3 w-full grow overflow-hidden rounded-full"
        style={{
          background:
            "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
          backgroundSize: "8px 8px",
          backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0px",
        }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `linear-gradient(to right, transparent, ${gradientColor})`,
          }}
        />
        <SliderPrimitive.Range className="absolute h-full" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
}

function ColorPickerSwatch(props: DivProps) {
  const { asChild, className, ...swatchProps } = props;

  const context = useColorPickerContext(SWATCH_NAME);

  const color = useStore((state) => state.color);
  const format = useStore((state) => state.format);

  const backgroundStyle = React.useMemo(() => {
    if (!color) {
      return {
        background:
          "linear-gradient(to bottom right, transparent calc(50% - 1px), hsl(var(--destructive)) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) no-repeat",
      };
    }

    const colorString = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;

    if (color.a < 1) {
      return {
        background: `linear-gradient(${colorString}, ${colorString}), repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0% 50% / 8px 8px`,
      };
    }

    return {
      backgroundColor: colorString,
    };
  }, [color]);

  const ariaLabel = !color
    ? "No color selected"
    : `Current color: ${colorToString(color, format)}`;

  const SwatchPrimitive = asChild ? SlotPrimitive.Slot : "div";

  return (
    <SwatchPrimitive
      role="img"
      aria-label={ariaLabel}
      data-slot="color-picker-swatch"
      {...swatchProps}
      className={cn(
        "box-border size-8 rounded-sm border shadow-sm",
        context.disabled && "opacity-50",
        className,
      )}
      style={{
        ...backgroundStyle,
        forcedColorAdjust: "none",
      }}
    />
  );
}

function ColorPickerEyeDropper(props: React.ComponentProps<typeof Button>) {
  const { size: sizeProp, children, disabled, ...buttonProps } = props;

  const context = useColorPickerContext(EYE_DROPPER_NAME);
  const store = useStoreContext(EYE_DROPPER_NAME);

  const color = useStore((state) => state.color);

  const isDisabled = disabled || context.disabled;

  const onEyeDropper = React.useCallback(async () => {
    if (!window.EyeDropper) return;

    try {
      const eyeDropper = new window.EyeDropper();
      const result = await eyeDropper.open();

      if (result.sRGBHex) {
        const currentAlpha = color?.a ?? 1;
        const newColor = hexToRgb(result.sRGBHex, currentAlpha);
        const newHsv = rgbToHsv(newColor);
        store.setColorAndHsv(newColor, newHsv);
      }
    } catch (error) {
      console.warn("EyeDropper error:", error);
    }
  }, [color, store]);

  const hasEyeDropper = typeof window !== "undefined" && !!window.EyeDropper;

  if (!hasEyeDropper) return null;

  const size = sizeProp ?? (children ? "default" : "icon");

  return (
    <Button
      data-slot="color-picker-eye-dropper"
      {...buttonProps}
      variant="outline"
      size={size}
      onClick={onEyeDropper}
      disabled={isDisabled}
    >
      {children ?? <PipetteIcon />}
    </Button>
  );
}

interface ColorPickerFormatSelectProps
  extends Omit<React.ComponentProps<typeof Select>, "value" | "onValueChange">,
    Pick<React.ComponentProps<typeof SelectTrigger>, "size" | "className"> {
  contentClassName?: string;
  itemClassName?: string;
}

function ColorPickerFormatSelect(props: ColorPickerFormatSelectProps) {
  const {
    contentClassName,
    itemClassName,
    size,
    disabled,
    className,
    ...selectProps
  } = props;

  const context = useColorPickerContext(FORMAT_SELECT_NAME);
  const store = useStoreContext(FORMAT_SELECT_NAME);
  const isDisabled = disabled || context.disabled;

  const format = useStore((state) => state.format);

  const onFormatChange = React.useCallback(
    (value: ColorFormat) => {
      store.setFormat(value);
    },
    [store],
  );

  return (
    <Select
      data-slot="color-picker-format-select"
      {...selectProps}
      value={format}
      onValueChange={onFormatChange}
      disabled={isDisabled}
    >
      <SelectTrigger
        data-slot="color-picker-format-select-trigger"
        size={size ?? "sm"}
        className={cn(className)}
      >
        <SelectValue>{getFormatTriggerLabel(format)}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        <SelectGroup>
          {colorFormats.map((format) => (
            <SelectItem key={format} value={format} className={itemClassName}>
              {getFormatMenuLabel(format)}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

interface ColorPickerInputProps
  extends Omit<
    React.ComponentProps<typeof Input>,
    "value" | "onChange" | "color"
  > {
  withoutAlpha?: boolean;
}

function ColorPickerInput(props: ColorPickerInputProps) {
  const store = useStoreContext(INPUT_NAME);
  const context = useColorPickerContext(INPUT_NAME);

  const color = useStore((state) => state.color);
  const format = useStore((state) => state.format);

  const onColorChange = React.useCallback(
    (newColor: ColorValue) => {
      const newHsv = rgbToHsv(newColor);
      store.setColorAndHsv(newColor, newHsv);
    },
    [store],
  );

  if (format === "hex") {
    return (
      <HexInput
        color={color}
        onColorChange={onColorChange}
        context={context}
        {...props}
      />
    );
  }

  if (format === "rgb") {
    return (
      <RgbInput
        color={color}
        onColorChange={onColorChange}
        context={context}
        {...props}
      />
    );
  }

  if (format === "hsl") {
    return (
      <HslInput
        color={color}
        onColorChange={onColorChange}
        context={context}
        {...props}
      />
    );
  }

  if (format === "oklch") {
    return (
      <OklchInput
        color={color}
        onColorChange={onColorChange}
        context={context}
        {...props}
      />
    );
  }

  return null;
}

function normalizeHexDraft(value: string) {
  const valueWithoutHash = value.startsWith("#") ? value.slice(1) : value;
  const hexDigits = valueWithoutHash
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6)
    .toLowerCase();

  return `#${hexDigits}`;
}

function isCompleteHexDraft(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

const inputGroupItemLayoutVariants = cva("", {
  variants: {
    position: {
      first: "",
      middle: "-ms-px",
      last: "-ms-px",
      isolated: "",
    },
  },
  defaultVariants: {
    position: "isolated",
  },
});

const inputGroupItemChromeVariants = cva(
  "h-6 px-1.5 text-left font-mono text-[13px] tabular-nums [-moz-appearance:textfield] focus-visible:z-10 focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-1 focus-visible:ring-ring/20 md:text-[13px] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-outer-spin-button]:appearance-none",
  {
    variants: {
      position: {
        first: "rounded-e-none",
        middle: "rounded-none border-l-0",
        last: "rounded-s-none border-l-0",
        isolated: "",
      },
    },
    defaultVariants: {
      position: "isolated",
    },
  },
);

interface InputGroupItemProps
  extends React.ComponentProps<typeof Input>,
    VariantProps<typeof inputGroupItemChromeVariants> {
  layout?: boolean;
}

function InputGroupItem({
  className,
  layout = true,
  position,
  ...props
}: InputGroupItemProps) {
  return (
    <Input
      data-slot="color-picker-input"
      className={cn(
        layout && inputGroupItemLayoutVariants({ position }),
        inputGroupItemChromeVariants({ position, className }),
      )}
      {...props}
    />
  );
}

interface NumericChannelInputProps
  extends Omit<InputGroupItemProps, "value" | "onChange"> {
  max: number;
  min?: number;
  onValueCommit: (value: number) => void;
  suffix?: string;
  value: number;
}

function NumericChannelInput({
  className,
  max,
  min = 0,
  onBlur: onBlurProp,
  onFocus: onFocusProp,
  onKeyDown: onKeyDownProp,
  onValueCommit,
  suffix,
  value,
  position,
  ...inputProps
}: NumericChannelInputProps) {
  const valueText = String(Math.round(value));
  const isFocusedRef = React.useRef(false);
  const skipBlurCommitRef = React.useRef(false);
  const [draft, setDraft] = React.useState(valueText);

  React.useEffect(() => {
    if (!isFocusedRef.current) {
      setDraft(valueText);
    }
  }, [valueText]);

  const commitDraft = React.useCallback(
    (nextDraft: string) => {
      if (nextDraft === "") {
        return false;
      }

      const numericValue = Number.parseInt(nextDraft, 10);
      if (
        Number.isNaN(numericValue) ||
        numericValue < min ||
        numericValue > max
      ) {
        return false;
      }

      onValueCommit(numericValue);
      return true;
    },
    [max, min, onValueCommit],
  );

  const onChange = React.useCallback(
    (event: React.ChangeEvent<InputElement>) => {
      const nextDraft = event.target.value.replace(/\D/g, "").slice(0, 3);
      setDraft(nextDraft);
      commitDraft(nextDraft);
    },
    [commitDraft],
  );

  const onFocus = React.useCallback(
    (event: React.FocusEvent<InputElement>) => {
      isFocusedRef.current = true;
      onFocusProp?.(event);
    },
    [onFocusProp],
  );

  const onBlur = React.useCallback(
    (event: React.FocusEvent<InputElement>) => {
      isFocusedRef.current = false;
      if (skipBlurCommitRef.current) {
        skipBlurCommitRef.current = false;
        setDraft(valueText);
        onBlurProp?.(event);
        return;
      }

      const normalizedDraft = event.target.value.replace(/\D/g, "").slice(0, 3);
      if (commitDraft(normalizedDraft)) {
        setDraft(String(Number.parseInt(normalizedDraft, 10)));
      } else {
        setDraft(valueText);
      }
      onBlurProp?.(event);
    },
    [commitDraft, onBlurProp, valueText],
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<InputElement>) => {
      if (event.key === "Enter") {
        if (!commitDraft(event.currentTarget.value)) {
          setDraft(valueText);
        }
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        skipBlurCommitRef.current = true;
        setDraft(valueText);
        event.currentTarget.blur();
      }
      onKeyDownProp?.(event);
    },
    [commitDraft, onKeyDownProp, valueText],
  );

  const input = (
    <InputGroupItem
      {...inputProps}
      layout={!suffix}
      position={position}
      className={cn(suffix ? "w-full pr-3" : className)}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={3}
      min={min}
      max={max}
      value={draft}
      onChange={onChange}
      onBlur={onBlur}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    />
  );

  if (!suffix) {
    return input;
  }

  return (
    <div
      className={cn(
        inputGroupItemLayoutVariants({ position }),
        "relative flex-none",
        className,
      )}
    >
      {input}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-1 flex items-center font-mono text-[11px] text-muted-foreground"
      >
        {suffix}
      </span>
    </div>
  );
}

interface FormatInputProps extends ColorPickerInputProps {
  color: ColorValue;
  onColorChange: (color: ColorValue) => void;
  context: ColorPickerContextValue;
}

function HexInput(props: FormatInputProps) {
  const {
    color,
    onColorChange,
    context,
    withoutAlpha,
    className,
    onBlur: onBlurProp,
    onKeyDown: onKeyDownProp,
    ...inputProps
  } = props;

  const hexValue = rgbToHex(color);
  const [hexDraft, setHexDraft] = React.useState(hexValue);
  const alphaValue = Math.round((color?.a ?? 1) * 100);

  React.useEffect(() => {
    setHexDraft(hexValue);
  }, [hexValue]);

  const commitHexDraft = React.useCallback(
    (draft: string) => {
      const normalizedDraft = normalizeHexDraft(draft);
      if (!isCompleteHexDraft(normalizedDraft)) {
        return false;
      }

      const parsedColor = parseColorString(normalizedDraft);
      if (!parsedColor) {
        return false;
      }

      onColorChange({ ...parsedColor, a: color?.a ?? 1 });
      return true;
    },
    [color?.a, onColorChange],
  );

  const onHexChange = React.useCallback(
    (event: React.ChangeEvent<InputElement>) => {
      const value = normalizeHexDraft(event.target.value);
      setHexDraft(value);
      commitHexDraft(value);
    },
    [commitHexDraft],
  );

  const onHexBlur = React.useCallback(
    (event: React.FocusEvent<InputElement>) => {
      if (!commitHexDraft(event.target.value)) {
        setHexDraft(hexValue);
      }
      onBlurProp?.(event);
    },
    [commitHexDraft, hexValue, onBlurProp],
  );

  const onHexKeyDown = React.useCallback(
    (event: React.KeyboardEvent<InputElement>) => {
      if (event.key === "Enter") {
        if (!commitHexDraft(event.currentTarget.value)) {
          setHexDraft(hexValue);
        }
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        setHexDraft(hexValue);
        event.currentTarget.blur();
      }
      onKeyDownProp?.(event);
    },
    [commitHexDraft, hexValue, onKeyDownProp],
  );

  const onAlphaChange = React.useCallback(
    (event: React.ChangeEvent<InputElement>) => {
      const value = Number.parseInt(event.target.value, 10);
      if (!Number.isNaN(value) && value >= 0 && value <= 100) {
        onColorChange({ ...color, a: value / 100 });
      }
    },
    [color, onColorChange],
  );

  if (withoutAlpha) {
    return (
      <InputGroupItem
        aria-label="Hex color value"
        position="isolated"
        {...inputProps}
        placeholder="#000000"
        className={cn("font-mono", className)}
        maxLength={7}
        spellCheck={false}
        value={hexDraft}
        onChange={onHexChange}
        onBlur={onHexBlur}
        onKeyDown={onHexKeyDown}
        disabled={context.disabled}
      />
    );
  }

  return (
    <div
      data-slot="color-picker-input-wrapper"
      className={cn("flex items-center", className)}
    >
      <InputGroupItem
        aria-label="Hex color value"
        position="first"
        {...inputProps}
        placeholder="#000000"
        className="flex-1 font-mono"
        maxLength={7}
        spellCheck={false}
        value={hexDraft}
        onChange={onHexChange}
        onBlur={onHexBlur}
        onKeyDown={onHexKeyDown}
        disabled={context.disabled}
      />
      <InputGroupItem
        aria-label="Alpha transparency percentage"
        position="last"
        {...inputProps}
        placeholder="100"
        inputMode="numeric"
        pattern="[0-9]*"
        min="0"
        max="100"
        className={CHANNEL_INPUT_CLASS}
        value={alphaValue}
        onChange={onAlphaChange}
        onBlur={onBlurProp}
        onKeyDown={onKeyDownProp}
        disabled={context.disabled}
      />
    </div>
  );
}

function RgbInput(props: FormatInputProps) {
  const {
    color,
    onColorChange,
    context,
    withoutAlpha,
    className,
    ...inputProps
  } = props;

  const rValue = Math.round(color?.r ?? 0);
  const gValue = Math.round(color?.g ?? 0);
  const bValue = Math.round(color?.b ?? 0);
  const alphaValue = Math.round((color?.a ?? 1) * 100);

  const onChannelCommit = React.useCallback(
    (channel: "r" | "g" | "b" | "a", isAlpha = false) => (value: number) => {
      const newValue = isAlpha ? value / 100 : value;
      onColorChange({ ...color, [channel]: newValue });
    },
    [color, onColorChange],
  );

  return (
    <div
      data-slot="color-picker-input-wrapper"
      className={cn("flex items-center", className)}
    >
      <NumericChannelInput
        {...inputProps}
        aria-label="Red color component (0-255)"
        position="first"
        placeholder="0"
        min={0}
        max={255}
        className={CHANNEL_INPUT_CLASS}
        value={rValue}
        onValueCommit={onChannelCommit("r")}
        disabled={context.disabled}
      />
      <NumericChannelInput
        {...inputProps}
        aria-label="Green color component (0-255)"
        position="middle"
        placeholder="0"
        min={0}
        max={255}
        className={CHANNEL_INPUT_CLASS}
        value={gValue}
        onValueCommit={onChannelCommit("g")}
        disabled={context.disabled}
      />
      <NumericChannelInput
        {...inputProps}
        aria-label="Blue color component (0-255)"
        position={withoutAlpha ? "last" : "middle"}
        placeholder="0"
        min={0}
        max={255}
        className={CHANNEL_INPUT_CLASS}
        value={bValue}
        onValueCommit={onChannelCommit("b")}
        disabled={context.disabled}
      />
      {!withoutAlpha && (
        <NumericChannelInput
          {...inputProps}
          aria-label="Alpha transparency percentage"
          position="last"
          placeholder="100"
          min={0}
          max={100}
          className={CHANNEL_INPUT_CLASS}
          value={alphaValue}
          onValueCommit={onChannelCommit("a", true)}
          disabled={context.disabled}
        />
      )}
    </div>
  );
}

function HslInput(props: FormatInputProps) {
  const {
    color,
    onColorChange,
    context,
    withoutAlpha,
    className,
    ...inputProps
  } = props;

  const hsl = React.useMemo(() => rgbToHsl(color), [color]);
  const alphaValue = Math.round((color?.a ?? 1) * 100);

  const onHslChannelCommit = React.useCallback(
    (channel: "h" | "s" | "l") => (value: number) => {
      const newHsl = { ...hsl, [channel]: value };
      const newColor = hslToRgb(newHsl, color?.a ?? 1);
      onColorChange(newColor);
    },
    [hsl, color?.a, onColorChange],
  );

  const onAlphaCommit = React.useCallback(
    (value: number) => {
      onColorChange({ ...color, a: value / 100 });
    },
    [color, onColorChange],
  );

  return (
    <div
      data-slot="color-picker-input-wrapper"
      className={cn("flex items-center", className)}
    >
      <NumericChannelInput
        {...inputProps}
        aria-label="Hue degree (0-360)"
        position="first"
        placeholder="0"
        suffix="°"
        min={0}
        max={360}
        className={CHANNEL_INPUT_CLASS}
        value={hsl.h}
        onValueCommit={onHslChannelCommit("h")}
        disabled={context.disabled}
      />
      <NumericChannelInput
        {...inputProps}
        aria-label="Saturation percentage (0-100)"
        position="middle"
        placeholder="0"
        suffix="%"
        min={0}
        max={100}
        className={CHANNEL_INPUT_CLASS}
        value={hsl.s}
        onValueCommit={onHslChannelCommit("s")}
        disabled={context.disabled}
      />
      <NumericChannelInput
        {...inputProps}
        aria-label="Lightness percentage (0-100)"
        position={withoutAlpha ? "last" : "middle"}
        placeholder="0"
        suffix="%"
        min={0}
        max={100}
        className={CHANNEL_INPUT_CLASS}
        value={hsl.l}
        onValueCommit={onHslChannelCommit("l")}
        disabled={context.disabled}
      />
      {!withoutAlpha && (
        <NumericChannelInput
          {...inputProps}
          aria-label="Alpha transparency percentage"
          position="last"
          placeholder="100"
          suffix="%"
          min={0}
          max={100}
          className={CHANNEL_INPUT_CLASS}
          value={alphaValue}
          onValueCommit={onAlphaCommit}
          disabled={context.disabled}
        />
      )}
    </div>
  );
}

function OklchInput(props: FormatInputProps) {
  const {
    color,
    onColorChange,
    context,
    withoutAlpha,
    className,
    ...inputProps
  } = props;

  const oklch = React.useMemo(() => rgbToOklchChannels(color), [color]);
  const alphaValue = Math.round((color?.a ?? 1) * 100);

  const onOklchChannelCommit = React.useCallback(
    (channel: keyof OklchChannelValue) => (value: number) => {
      const newOklch = { ...oklch, [channel]: value };
      const newColor = oklchChannelsToRgb(newOklch, color?.a ?? 1);
      onColorChange(newColor);
    },
    [oklch, color?.a, onColorChange],
  );

  const onAlphaCommit = React.useCallback(
    (value: number) => {
      onColorChange({ ...color, a: value / 100 });
    },
    [color, onColorChange],
  );

  return (
    <div
      data-slot="color-picker-input-wrapper"
      className={cn("flex items-center", className)}
    >
      <NumericChannelInput
        {...inputProps}
        aria-label="OKLCH lightness percentage (0-100)"
        position="first"
        placeholder="0"
        suffix="%"
        min={0}
        max={100}
        className={CHANNEL_INPUT_CLASS}
        value={oklch.l}
        onValueCommit={onOklchChannelCommit("l")}
        disabled={context.disabled}
      />
      <NumericChannelInput
        {...inputProps}
        aria-label="OKLCH chroma percentage (0-100)"
        position="middle"
        placeholder="0"
        suffix="%"
        min={0}
        max={100}
        className={CHANNEL_INPUT_CLASS}
        value={oklch.c}
        onValueCommit={onOklchChannelCommit("c")}
        disabled={context.disabled}
      />
      <NumericChannelInput
        {...inputProps}
        aria-label="OKLCH hue degree (0-360)"
        position={withoutAlpha ? "last" : "middle"}
        placeholder="0"
        suffix="°"
        min={0}
        max={360}
        className={CHANNEL_INPUT_CLASS}
        value={oklch.h}
        onValueCommit={onOklchChannelCommit("h")}
        disabled={context.disabled}
      />
      {!withoutAlpha && (
        <NumericChannelInput
          {...inputProps}
          aria-label="Alpha transparency percentage"
          position="last"
          placeholder="100"
          suffix="%"
          min={0}
          max={100}
          className={CHANNEL_INPUT_CLASS}
          value={alphaValue}
          onValueCommit={onAlphaCommit}
          disabled={context.disabled}
        />
      )}
    </div>
  );
}

export {
  ColorPicker,
  ColorPickerAlphaSlider,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerInput,
  type ColorPickerProps,
  ColorPickerSwatch,
  ColorPickerTrigger,
  useStore as useColorPicker,
};
