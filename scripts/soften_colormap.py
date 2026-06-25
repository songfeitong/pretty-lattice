from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class SofteningProfile:
    lightness_center: float = 0.68
    lightness_compression: float = 0.82
    min_lightness: float = 0.46
    max_lightness: float = 0.90
    chroma_knee: float = 0.08
    chroma_cap: float = 0.14
    yellow_green_chroma_cap: float = 0.11
    yellow_green_start: float = 80.0
    yellow_green_end: float = 160.0
    bright_lightness: float = 0.84
    bright_chroma_scale: float = 0.92


@dataclass(frozen=True)
class ColorChange:
    element: str
    source_hex: str
    output_hex: str
    source_chroma: float
    output_chroma: float
    source_lightness: float
    output_lightness: float


def main() -> None:
    args = parse_args()
    source = load_colormap(args.input)
    source_name = source.get("name") or args.input.stem
    output_name = args.name or f"{source_name}-soft"
    profile = SofteningProfile(
        lightness_center=args.lightness_center,
        lightness_compression=args.lightness_compression,
        min_lightness=args.min_lightness,
        max_lightness=args.max_lightness,
        chroma_knee=args.chroma_knee,
        chroma_cap=args.chroma_cap,
        yellow_green_chroma_cap=args.yellow_green_chroma_cap,
        yellow_green_start=args.yellow_green_start,
        yellow_green_end=args.yellow_green_end,
        bright_lightness=args.bright_lightness,
        bright_chroma_scale=args.bright_chroma_scale,
    )

    output_elements: dict[str, str] = {}
    changes: list[ColorChange] = []
    for element, source_hex in source["elements"].items():
        output_hex, change = soften_hex(element, source_hex, profile)
        output_elements[element] = output_hex
        changes.append(change)

    output = {
        "name": output_name,
        "elements": output_elements,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")

    print(f"Wrote {len(output_elements)} colors to {args.output}")
    if args.report > 0:
        print_report(changes, args.report)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Generate a calmer derived element colormap by compressing OKLCH chroma "
            "and lightness while preserving hue."
        )
    )
    parser.add_argument("input", type=Path, help="Input colormap JSON with name/elements fields.")
    parser.add_argument("output", type=Path, help="Output colormap JSON path.")
    parser.add_argument("--name", help="Output colormap name. Defaults to '<input-name>-soft'.")
    parser.add_argument(
        "--report",
        type=int,
        default=0,
        help="Print the largest chroma reductions.",
    )

    parser.add_argument("--lightness-center", type=float, default=0.68)
    parser.add_argument("--lightness-compression", type=float, default=0.82)
    parser.add_argument("--min-lightness", type=float, default=0.46)
    parser.add_argument("--max-lightness", type=float, default=0.90)
    parser.add_argument("--chroma-knee", type=float, default=0.08)
    parser.add_argument("--chroma-cap", type=float, default=0.14)
    parser.add_argument("--yellow-green-chroma-cap", type=float, default=0.11)
    parser.add_argument("--yellow-green-start", type=float, default=80.0)
    parser.add_argument("--yellow-green-end", type=float, default=160.0)
    parser.add_argument("--bright-lightness", type=float, default=0.84)
    parser.add_argument("--bright-chroma-scale", type=float, default=0.92)
    return parser.parse_args()


def load_colormap(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path} must contain a JSON object.")
    elements = data.get("elements")
    if not isinstance(elements, dict):
        raise ValueError(f"{path} must contain an 'elements' object.")
    for element, value in elements.items():
        if not isinstance(element, str) or not isinstance(value, str):
            raise ValueError(f"{path} elements must map strings to hex strings.")
    return data


def soften_hex(element: str, source_hex: str, profile: SofteningProfile) -> tuple[str, ColorChange]:
    red, green, blue, alpha = parse_hex(source_hex)
    lightness, chroma, hue = linear_srgb_to_oklch(
        srgb_channel_to_linear(red),
        srgb_channel_to_linear(green),
        srgb_channel_to_linear(blue),
    )

    output_lightness = clamp(
        profile.lightness_center
        + profile.lightness_compression * (lightness - profile.lightness_center),
        profile.min_lightness,
        profile.max_lightness,
    )
    output_chroma = compress_chroma(chroma, hue, output_lightness, profile)
    output_red, output_green, output_blue = oklch_to_in_gamut_srgb(
        output_lightness,
        output_chroma,
        hue,
    )
    output_hex = format_hex(output_red, output_green, output_blue, alpha)
    _, actual_chroma, _ = linear_srgb_to_oklch(
        srgb_channel_to_linear(output_red),
        srgb_channel_to_linear(output_green),
        srgb_channel_to_linear(output_blue),
    )
    change = ColorChange(
        element=element,
        source_hex=source_hex,
        output_hex=output_hex,
        source_chroma=chroma,
        output_chroma=actual_chroma,
        source_lightness=lightness,
        output_lightness=output_lightness,
    )
    return output_hex, change


def parse_hex(value: str) -> tuple[float, float, float, str | None]:
    if len(value) not in {7, 9} or not value.startswith("#"):
        raise ValueError(f"Expected #RRGGBB or #RRGGBBAA, got {value!r}.")
    try:
        red = int(value[1:3], 16) / 255
        green = int(value[3:5], 16) / 255
        blue = int(value[5:7], 16) / 255
    except ValueError as exc:
        raise ValueError(f"Expected hex color, got {value!r}.") from exc
    alpha = value[7:9].lower() if len(value) == 9 else None
    return red, green, blue, alpha


