import { ChevronDown, Eye, EyeOff, Minus, RotateCcw } from "lucide-react";
import {
  type Dispatch,
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
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { BondFamilySpec, BondSpec, SceneSpec } from "../../api/scene";
import {
  atomSiteLabel,
  baseColorSchemeForStyle,
  clampAtomOpacity,
  clampBondRadius,
  clearBondOverridePropertyForFamily,
  elementColorOverridesForStyle,
  formatCellOffset,
  resolveAtomAppearance,
  resolveBondOpacityForStyle,
  resolveBondRadiusForStyle,
  setBondFamilyOverrideProperty,
  setBondOverrideProperty,
  type BondVisibilityOverrides,
  type StyleState,
} from "../../model";
import { lambertLegendSwatchBackground } from "../../scene/renderAppearance";
import { BOND_RADIUS } from "../../scene/sceneGeometry";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";
import {
  bondCutoffDraftCanRestore,
  formatBondCutoffDraftField,
  type BondCutoffDraft,
  type BondCutoffDrafts,
  type BondCutoffField,
} from "./bondCutoffEditor";

export interface BondLocateRequest {
  bondId: string;
  token: number;
}

const BOND_CONTROL_GRID_CLASS =
  "grid grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_1.5rem] items-center gap-2";

export function BondsPanel({
  bondLocateRequest,
  bondOpacity,
  bondsVisible,
  cutoffDrafts,
  cutoffEditing,
  invalidCutoffFields,
  invalidCutoffFeedbackPhase,
  isSceneLoading,
  onBondLocateRequestHandled,
  onBondVisibilityChange,
  onCutoffDraftChange,
  onCutoffEditorKeyDown,
  onCutoffRestoreToggle,
  onFamilyVisibilityChange,
  onStyleChange,
  resetToken,
  scene,
  selectedBondId,
  style,
  visibilityOverrides,
}: {
  bondLocateRequest: BondLocateRequest | null;
  bondOpacity: number;
  bondsVisible: boolean;
  cutoffDrafts: BondCutoffDrafts;
  cutoffEditing: boolean;
  invalidCutoffFields: ReadonlySet<string>;
  invalidCutoffFeedbackPhase: "a" | "b" | null;
  isSceneLoading: boolean;
  onBondLocateRequestHandled: (token: number) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onCutoffDraftChange: (familyKey: string, field: BondCutoffField, value: string) => void;
  onCutoffEditorKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  onCutoffRestoreToggle: (familyKey: string) => void;
  onFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  resetToken: number;
  scene: SceneSpec;
  selectedBondId: string | null;
  style: StyleState;
  visibilityOverrides: BondVisibilityOverrides;
}) {
  const { t } = useTranslation();
  const [pendingLocateBondId, setPendingLocateBondId] = useState<string | null>(null);
  const familyByKeyRef = useRef(new Map<string, HTMLElement>());
  const colorScheme = baseColorSchemeForStyle(style);
  const colorOverrides = useMemo(
    () => elementColorOverridesForStyle(scene.atoms, style),
    [scene.atoms, style],
  );
  const selectedBond = selectedBondId
    ? scene.bonds.find((bond) => bond.id === selectedBondId) ?? null
    : null;
  const hiddenBonds = useMemo(
    () => {
      const relations = new Set<string>();
      return scene.bonds.filter((bond) => {
        if (
          !visibilityOverrides.hiddenBondRelations.has(bond.relationId) ||
          relations.has(bond.relationId)
        ) {
          return false;
        }
        relations.add(bond.relationId);
        return true;
      });
    },
    [scene.bonds, visibilityOverrides.hiddenBondRelations],
  );
  const baseRadius = BOND_RADIUS * (style.bondThickness / 100);

  useEffect(() => {
    setPendingLocateBondId(null);
  }, [resetToken]);

  useEffect(() => {
    if (!bondLocateRequest) {
      return;
    }
    const bond = scene.bonds.find((candidate) => candidate.id === bondLocateRequest.bondId);
    if (bond) {
      setPendingLocateBondId(bond.id);
    }
    onBondLocateRequestHandled(bondLocateRequest.token);
  }, [bondLocateRequest, onBondLocateRequestHandled, scene.bonds]);

  useLayoutEffect(() => {
    if (!pendingLocateBondId) {
      return;
    }
    const bond = scene.bonds.find((candidate) => candidate.id === pendingLocateBondId);
    const family = bond ? familyByKeyRef.current.get(bond.familyKey) : null;
    if (family) {
      scrollElementIntoInspectorBody(family);
      setPendingLocateBondId(null);
    }
  }, [pendingLocateBondId, scene.bonds, selectedBondId]);

  function setFamilyAppearance(
    family: BondFamilySpec,
    property: "radius" | "opacity",
    value: number,
  ) {
    onStyleChange((currentStyle) => {
      let objectStyles = setBondFamilyOverrideProperty(
        currentStyle.objectStyles,
        family.key,
        property,
        value,
      );
      objectStyles = clearBondOverridePropertyForFamily(
        objectStyles,
        scene.bonds,
        family.key,
        property,
      );
      return { ...currentStyle, objectStyles };
    });
  }

  function setBondAppearance(
    bond: BondSpec,
    property: "radius" | "opacity",
    value: number,
  ) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      objectStyles: setBondOverrideProperty(
        currentStyle.objectStyles,
        bond.id,
        property,
        value,
      ),
    }));
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex min-h-0 flex-col text-[13px]">
        <div
          data-slot="bond-column-header"
          className={cn(
            BOND_CONTROL_GRID_CLASS,
            "min-h-4 border-x border-transparent px-2.5 text-[11px] font-medium leading-none text-muted-foreground",
          )}
        >
          <span>{t("objectsPanel.bond")}</span>
          <span className={cn("text-center whitespace-nowrap", cutoffEditing && "text-[10px]")}>
            {cutoffEditing ? t("objectsPanel.minimumAngstrom") : t("objectsPanel.radius")}
          </span>
          <span className={cn("text-center whitespace-nowrap", cutoffEditing && "text-[10px]")}>
            {cutoffEditing ? t("objectsPanel.maximumAngstrom") : t("objectsPanel.opacity")}
          </span>
          <span aria-hidden="true" />
        </div>
        <div data-slot="bond-family-groups" className="mt-1 flex flex-col gap-2">
          {scene.bondFamilies.map((family) => {
            const familyRadius = clampBondRadius(
              style.objectStyles.bondFamilyOverrides[family.key]?.radius ?? baseRadius,
            );
            const familyOpacity = clampAtomOpacity(
              style.objectStyles.bondFamilyOverrides[family.key]?.opacity ?? bondOpacity,
            );
            const familyVisible =
              bondsVisible && !visibilityOverrides.hiddenFamilies.has(family.key);
            const cutoffDraft = cutoffDrafts[family.key];
            return (
              <section
                key={family.key}
                ref={(node) => {
                  if (node) {
                    familyByKeyRef.current.set(family.key, node);
                  } else {
                    familyByKeyRef.current.delete(family.key);
                  }
                }}
                aria-label={t("objectsPanel.bondFamily", {
                  family: family.elements.join("–"),
                })}
                className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-xs shadow-foreground/[0.025]"
              >
                <div className={cn(BOND_CONTROL_GRID_CLASS, "min-h-7 px-2.5 py-2")}>
                  <div className="flex min-w-0 items-center">
                    <FamilyLabel family={family} scene={scene} style={style} />
                  </div>
                  <div
                    key={cutoffEditing ? "cutoff" : "appearance"}
                    className={cn(
                      "col-span-3 grid grid-cols-[2.75rem_2.75rem_1.5rem] items-center gap-2",
                      cutoffEditing
                        ? "bond-family-controls-enter-cutoff"
                        : "bond-family-controls-enter-appearance",
                    )}
                  >
                    {cutoffEditing && cutoffDraft ? (
                      <>
                      <CutoffInput
                        field="min"
                        family={family}
                        draft={cutoffDraft}
                        invalid={invalidCutoffFields.has(`${family.key}:min`)}
                        feedbackPhase={invalidCutoffFeedbackPhase}
                        isSceneLoading={isSceneLoading}
                        onChange={onCutoffDraftChange}
                        onKeyDown={onCutoffEditorKeyDown}
                      />
                      <CutoffInput
                        field="max"
                        family={family}
                        draft={cutoffDraft}
                        invalid={invalidCutoffFields.has(`${family.key}:max`)}
                        feedbackPhase={invalidCutoffFeedbackPhase}
                        isSceneLoading={isSceneLoading}
                        onChange={onCutoffDraftChange}
                        onKeyDown={onCutoffEditorKeyDown}
                      />
                      <CutoffRestoreButton
                        disabled={isSceneLoading || !bondCutoffDraftCanRestore(cutoffDraft, family)}
                        family={family}
                        pendingRemoval={cutoffDraft.pendingRemoval}
                        onToggle={onCutoffRestoreToggle}
                      />
                      </>
                    ) : (
                      <>
                      <RadiusCell
                        ariaLabel={t("objectsPanel.radiusControl", { target: family.elements.join("–") })}
                        value={familyRadius}
                        onCommit={(value) => setFamilyAppearance(family, "radius", value)}
                      />
                      <OpacityCell
                        ariaLabel={t("objectsPanel.opacityControl", { target: family.elements.join("–") })}
                        value={familyOpacity}
                        onCommit={(value) => setFamilyAppearance(family, "opacity", value)}
                      />
                      <VisibilityButton
                        label={t("objectsPanel.visibility", { target: family.elements.join("–") })}
                        visible={familyVisible}
                        onToggle={() => onFamilyVisibilityChange(family.key, !familyVisible)}
                      />
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <SelectedBondWorkspace
                    bond={!cutoffEditing && selectedBond?.familyKey === family.key ? selectedBond : null}
                    bondOpacity={bondOpacity}
                    bondsVisible={bondsVisible}
                    colorOverrides={colorOverrides}
                    colorScheme={colorScheme}
                    onAppearanceChange={setBondAppearance}
                    onVisibilityChange={onBondVisibilityChange}
                    scene={scene}
                    style={style}
                    visibilityOverrides={visibilityOverrides}
                  />
                </div>
              </section>
            );
          })}
        </div>
        <HiddenBonds
          bonds={hiddenBonds}
          onRestore={(bond) => onBondVisibilityChange(bond, true)}
          scene={scene}
          style={style}
        />
      </div>
    </TooltipProvider>
  );
}

