import { ChevronDown, Eye, EyeOff, Minus } from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomSpec, SceneSpec } from "../../api/scene";
import {
  CUSTOM_ATOM_RADIUS_MODEL,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  atomHasExplicitHiddenOverride,
  baseAtomRadiusForStyle,
  baseColorSchemeForStyle,
  canonicalAtomsForObjectStyles,
  clampAtomOpacity,
  clampAtomRadius,
  clearAtomOverridePropertyForAtom,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  createCustomAtomRadii,
  createCustomColormapFromStyle,
  elementColorOverridesForStyle,
  resolveAtomAppearance,
  setAtomOverrideProperty,
  setElementOverrideProperty,
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
import { PercentSliderRow, clampPercentValue } from "../controls/commonPanel/sharedControls";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";

export interface AtomLocateRequest {
  atomId: string;
  token: number;
}

interface ElementGroup {
  atoms: AtomSpec[];
  element: string;
}

interface HiddenAtomRow {
  atom: AtomSpec;
  color: string;
}

const RADIUS_STEP = 0.01;
const OPACITY_STEP = 1;
const ATOM_CONTROL_GRID_CLASS =
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

export function AtomsPanel({
  atomLocateRequest,
  atomOpacity,
  atomsVisible,
  onAtomLocateRequestHandled,
  onElementColorChange,
  onStyleChange,
  scene,
  selectedAtomId,
  style,
}: {
  atomLocateRequest: AtomLocateRequest | null;
  atomOpacity: number;
  atomsVisible: boolean;
  onAtomLocateRequestHandled: (token: number) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  const { t } = useTranslation();
  const elementContainerByElementRef = useRef(new Map<string, HTMLElement>());
  const objectAtoms = useMemo(
    () => canonicalAtomsForObjectStyles(scene.atoms),
    [scene.atoms],
  );
  const elementGroups = useMemo(() => groupAtomsByElement(objectAtoms), [objectAtoms]);
  const colorScheme = baseColorSchemeForStyle(style);
  const colorOverrides = useMemo(
    () => elementColorOverridesForStyle(objectAtoms, style),
    [objectAtoms, style],
  );
  const atomById = useMemo(() => atomLookupForScene(scene), [scene]);
  const selectedAtom = selectedAtomId ? atomById.get(selectedAtomId) ?? null : null;
  const elementAppearanceByElement = useMemo(
    () =>
      elementAppearanceByElementForGroups(
        elementGroups,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
        atomOpacity,
      ),
    [atomOpacity, atomsVisible, colorOverrides, colorScheme, elementGroups, style],
  );
  const hiddenAtoms = useMemo(
    () =>
      hiddenAtomRowsForAtoms(
        objectAtoms,
        selectedAtom?.id ?? null,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
        atomOpacity,
      ),
    [atomOpacity, atomsVisible, colorOverrides, colorScheme, objectAtoms, selectedAtom?.id, style],
  );

  useLayoutEffect(() => {
    if (!atomLocateRequest) {
      return;
    }

    const atom = atomById.get(atomLocateRequest.atomId);
    if (atom) {
      scrollElementIntoInspectorBody(
        elementContainerByElementRef.current.get(atom.element) ?? null,
      );
    }
    onAtomLocateRequestHandled(atomLocateRequest.token);
  }, [atomById, atomLocateRequest, onAtomLocateRequestHandled]);

  function setElementRadius(element: string, radius: number) {
    const nextStyle = ensureCustomRadiusStyle(style, objectAtoms);
    let objectStyles = setElementOverrideProperty(
      nextStyle.objectStyles,
      element,
      "radius",
      radius,
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      objectAtoms,
      element,
      "radius",
    );
    onStyleChange({ ...nextStyle, objectStyles });
  }

  function setAtomRadius(atom: AtomSpec, radius: number) {
    const nextStyle = ensureCustomRadiusStyle(style, objectAtoms);
    onStyleChange({
      ...nextStyle,
      objectStyles: setAtomOverrideProperty(
        nextStyle.objectStyles,
        atom.siteId,
        "radius",
        radius,
      ),
    });
  }

  function setElementOpacity(element: string, opacity: number) {
    let objectStyles = setElementOverrideProperty(
      style.objectStyles,
      element,
      "opacity",
      opacity,
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      objectAtoms,
      element,
      "opacity",
    );
    onStyleChange({ ...style, objectStyles });
  }

  function setAtomOpacity(atom: AtomSpec, opacity: number) {
    onStyleChange({
      ...style,
      objectStyles: setAtomOverrideProperty(
        style.objectStyles,
        atom.siteId,
        "opacity",
        opacity,
      ),
    });
  }

  function setAtomRadiusModel(atomRadiusModel: AtomRadiusStyleModel) {
    onStyleChange((currentStyle) => {
      if (atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
        if (currentStyle.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
          return currentStyle;
        }

        const customAtomRadii = createCustomAtomRadii(objectAtoms, currentStyle);
        const objectStylesWithoutRadius = clearObjectStyleProperty(
          currentStyle.objectStyles,
          "radius",
        );
        return {
          ...currentStyle,
          atomRadiusModel,
          objectStyles: {
            ...objectStylesWithoutRadius,
            customAtomRadii,
            customRadiusBaseModel: currentStyle.atomRadiusModel,
            customRadiusPreviousScale: currentStyle.atomRadius,
          },
        };
      }

      return {
        ...currentStyle,
        atomRadius:
          currentStyle.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL &&
          currentStyle.objectStyles.customRadiusPreviousScale !== null
            ? currentStyle.objectStyles.customRadiusPreviousScale
            : currentStyle.atomRadius,
        atomRadiusModel,
        objectStyles: clearObjectStyleProperty(currentStyle.objectStyles, "radius"),
      };
    });
  }

  function setAtomRadiusScale(atomRadius: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      atomRadius: clampPercentValue(
        atomRadius,
        STYLE_SCALE_MIN.atomRadius,
        STYLE_SCALE_MAX.atomRadius,
      ),
    }));
  }

  function setElementVisible(element: string, visible: boolean) {
    let objectStyles = setElementOverrideProperty(
      style.objectStyles,
      element,
      "visible",
      visible,
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      objectAtoms,
      element,
      "visible",
    );
    onStyleChange({ ...style, objectStyles });
  }

  function setAtomVisible(atom: AtomSpec, visible: boolean) {
    onStyleChange({
      ...style,
      objectStyles: setAtomOverrideProperty(
        style.objectStyles,
        atom.siteId,
        "visible",
        visible,
      ),
    });
  }

  function restoreAtomVisibility(atom: AtomSpec) {
    onStyleChange({
      ...style,
      objectStyles: clearAtomOverridePropertyForAtom(
        style.objectStyles,
        atom,
        "visible",
      ),
    });
  }

  function setAtomColor(atom: AtomSpec, color: string) {
    const nextStyle = ensureCustomColorStyle(style, objectAtoms);
    onStyleChange({
      ...nextStyle,
      objectStyles: setAtomOverrideProperty(
        nextStyle.objectStyles,
        atom.siteId,
        "color",
        color,
      ),
    });
  }

  function applyElementToAllAtoms(group: ElementGroup) {
    const elementAppearance =
      elementAppearanceByElement.get(group.element) ??
      elementRowAppearance(
        group,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
        atomOpacity,
      );
    const nextStyle = ensureCustomRadiusStyle(style, objectAtoms);
    let objectStyles = setElementOverrideProperty(
      nextStyle.objectStyles,
      group.element,
      "radius",
      elementAppearance.radius,
    );
    objectStyles = setElementOverrideProperty(
      objectStyles,
      group.element,
      "opacity",
      elementAppearance.opacity,
    );
    objectStyles = setElementOverrideProperty(
      objectStyles,
      group.element,
      "visible",
      elementAppearance.visible,
    );
    for (const property of ["radius", "opacity", "visible", "color"] as const) {
      objectStyles = clearAtomOverridePropertyForElement(
        objectStyles,
        objectAtoms,
        group.element,
        property,
      );
    }
    onStyleChange({ ...nextStyle, objectStyles });
    onElementColorChange(group.element, elementAppearance.color);
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex min-h-0 flex-col text-[13px]">
        <div data-slot="atom-radius-controls" className="flex flex-col gap-1">
          <div className="grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.6rem] items-center gap-2 rounded-md px-1.5">
            <span className="min-w-0 leading-tight">{t("style.atomRadiusModel")}</span>
            <Select
              value={style.atomRadiusModel}
              onValueChange={(value) => setAtomRadiusModel(value as AtomRadiusStyleModel)}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("style.atomRadiusModel")}
                className="!h-6 w-full !px-2 !py-0 bg-background text-[13px]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="!bg-background !text-foreground">
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
            onValueChange={setAtomRadiusScale}
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
        <div data-slot="atom-element-groups" className="mt-1 flex flex-col gap-2">
          {elementGroups.map((group) => {
          const elementAppearance =
            elementAppearanceByElement.get(group.element) ??
            elementRowAppearance(
              group,
              style,
              colorScheme,
              colorOverrides,
              atomsVisible,
              atomOpacity,
            );
          const selectedGroupAtom =
            selectedAtom?.element === group.element ? selectedAtom : null;

          const elementContainer = (
            <section
              ref={(node) => {
                if (node) {
                  elementContainerByElementRef.current.set(group.element, node);
                } else {
                  elementContainerByElementRef.current.delete(group.element);
                }
              }}
              aria-label={t("objectsPanel.elementGroup", { element: group.element })}
              className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs shadow-foreground/[0.025]"
            >
              <div
                data-slot="atom-control-row"
                className={cn(ATOM_CONTROL_GRID_CLASS, "min-h-7 px-2.5 py-2")}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <ColorCell
                    ariaLabel={t("objectsPanel.setElementColor", { element: group.element })}
                    color={elementAppearance.color}
                    inputLabel={t("colorPicker.colorValue", { target: group.element })}
                    onChange={(color) => onElementColorChange(group.element, color)}
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
                  ariaLabel={t("objectsPanel.radiusControl", { target: group.element })}
                  value={elementAppearance.radius}
                  onCommit={(radius) => setElementRadius(group.element, radius)}
                />
                <OpacityCell
                  ariaLabel={t("objectsPanel.opacityControl", { target: group.element })}
                  value={elementAppearance.opacity}
                  onCommit={(opacity) => setElementOpacity(group.element, opacity)}
                />
                <VisibilityCell
                  ariaLabel={t("objectsPanel.visibility", { target: group.element })}
                  visible={elementAppearance.visible}
                  onToggle={() => setElementVisible(group.element, !elementAppearance.visible)}
                />
              </div>

              <SelectedAtomWorkspace
                workspace={selectedGroupAtom ? {
                  atom: selectedGroupAtom,
                  appearance: resolveAtomAppearanceForRow(
                    selectedGroupAtom,
                    style,
                    colorScheme,
                    colorOverrides,
                    atomsVisible,
                    atomOpacity,
                  ),
                  onColorChange: (color) => setAtomColor(selectedGroupAtom, color),
                  onOpacityChange: (opacity) => setAtomOpacity(selectedGroupAtom, opacity),
                  onRadiusChange: (radius) => setAtomRadius(selectedGroupAtom, radius),
                  onVisibilityChange: (visible) => setAtomVisible(selectedGroupAtom, visible),
                } : null}
              />
            </section>
          );

          return (
            <ContextMenu key={group.element}>
              <ContextMenuTrigger asChild>{elementContainer}</ContextMenuTrigger>
              <ContextMenuContent className="min-w-48">
                <ContextMenuItem onSelect={() => applyElementToAllAtoms(group)}>
                  {t("objectsPanel.applyElementStyleToAtoms", {
                    element: group.element,
                  })}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
          })}
        </div>
        <HiddenAtoms atoms={hiddenAtoms} onRestore={restoreAtomVisibility} />
      </div>
    </TooltipProvider>
  );
}

