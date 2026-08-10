"use client";

import * as React from "react";

import { useAsRef } from "@/hooks/use-as-ref";
import { useLazyRef } from "@/hooks/use-lazy-ref";

import {
  colorToString,
  hexToRgb,
  hsvToRgb,
  isSameColorValue,
  isSameHsvColorValue,
  parseColorString,
  rgbToHsv,
  type ColorFormat,
  type ColorValue,
  type HSVColorValue,
} from "./colorModel";

const ROOT_NAME = "ColorPicker";

export interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean;
}

export type Direction = "ltr" | "rtl";

export interface StoreState {
  color: ColorValue;
  hsv: HSVColorValue;
  open: boolean;
  format: ColorFormat;
}

export interface Store {
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

interface UseColorPickerStoreOptions {
  defaultFormat: ColorFormat;
  defaultOpen?: boolean;
  defaultValue: string;
  format?: ColorFormat;
  onFormatChange?: (format: ColorFormat) => void;
  onOpenChange?: (open: boolean) => void;
  onValueChange?: (value: string) => void;
  open?: boolean;
  value?: string;
}

export function useColorPickerStore({
  defaultFormat,
  defaultOpen,
  defaultValue,
  format,
  onFormatChange,
  onOpenChange,
  onValueChange,
  open,
  value,
}: UseColorPickerStoreOptions): Store {
  const listenersRef = useLazyRef(() => new Set<() => void>());
  const stateRef = useLazyRef<StoreState>(() => {
    const color = hexToRgb(value ?? defaultValue);
    return {
      color,
      format: format ?? defaultFormat,
      hsv: rgbToHsv(color),
      open: open ?? defaultOpen ?? false,
    };
  });
  const pendingControlledColorEchoRef = useLazyRef<ColorValue | null>(() => null);
  const propsRef = useAsRef({
    onFormatChange,
    onOpenChange,
    onValueChange,
  });

  return React.useMemo<Store>(() => {
    const emitColor = (color: ColorValue, format: ColorFormat) => {
      if (!propsRef.current.onValueChange) {
        return;
      }
      const colorString = colorToString(color, format);
      pendingControlledColorEchoRef.current =
        parseColorString(colorString) ?? color;
      propsRef.current.onValueChange(colorString);
    };

    const store: Store = {
      subscribe: (callback) => {
        listenersRef.current.add(callback);
        return () => listenersRef.current.delete(callback);
      },
      consumeControlledColorEcho: (nextValue) => {
        const pendingEcho = pendingControlledColorEchoRef.current;
        pendingControlledColorEchoRef.current = null;
        return pendingEcho ? isSameColorValue(pendingEcho, nextValue) : false;
      },
      getState: () => stateRef.current,
      setColor: (nextValue, options) => {
        if (isSameColorValue(stateRef.current.color, nextValue)) return;
        const format = stateRef.current.format;
        stateRef.current.color = nextValue;
        if (options?.emit !== false) emitColor(nextValue, format);
        store.notify();
      },
      setColorAndHsv: (color, hsv, options) => {
        if (
          isSameColorValue(stateRef.current.color, color) &&
          isSameHsvColorValue(stateRef.current.hsv, hsv)
        ) {
          return;
        }
        const format = stateRef.current.format;
        stateRef.current.color = color;
        stateRef.current.hsv = hsv;
        if (options?.emit !== false) emitColor(color, format);
        store.notify();
      },
      setHsv: (nextValue, options) => {
        if (isSameHsvColorValue(stateRef.current.hsv, nextValue)) return;
        const format = stateRef.current.format;
        stateRef.current.hsv = nextValue;
        if (options?.emit !== false) emitColor(hsvToRgb(nextValue), format);
        store.notify();
      },
      setOpen: (nextValue, options) => {
        if (Object.is(stateRef.current.open, nextValue)) return;
        stateRef.current.open = nextValue;
        if (options?.emit !== false) propsRef.current.onOpenChange?.(nextValue);
        store.notify();
      },
      setFormat: (nextValue) => {
        if (Object.is(stateRef.current.format, nextValue)) return;
        stateRef.current.format = nextValue;
        propsRef.current.onFormatChange?.(nextValue);
        store.notify();
      },
      notify: () => {
        for (const callback of listenersRef.current) callback();
      },
    };
    return store;
  }, [listenersRef, pendingControlledColorEchoRef, propsRef, stateRef]);
}

export const StoreContext = React.createContext<Store | null>(null);

export function useStoreContext(consumerName: string) {
  const context = React.useContext(StoreContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}

export function useStore<U>(selector: (state: StoreState) => U): U {
  const store = useStoreContext("useStore");

  const getSnapshot = React.useCallback(
    () => selector(store.getState()),
    [store, selector],
  );

  return React.useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export interface ColorPickerContextValue {
  dir: Direction;
  disabled?: boolean;
  inline?: boolean;
  readOnly?: boolean;
  required?: boolean;
}

export const ColorPickerContext = React.createContext<ColorPickerContextValue | null>(
  null,
);

export function useColorPickerContext(consumerName: string) {
  const context = React.useContext(ColorPickerContext);
  if (!context) {
    throw new Error(`\`${consumerName}\` must be used within \`${ROOT_NAME}\``);
  }
  return context;
}