function CutoffInput({
  draft,
  family,
  feedbackPhase,
  field,
  invalid,
  isSceneLoading,
  onChange,
  onKeyDown,
}: {
  draft: BondCutoffDraft;
  family: BondFamilySpec;
  feedbackPhase: "a" | "b" | null;
  field: BondCutoffField;
  invalid: boolean;
  isSceneLoading: boolean;
  onChange: (familyKey: string, field: BondCutoffField, value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const { t } = useTranslation();
  const value = field === "min" ? draft.minText : draft.maxText;
  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={t(
        field === "min" ? "objectsPanel.minimumCutoffFor" : "objectsPanel.maximumCutoffFor",
        { family: family.elements.join("–") },
      )}
      aria-invalid={invalid}
      disabled={isSceneLoading || draft.pendingRemoval}
      value={value}
      className={cn(
        "h-[22px] min-w-0 justify-self-center rounded-md px-1 py-0 text-center font-mono text-[0.66rem] tabular-nums aria-invalid:border-input aria-invalid:ring-0 focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.66rem]",
        invalid && feedbackPhase ? `bond-cutoff-invalid-feedback-${feedbackPhase}` : null,
      )}
      onChange={(event) => onChange(family.key, field, event.currentTarget.value)}
      onBlur={(event) => {
        const formatted = formatBondCutoffDraftField(event.currentTarget.value);
        if (formatted !== event.currentTarget.value) onChange(family.key, field, formatted);
      }}
      onKeyDown={onKeyDown}
    />
  );
}

function CutoffRestoreButton({
  disabled,
  family,
  onToggle,
  pendingRemoval,
}: {
  disabled: boolean;
  family: BondFamilySpec;
  onToggle: (familyKey: string) => void;
  pendingRemoval: boolean;
}) {
  const { t } = useTranslation();
  const label = pendingRemoval
    ? t("objectsPanel.keepCustomCutoff", { family: family.elements.join("–") })
    : t("objectsPanel.restoreAutomaticCutoff", { family: family.elements.join("–") });
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pendingRemoval}
          disabled={disabled}
          className={cn(
            TOOL_ICON_BUTTON_CLASS,
            "size-6 rounded-[8px]",
            pendingRemoval && "bg-muted text-foreground",
          )}
          onClick={() => onToggle(family.key)}
        >
          <RotateCcw aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  );
}

