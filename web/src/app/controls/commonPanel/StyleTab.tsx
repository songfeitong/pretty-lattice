import { RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomRadiusModel } from "../../../api/scene";
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
  STYLE_FOG_START_MAX,
  STYLE_FOG_START_MIN,
  STYLE_FOG_STRENGTH_MAX,
  STYLE_FOG_STRENGTH_MIN,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  createDefaultStyle,
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
import { MaterialPresetToken3D } from "./MaterialPresetToken3D";

const BOND_COLOR_OPTIONS: { label: string; value: BondColorMode }[] = [
  { label: "By atom", value: "by-atom" },
  { label: "Uniform", value: "neutral" },
];
const ATOM_RADIUS_MODEL_OPTIONS: {
  menuLabel: string;
  triggerLabel: string;
  value: AtomRadiusModel;
}[] = [
  { menuLabel: "Uniform", triggerLabel: "Uniform", value: "uniform" },
  { menuLabel: "Atomic", triggerLabel: "Atomic", value: "atomic" },
  { menuLabel: "Van der Waals", triggerLabel: "vdW", value: "vdw" },
  { menuLabel: "Ionic", triggerLabel: "Ionic", value: "ionic" },
];
const UNICOLOR_TOKEN_STYLE = { background: "#aeb5c0" } as const;
const BY_ATOM_TOKEN_STYLE = { background: "linear-gradient(90deg, #f58c9a 0 50%, #78a7ff 50% 100%)" } as const;

export function StyleTabContent({
  onAtomRadiusModelChange,
  onStyleChange,
  style,
}: {
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  function setStyleScale(key: keyof typeof STYLE_SCALE_MIN, value: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      [key]: clampPercentValue(value, STYLE_SCALE_MIN[key], STYLE_SCALE_MAX[key]),
    }));
  }

  function setAtomRadiusModel(atomRadiusModel: AtomRadiusModel) {
    onAtomRadiusModelChange(atomRadiusModel);
  }

  function setBondColorMode(bondColorMode: BondColorMode) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      bondColorMode,
    }));
  }

  function setColorScheme(colorScheme: ColorScheme) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      colorScheme,
    }));
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

  function setFogStrength(fogStrength: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      fogStrength: clampPercentValue(
        fogStrength,
        STYLE_FOG_STRENGTH_MIN,
        STYLE_FOG_STRENGTH_MAX,
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
      fogStart: createDefaultStyle().fogStart,
      fogStrength: createDefaultStyle().fogStrength,
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
            Radius
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
              <AtomRadiusModelSelect
                value={style.atomRadiusModel}
                onValueChange={setAtomRadiusModel}
              />
            )}
            max={STYLE_SCALE_MAX.atomRadius}
            min={STYLE_SCALE_MIN.atomRadius}
            value={style.atomRadius}
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
          <div className="flex min-w-0 items-center gap-2">
            <h2
              id="style-fog-label"
              className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
            >
              Fog
            </h2>
            <Switch
              checked={style.fogEnabled}
              aria-label="Fog"
              className="h-4 w-7 p-0.5"
              thumbClassName="size-3 data-[state=checked]:translate-x-3"
              onCheckedChange={setFogEnabled}
            />
          </div>
          <span aria-hidden="true" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset fog"
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
            <TooltipContent side="top">Reset fog</TooltipContent>
          </Tooltip>
        </div>
        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS, style.fogEnabled ? null : "opacity-55")}>
          <PercentSliderRow
            accessibleLabel="Fog"
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
            accessibleLabel="Fog"
            allowZero
            disabled={!style.fogEnabled}
            label="Strength"
            max={STYLE_FOG_STRENGTH_MAX}
            min={STYLE_FOG_STRENGTH_MIN}
            value={style.fogStrength}
            valueLabel="strength"
            onValueChange={setFogStrength}
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
          <span className="min-w-0 truncate leading-tight">Bond style</span>
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
            value={style.colorScheme}
            onValueChange={(value) => setColorScheme(value as ColorScheme)}
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
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function AtomRadiusModelSelect({
  onValueChange,
  value,
}: {
  onValueChange: (value: AtomRadiusModel) => void;
  value: AtomRadiusModel;
}) {
  const selectedOption = ATOM_RADIUS_MODEL_OPTIONS.find((option) => option.value === value);

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => onValueChange(nextValue as AtomRadiusModel)}
    >
      <SelectTrigger
        size="sm"
        aria-label="Atom radius model"
        className={cn(
          "-ml-1.5 !h-6 w-20 gap-0.5 !py-0 !pr-0.5 !pl-1.5 [&_svg]:size-3.5",
          COMMON_PANEL_BODY_TEXT_CLASS,
        )}
      >
        <span data-slot="select-value" className="min-w-0 truncate">
          {selectedOption?.triggerLabel}
        </span>
      </SelectTrigger>
      <SelectContent
        position="popper"
        className="!bg-background !text-foreground"
      >
        <SelectGroup>
          <SelectLabel className="py-1 text-xs font-medium">Atom radius model</SelectLabel>
          {ATOM_RADIUS_MODEL_OPTIONS.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              textValue={option.menuLabel}
              className={cn("min-h-6 py-0.5", COMMON_PANEL_BODY_TEXT_CLASS)}
            >
              {option.menuLabel}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
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
  value,
}: {
  label: string;
  value: BondColorMode;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className="h-3 w-6 shrink-0 rounded-full border border-border"
        style={bondStyleTokenStyle(value)}
      />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function bondStyleTokenStyle(value: BondColorMode): CSSProperties | undefined {
  if (value === "neutral") {
    return UNICOLOR_TOKEN_STYLE;
  }
  if (value === "by-atom") {
    return BY_ATOM_TOKEN_STYLE;
  }
  return undefined;
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
