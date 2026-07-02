import { RotateCcw } from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  ATOM_LABEL_SIZE_MAX,
  ATOM_LABEL_SIZE_MIN,
  atomLabelElementsForAtoms,
  atomLabelOptionsForAtoms,
  COMPONENT_OPACITY_MAX,
  createDefaultComponentOpacity,
  selectedAtomLabelSettingsForScene,
  type AtomLabelMode,
  type AtomLabelSettings,
  type ComponentOpacityState,
  type ComponentVisibilityState,
} from "../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../surface";
import { TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS } from "./controlFeedback";
import {
  clampOpacityValue,
  formatOpacityValue,
  PercentSliderRow,
  parseOpacityInput,
  snapSliderOpacityValue,
  useAutoBlurSlider,
} from "./sharedControls";
import {
  COMMON_PANEL_BODY_TEXT_CLASS,
  COMMON_PANEL_ROW_STACK_CLASS,
  COMMON_PANEL_SECTION_TITLE_TEXT_CLASS,
} from "./styles";

export function DisplayTabContent({
  hasPolyhedra,
  onOpacityChange,
  onVisibilityChange,
  opacity,
  sceneAtoms,
  visibility,
}: {
  hasPolyhedra: boolean;
  onOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  opacity: ComponentOpacityState;
  sceneAtoms: ComponentVisibilitySceneAtom[];
  visibility: ComponentVisibilityState;
}) {
  function setVisibility(key: keyof ComponentVisibilityState, value: boolean) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      [key]: value,
    }));
  }

  function setOpacity(key: keyof ComponentOpacityState, value: number) {
    onOpacityChange((currentOpacity) => ({
      ...currentOpacity,
      [key]: clampOpacityValue(value, COMPONENT_OPACITY_MAX[key]),
    }));
  }

  function setAtomLabels(nextSettings: AtomLabelSettings) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      atomLabels: selectedAtomLabelSettingsForScene(nextSettings, sceneAtoms),
    }));
  }

  function updateAtomLabels(update: (settings: AtomLabelSettings) => AtomLabelSettings) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      atomLabels: selectedAtomLabelSettingsForScene(
        update(currentVisibility.atomLabels),
        sceneAtoms,
      ),
    }));
  }

  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
    },
    [],
  );

  function handleResetOpacityClick() {
    onOpacityChange(createDefaultComponentOpacity());

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

  return (
    <div className="flex flex-col gap-1.5">
      <section aria-labelledby="display-components-label">
        <div className="grid grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 px-1.5">
          <h2
            id="display-components-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            Objects
          </h2>
          <span className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "text-right leading-tight text-muted-foreground")}>
            Opacity
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Reset opacity"
                  className={cn(
                    TOOL_ICON_BUTTON_CLASS,
                    resetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
                    resetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
                  )}
                  onClick={handleResetOpacityClick}
                >
                  <RotateCcw aria-hidden="true" />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">Reset opacity</TooltipContent>
          </Tooltip>
        </div>

        <div className={cn("mt-1", COMMON_PANEL_ROW_STACK_CLASS)}>
          <ComponentOpacityRow
            checked={visibility.atoms}
            label="Atoms"
            max={COMPONENT_OPACITY_MAX.atoms}
            value={opacity.atoms}
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
            onOpacityChange={(value) => setOpacity("atoms", value)}
          />
          <ImageSwitchRow
            checked={visibility.atomLabels.enabled && visibility.atomLabels.kind === "element"}
            label="Atom labels"
            onCheckedChange={(checked) =>
              updateAtomLabels((settings) => ({
                ...settings,
                enabled: checked,
                kind: "element",
              }))
            }
          />
          <ImageSwitchRow
            checked={visibility.atomLabels.enabled && visibility.atomLabels.kind === "number"}
            label="Atom number"
            onCheckedChange={(checked) =>
              updateAtomLabels((settings) => ({
                ...settings,
                enabled: checked,
                kind: "number",
              }))
            }
          />
          {visibility.atomLabels.enabled ? (
            <AtomLabelControls
              atoms={sceneAtoms}
              settings={selectedAtomLabelSettingsForScene(visibility.atomLabels, sceneAtoms)}
              onSettingsChange={setAtomLabels}
            />
          ) : null}
          <ComponentOpacityRow
            checked={visibility.bonds}
            label="Bonds"
            max={COMPONENT_OPACITY_MAX.bonds}
            value={opacity.bonds}
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
            onOpacityChange={(value) => setOpacity("bonds", value)}
          />
          <ComponentOpacityRow
            checked={visibility.unitCell}
            label="Unit cell"
            max={COMPONENT_OPACITY_MAX.unitCell}
            value={opacity.unitCell}
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
            onOpacityChange={(value) => setOpacity("unitCell", value)}
          />
          <ComponentOpacityRow
            checked={hasPolyhedra && visibility.polyhedra}
            checkboxDisabled={!hasPolyhedra}
            label="Polyhedra"
            max={COMPONENT_OPACITY_MAX.polyhedra}
            value={opacity.polyhedra}
            onCheckedChange={(checked) => setVisibility("polyhedra", checked)}
            onOpacityChange={(value) => setOpacity("polyhedra", value)}
          />
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
        >
          Periodic images
        </h2>
        <div className="mt-1.5 flex flex-col gap-1">
          <ImageSwitchRow
            checked={visibility.boundaryAtoms}
            label="Cell-boundary atoms"
            onCheckedChange={(checked) => setVisibility("boundaryAtoms", checked)}
          />
          <ImageSwitchRow
            checked={visibility.oneHopBondedAtoms}
            label="One-hop bonded atoms"
            onCheckedChange={(checked) => setVisibility("oneHopBondedAtoms", checked)}
          />
        </div>
      </section>
    </div>
  );
}

