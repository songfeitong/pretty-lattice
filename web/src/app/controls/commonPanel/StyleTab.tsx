import { RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  COLOR_SCHEME_OPTIONS,
  colorSchemeTokenStyle,
  type ColorScheme,
} from "../../../model/colorSchemes";
import {
  MATERIAL_PRESET_OPTIONS,
  type MaterialPresetId,
} from "../../../model/materialPresets";
import {
  STYLE_FOG_AMOUNT_MAX,
  STYLE_FOG_AMOUNT_MIN,
  STYLE_FOG_START_MAX,
  STYLE_FOG_START_MIN,
  createDefaultStyle,
  createCustomColormapFromScheme,
  DEFAULT_BOND_COLOR,
  clearObjectStyleProperty,
  type BondColorMode,
  type StyleState,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import { BOND_COLOR_PICKER_ID } from "../../colorPickerRegistry";
import { TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS } from "./controlFeedback";
import { PercentSliderRow, clampPercentValue } from "./sharedControls";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_ROW_STACK_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";
import { HexColorPicker, normalizeHexColor } from "../HexColorPicker";
import { MaterialPresetToken3D } from "./MaterialPresetToken3D";

const BOND_COLOR_OPTIONS: { labelKey: "style.unicolor" | "style.bicolor"; value: BondColorMode }[] = [
  { labelKey: "style.unicolor", value: "unicolor" },
  { labelKey: "style.bicolor", value: "bicolor" },
];
const CUSTOM_COLOR_SCHEME_VALUE = "__custom";
const BY_ATOM_TOKEN_STYLE = { background: "linear-gradient(90deg, #f58c9a 0 50%, #78a7ff 50% 100%)" } as const;
const CUSTOM_COLOR_SCHEME_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, oklch(78% 0.17 24) 0%, oklch(80% 0.18 92) 28%, oklch(78% 0.17 168) 60%, oklch(76% 0.18 268) 100%)",
  boxShadow:
    "inset 0 0 0 1px oklch(100% 0 0 / 0.35), inset 0 1px 0 oklch(100% 0 0 / 0.28)",
} satisfies CSSProperties;

