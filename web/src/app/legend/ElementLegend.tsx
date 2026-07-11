import { type CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import type { PreviewSafeArea } from "../../model/layout";
import { lambertLegendSwatchBackground } from "../../scene/renderAppearance";
import { HexColorPicker, normalizeHexColor } from "../controls/HexColorPicker";
import { legendElementColorPickerId } from "../colorPickerRegistry";
import type { ElementLegendEntry } from "../elementLegend";
import { GLASS_SURFACE_CLASS } from "../surface";

export function ElementLegend({
  entries,
  offsetX = 0,
  onElementColorChange,
  safeArea,
}: {
  entries: ElementLegendEntry[];
  offsetX?: number;
  onElementColorChange?: (element: string, color: string) => void;
  safeArea: PreviewSafeArea;
}) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t("display.elementLegend")}
      className={cn(
        "continuous-pill pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-full border px-4 py-2 shadow-lg shadow-foreground/10 transition-[left,max-width] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none",
        GLASS_SURFACE_CLASS,
      )}
      style={legendContainerStyle(safeArea, offsetX)}
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {entries.map((entry) => (
          <li key={entry.element} className="flex min-w-0 items-center gap-2">
            <ElementLegendColorControl
              color={entry.color}
              element={entry.element}
              onElementColorChange={onElementColorChange}
            />
            <span className="font-sans text-[0.95rem] font-normal leading-none text-foreground">
              {entry.element}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function ElementLegendColorControl({
  color,
  element,
  onElementColorChange,
}: {
  color: string;
  element: string;
  onElementColorChange?: (element: string, color: string) => void;
}) {
  const { t } = useTranslation();
  const hexColor = normalizeHexColor(color);

  if (!onElementColorChange) {
    return (
      <ElementLegendSwatch color={color} />
    );
  }

  return (
    <HexColorPicker
      align="center"
      ariaLabel={t("objectsPanel.setElementColor", { element })}
      inputLabel={t("colorPicker.colorValue", { target: element })}
      pickerId={legendElementColorPickerId(element)}
      side="top"
      triggerClassName="pointer-events-auto rounded-full transition-transform duration-150 ease-out hover:scale-[1.08] motion-reduced:transition-none motion-reduced:hover:scale-100"
      value={hexColor}
      swatchClassName="rounded-full"
      swatchStyle={legendSphereStyle(color)}
      onValueChange={(nextColor) => {
        if (nextColor !== hexColor) {
          onElementColorChange(element, nextColor);
        }
      }}
    />
  );
}

function ElementLegendSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      data-slot="element-legend-swatch"
      className="size-[18px] shrink-0 rounded-full border border-foreground/10 shadow-sm"
      style={legendSphereStyle(color)}
    />
  );
}

function legendContainerStyle(safeArea: PreviewSafeArea, offsetX: number): CSSProperties {
  return {
    left: `calc(50% + ${(safeArea.left - safeArea.right) / 2 + offsetX}px)`,
    maxWidth: `min(calc(100vw - ${safeArea.left + safeArea.right + 32}px), 760px)`,
  };
}

function legendSphereStyle(color: string): CSSProperties {
  return {
    background: lambertLegendSwatchBackground(color),
  };
}