function SelectedBondWorkspace({
  bond,
  bondOpacity,
  bondsVisible,
  colorOverrides,
  colorScheme,
  onAppearanceChange,
  onVisibilityChange,
  scene,
  style,
  visibilityOverrides,
}: {
  bond: BondSpec | null;
  bondOpacity: number;
  bondsVisible: boolean;
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>;
  colorScheme: StyleState["colorScheme"];
  onAppearanceChange: (bond: BondSpec, property: "radius" | "opacity", value: number) => void;
  onVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  scene: SceneSpec;
  style: StyleState;
  visibilityOverrides: BondVisibilityOverrides;
}) {
  const { t } = useTranslation();
  const [displayedBond, setDisplayedBond] = useState(bond);
  const activeBond = bond ?? displayedBond;
  useEffect(() => {
    if (bond) setDisplayedBond(bond);
  }, [bond]);
  if (!activeBond) return null;
  const startAtom = scene.atoms[activeBond.startAtomIndex];
  const endAtom = scene.atoms[activeBond.endAtomIndex];
  if (!startAtom || !endAtom) return null;
  const baseRadius = BOND_RADIUS * (style.bondThickness / 100);
  const visible =
    bondsVisible &&
    !visibilityOverrides.hiddenFamilies.has(activeBond.familyKey) &&
    !visibilityOverrides.hiddenBondRelations.has(activeBond.relationId);
  return (
    <div
      aria-hidden={!bond}
      inert={!bond}
      className={cn(
        "grid overflow-hidden transition-[grid-template-rows,opacity] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduced:transition-none",
        bond ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
      )}
      onTransitionEnd={() => {
        if (!bond) setDisplayedBond(null);
      }}
    >
      <div className="min-h-0 overflow-hidden bg-muted/45">
        <Separator className="opacity-70" />
        <div className={cn(BOND_CONTROL_GRID_CLASS, "min-h-7 px-2.5 py-1.5")}>
          <BondLabel bond={activeBond} scene={scene} style={style} />
          <RadiusCell
            ariaLabel={t("objectsPanel.radiusControl", { target: `${atomSiteLabel(startAtom)}–${atomSiteLabel(endAtom)}` })}
            value={resolveBondRadiusForStyle(activeBond, style.objectStyles, baseRadius)}
            onCommit={(value) => onAppearanceChange(activeBond, "radius", value)}
          />
          <OpacityCell
            ariaLabel={t("objectsPanel.opacityControl", { target: `${atomSiteLabel(startAtom)}–${atomSiteLabel(endAtom)}` })}
            value={resolveBondOpacityForStyle(activeBond, style.objectStyles, bondOpacity)}
            onCommit={(value) => onAppearanceChange(activeBond, "opacity", value)}
          />
          <VisibilityButton
            label={t("objectsPanel.visibility", { target: `${atomSiteLabel(startAtom)}–${atomSiteLabel(endAtom)}` })}
            visible={visible}
            onToggle={() => onVisibilityChange(activeBond, !visible)}
          />
        </div>
      </div>
    </div>
  );
}

