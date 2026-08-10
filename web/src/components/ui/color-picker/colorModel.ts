import { clampChroma, converter, type Oklch, type Rgb } from "culori";

export const colorFormats = ["hex", "rgb", "hsl", "oklch"] as const;
export type ColorFormat = (typeof colorFormats)[number];

export interface ColorValue {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HSVColorValue {
  h: number;
  s: number;
  v: number;
  a: number;
}

export interface OklchChannelValue {
  c: number;
  h: number;
  l: number;
}

const OKLCH_CHROMA_PERCENT_SCALE = 0.4;
const DEFAULT_HEX_COLOR = "#808080";
const HEX_COLOR_PATTERN = /^#[\da-fA-F]{6}$/;
const SHORT_HEX_COLOR_PATTERN = /^#[\da-fA-F]{3}$/;
const convertToOklch = converter("oklch");
const convertToRgb = converter("rgb");

export function isSameColorValue(left: ColorValue, right: ColorValue) {
  return (
    left.r === right.r &&
    left.g === right.g &&
    left.b === right.b &&
    left.a === right.a
  );
}

export function isSameHsvColorValue(left: HSVColorValue, right: HSVColorValue) {
  return (
    left.h === right.h &&
    left.s === right.s &&
    left.v === right.v &&
    left.a === right.a
  );
}

export function hexToRgb(hex: string, alpha?: number): ColorValue {
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

export function rgbToHex(color: ColorValue): string {
  const toHex = (n: number) => {
    const hex = Math.round(clamp(n, 0, 255)).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };
  return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

export function rgbToHsv(color: ColorValue): HSVColorValue {
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

export function hsvToRgb(hsv: HSVColorValue): ColorValue {
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

export function colorToString(color: ColorValue, format: ColorFormat = "hex"): string {
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

export function rgbToHsl(color: ColorValue) {
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

export function hslToRgb(
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

export function rgbToOklchChannels(color: ColorValue): OklchChannelValue {
  const oklch = rgbToOklchCssChannels(color);

  return {
    l: Math.round(oklch.l),
    c: Math.round(oklch.c),
    h: Math.round(oklch.h),
  };
}

export function rgbToOklchCssChannels(color: ColorValue): OklchChannelValue {
  const oklch = convertToOklch(colorValueToCuloriRgb(color));

  return {
    l: clamp(oklch.l, 0, 1) * 100,
    c: clamp(oklch.c / OKLCH_CHROMA_PERCENT_SCALE, 0, 1) * 100,
    h: normalizeHue(oklch.h ?? 0),
  };
}

export function formatOklchNumber(value: number) {
  return Number.parseFloat(value.toFixed(4)).toString();
}

export function oklchChannelsToRgb(
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

export function colorValueToCuloriRgb(color: ColorValue): Rgb {
  return {
    mode: "rgb",
    r: clamp(color.r, 0, 255) / 255,
    g: clamp(color.g, 0, 255) / 255,
    b: clamp(color.b, 0, 255) / 255,
    alpha: color.a,
  };
}

export function culoriRgbToColorValue(color: Rgb, alpha = 1): ColorValue {
  return {
    r: Math.round(clamp(color.r, 0, 1) * 255),
    g: Math.round(clamp(color.g, 0, 1) * 255),
    b: Math.round(clamp(color.b, 0, 1) * 255),
    a: color.alpha ?? alpha,
  };
}

export function normalizeHue(value: number) {
  return ((value % 360) + 360) % 360;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function parseColorString(value: string): ColorValue | null {
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
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/,
  );
  if (rgbMatch) {
    return {
      r: Number.parseFloat(rgbMatch[1] ?? "0"),
      g: Number.parseFloat(rgbMatch[2] ?? "0"),
      b: Number.parseFloat(rgbMatch[3] ?? "0"),
      a: rgbMatch[4] ? Number.parseFloat(rgbMatch[4]) : 1,
    };
  }

  const hslMatch = trimmed.match(
    /^hsla?\(\s*([-\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*(?:,\s*([\d.]+))?\s*\)$/,
  );
  if (hslMatch) {
    const h = Number.parseFloat(hslMatch[1] ?? "0");
    const s = Number.parseFloat(hslMatch[2] ?? "0");
    const l = Number.parseFloat(hslMatch[3] ?? "0");
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

export function normalizeHexDraft(value: string) {
  const valueWithoutHash = value.startsWith("#") ? value.slice(1) : value;
  const hexDigits = valueWithoutHash
    .replace(/[^0-9a-fA-F]/g, "")
    .slice(0, 6)
    .toLowerCase();

  return `#${hexDigits}`;
}

export function isCompleteHexDraft(value: string) {
  return HEX_COLOR_PATTERN.test(value);
}

export function normalizeHexColor(
  value: string,
  fallbackValue = DEFAULT_HEX_COLOR,
) {
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

export function parseColorToHex(value: string): string | null {
  const parsed = parseColorString(value);
  return parsed ? rgbToHex(parsed) : null;
}

function expandShortHex(value: string) {
  const [, r = "0", g = "0", b = "0"] = value.toLowerCase();
  return `#${r}${r}${g}${g}${b}${b}`;
}
