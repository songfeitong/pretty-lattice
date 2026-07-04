import { Check, ChevronDown, RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  createDefaultStyle,
  createCustomColormapFromScheme,
  DEFAULT_BOND_COLOR,
  CUSTOM_ATOM_RADIUS_MODEL,
  clearObjectStyleProperty,
  type AtomRadiusStyleModel,
  type BondColorMode,
  type StyleState,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import { TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS } from "./controlFeedback";
import { PercentSliderRow, clampPercentValue } from "./sharedControls";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_ROW_STACK_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";
import { HexColorPicker, normalizeHexColor } from "../HexColorPicker";
import { MaterialPresetToken3D } from "./MaterialPresetToken3D";

const BOND_COLOR_OPTIONS: { label: string; value: BondColorMode }[] = [
  { label: "Unicolor", value: "unicolor" },
  { label: "Bicolor", value: "bicolor" },
];
const CUSTOM_COLOR_SCHEME_VALUE = "__custom";
const ATOM_RADIUS_MODEL_OPTIONS: {
  menuLabel: string;
  value: AtomRadiusStyleModel;
}[] = [
  { menuLabel: "Uniform", value: "uniform" },
  { menuLabel: "Atomic", value: "atomic" },
  { menuLabel: "Van der Waals", value: "vdw" },
  { menuLabel: "Ionic", value: "ionic" },
  { menuLabel: "Custom", value: CUSTOM_ATOM_RADIUS_MODEL },
];
const BY_ATOM_TOKEN_STYLE = { background: "linear-gradient(90deg, #f58c9a 0 50%, #78a7ff 50% 100%)" } as const;
const CUSTOM_COLOR_SCHEME_TOKEN_STYLE = {
  background:
    "linear-gradient(90deg, oklch(78% 0.17 24) 0%, oklch(80% 0.18 92) 28%, oklch(78% 0.17 168) 60%, oklch(76% 0.18 268) 100%)",
  boxShadow:
    "inset 0 0 0 1px oklch(100% 0 0 / 0.35), inset 0 1px 0 oklch(100% 0 0 / 0.28)",
} satisfies CSSProperties;

export function StyleTabContent({
  onAtomRadiusModelChange,
  onStyleChange,
  style,
}: {
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusStyleModel) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  function setStyleScale(key: keyof typeof STYLE_SCALE_MIN, value: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      [key]: clampPercentValue(value, STYLE_SCALE_MIN[key], STYLE_SCALE_MAX[key]),
    }));
  }

  function setAtomRadiusModel(atomRadiusModel: AtomRadiusStyleModel) {
    onAtomRadiusModelChange(atomRadiusModel);
  }

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

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
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
  const isCustomAtomRadiusModel = style.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL;

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
      if (fogResetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(fogResetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetScaleClick() {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      atomRadius: createDefaultStyle().atomRadius,
      bondThickness: createDefaultStyle().bondThickness,
    }));

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

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
      <section aria-labelledby="style-size-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="style-size-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            Size
          </h2>
          <span aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset scale"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetScaleClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset scale</TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS)}>
          <PercentSliderRow
            accessibleLabel="Atom"
            label={(
              <AtomRadiusModelPopover
                value={style.atomRadiusModel}
                onValueChange={setAtomRadiusModel}
              />
            )}
            max={STYLE_SCALE_MAX.atomRadius}
            min={STYLE_SCALE_MIN.atomRadius}
            value={style.atomRadius}
            disabled={isCustomAtomRadiusModel}
            onValueChange={(value) => setStyleScale("atomRadius", value)}
          />
          <PercentSliderRow
            accessibleLabel="Bond"
            label="Bond"
            max={STYLE_SCALE_MAX.bondThickness}
            min={STYLE_SCALE_MIN.bondThickness}
            value={style.bondThickness}
            onValueChange={(value) => setStyleScale("bondThickness", value)}
          />
        </div>
      </section>

      <Separator />

      <section aria-labelledby="style-fog-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <div className="col-span-2 flex min-w-0 items-center gap-2">
            <h2
              id="style-fog-label"
              className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "whitespace-nowrap leading-tight text-muted-foreground")}
            >
              Depth cueing
            </h2>
            <Switch
              checked={style.fogEnabled}
              aria-label="Depth cueing"
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
                  aria-label="Reset depth cueing"
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
            <TooltipContent side="top">Reset depth cueing</TooltipContent>
          </Tooltip>
        </div>
        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS, style.fogEnabled ? null : "opacity-55")}>
          <PercentSliderRow
            accessibleLabel="Depth cueing"
            allowZero
            disabled={!style.fogEnabled}
            label="Start"
            max={STYLE_FOG_START_MAX}
            min={STYLE_FOG_START_MIN}
            value={style.fogStart}
            valueLabel="start"
            onValueChange={setFogStart}
          />
          <PercentSliderRow
            accessibleLabel="Depth cueing"
            allowZero
            disabled={!style.fogEnabled}
            label="Amount"
            max={STYLE_FOG_AMOUNT_MAX}
            min={STYLE_FOG_AMOUNT_MIN}
            value={style.fogAmount}
            valueLabel="amount"
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
          <span className="min-w-0 truncate leading-tight">Material</span>
          <Select
            value={style.materialPreset}
            onValueChange={(value) => setMaterialPreset(value)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Material"
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
            <span className="min-w-0 truncate">Bond style</span>
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
              aria-label="Bond style"
              className={cn("!h-6 w-full !px-2 !py-0", COMMON_PANEL_BODY_TEXT_CLASS)}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {BOND_COLOR_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    textValue={option.label}
                    className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
                  >
                    <BondStyleOptionLabel
                      label={option.label}
                      unicolorColor={style.bondColor}
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
          <span className="min-w-0 truncate leading-tight">Color scheme</span>
          <Select
            value={selectedColorSchemeValue}
            onValueChange={setColorScheme}
          >
            <SelectTrigger
              size="sm"
              aria-label="Color scheme"
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
                  textValue="Custom"
                  className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
                >
                  <CustomColorSchemeOptionLabel />
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function AtomRadiusModelPopover({
  onValueChange,
  value,
}: {
  onValueChange: (value: AtomRadiusStyleModel) => void;
  value: AtomRadiusStyleModel;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = ATOM_RADIUS_MODEL_OPTIONS.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <span className="inline-flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate">Atom</span>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Atom radius model: ${selectedOption?.menuLabel ?? "Unknown"}`}
            aria-haspopup="listbox"
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "size-5 rounded-[7px] border-input [&_svg]:size-3",
            )}
          >
            <ChevronDown aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </span>
      <PopoverContent
        align="start"
        className="w-40"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div
          className={cn(
            "px-2 pb-1 pt-1.5 leading-none text-muted-foreground",
            COMMON_PANEL_BODY_TEXT_CLASS,
          )}
        >
          Atom radius model
        </div>
        <div role="listbox" aria-label="Atom radius model" className="grid gap-0.5">
          {ATOM_RADIUS_MODEL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                COMMON_PANEL_BODY_TEXT_CLASS,
                option.value === value
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-foreground",
              )}
              onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}
            >
              <Check
                aria-hidden="true"
                className={cn(
                  "size-3 shrink-0",
                  option.value === value ? "opacity-100" : "opacity-0",
                )}
              />
              <span className="min-w-0 truncate">{option.menuLabel}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  const hexValue = normalizeHexColor(value, DEFAULT_BOND_COLOR);
  return (
    <HexColorPicker
      align="center"
      ariaLabel="Bond color"
      fallbackValue={DEFAULT_BOND_COLOR}
      inputLabel="Bond color value"
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

function CustomColorSchemeOptionLabel() {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={CUSTOM_COLOR_SCHEME_TOKEN_STYLE}
      />
      <span className="min-w-0 truncate">Custom</span>
    </span>
  );
}