function HiddenBonds({ bonds, onRestore, scene, style }: {
  bonds: readonly BondSpec[];
  onRestore: (bond: BondSpec) => void;
  scene: SceneSpec;
  style: StyleState;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const previousCountRef = useRef(bonds.length);
  useEffect(() => {
    const previousCount = previousCountRef.current;
    previousCountRef.current = bonds.length;
    if (previousCount === 0 && bonds.length > 0) setExpanded(true);
    else if (bonds.length === 0) setExpanded(false);
  }, [bonds.length]);
  if (bonds.length === 0) return null;
  return (
    <Collapsible open={expanded} onOpenChange={setExpanded} data-slot="hidden-bonds">
      <div className="py-4"><Separator className="opacity-60" /></div>
      <div className="flex min-h-6 items-center gap-1 px-2.5 text-[11px] font-medium text-muted-foreground">
        <span className="flex items-baseline gap-1.5">
          <span>{t("objectsPanel.hiddenBonds")}</span>
          <span className="tabular-nums">{bonds.length}</span>
        </span>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${t("objectsPanel.hiddenBonds")} ${bonds.length}`}
            className="size-6 rounded-md text-foreground/70 hover:bg-muted/35 hover:text-foreground"
          >
            <ChevronDown
              aria-hidden="true"
              className={cn("transition-transform duration-240 motion-reduced:transition-none", expanded ? "rotate-0" : "-rotate-90")}
            />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent
        forceMount
        aria-hidden={!expanded}
        inert={!expanded}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-[320ms] motion-reduced:transition-none",
          expanded ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="mt-0.5 flex flex-col gap-0.5">
            {bonds.map((bond) => (
              <div key={bond.id} className="flex h-7 items-center justify-between rounded-md px-2.5 text-muted-foreground hover:bg-muted/35">
                <BondLabel bond={bond} scene={scene} showCellShift style={style} />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={t("objectsPanel.restoreBondVisibilityFor", {
                        bond: hiddenBondLabel(bond, scene),
                      })}
                      className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[8px]")}
                      onClick={() => onRestore(bond)}
                    >
                      <Minus aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    {t("objectsPanel.restoreBondVisibility")}
                  </TooltipContent>
                </Tooltip>
              </div>
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FamilyLabel({ family, scene, style }: { family: BondFamilySpec; scene: SceneSpec; style: StyleState }) {
  const representativeAtoms = family.elements.map((element) =>
    scene.atoms.find((atom) => !atom.isPeriodicImage && atom.element === element),
  );
  return (
    <PairLabel
      endColor={tokenColor(representativeAtoms[1], scene, style)}
      endLabel={family.elements[1]}
      startColor={tokenColor(representativeAtoms[0], scene, style)}
      startLabel={family.elements[0]}
      strong
    />
  );
}

function BondLabel({ bond, scene, showCellShift = false, style }: {
  bond: BondSpec;
  scene: SceneSpec;
  showCellShift?: boolean;
  style: StyleState;
}) {
  const startAtom = scene.atoms[bond.startAtomIndex];
  const endAtom = scene.atoms[bond.endAtomIndex];
  if (!startAtom || !endAtom) return null;
  return (
    <PairLabel
      endColor={tokenColor(endAtom, scene, style)}
      endLabel={`${atomSiteLabel(endAtom)}${showCellShift ? ` (${formatCellOffset(bond.relativeImageOffset)})` : ""}`}
      startColor={tokenColor(startAtom, scene, style)}
      startLabel={atomSiteLabel(startAtom)}
    />
  );
}

function PairLabel({ endColor, endLabel, startColor, startLabel, strong = false }: {
  endColor: string;
  endLabel: string;
  startColor: string;
  startLabel: string;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 text-[12px]",
        strong ? "font-semibold" : "font-mono",
      )}
    >
      <AtomToken color={startColor} />
      <span>{startLabel}</span>
      <span aria-hidden="true" className="h-px w-2 shrink-0 bg-muted-foreground" />
      <AtomToken color={endColor} />
      <span className="truncate">{endLabel}</span>
    </div>
  );
}

function AtomToken({ color }: { color: string }) {
  return (
    <span aria-hidden="true" className="inline-flex h-6 items-center justify-center">
      <span
        className="size-3.5 shrink-0 rounded-full border border-foreground/15"
        style={{ background: lambertLegendSwatchBackground(color) }}
      />
    </span>
  );
}

function tokenColor(
  atom: SceneSpec["atoms"][number] | undefined,
  scene: SceneSpec,
  style: StyleState,
): string {
  if (!atom) return "#808080";
  return resolveAtomAppearance({
    atom,
    colorOverrides: elementColorOverridesForStyle(scene.atoms, style),
    colorScheme: baseColorSchemeForStyle(style),
    style,
  }).color;
}

function RadiusCell({ ariaLabel, onCommit, value }: { ariaLabel: string; onCommit: (value: number) => void; value: number }) {
  return <NumericCell ariaLabel={ariaLabel} digits={2} max={Infinity} min={0.01} onCommit={onCommit} value={value} width="w-[42px]" />;
}

function OpacityCell({ ariaLabel, onCommit, value }: { ariaLabel: string; onCommit: (value: number) => void; value: number }) {
  return <NumericCell ariaLabel={ariaLabel} digits={0} max={100} min={0} onCommit={onCommit} value={value} width="w-9" />;
}

function NumericCell({ ariaLabel, digits, max, min, onCommit, value, width }: {
  ariaLabel: string;
  digits: number;
  max: number;
  min: number;
  onCommit: (value: number) => void;
  value: number;
  width: string;
}) {
  const [draft, setDraft] = useState(value.toFixed(digits));
  const [hasEdited, setHasEdited] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cancelCommitRef = useRef(false);
  const displayedValue = isFocused && !hasEdited ? "" : draft;
  useEffect(() => setDraft(value.toFixed(digits)), [digits, value]);
  function commit(text: string) {
    const parsed = Number(text.trim());
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
      setDraft(value.toFixed(digits));
      return;
    }
    onCommit(parsed);
    setDraft(parsed.toFixed(digits));
  }
  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={displayedValue}
      className={cn(
        "h-[22px] justify-self-center rounded-md px-1.5 py-0 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]",
        width,
      )}
      onBlur={(event) => {
        setIsFocused(false);
        setHasEdited(false);
        if (cancelCommitRef.current || !hasEdited) {
          cancelCommitRef.current = false;
          setDraft(value.toFixed(digits));
          return;
        }
        commit(event.currentTarget.value);
      }}
      onChange={(event) => {
        setHasEdited(true);
        setDraft(event.currentTarget.value);
      }}
      onFocus={() => {
        cancelCommitRef.current = false;
        setIsFocused(true);
        setHasEdited(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          cancelCommitRef.current = true;
          setDraft(value.toFixed(digits));
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function VisibilityButton({ label, onToggle, visible }: { label: string; onToggle: () => void; visible: boolean }) {
  const Icon = visible ? Eye : EyeOff;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-pressed={visible}
      className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[8px] [&_svg]:size-3.5", visible ? "text-foreground" : "text-muted-foreground/55")}
      onClick={onToggle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

function bondLabel(bond: BondSpec, scene: SceneSpec): string {
  const startAtom = scene.atoms[bond.startAtomIndex];
  const endAtom = scene.atoms[bond.endAtomIndex];
  return startAtom && endAtom ? `${atomSiteLabel(startAtom)}–${atomSiteLabel(endAtom)}` : bond.id;
}

function hiddenBondLabel(bond: BondSpec, scene: SceneSpec): string {
  return `${bondLabel(bond, scene)} (${formatCellOffset(bond.relativeImageOffset)})`;
}

function scrollElementIntoInspectorBody(element: HTMLElement) {
  const container = element.closest<HTMLElement>('[data-slot="inspector-body"]');
  if (!container) return;
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  if (elementRect.top < containerRect.top) container.scrollTop -= containerRect.top - elementRect.top + 8;
  else if (elementRect.bottom > containerRect.bottom) container.scrollTop += elementRect.bottom - containerRect.bottom + 8;
}
