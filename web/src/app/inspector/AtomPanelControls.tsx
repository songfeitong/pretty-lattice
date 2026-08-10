import { ChevronDown, Eye, EyeOff, Minus } from "lucide-react";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomSpec } from "../../api/scene";
import {
  CUSTOM_ATOM_RADIUS_MODEL,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  clampAtomOpacity,
  clampAtomRadius,
  type AtomAppearance,
  type AtomRadiusStyleModel,
  type StyleState,
} from "../../model";
import { lambertLegendSwatchBackground } from "../../scene/renderAppearance";
import {
  objectsAtomColorPickerId,
  objectsElementColorPickerId,
} from "../colorPickerRegistry";
import { HexColorPicker, normalizeHexColor } from "../controls/HexColorPicker";
import { PercentSliderRow } from "../controls/commonPanel/sharedControls";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";
import {
  CompactNumberCell,
  parseFiniteNumber,
  parsePositiveNumber,
} from "./CompactNumberInput";
import type { AtomAppearanceEditor } from "./atomAppearanceEditor";
import {
  formatAtomSite,
  type AtomAppearanceModel,
  type HiddenAtomRow,
} from "./atomAppearanceModel";

const RADIUS_STEP = 0.01;
const OPACITY_STEP = 1;
export const ATOM_CONTROL_GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_1.5rem] items-center gap-2";
const ATOM_RADIUS_MODEL_OPTIONS: {
  labelKey:
    | "style.atomic"
    | "style.custom"
    | "style.ionic"
    | "style.uniform"
    | "style.vanDerWaals";
  value: AtomRadiusStyleModel;
}[] = [
  { labelKey: "style.uniform", value: "uniform" },
  { labelKey: "style.atomic", value: "atomic" },
  { labelKey: "style.vanDerWaals", value: "vdw" },
  { labelKey: "style.ionic", value: "ionic" },
  { labelKey: "style.custom", value: CUSTOM_ATOM_RADIUS_MODEL },
];