interface SelectedAtomWorkspaceModel {
  appearance: AtomAppearance;
  atom: AtomSpec;
  onColorChange: (color: string) => void;
  onOpacityChange: (opacity: number) => void;
  onRadiusChange: (radius: number) => void;
  onVisibilityChange: (visible: boolean) => void;
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
      return;
    }
    setExpanded(false);
  }, [workspace?.atom.id, workspace !== null]);

  if (!activeWorkspace) {
    return null;
  }

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
        if (
          event.target === event.currentTarget &&
          !expanded &&
          !workspace
        ) {
          setDisplayedWorkspace(null);
        }
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
  onColorChange,
  onOpacityChange,
  onRadiusChange,
  onVisibilityChange,
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
            onChange={onColorChange}
            pickerId={objectsAtomColorPickerId(atom.id)}
          />
          <span className="truncate font-mono text-[12px] text-foreground">{atomLabel}</span>
        </div>
        <RadiusCell
          ariaLabel={t("objectsPanel.radiusControl", { target: atomLabel })}
          value={appearance.radius}
          onCommit={onRadiusChange}
        />
        <OpacityCell
          ariaLabel={t("objectsPanel.opacityControl", { target: atomLabel })}
          value={appearance.opacity}
          onCommit={onOpacityChange}
        />
        <VisibilityCell
          ariaLabel={t("objectsPanel.visibility", { target: atomLabel })}
          visible={appearance.visible}
          onToggle={() => onVisibilityChange(!appearance.visible)}
        />
      </div>
    </div>
  );
}