export function StyleTabContent({
  onStyleChange,
  style,
}: {
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  const { t } = useTranslation();

  function setBondColorMode(bondColorMode: BondColorMode) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      bondColor:
        bondColorMode === "bicolor"
          ? DEFAULT_BOND_COLOR
          : currentStyle.bondColor,
      bondColorMode,
    }));
  }

  function setBondColor(bondColor: string) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      bondColor,
    }));
  }

  function setColorScheme(value: string) {
    onStyleChange((currentStyle) => {
      if (value === CUSTOM_COLOR_SCHEME_VALUE) {
        const customColormap =
          currentStyle.customColormap ??
          createCustomColormapFromScheme(currentStyle.colorScheme);

        return {
          ...currentStyle,
          colorScheme: customColormap.baseColorScheme,
          colorSchemeMode: "custom",
          customColormap,
        };
      }

      return {
        ...currentStyle,
        colorScheme: value,
        colorSchemeMode: "preset",
        customColormap: null,
        objectStyles: clearObjectStyleProperty(
          currentStyle.objectStyles,
          "color",
        ),
      };
    });
  }

  function setMaterialPreset(materialPreset: MaterialPresetId) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      materialPreset,
    }));
  }

  function setFogEnabled(fogEnabled: boolean) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogEnabled,
    }));
  }

  function setFogStart(fogStart: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogStart: clampPercentValue(
        fogStart,
        STYLE_FOG_START_MIN,
        STYLE_FOG_START_MAX,
      ),
    }));
  }

  function setFogAmount(fogAmount: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogAmount: clampPercentValue(
        fogAmount,
        STYLE_FOG_AMOUNT_MIN,
        STYLE_FOG_AMOUNT_MAX,
      ),
    }));
  }

  const [fogResetFeedbackPhase, setFogResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const fogResetFeedbackTickRef = useRef(0);
  const fogResetFeedbackTimeoutRef = useRef<number | null>(null);
  const selectedMaterialPresetOption =
    MATERIAL_PRESET_OPTIONS.find((option) => option.value === style.materialPreset) ??
    MATERIAL_PRESET_OPTIONS[0];
  const selectedColorSchemeValue =
    style.colorSchemeMode === "custom" && style.customColormap
      ? CUSTOM_COLOR_SCHEME_VALUE
      : style.colorScheme;

  useEffect(
    () => () => {
      if (fogResetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(fogResetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetFogClick() {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogAmount: createDefaultStyle().fogAmount,
      fogStart: createDefaultStyle().fogStart,
    }));

    if (fogResetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(fogResetFeedbackTimeoutRef.current);
    }

    fogResetFeedbackTickRef.current += 1;
    setFogResetFeedbackPhase(fogResetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    fogResetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setFogResetFeedbackPhase(null);
      fogResetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  return (
    <div className="flex flex-col gap-2.5">
      <section aria-labelledby="style-fog-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <div className="col-span-2 flex min-w-0 items-center gap-2">
            <h2
              id="style-fog-label"
              className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "whitespace-nowrap leading-tight text-muted-foreground")}
            >
              {t("style.depthFading")}
            </h2>
            <Switch
              checked={style.fogEnabled}
              aria-label={t("style.depthFading")}
              className="h-4 w-7 p-0.5"
              thumbClassName="size-3 data-[state=checked]:translate-x-3"
              onCheckedChange={setFogEnabled}
            />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("actions.resetDepthFading")}
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    fogResetFeedbackPhase === "a"
                      ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS
                      : null,
                    fogResetFeedbackPhase === "b"
                      ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS
                      : null,
                  )}
                  onClick={handleResetFogClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{t("actions.resetDepthFading")}</TooltipContent>
          </Tooltip>
        </div>
        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS, style.fogEnabled ? null : "opacity-55")}>
          <PercentSliderRow
            accessibleLabel={t("style.depthFading")}
            allowZero
            disabled={!style.fogEnabled}
            label={t("style.start")}
            max={STYLE_FOG_START_MAX}
            min={STYLE_FOG_START_MIN}
            value={style.fogStart}
            valueLabel={t("style.startValueLabel")}
            onValueChange={setFogStart}
          />
          <PercentSliderRow
            accessibleLabel={t("style.depthFading")}
            allowZero
            disabled={!style.fogEnabled}
            label={t("style.amount")}
            max={STYLE_FOG_AMOUNT_MAX}
            min={STYLE_FOG_AMOUNT_MIN}
            value={style.fogAmount}
            valueLabel={t("style.amountValueLabel")}
            onValueChange={setFogAmount}
          />
        </div>
      </section>

      <Separator />

      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            "grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5",
            COMMON_PANEL_BODY_TEXT_CLASS,
          )}
        >
          <span className="min-w-0 truncate leading-tight">{t("style.material")}</span>
          <Select
            value={style.materialPreset}
            onValueChange={(value) => setMaterialPreset(value)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("style.material")}
              className={cn("!h-6 w-full !px-2 !py-0", COMMON_PANEL_BODY_TEXT_CLASS)}
            >
              {selectedMaterialPresetOption ? (
                <MaterialPresetOptionLabel
                  label={selectedMaterialPresetOption.label}
                  value={selectedMaterialPresetOption.value}
                />
              ) : null}
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {MATERIAL_PRESET_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    textValue={option.label}
                    className={cn(
                      "min-h-6 justify-start py-0.5 *:[span]:last:min-w-0 *:[span]:last:flex-1 *:[span]:last:justify-start",
                      COMMON_PANEL_BODY_TEXT_CLASS,
                    )}
                  >
                    <MaterialPresetOptionLabel
                      label={option.label}
                      value={option.value}
                    />
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div
          className={cn(
            "grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5",
            COMMON_PANEL_BODY_TEXT_CLASS,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5 leading-tight">
            <span className="min-w-0 truncate">{t("style.bondStyle")}</span>
            {style.bondColorMode === "unicolor" ? (
              <BondColorPicker
                value={style.bondColor}
                onValueChange={setBondColor}
              />
            ) : null}
          </span>
          <Select
            value={style.bondColorMode}
            onValueChange={(value) => setBondColorMode(value as BondColorMode)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("style.bondStyle")}
              className={cn("!h-6 w-full !px-2 !py-0", COMMON_PANEL_BODY_TEXT_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {BOND_COLOR_OPTIONS.map((option) => {
                  const label = t(option.labelKey);
                  return (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      textValue={label}
                      className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
                    >
                      <BondStyleOptionLabel
                        label={label}
                        unicolorColor={style.bondColor}
                        value={option.value}
                      />
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        <div
          className={cn(
            "grid min-h-8 grid-cols-[minmax(5.5rem,1fr)_9.5rem] items-center gap-2 rounded-md px-1.5",
            COMMON_PANEL_BODY_TEXT_CLASS,
          )}
        >
          <span className="min-w-0 truncate leading-tight">{t("style.colorScheme")}</span>
          <Select
            value={selectedColorSchemeValue}
            onValueChange={setColorScheme}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("style.colorScheme")}
              className={cn("!h-6 w-full !px-2 !py-0", COMMON_PANEL_BODY_TEXT_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {COLOR_SCHEME_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    textValue={option.label}
                    className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
                  >
                    <ColorSchemeOptionLabel
                      label={option.label}
                      value={option.value}
                    />
                  </SelectItem>
                ))}
                <SelectItem
                  value={CUSTOM_COLOR_SCHEME_VALUE}
                  textValue={t("style.custom")}
                  className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
                >
                  <CustomColorSchemeOptionLabel label={t("style.custom")} />
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function MaterialPresetOptionLabel({
  label,
  value,
}: {
  label: string;
  value: MaterialPresetId;
}) {
  return (
    <span className="flex w-full min-w-0 items-center justify-start gap-2 text-left">
      <MaterialPresetToken3D presetId={value} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </span>
  );
}

function BondStyleOptionLabel({
  label,
  unicolorColor,
  value,
}: {
  label: string;
  unicolorColor: string;
  value: BondColorMode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={bondStyleTokenStyle(value, unicolorColor)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function bondStyleTokenStyle(
  value: BondColorMode,
  unicolorColor: string,
): CSSProperties | undefined {
  if (value === "unicolor") {
    return { background: normalizeHexColor(unicolorColor, DEFAULT_BOND_COLOR) };
  }
  if (value === "bicolor") {
    return BY_ATOM_TOKEN_STYLE;
  }
  return undefined;
}

function BondColorPicker({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) {
  const { t } = useTranslation();
  const hexValue = normalizeHexColor(value, DEFAULT_BOND_COLOR);
  return (
    <HexColorPicker
      align="center"
      ariaLabel={t("colorPicker.bondColor")}
      fallbackValue={DEFAULT_BOND_COLOR}
      inputLabel={t("colorPicker.bondColorValue")}
      pickerId={BOND_COLOR_PICKER_ID}
      side="left"
      value={hexValue}
      swatchClassName="border-foreground/5 shadow-[0_0_0_1px_rgba(40,40,40,0.015),0_1px_1px_rgba(40,40,40,0.03)]"
      swatchStyle={{ background: hexValue }}
      onValueChange={onValueChange}
    />
  );
}

function ColorSchemeOptionLabel({
  label,
  value,
}: {
  label: string;
  value: ColorScheme;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={colorSchemeTokenStyle(value)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function CustomColorSchemeOptionLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={CUSTOM_COLOR_SCHEME_TOKEN_STYLE}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}