def format_hex(red: float, green: float, blue: float, alpha: str | None) -> str:
    rgb = (
        round(clamp(red, 0, 1) * 255),
        round(clamp(green, 0, 1) * 255),
        round(clamp(blue, 0, 1) * 255),
    )
    suffix = alpha or ""
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}{suffix}"


def srgb_channel_to_linear(value: float) -> float:
    if value <= 0.04045:
        return value / 12.92
    return ((value + 0.055) / 1.055) ** 2.4


def linear_channel_to_srgb(value: float) -> float:
    if value <= 0.0031308:
        return 12.92 * value
    return 1.055 * (value ** (1 / 2.4)) - 0.055


def linear_srgb_to_oklch(red: float, green: float, blue: float) -> tuple[float, float, float]:
    lab_lightness, lab_a, lab_b = linear_srgb_to_oklab(red, green, blue)
    chroma = math.hypot(lab_a, lab_b)
    hue = math.degrees(math.atan2(lab_b, lab_a)) % 360
    return lab_lightness, chroma, hue


def linear_srgb_to_oklab(red: float, green: float, blue: float) -> tuple[float, float, float]:
    long = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue
    medium = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue
    short = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue

    long_root = math.copysign(abs(long) ** (1 / 3), long)
    medium_root = math.copysign(abs(medium) ** (1 / 3), medium)
    short_root = math.copysign(abs(short) ** (1 / 3), short)

    lightness = 0.2104542553 * long_root + 0.7936177850 * medium_root - 0.0040720468 * short_root
    lab_a = 1.9779984951 * long_root - 2.4285922050 * medium_root + 0.4505937099 * short_root
    lab_b = 0.0259040371 * long_root + 0.7827717662 * medium_root - 0.8086757660 * short_root
    return lightness, lab_a, lab_b


def oklch_to_linear_srgb(lightness: float, chroma: float, hue: float) -> tuple[float, float, float]:
    hue_radians = math.radians(hue)
    lab_a = chroma * math.cos(hue_radians)
    lab_b = chroma * math.sin(hue_radians)

    long_root = lightness + 0.3963377774 * lab_a + 0.2158037573 * lab_b
    medium_root = lightness - 0.1055613458 * lab_a - 0.0638541728 * lab_b
    short_root = lightness - 0.0894841775 * lab_a - 1.2914855480 * lab_b

    long = long_root**3
    medium = medium_root**3
    short = short_root**3

    red = 4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short
    green = -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short
    blue = -0.0041960863 * long - 0.7034186147 * medium + 1.7076147010 * short
    return red, green, blue


def compress_chroma(
    chroma: float,
    hue: float,
    output_lightness: float,
    profile: SofteningProfile,
) -> float:
    cap = (
        profile.yellow_green_chroma_cap
        if hue_between(hue, profile.yellow_green_start, profile.yellow_green_end)
        else profile.chroma_cap
    )
    if output_lightness >= profile.bright_lightness:
        cap *= profile.bright_chroma_scale
    if chroma <= profile.chroma_knee:
        return chroma
    if cap <= profile.chroma_knee:
        return min(chroma, cap)
    return profile.chroma_knee + (cap - profile.chroma_knee) * (
        1 - math.exp(-(chroma - profile.chroma_knee) / (cap - profile.chroma_knee))
    )


def oklch_to_in_gamut_srgb(
    lightness: float,
    chroma: float,
    hue: float,
) -> tuple[float, float, float]:
    if in_gamut(oklch_to_linear_srgb(lightness, chroma, hue)):
        return linear_tuple_to_srgb(oklch_to_linear_srgb(lightness, chroma, hue))

    low = 0.0
    high = chroma
    for _ in range(28):
        mid = (low + high) / 2
        if in_gamut(oklch_to_linear_srgb(lightness, mid, hue)):
            low = mid
        else:
            high = mid

    return linear_tuple_to_srgb(oklch_to_linear_srgb(lightness, low, hue))


def linear_tuple_to_srgb(linear_rgb: tuple[float, float, float]) -> tuple[float, float, float]:
    return tuple(linear_channel_to_srgb(clamp(channel, 0, 1)) for channel in linear_rgb)


def in_gamut(linear_rgb: tuple[float, float, float]) -> bool:
    return all(-1e-9 <= channel <= 1 + 1e-9 for channel in linear_rgb)


def hue_between(hue: float, start: float, end: float) -> bool:
    hue %= 360
    start %= 360
    end %= 360
    if start <= end:
        return start <= hue <= end
    return hue >= start or hue <= end


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(max(value, minimum), maximum)


def print_report(changes: list[ColorChange], count: int) -> None:
    ranked = sorted(changes, key=lambda item: item.source_chroma - item.output_chroma, reverse=True)
    for change in ranked[:count]:
        print(
            f"{change.element:>2} {change.source_hex} -> {change.output_hex} "
            f"C {change.source_chroma:.3f}->{change.output_chroma:.3f} "
            f"L {change.source_lightness:.3f}->{change.output_lightness:.3f}"
        )


if __name__ == "__main__":
    main()
