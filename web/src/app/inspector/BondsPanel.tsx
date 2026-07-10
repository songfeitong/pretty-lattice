import { ChevronRight, Eye, EyeOff, RotateCcw } from "lucide-react";
import {
  type KeyboardEvent,
  type MutableRefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { BondFamilySpec, BondSpec, SceneSpec } from "../../api/scene";
import {
  atomSiteLabel,
  baseColorSchemeForStyle,
  bondFamilyHasVisibilityOverride,
  elementColorOverridesForStyle,
  formatBondFamilyLength,
  isBondVisible,
  resolveAtomAppearance,
  type BondVisibilityOverrides,
  type StyleState,
} from "../../model";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";

export interface BondLocateRequest {
  bondId: string;
  token: number;
}

export function BondsPanel({
  bondLocateRequest,
  bondsVisible,
  cutoffOverrides,
  isSceneLoading,
  onBondLocateRequestHandled,
  onBondVisibilityChange,
  onCutoffChange,
  onFamilyReset,
  onFamilyVisibilityChange,
  resetToken,
  scene,
  selectedBondId,
  style,
  visibilityOverrides,
}: {
  bondLocateRequest: BondLocateRequest | null;
  bondsVisible: boolean;
  cutoffOverrides: Record<string, number>;
  isSceneLoading: boolean;
  onBondLocateRequestHandled: (token: number) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onCutoffChange: (familyKey: string, cutoff: number | null) => Promise<boolean>;
  onFamilyReset: (familyKey: string) => Promise<void>;
  onFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  resetToken: number;
  scene: SceneSpec;
  selectedBondId: string | null;
  style: StyleState;
  visibilityOverrides: BondVisibilityOverrides;
}) {
  const { t } = useTranslation();
  const [expandedFamilies, setExpandedFamilies] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [pendingLocateBondId, setPendingLocateBondId] = useState<string | null>(
    null,
  );
  const rowByBondIdRef = useRef(new Map<string, HTMLTableRowElement>());
  const selectedBond = selectedBondId
    ? scene.bonds.find((bond) => bond.id === selectedBondId) ?? null
    : null;
  const colorScheme = baseColorSchemeForStyle(style);
  const colorOverrides = useMemo(
    () => elementColorOverridesForStyle(scene.atoms, style),
    [scene.atoms, style],
  );
  const representativeAtomByElement = useMemo(() => {
    const atoms = new Map<string, SceneSpec["atoms"][number]>();
    for (const atom of scene.atoms) {
      if (!atom.isPeriodicImage && !atoms.has(atom.element)) {
        atoms.set(atom.element, atom);
      }
    }
    return atoms;
  }, [scene.atoms]);

  useEffect(() => {
    setExpandedFamilies(new Set());
    setPendingLocateBondId(null);
  }, [resetToken]);

  useEffect(() => {
    if (!bondLocateRequest) {
      return;
    }
    const bond = scene.bonds.find(
      (candidate) => candidate.id === bondLocateRequest.bondId,
    );
    if (bond) {
      setExpandedFamilies((current) => new Set(current).add(bond.familyKey));
      setPendingLocateBondId(bond.id);
    }
    onBondLocateRequestHandled(bondLocateRequest.token);
  }, [bondLocateRequest, onBondLocateRequestHandled, scene.bonds]);

  useLayoutEffect(() => {
    if (!pendingLocateBondId) {
      return;
    }
    const row = rowByBondIdRef.current.get(pendingLocateBondId);
    if (!row) {
      return;
    }
    scrollRowIntoInspectorBody(row);
    setPendingLocateBondId(null);
  }, [expandedFamilies, pendingLocateBondId, selectedBondId]);

  function tokenColor(element: string): string {
    const atom = representativeAtomByElement.get(element);
    return atom
      ? resolveAtomAppearance({
          atom,
          colorOverrides,
          colorScheme,
          style,
        }).color
      : "#808080";
  }

  function toggleFamily(familyKey: string) {
    setExpandedFamilies((current) => {
      const next = new Set(current);
      if (next.has(familyKey)) {
        next.delete(familyKey);
      } else {
        next.add(familyKey);
      }
      return next;
    });
  }

  return (
    <Table className="table-fixed border-separate border-spacing-0 text-[13px]">
      <colgroup>
        <col className="w-[49%]" />
        <col className="w-[28%]" />
        <col className="w-[23%]" />
      </colgroup>
      <TableHeader>
        <TableRow className="border-border/70 hover:bg-transparent">
          <TableHead className="h-7 px-1.5 py-0 text-[12px] font-medium text-muted-foreground">
            {t("objectsPanel.bond")}
          </TableHead>
          <TableHead className="h-7 px-1.5 py-0 text-[12px] font-medium text-muted-foreground">
            {t("objectsPanel.length")}
          </TableHead>
          <TableHead className="h-7 px-1.5 py-0 text-center text-[12px] font-medium text-muted-foreground">
            {t("objectsPanel.visible")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {scene.bondFamilies.map((family) => {
          const expanded = expandedFamilies.has(family.key);
          const familyVisible =
            bondsVisible && !visibilityOverrides.hiddenFamilies.has(family.key);
          const modified =
            cutoffOverrides[family.key] !== undefined ||
            bondFamilyHasVisibilityOverride(
              visibilityOverrides,
              family.key,
              scene.bonds,
            );
          const contextualBond =
            selectedBond?.familyKey === family.key ? selectedBond : null;
          return (
            <FamilyRows
              key={family.key}
              bondsVisible={bondsVisible}
              colorOverrides={colorOverrides}
              colorScheme={colorScheme}
              contextualBond={contextualBond}
              cutoff={cutoffOverrides[family.key]}
              expanded={expanded}
              family={family}
              familyVisible={familyVisible}
              isSceneLoading={isSceneLoading}
              modified={modified}
              onBondVisibilityChange={onBondVisibilityChange}
              onCutoffChange={onCutoffChange}
              onFamilyReset={onFamilyReset}
              onFamilyVisibilityChange={onFamilyVisibilityChange}
              onToggle={() => toggleFamily(family.key)}
              rowByBondIdRef={rowByBondIdRef}
              scene={scene}
              style={style}
              tokenColor={tokenColor}
              visibilityOverrides={visibilityOverrides}
            />
          );
        })}
      </TableBody>
    </Table>
  );
}

function FamilyRows({
  bondsVisible,
  colorOverrides,
  colorScheme,
  contextualBond,
  cutoff,
  expanded,
  family,
  familyVisible,
  isSceneLoading,
  modified,
  onBondVisibilityChange,
  onCutoffChange,
  onFamilyReset,
  onFamilyVisibilityChange,
  onToggle,
  rowByBondIdRef,
  scene,
  style,
  tokenColor,
  visibilityOverrides,
}: {
  bondsVisible: boolean;
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>;
  colorScheme: StyleState["colorScheme"];
  contextualBond: BondSpec | null;
  cutoff: number | undefined;
  expanded: boolean;
  family: BondFamilySpec;
  familyVisible: boolean;
  isSceneLoading: boolean;
  modified: boolean;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onCutoffChange: (familyKey: string, cutoff: number | null) => Promise<boolean>;
  onFamilyReset: (familyKey: string) => Promise<void>;
  onFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  onToggle: () => void;
  rowByBondIdRef: MutableRefObject<Map<string, HTMLTableRowElement>>;
  scene: SceneSpec;
  style: StyleState;
  tokenColor: (element: string) => string;
  visibilityOverrides: BondVisibilityOverrides;
}) {
  const { t } = useTranslation();
  return (
    <>
      <TableRow className="border-border/45 bg-muted/40 hover:bg-muted/55">
        <TableCell className="h-8 px-1.5 py-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={
                expanded
                  ? t("objectsPanel.collapseBondFamily", {
                      family: family.elements.join("–"),
                    })
                  : t("objectsPanel.expandBondFamily", {
                      family: family.elements.join("–"),
                    })
              }
              className={cn(
                TOOL_ICON_BUTTON_CLASS,
                "size-5 rounded-[7px] [&_svg]:size-3",
              )}
              onClick={onToggle}
            >
              <ChevronRight
                aria-hidden="true"
                className={cn("transition-transform", expanded ? "rotate-90" : null)}
              />
            </Button>
            <AtomToken color={tokenColor(family.elements[0])} />
            <span className="font-semibold">{family.elements[0]}</span>
            <span className="text-muted-foreground">—</span>
            <AtomToken color={tokenColor(family.elements[1])} />
            <span className="font-semibold">{family.elements[1]}</span>
          </div>
        </TableCell>
        <TableCell className="h-8 px-1.5 py-0 font-mono text-[12px] tabular-nums">
          {formatBondFamilyLength(family)}
        </TableCell>
        <TableCell className="h-8 px-1 py-0">
          <div className="flex items-center justify-center gap-0.5">
            <VisibilityButton
              label={t("objectsPanel.visibility", {
                target: family.elements.join("–"),
              })}
              visible={familyVisible}
              onToggle={() =>
                onFamilyVisibilityChange(family.key, !familyVisible)
              }
            />
            {modified ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("objectsPanel.resetBondFamily", {
                  family: family.elements.join("–"),
                })}
                disabled={isSceneLoading}
                className={cn(
                  TOOL_ICON_BUTTON_CLASS,
                  "size-6 rounded-[8px] [&_svg]:size-3.5",
                )}
                onClick={() => void onFamilyReset(family.key)}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow className="border-border/30 hover:bg-transparent">
          <TableCell colSpan={3} className="h-9 px-7 py-0">
            <MaximumLengthControl
              cutoff={cutoff}
              family={family}
              isSceneLoading={isSceneLoading}
              onCutoffChange={onCutoffChange}
            />
          </TableCell>
        </TableRow>
      ) : null}
      {expanded && contextualBond ? (
        <ContextualBondRow
          bond={contextualBond}
          bondsVisible={bondsVisible}
          colorOverrides={colorOverrides}
          colorScheme={colorScheme}
          onBondVisibilityChange={onBondVisibilityChange}
          rowByBondIdRef={rowByBondIdRef}
          scene={scene}
          style={style}
          visibilityOverrides={visibilityOverrides}
        />
      ) : null}
    </>
  );
}

