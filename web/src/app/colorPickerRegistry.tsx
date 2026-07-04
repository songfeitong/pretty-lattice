import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ColorPickerId = string;

interface ColorPickerRegistryValue {
  activeColorPickerId: ColorPickerId | null;
  closeActiveColorPicker: () => void;
  closeColorPicker: (pickerId: ColorPickerId) => void;
  setColorPickerOpen: (pickerId: ColorPickerId, open: boolean) => void;
}

const ColorPickerRegistryContext = createContext<ColorPickerRegistryValue | null>(null);

export const BOND_COLOR_PICKER_ID = "style:bond";

export function legendElementColorPickerId(element: string): ColorPickerId {
  return `legend:element:${element}`;
}

export function objectsElementColorPickerId(element: string): ColorPickerId {
  return `objects:element:${element}`;
}

export function objectsAtomColorPickerId(atomId: string): ColorPickerId {
  return `objects:atom:${atomId}`;
}

export function ColorPickerRegistryProvider({ children }: { children: ReactNode }) {
  const [activeColorPickerId, setActiveColorPickerId] = useState<ColorPickerId | null>(null);

  const closeActiveColorPicker = useCallback(() => {
    setActiveColorPickerId(null);
  }, []);

  const closeColorPicker = useCallback((pickerId: ColorPickerId) => {
    setActiveColorPickerId((currentPickerId) =>
      currentPickerId === pickerId ? null : currentPickerId,
    );
  }, []);

  const setColorPickerOpen = useCallback((pickerId: ColorPickerId, open: boolean) => {
    setActiveColorPickerId((currentPickerId) => {
      if (open) {
        return pickerId;
      }

      return currentPickerId === pickerId ? null : currentPickerId;
    });
  }, []);

  const value = useMemo(
    () => ({
      activeColorPickerId,
      closeActiveColorPicker,
      closeColorPicker,
      setColorPickerOpen,
    }),
    [
      activeColorPickerId,
      closeActiveColorPicker,
      closeColorPicker,
      setColorPickerOpen,
    ],
  );

  return (
    <ColorPickerRegistryContext.Provider value={value}>
      {children}
    </ColorPickerRegistryContext.Provider>
  );
}

export function useColorPickerRegistry() {
  const registry = useContext(ColorPickerRegistryContext);
  if (!registry) {
    throw new Error("useColorPickerRegistry must be used within ColorPickerRegistryProvider");
  }

  return registry;
}

export function useOptionalColorPickerRegistry() {
  return useContext(ColorPickerRegistryContext);
}