export function AtomGlobalControls({
  editor,
  style,
}: {
  editor: AtomAppearanceEditor;
  style: StyleState;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div data-slot="atom-radius-controls" className="flex flex-col gap-1">
        <div className="grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.6rem] items-center gap-2 rounded-md px-1.5">
          <span className="min-w-0 leading-tight">
            {t("style.atomRadiusModel")}
          </span>
          <Select
            value={style.atomRadiusModel}
            onValueChange={(value) =>
              editor.setAtomRadiusModel(value as AtomRadiusStyleModel)
            }
          >
            <SelectTrigger
              size="sm"
              aria-label={t("style.atomRadiusModel")}
              className="!h-6 w-full !px-2 !py-0 bg-background text-[13px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent
              position="popper"
              className="!bg-background !text-foreground"
            >
              <SelectGroup>
                {ATOM_RADIUS_MODEL_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-6 py-0.5 text-[13px]"
                  >
                    {t(option.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <PercentSliderRow
          accessibleLabel={t("style.atom")}
          label={t("style.atomRadiusScale")}
          max={STYLE_SCALE_MAX.atomRadius}
          min={STYLE_SCALE_MIN.atomRadius}
          value={style.atomRadius}
          disabled={style.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL}
          valueLabel={t("style.scale")}
          onValueChange={editor.setAtomRadiusScale}
        />
      </div>
      <AtomSectionSeparator dataSlot="atom-radius-controls-separator" />
      <div
        data-slot="atom-column-header"
        className={cn(
          ATOM_CONTROL_GRID_CLASS,
          "min-h-4 border-x border-transparent px-2.5 text-[11px] font-medium leading-none text-muted-foreground",
        )}
      >
        <span>{t("objectsPanel.atom")}</span>
        <span className="text-center">{t("objectsPanel.radius")}</span>
        <span className="text-center">{t("objectsPanel.opacity")}</span>
        <span aria-hidden="true" />
      </div>
    </>
  );
}

export function AtomElementGroups({
  editor,
  elementContainerByElementRef,
  model,
}: {
  editor: AtomAppearanceEditor;
  elementContainerByElementRef: MutableRefObject<Map<string, HTMLElement>>;
  model: AtomAppearanceModel;
}) {
  const { t } = useTranslation();
  return (
    <div data-slot="atom-element-groups" className="mt-1 flex flex-col gap-2">
      {model.elementGroups.map((group) => {
        const appearance = model.elementAppearanceByElement.get(group.element);
        if (!appearance) return null;
        const selectedAtom =
          model.selectedAtom?.element === group.element
            ? model.selectedAtom
            : null;
        const elementContainer = (
          <section
            ref={(node) => {
              if (node)
                elementContainerByElementRef.current.set(group.element, node);
              else elementContainerByElementRef.current.delete(group.element);
            }}
            aria-label={t("objectsPanel.elementGroup", {
              element: group.element,
            })}
            className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs shadow-foreground/[0.025]"
          >
            <div
              data-slot="atom-control-row"
              className={cn(ATOM_CONTROL_GRID_CLASS, "min-h-7 px-2.5 py-2")}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <ColorCell
                  ariaLabel={t("objectsPanel.setElementColor", {
                    element: group.element,
                  })}
                  color={appearance.color}
                  inputLabel={t("colorPicker.colorValue", {
                    target: group.element,
                  })}
                  onChange={(color) =>
                    editor.setElementColor(group.element, color)
                  }
                  pickerId={objectsElementColorPickerId(group.element)}
                />
                <div className="flex min-w-0 items-center gap-0.5">
                  <span className="w-5 shrink-0 text-left font-semibold leading-tight text-foreground">
                    {group.element}
                  </span>
                  <span className="min-w-0 text-left text-[11px] leading-none text-muted-foreground tabular-nums">
                    {group.atoms.length}
                  </span>
                </div>
              </div>
              <RadiusCell
                ariaLabel={t("objectsPanel.radiusControl", {
                  target: group.element,
                })}
                value={appearance.radius}
                onCommit={(value) =>
                  editor.setElementRadius(group.element, value)
                }
              />
              <OpacityCell
                ariaLabel={t("objectsPanel.opacityControl", {
                  target: group.element,
                })}
                value={appearance.opacity}
                onCommit={(value) =>
                  editor.setElementOpacity(group.element, value)
                }
              />
              <VisibilityCell
                ariaLabel={t("objectsPanel.visibility", {
                  target: group.element,
                })}
                visible={appearance.visible}
                onToggle={() =>
                  editor.setElementVisible(group.element, !appearance.visible)
                }
              />
            </div>
            <SelectedAtomWorkspace
              workspace={
                selectedAtom
                  ? {
                      appearance: model.resolveAtom(selectedAtom),
                      atom: selectedAtom,
                      editor,
                    }
                  : null
              }
            />
          </section>
        );
        return (
          <ContextMenu key={group.element}>
            <ContextMenuTrigger asChild>{elementContainer}</ContextMenuTrigger>
            <ContextMenuContent className="min-w-48">
              <ContextMenuItem
                onSelect={() => editor.applyElementToAllAtoms(group.element)}
              >
                {t("objectsPanel.applyElementStyleToAtoms", {
                  element: group.element,
                })}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
    </div>
  );
}

interface SelectedAtomWorkspaceModel {
  appearance: AtomAppearance;
  atom: AtomSpec;
  editor: AtomAppearanceEditor;
}

function SelectedAtomWorkspace({
  workspace,
}: {
  workspace: SelectedAtomWorkspaceModel | null;
}) {
  const [displayedWorkspace, setDisplayedWorkspace] = useState(workspace);
  const [expanded, setExpanded] = useState(workspace !== null);
  const activeWorkspace = workspace ?? displayedWorkspace;

  useEffect(() => {
    if (workspace) {
      setDisplayedWorkspace(workspace);
      setExpanded(true);
    } else {
      setExpanded(false);
    }
  }, [workspace?.atom.id, workspace !== null]);

  if (!activeWorkspace) return null;
  return (
    <div
      data-slot="selected-atom-workspace"
      aria-hidden={!expanded}
      inert={!expanded}
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduced:transition-none",
        expanded
          ? "grid-rows-[1fr] opacity-100"
          : "pointer-events-none grid-rows-[0fr] opacity-0",
      )}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && !expanded && !workspace)
          setDisplayedWorkspace(null);
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <SelectedAtomWorkspaceContent {...activeWorkspace} />
      </div>
    </div>
  );
}

function SelectedAtomWorkspaceContent({
  appearance,
  atom,
  editor,
}: SelectedAtomWorkspaceModel) {
  const { t } = useTranslation();
  const atomLabel = formatAtomSite(atom);
  return (
    <div data-slot="selected-atom-content" className="bg-muted/45">
      <Separator className="opacity-70" />
      <div
        data-slot="atom-control-row"
        className={cn(ATOM_CONTROL_GRID_CLASS, "min-h-7 px-2.5 py-1.5")}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ColorCell
            ariaLabel={t("objectsPanel.setAtomColor", { atom: atomLabel })}
            color={appearance.color}
            inputLabel={t("colorPicker.colorValue", { target: atomLabel })}
            onChange={(color) => editor.setAtomColor(atom, color)}
            pickerId={objectsAtomColorPickerId(atom.id)}
          />
          <span className="truncate font-mono text-[12px] text-foreground">
            {atomLabel}
          </span>
        </div>
        <RadiusCell
          ariaLabel={t("objectsPanel.radiusControl", { target: atomLabel })}
          value={appearance.radius}
          onCommit={(value) => editor.setAtomRadius(atom, value)}
        />
        <OpacityCell
          ariaLabel={t("objectsPanel.opacityControl", { target: atomLabel })}
          value={appearance.opacity}
          onCommit={(value) => editor.setAtomOpacity(atom, value)}
        />
        <VisibilityCell
          ariaLabel={t("objectsPanel.visibility", { target: atomLabel })}
          visible={appearance.visible}
          onToggle={() => editor.setAtomVisible(atom, !appearance.visible)}
        />
      </div>
    </div>
  );
}

export function HiddenAtoms({
  atoms,
  editor,
}: {
  atoms: readonly HiddenAtomRow[];
  editor: AtomAppearanceEditor;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const previousAtomCountRef = useRef(atoms.length);
  useEffect(() => {
    const previousAtomCount = previousAtomCountRef.current;
    previousAtomCountRef.current = atoms.length;
    if (previousAtomCount === 0 && atoms.length > 0) setExpanded(true);
    else if (atoms.length === 0) setExpanded(false);
  }, [atoms.length]);

  if (atoms.length === 0) return null;
  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      data-slot="hidden-atoms"
    >
      <AtomSectionSeparator dataSlot="hidden-atoms-separator" muted />
      <div
        data-slot="hidden-atoms-header"
        className="flex min-h-6 items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground"
      >
        <span
          data-slot="hidden-atoms-label"
          className="flex items-baseline gap-1.5"
        >
          <span>{t("objectsPanel.hiddenAtoms")}</span>
          <span className="tabular-nums">{atoms.length}</span>
        </span>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${t("objectsPanel.hiddenAtoms")} ${atoms.length}`}
            className="size-6 rounded-md text-foreground/70 hover:bg-muted/35 hover:text-foreground"
          >
            <ChevronDown
              data-slot="hidden-atoms-chevron"
              aria-hidden="true"
              className={cn(
                "transition-transform duration-240 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduced:transition-none",
                expanded ? "rotate-0" : "-rotate-90",
              )}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent
        forceMount
        aria-hidden={!expanded}
        inert={!expanded}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduced:transition-none",
          expanded
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-0.5 flex flex-col gap-0.5">
            {atoms.map(({ atom, color }) => {
              const atomLabel = formatAtomSite(atom);
              return (
                <div
                  key={atom.id}
                  data-slot="hidden-atom-row"
                  className="flex h-7 items-center justify-between rounded-md px-2.5 text-muted-foreground hover:bg-muted/35"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StaticColorToken color={color} />
                    <span className="font-mono text-[12px]">{atomLabel}</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t("objectsPanel.restoreElementVisibility", {
                          atom: atomLabel,
                        })}
                        className={cn(
                          TOOL_ICON_BUTTON_CLASS,
                          "size-6 rounded-[8px] text-muted-foreground [&_svg]:size-3.5",
                        )}
                        onClick={() => editor.restoreAtomVisibility(atom)}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {t("objectsPanel.restoreElementVisibility", {
                        atom: atomLabel,
                      })}
                    </TooltipContent>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AtomSectionSeparator({
  dataSlot,
  muted = false,
}: {
  dataSlot: string;
  muted?: boolean;
}) {
  return (
    <div data-slot={dataSlot} className="py-4">
      <Separator className={cn(muted && "opacity-70")} />
    </div>
  );
}

function StaticColorToken({ color }: { color: string }) {
  const hexColor = normalizeHexColor(color);
  return (
    <span
      className="inline-flex h-6 items-center justify-center"
      aria-hidden="true"
    >
      <span
        data-slot="atom-color-token"
        className="size-4 shrink-0 rounded-full border border-foreground/10 shadow-sm"
        style={{ background: lambertLegendSwatchBackground(hexColor) }}
      />
    </span>
  );
}

function RadiusCell({
  ariaLabel,
  onCommit,
  value,
}: {
  ariaLabel: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  return (
    <CompactNumberCell
      ariaLabel={ariaLabel}
      clampValue={clampAtomRadius}
      className="w-[42px] justify-self-center px-1.5"
      formatValue={(value) => value.toFixed(2)}
      inputMode="decimal"
      parseValue={parsePositiveNumber}
      step={RADIUS_STEP}
      value={value}
      onCommit={onCommit}
    />
  );
}

function OpacityCell({
  ariaLabel,
  onCommit,
  value,
}: {
  ariaLabel: string;
  onCommit: (value: number) => void;
  value: number;
}) {
  return (
    <CompactNumberCell
      ariaLabel={ariaLabel}
      clampValue={clampAtomOpacity}
      className="w-9 justify-self-center px-1.5"
      formatValue={(value) => String(Math.round(clampAtomOpacity(value)))}
      inputMode="numeric"
      parseValue={parseFiniteNumber}
      step={OPACITY_STEP}
      value={value}
      onCommit={onCommit}
    />
  );
}

function ColorCell({
  ariaLabel,
  color,
  inputLabel,
  onChange,
  pickerId,
}: {
  ariaLabel: string;
  color: string;
  inputLabel: string;
  onChange: (color: string) => void;
  pickerId: string;
}) {
  const hexColor = normalizeHexColor(color);
  return (
    <span className="inline-flex h-6 items-center justify-center">
      <HexColorPicker
        align="center"
        ariaLabel={ariaLabel}
        inputLabel={inputLabel}
        pickerId={pickerId}
        side="left"
        triggerClassName="size-4 transition-transform duration-150 ease-out hover:scale-[1.08] motion-reduced:transition-none motion-reduced:hover:scale-100"
        value={hexColor}
        swatchClassName="size-4 rounded-full"
        swatchStyle={{ background: lambertLegendSwatchBackground(hexColor) }}
        onValueChange={onChange}
      />
    </span>
  );
}

function VisibilityCell({
  ariaLabel,
  onToggle,
  visible,
}: {
  ariaLabel: string;
  onToggle: () => void;
  visible: boolean;
}) {
  const Icon = visible ? Eye : EyeOff;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={ariaLabel}
      aria-pressed={visible}
      className={cn(
        TOOL_ICON_BUTTON_CLASS,
        "size-6 rounded-[8px] [&_svg]:size-3.5",
        visible ? "text-foreground" : "text-muted-foreground/55",
      )}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