function HiddenAtoms({
  atoms,
  onRestore,
}: {
  atoms: readonly HiddenAtomRow[];
  onRestore: (atom: AtomSpec) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const previousAtomCountRef = useRef(atoms.length);

  useEffect(() => {
    const previousAtomCount = previousAtomCountRef.current;
    previousAtomCountRef.current = atoms.length;

    if (previousAtomCount === 0 && atoms.length > 0) {
      setExpanded(true);
    } else if (atoms.length === 0) {
      setExpanded(false);
    }
  }, [atoms.length]);

  if (atoms.length === 0) {
    return null;
  }

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
        <span data-slot="hidden-atoms-label" className="flex items-baseline gap-1.5">
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
                        aria-label={t("objectsPanel.restoreElementVisibility", { atom: atomLabel })}
                        className={cn(
                          TOOL_ICON_BUTTON_CLASS,
                          "size-6 rounded-[8px] text-muted-foreground [&_svg]:size-3.5",
                        )}
                        onClick={() => onRestore(atom)}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      {t("objectsPanel.restoreElementVisibility", { atom: atomLabel })}
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
    <span className="inline-flex h-6 items-center justify-center" aria-hidden="true">
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
      formatValue={formatRadius}
      inputMode="decimal"
      inputClassName="w-[42px] justify-self-center"
      parseValue={parseRadiusInput}
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
      formatValue={formatOpacity}
      inputMode="numeric"
      inputClassName="w-9 justify-self-center"
      parseValue={parseOpacityInput}
      step={OPACITY_STEP}
      value={value}
      onCommit={onCommit}
    />
  );
}

