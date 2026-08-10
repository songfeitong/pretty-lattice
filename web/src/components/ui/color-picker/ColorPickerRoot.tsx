"use client";

import {
  Direction as DirectionPrimitive,
  Slot as SlotPrimitive,
} from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { VisuallyHiddenInput } from "@/components/visually-hidden-input";
import { useIsomorphicLayoutEffect } from "@/hooks/use-isomorphic-layout-effect";
import { useComposedRefs } from "@/lib/compose-refs";
import { cn } from "@/lib/utils";

import {
  hexToRgb,
  isSameColorValue,
  rgbToHex,
  rgbToHsv,
  type ColorFormat,
} from "./colorModel";
import {
  ColorPickerContext,
  StoreContext,
  type ColorPickerContextValue,
  type Direction,
  type DivProps,
  useColorPickerStore,
  useColorPickerContext,
  useStore,
  useStoreContext,
} from "./colorPickerStore";
import { ColorPickerInput } from "./ColorPickerInputs";
import {
  ColorPickerAlphaSlider,
  ColorPickerArea,
  ColorPickerEyeDropper,
  ColorPickerFormatSelect,
  ColorPickerHueSlider,
  ColorPickerSwatch,
} from "./ColorPickerPrimitives";

const ROOT_IMPL_NAME = "ColorPickerImpl";
const TRIGGER_NAME = "ColorPickerTrigger";
const CONTENT_NAME = "ColorPickerContent";

type RootElement = React.ComponentRef<typeof ColorPicker>;

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

  const store = useColorPickerStore({
    defaultFormat,
    defaultOpen,
    defaultValue,
    format: formatProp,
    onFormatChange,
    onOpenChange,
    onValueChange,
    open: openProp,
    value: valueProp,
  });

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


export { ColorPicker, ColorPickerContent, type ColorPickerProps, ColorPickerTrigger };
