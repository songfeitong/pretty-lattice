"use client";

import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { useTranslation } from "react-i18next";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  hslToRgb,
  isCompleteHexDraft,
  normalizeHexDraft,
  oklchChannelsToRgb,
  parseColorString,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
  rgbToOklchChannels,
  type ColorValue,
  type OklchChannelValue,
} from "./colorModel";
import {
  type ColorPickerContextValue,
  useColorPickerContext,
  useStore,
  useStoreContext,
} from "./colorPickerStore";

const INPUT_NAME = "ColorPickerInput";
const CHANNEL_INPUT_CLASS = "w-12";

type InputElement = React.ComponentRef<typeof ColorPickerInput>;

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
  const { t } = useTranslation();
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
        aria-label={t("colorPicker.hexColorValue")}
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
        aria-label={t("colorPicker.hexColorValue")}
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
        aria-label={t("colorPicker.alphaTransparency")}
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
  const { t } = useTranslation();
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
        aria-label={t("colorPicker.redComponent")}
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
        aria-label={t("colorPicker.greenComponent")}
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
        aria-label={t("colorPicker.blueComponent")}
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
          aria-label={t("colorPicker.alphaTransparency")}
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
  const { t } = useTranslation();
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
        aria-label={t("colorPicker.hslHue")}
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
        aria-label={t("colorPicker.hslSaturation")}
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
        aria-label={t("colorPicker.hslLightness")}
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
          aria-label={t("colorPicker.alphaTransparency")}
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
  const { t } = useTranslation();
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
        aria-label={t("colorPicker.oklchLightness")}
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
        aria-label={t("colorPicker.oklchChroma")}
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
        aria-label={t("colorPicker.oklchHue")}
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
          aria-label={t("colorPicker.alphaTransparency")}
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

export { ColorPickerInput };