function CompactNumberCell({
  ariaLabel,
  clampValue,
  formatValue,
  inputMode,
  inputClassName,
  onCommit,
  parseValue,
  step,
  value,
}: {
  ariaLabel: string;
  clampValue: (value: number) => number;
  formatValue: (value: number) => string;
  inputMode: "decimal" | "numeric";
  inputClassName?: string;
  onCommit: (value: number) => void;
  parseValue: (value: string) => number | null;
  step: number;
  value: number;
}) {
  const [valueText, setValueText] = useState(formatValue(value));
  const [hasEdited, setHasEdited] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cancelCommitRef = useRef(false);
  const displayedValue = isFocused && !hasEdited ? "" : valueText;

  useEffect(() => {
    setValueText(formatValue(value));
  }, [formatValue, value]);

  function commitValueText(text: string) {
    const parsedValue = parseValue(text);
    if (parsedValue === null) {
      setValueText(formatValue(value));
      return;
    }

    const nextValue = clampValue(parsedValue);
    setValueText(formatValue(nextValue));
    onCommit(nextValue);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);
    if (cancelCommitRef.current || !hasEdited) {
      cancelCommitRef.current = false;
      setValueText(formatValue(value));
      return;
    }
    commitValueText(event.currentTarget.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      cancelCommitRef.current = true;
      setValueText(formatValue(value));
      event.currentTarget.blur();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? step : -step;
      const nextValue = clampValue(value + direction);
      setHasEdited(true);
      setValueText(formatValue(nextValue));
      onCommit(nextValue);
    }
  }

  return (
    <Input
      type="text"
      inputMode={inputMode}
      aria-label={ariaLabel}
      value={displayedValue}
      className={cn(
        "h-[22px] w-11 rounded-md px-1.5 py-0 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]",
        inputClassName,
      )}
      onBlur={handleBlur}
      onChange={(event: ChangeEvent<HTMLInputElement>) => {
        setHasEdited(true);
        setValueText(event.currentTarget.value);
      }}
      onFocus={() => {
        cancelCommitRef.current = false;
        setIsFocused(true);
        setHasEdited(false);
      }}
      onKeyDown={handleKeyDown}
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

function groupAtomsByElement(atoms: readonly AtomSpec[]): ElementGroup[] {
  const groups: ElementGroup[] = [];
  const groupByElement = new Map<string, ElementGroup>();

  for (const atom of atoms) {
    let group = groupByElement.get(atom.element);
    if (!group) {
      group = { atoms: [], element: atom.element };
      groupByElement.set(atom.element, group);
      groups.push(group);
    }
    group.atoms.push(atom);
  }
  return groups;
}

function hiddenAtomRowsForAtoms(
  atoms: readonly AtomSpec[],
  selectedAtomId: string | null,
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
  atomOpacity: number,
): HiddenAtomRow[] {
  const rows: HiddenAtomRow[] = [];
  for (const atom of atoms) {
    if (
      atom.id === selectedAtomId ||
      !atomHasExplicitHiddenOverride(style.objectStyles, atom)
    ) {
      continue;
    }
    rows.push({
      atom,
      color: resolveAtomAppearanceForRow(
        atom,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
        atomOpacity,
      ).color,
    });
  }
  return rows;
}

function atomLookupForScene(scene: SceneSpec): Map<string, AtomSpec> {
  const canonicalBySiteId = new Map<string, AtomSpec>();
  for (const atom of scene.atoms) {
    if (!atom.isPeriodicImage) {
      canonicalBySiteId.set(atom.siteId, atom);
    }
  }

  const atoms = new Map<string, AtomSpec>();
  for (const atom of scene.atoms) {
    atoms.set(atom.id, canonicalBySiteId.get(atom.siteId) ?? atom);
  }
  return atoms;
}

function scrollElementIntoInspectorBody(elementContainer: HTMLElement | null) {
  const scrollContainer = elementContainer?.closest<HTMLElement>(
    '[data-slot="inspector-body"]',
  );
  if (!elementContainer || !scrollContainer) {
    return;
  }

  const elementRect = elementContainer.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  if (elementRect.top < containerRect.top + 8) {
    scrollContainer.scrollTop += elementRect.top - containerRect.top - 8;
    return;
  }
  if (elementRect.bottom > containerRect.bottom - 8) {
    scrollContainer.scrollTop += elementRect.bottom - containerRect.bottom + 8;
  }
}

function elementAppearanceByElementForGroups(
  elementGroups: readonly ElementGroup[],
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
  atomOpacity: number,
): Map<string, AtomAppearance> {
  const appearanceByElement = new Map<string, AtomAppearance>();
  for (const group of elementGroups) {
    appearanceByElement.set(
      group.element,
      elementRowAppearance(
        group,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
        atomOpacity,
      ),
    );
  }
  return appearanceByElement;
}

function elementRowAppearance(
  group: ElementGroup,
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
  atomOpacity: number,
): AtomAppearance {
  const representativeAtom = group.atoms[0];
  const elementOverride = style.objectStyles.elementOverrides[group.element];
  if (!representativeAtom) {
    return {
      color: "#808080",
      opacity: elementOverride?.opacity ?? atomOpacity,
      radius: 1,
      visible: (elementOverride?.visible ?? true) && atomsVisible,
    };
  }

  const appearance = resolveAtomAppearanceForRow(
    representativeAtom,
    {
      ...style,
      objectStyles: { ...style.objectStyles, atomOverrides: {} },
    },
    colorScheme,
    colorOverrides,
    atomsVisible,
    atomOpacity,
  );
  return {
    ...appearance,
    radius: elementOverride?.radius ?? baseAtomRadiusForStyle(representativeAtom, style),
    visible: (elementOverride?.visible ?? true) && atomsVisible,
  };
}

function resolveAtomAppearanceForRow(
  atom: AtomSpec,
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
  atomOpacity: number,
) {
  return resolveAtomAppearance({
    atom,
    colorOverrides,
    colorScheme,
    style: { ...style, atomOpacity, globalAtomsVisible: atomsVisible },
  });
}

function ensureCustomRadiusStyle(
  style: StyleState,
  atoms: readonly AtomSpec[],
): StyleState {
  if (style.atomRadiusModel === CUSTOM_ATOM_RADIUS_MODEL) {
    return style;
  }
  const customAtomRadii = createCustomAtomRadii(atoms, style);
  const objectStylesWithoutRadius = clearObjectStyleProperty(style.objectStyles, "radius");
  return {
    ...style,
    atomRadiusModel: CUSTOM_ATOM_RADIUS_MODEL,
    objectStyles: {
      ...objectStylesWithoutRadius,
      customAtomRadii,
      customRadiusBaseModel: style.atomRadiusModel,
      customRadiusPreviousScale: style.atomRadius,
    },
  };
}

function ensureCustomColorStyle(
  style: StyleState,
  atoms: readonly AtomSpec[],
): StyleState {
  if (style.colorSchemeMode === "custom" && style.customColormap) {
    return style;
  }
  const customColormap = createCustomColormapFromStyle(atoms, style);
  return {
    ...style,
    colorScheme: customColormap.baseColorScheme,
    colorSchemeMode: "custom",
    customColormap,
  };
}

function formatAtomSite(atom: AtomSpec): string {
  return `${atom.element}:${atom.siteIndex}`;
}

function formatRadius(value: number): string {
  return value.toFixed(2);
}

function parseRadiusInput(value: string): number | null {
  const parsedValue = Number(value.trim());
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function formatOpacity(value: number): string {
  return String(Math.round(clampAtomOpacity(value)));
}

function parseOpacityInput(value: string): number | null {
  const parsedValue = Number(value.trim());
  return Number.isFinite(parsedValue) ? clampAtomOpacity(parsedValue) : null;
}