function MaximumLengthControl({
  cutoff,
  family,
  isSceneLoading,
  onCutoffChange,
}: {
  cutoff: number | undefined;
  family: BondFamilySpec;
  isSceneLoading: boolean;
  onCutoffChange: (familyKey: string, cutoff: number | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(cutoff !== undefined);
  const submittingRef = useRef(false);
  const [valueText, setValueText] = useState(
    cutoff === undefined ? "" : formatCutoff(cutoff),
  );

  useEffect(() => {
    setEditing(cutoff !== undefined);
    setValueText(cutoff === undefined ? "" : formatCutoff(cutoff));
  }, [cutoff]);

  function beginEditing() {
    const suggested = family.maxLength;
    if (suggested === null) {
      return;
    }
    setValueText(formatCutoff(suggested));
    setEditing(true);
  }

  async function commit() {
    if (submittingRef.current) {
      return;
    }
    const parsed = Number(valueText.trim());
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setValueText(cutoff === undefined ? "" : formatCutoff(cutoff));
      setEditing(cutoff !== undefined);
      return;
    }
    if (cutoff !== undefined && parsed === cutoff) {
      setValueText(formatCutoff(cutoff));
      return;
    }
    submittingRef.current = true;
    const succeeded = await onCutoffChange(family.key, parsed);
    submittingRef.current = false;
    if (!succeeded) {
      setValueText(
        cutoff === undefined
          ? formatCutoff(family.maxLength ?? parsed)
          : formatCutoff(cutoff),
      );
      setEditing(cutoff !== undefined);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commit();
    } else if (event.key === "Escape") {
      setValueText(cutoff === undefined ? "" : formatCutoff(cutoff));
      setEditing(cutoff !== undefined);
      event.currentTarget.blur();
    }
  }

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span className="min-w-[7.4rem] text-muted-foreground">
        {t("objectsPanel.maximumLength")}
      </span>
      {editing ? (
        <>
          <Input
            type="text"
            inputMode="decimal"
            aria-label={t("objectsPanel.maximumLengthFor", {
              family: family.elements.join("–"),
            })}
            disabled={isSceneLoading}
            value={valueText}
            className="h-[22px] w-[4rem] rounded-md px-1.5 py-0 text-right font-mono text-[0.68rem] tabular-nums md:text-[0.68rem]"
            onBlur={() => void commit()}
            onChange={(event) => setValueText(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <span className="text-muted-foreground">Å</span>
        </>
      ) : (
        <>
          <span className="font-mono text-muted-foreground">
            {t("objectsPanel.automatic")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isSceneLoading || family.maxLength === null}
            className="h-6 px-2 text-[12px]"
            onClick={beginEditing}
          >
            {t("objectsPanel.set")}
          </Button>
        </>
      )}
    </div>
  );
}

function ContextualBondRow({
  bond,
  bondsVisible,
  colorOverrides,
  colorScheme,
  onBondVisibilityChange,
  rowByBondIdRef,
  scene,
  style,
  visibilityOverrides,
}: {
  bond: BondSpec;
  bondsVisible: boolean;
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>;
  colorScheme: StyleState["colorScheme"];
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  rowByBondIdRef: MutableRefObject<Map<string, HTMLTableRowElement>>;
  scene: SceneSpec;
  style: StyleState;
  visibilityOverrides: BondVisibilityOverrides;
}) {
  const { t } = useTranslation();
  const startAtom = scene.atoms[bond.startAtomIndex];
  const endAtom = scene.atoms[bond.endAtomIndex];
  if (!startAtom || !endAtom) {
    return null;
  }
  const startColor = resolveAtomAppearance({
    atom: startAtom,
    colorOverrides,
    colorScheme,
    style,
  }).color;
  const endColor = resolveAtomAppearance({
    atom: endAtom,
    colorOverrides,
    colorScheme,
    style,
  }).color;
  const visible = isBondVisible(bond, visibilityOverrides, bondsVisible);
  return (
    <TableRow
      ref={(row) => {
        if (row) {
          rowByBondIdRef.current.set(bond.id, row);
        } else {
          rowByBondIdRef.current.delete(bond.id);
        }
      }}
      data-state="selected"
      className="border-border/30 bg-accent hover:bg-accent"
    >
      <TableCell className="h-8 px-7 py-0">
        <div className="flex items-center gap-1.5 font-mono text-[12px]">
          <AtomToken color={startColor} />
          <span>{atomSiteLabel(startAtom)}</span>
          <span className="text-muted-foreground">—</span>
          <AtomToken color={endColor} />
          <span>{atomSiteLabel(endAtom)}</span>
        </div>
      </TableCell>
      <TableCell className="h-8 px-1.5 py-0 font-mono text-[12px] tabular-nums">
        {bond.length.toFixed(3)}
      </TableCell>
      <TableCell className="h-8 px-1.5 py-0 text-center">
        <VisibilityButton
          label={t("objectsPanel.visibility", {
            target: `${atomSiteLabel(startAtom)}–${atomSiteLabel(endAtom)}`,
          })}
          visible={visible}
          onToggle={() => onBondVisibilityChange(bond, !visible)}
        />
      </TableCell>
    </TableRow>
  );
}

function VisibilityButton({
  label,
  onToggle,
  visible,
}: {
  label: string;
  onToggle: () => void;
  visible: boolean;
}) {
  const Icon = visible ? Eye : EyeOff;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
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

function AtomToken({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-full border border-foreground/15"
      style={{ backgroundColor: color }}
    />
  );
}

function scrollRowIntoInspectorBody(row: HTMLTableRowElement) {
  const scrollContainer = row.closest<HTMLElement>('[data-slot="inspector-body"]');
  if (!scrollContainer) {
    return;
  }
  const rowRect = row.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  if (rowRect.top < containerRect.top) {
    scrollContainer.scrollTop -= containerRect.top - rowRect.top + 8;
  } else if (rowRect.bottom > containerRect.bottom) {
    scrollContainer.scrollTop += rowRect.bottom - containerRect.bottom + 8;
  }
}

function formatCutoff(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, "");
}