type ComponentVisibilitySceneAtom = Parameters<typeof atomLabelElementsForAtoms>[0][number];

function AtomLabelControls({
  atoms,
  onSettingsChange,
  settings,
}: {
  atoms: ComponentVisibilitySceneAtom[];
  onSettingsChange: (settings: AtomLabelSettings) => void;
  settings: AtomLabelSettings;
}) {
  const elements = atomLabelElementsForAtoms(atoms);
  const atomOptions = atomLabelOptionsForAtoms(atoms);

  function updateSettings(nextSettings: AtomLabelSettings) {
    onSettingsChange(selectedAtomLabelSettingsForScene(nextSettings, atoms));
  }

  function setMode(mode: AtomLabelMode) {
    updateSettings({ ...settings, mode });
  }

  return (
    <div className="rounded-md bg-muted/35 px-1.5 py-1.5">
      <PercentSliderRow
        accessibleLabel={settings.kind === "number" ? "Atom number" : "Element label"}
        allowZero={false}
        label={settings.kind === "number" ? "Number size" : "Label size"}
        min={ATOM_LABEL_SIZE_MIN}
        max={ATOM_LABEL_SIZE_MAX}
        value={settings.size}
        valueLabel="size"
        onValueChange={(size) => updateSettings({ ...settings, size })}
      />

      <div className={cn("grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.1rem] items-center gap-2 px-1.5", COMMON_PANEL_BODY_TEXT_CLASS)}>
        <span className="min-w-0 truncate leading-tight">
          {settings.kind === "number" ? "Show numbers" : "Show labels"}
        </span>
        <Select value={settings.mode} onValueChange={(value) => setMode(value as AtomLabelMode)}>
          <SelectTrigger
            size="sm"
            aria-label={settings.kind === "number" ? "Atom number visibility mode" : "Element label visibility mode"}
            className="h-[24px] w-full bg-background px-2 py-0 text-xs"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" className="!bg-background !text-foreground">
            <SelectGroup>
              <SelectItem value="all" className="text-xs">All atoms</SelectItem>
              <SelectItem value="elements" className="text-xs">By element</SelectItem>
              <SelectItem value="atoms" className="text-xs">By atom</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {settings.mode === "elements" ? (
        <div className="mt-1 grid grid-cols-3 gap-1 px-1.5">
          {elements.map((element) => (
            <label
              key={element}
              className={cn(
                "flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-accent/60",
                COMMON_PANEL_BODY_TEXT_CLASS,
              )}
            >
              <Checkbox
                checked={settings.elements[element] !== false}
                aria-label={`Show ${element} labels`}
                className="size-3.5 rounded-[3px]"
                iconClassName="size-3"
                onCheckedChange={(checked) =>
                  updateSettings({
                    ...settings,
                    elements: {
                      ...settings.elements,
                      [element]: checked === true,
                    },
                  })
                }
              />
              <span className="min-w-0 truncate leading-tight">{element}</span>
            </label>
          ))}
        </div>
      ) : null}

      {settings.mode === "atoms" ? (
        <div className="mt-1 grid max-h-28 grid-cols-3 gap-1 overflow-y-auto px-1.5">
          {atomOptions.map((option) => (
            <label
              key={option.atomId}
              className={cn(
                "flex h-6 min-w-0 items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-accent/60",
                COMMON_PANEL_BODY_TEXT_CLASS,
              )}
            >
              <Checkbox
                checked={settings.atomIds.includes(option.atomId)}
                aria-label={`Show ${option.label} label`}
                className="size-3.5 rounded-[3px]"
                iconClassName="size-3"
                onCheckedChange={(checked) => {
                  const nextAtomIds = checked === true
                    ? Array.from(new Set([...settings.atomIds, option.atomId]))
                    : settings.atomIds.filter((atomId) => atomId !== option.atomId);
                  updateSettings({
                    ...settings,
                    atomIds: nextAtomIds,
                  });
                }}
              />
              <span className="min-w-0 truncate leading-tight">{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComponentOpacityRow({
  checked,
  checkboxDisabled = false,
  label,
  max,
  onCheckedChange,
  onOpacityChange,
  value,
}: {
  checked: boolean;
  checkboxDisabled?: boolean;
  label: string;
  max: number;
  onCheckedChange: (checked: boolean) => void;
  onOpacityChange: (opacity: number) => void;
  value: number;
}) {
  const [opacityText, setOpacityText] = useState(formatOpacityValue(value));
  const sliderBlur = useAutoBlurSlider();
  const sliderPosition = max > 0 ? value / max : 0;
  const sliderStyle = {
    "--opacity-slider-position": `${Math.min(100, Math.max(0, sliderPosition * 100))}%`,
  } as CSSProperties;
  const inputDisabled = checkboxDisabled || !checked;

  useEffect(() => {
    setOpacityText(formatOpacityValue(value));
  }, [value]);

  function commitOpacityText() {
    const nextOpacity = parseOpacityInput(opacityText);
    if (nextOpacity === null) {
      setOpacityText(formatOpacityValue(value));
      return;
    }

    const clampedOpacity = clampOpacityValue(nextOpacity, max);
    setOpacityText(formatOpacityValue(clampedOpacity));
    onOpacityChange(clampedOpacity);
  }

  function handleOpacityKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitOpacityText();
      return;
    }

    if (event.key === "Escape") {
      setOpacityText(formatOpacityValue(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? 1 : -1;
      onOpacityChange(clampOpacityValue(value + direction, max));
    }
  }

  return (
    <div
      className={cn(
        "grid h-7 min-w-0 grid-cols-[minmax(5.5rem,1fr)_6.75rem_2.35rem] items-center gap-2 rounded-md px-1.5 transition-colors",
        COMMON_PANEL_BODY_TEXT_CLASS,
        checkboxDisabled ? "text-muted-foreground/55" : "hover:bg-accent/60",
      )}
    >
      <label
        className={cn(
          "flex min-w-0 items-center gap-2",
          checkboxDisabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={checkboxDisabled}
          aria-label={label}
          className="size-3.5 rounded-[3px]"
          iconClassName="size-3"
          onCheckedChange={(nextChecked) => onCheckedChange(nextChecked === true)}
        />
        <span
          className={cn(
            "min-w-0 truncate leading-tight",
            checkboxDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          {label}
        </span>
      </label>

      <div
        className="opacity-slider-shell relative mr-3 h-5"
        data-disabled={inputDisabled ? "true" : "false"}
        style={sliderStyle}
      >
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={inputDisabled}
          aria-label={`${label} opacity`}
          aria-valuetext={`${formatOpacityValue(value)}%`}
          className="opacity-slider absolute inset-0 z-10 h-full w-full"
          ref={sliderBlur.ref}
          onChange={(event) =>
            onOpacityChange(snapSliderOpacityValue(Number(event.target.value), max))
          }
          onMouseDown={sliderBlur.handlePointerDown}
          onMouseUp={sliderBlur.handlePointerEnd}
          onPointerCancel={sliderBlur.handlePointerEnd}
          onPointerDown={sliderBlur.handlePointerDown}
          onPointerUp={sliderBlur.handlePointerEnd}
        />
        <span aria-hidden="true" className="opacity-slider-track pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-fill pointer-events-none" />
        <span aria-hidden="true" className="opacity-slider-thumb pointer-events-none" />
      </div>

      <label
        className="opacity-value-control group flex h-[22px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150"
        data-disabled={inputDisabled ? "true" : "false"}
      >
        <span className="sr-only">{label} opacity value</span>
        <input
          type="text"
          inputMode="numeric"
          value={opacityText}
          disabled={inputDisabled}
          aria-label={`${label} opacity value`}
          className="opacity-value-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
          onBlur={commitOpacityText}
          onChange={(event) => setOpacityText(event.target.value)}
          onKeyDown={handleOpacityKeyDown}
        />
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground",
            inputDisabled ? "text-muted-foreground/60" : null,
          )}
        >
          %
        </span>
      </label>
    </div>
  );
}

function ImageSwitchRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-6 items-center justify-between gap-1.5 rounded-md px-1.5 transition-colors hover:bg-accent/60",
        COMMON_PANEL_BODY_TEXT_CLASS,
      )}
    >
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Switch
        checked={checked}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}
