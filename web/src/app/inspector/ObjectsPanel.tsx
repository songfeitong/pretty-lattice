import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  type ChangeEvent,
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import {
  BOND_ALGORITHM_OPTIONS,
  type AtomSpec,
  type BondSpec,
  type SceneSpec,
} from "../../api/scene";
import { lambertLegendSwatchBackground } from "../../scene/renderAppearance";
import {
  objectsAtomColorPickerId,
  objectsElementColorPickerId,
} from "../colorPickerRegistry";
import {
  CUSTOM_ATOM_RADIUS_MODEL,
  baseAtomRadiusForStyle,
  baseColorSchemeForStyle,
  canonicalAtomsForObjectStyles,
  clampAtomRadius,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  CUSTOM_BONDING_MODE,
  createCustomAtomRadii,
  createCustomColormapFromStyle,
  elementColorOverridesForStyle,
  resolveAtomAppearance,
  setAtomOverrideProperty,
  setElementOverrideProperty,
  type AtomAppearance,
  type StyleState,
  type BondVisibilityOverrides,
  type BondingMode,
} from "../../model";
import { HexColorPicker, normalizeHexColor } from "../controls/HexColorPicker";
import {
  TOOL_ICON_BUTTON_CLASS,
} from "../surface";
import { BondsPanel, type BondLocateRequest } from "./BondsPanel";

export type ObjectsPanelTab = "atoms" | "bonds";

interface AtomLocateRequest {
  atomId: string;
  token: number;
}

interface ElementGroup {
  atoms: AtomSpec[];
  element: string;
}

type ObjectsAtomRow =
  | {
      atoms: AtomSpec[];
      element: string;
      id: string;
      kind: "element";
    }
  | {
      atom: AtomSpec;
      id: string;
      kind: "atom";
    };

type ObjectsAtomColumnId = "site" | "radius" | "visible";

interface VirtualViewport {
  height: number;
  scrollTop: number;
}

interface VirtualRowRange {
  endIndex: number;
  startIndex: number;
}

const OBJECTS_BODY_TEXT_CLASS = "text-[13px]";
const OBJECTS_HEADER_TEXT_CLASS =
  "text-[12px] font-medium leading-tight text-muted-foreground";
const OBJECTS_CELL_CLASS = "h-8 px-1.5 py-0 align-middle";
const OBJECTS_TABLE_HEADER_HEIGHT = 28;
const OBJECTS_ATOM_ROW_HEIGHT = 32;
const OBJECTS_ELEMENT_ROW_HEIGHT = 36;
const OBJECTS_TABLE_VIRTUAL_OVERSCAN = 8;
const OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT = 640;
const RADIUS_STEP = 0.01;
const OBJECTS_ATOM_COLUMNS = [
  { id: "site", header: "Site" },
  { id: "radius", header: "R (Å)" },
  { id: "visible", header: "Visible" },
] satisfies Array<{ id: ObjectsAtomColumnId; header: string }>;
const OBJECTS_ATOM_COLUMN_DEFS: ColumnDef<ObjectsAtomRow>[] =
  OBJECTS_ATOM_COLUMNS.map((column) => ({
    id: column.id,
    header: column.header,
  }));

function objectsAtomColumnHeader(
  columnId: ObjectsAtomColumnId,
  t: ReturnType<typeof useTranslation>["t"],
) {
  switch (columnId) {
    case "site":
      return t("objectsPanel.atom");
    case "radius":
      return t("objectsPanel.radius");
    case "visible":
      return t("objectsPanel.visible");
  }
}

export function ObjectsPanel({
  activeTab,
  atomLocateRequest,
  atomsVisible,
  bondAlgorithm,
  bondLocateRequest,
  bondsVisible,
  bondVisibilityOverrides,
  cutoffOverrides,
  hasCustomBondingProfile,
  isSceneLoading,
  onActiveTabChange,
  onAtomLocateRequestHandled,
  onAtomSelect,
  onBondLocateRequestHandled,
  onBondAlgorithmChange,
  onBondVisibilityChange,
  onCutoffChange,
  onElementColorChange,
  onFamilyReset,
  onFamilyVisibilityChange,
  onStyleChange,
  scene,
  bondObjectsResetToken,
  selectedBondId,
  selectedAtomId,
  style,
}: {
  activeTab: ObjectsPanelTab;
  atomLocateRequest: AtomLocateRequest | null;
  atomsVisible: boolean;
  bondAlgorithm: BondingMode;
  bondLocateRequest: BondLocateRequest | null;
  bondsVisible: boolean;
  bondVisibilityOverrides: BondVisibilityOverrides;
  cutoffOverrides: Record<string, number>;
  hasCustomBondingProfile: boolean;
  isSceneLoading: boolean;
  onActiveTabChange: (tab: ObjectsPanelTab) => void;
  onAtomLocateRequestHandled: (token: number) => void;
  onAtomSelect: (atomId: string) => void;
  onBondLocateRequestHandled: (token: number) => void;
  onBondAlgorithmChange: (bondAlgorithm: BondingMode) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onCutoffChange: (familyKey: string, cutoff: number | null) => Promise<boolean>;
  onElementColorChange: (element: string, color: string) => void;
  onFamilyReset: (familyKey: string) => Promise<void>;
  onFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  bondObjectsResetToken: number;
  selectedBondId: string | null;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  const { t } = useTranslation();

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as ObjectsPanelTab)}
      className="flex min-h-0 flex-col gap-3"
    >
      <TabsList
        className="!h-8 w-fit justify-start rounded-lg bg-muted/70 p-1"
      >
        <TabsTrigger
          value="atoms"
          className="!h-6 flex-none rounded-lg px-2.5 text-xs font-medium"
        >
          {t("objectsPanel.atoms")}
        </TabsTrigger>
        <TabsTrigger
          value="bonds"
          className="!h-6 flex-none rounded-lg px-2.5 text-xs font-medium"
        >
          {t("objectsPanel.bonds")}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="atoms" className="m-0 min-h-0">
        <ObjectsAtomsTable
          atomLocateRequest={atomLocateRequest}
          atomsVisible={atomsVisible}
          onAtomLocateRequestHandled={onAtomLocateRequestHandled}
          onAtomSelect={onAtomSelect}
          onElementColorChange={onElementColorChange}
          onStyleChange={onStyleChange}
          scene={scene}
          selectedAtomId={selectedAtomId}
          style={style}
        />
      </TabsContent>
      <TabsContent value="bonds" className="m-0 min-h-0">
        <div className="mb-3 grid min-h-8 grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-2 text-[13px]">
          <span className="leading-tight text-foreground">
            {t("settings.bondingAlgorithm")}
          </span>
          <Select
            value={bondAlgorithm}
            disabled={isSceneLoading}
            onValueChange={(value) => onBondAlgorithmChange(value as BondingMode)}
          >
            <SelectTrigger
              size="sm"
              aria-label={t("settings.bondingAlgorithm")}
              className="!h-6 w-full !px-2 !py-0 bg-background text-[13px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" className="!bg-background !text-foreground">
              <SelectGroup>
                {BOND_ALGORITHM_OPTIONS.map((option) => (
                  <SelectItem
                    key={option.value}
                    value={option.value}
                    className="min-h-6 py-0.5 text-[13px]"
                  >
                    {option.label}
                  </SelectItem>
                ))}
                {hasCustomBondingProfile ? (
                  <SelectItem
                    value={CUSTOM_BONDING_MODE}
                    className="min-h-6 py-0.5 text-[13px]"
                  >
                    {t("style.custom")}
                  </SelectItem>
                ) : null}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <Separator className="mb-3" />
        <BondsPanel
          bondLocateRequest={bondLocateRequest}
          bondsVisible={bondsVisible}
          cutoffOverrides={cutoffOverrides}
          isSceneLoading={isSceneLoading}
          onBondLocateRequestHandled={onBondLocateRequestHandled}
          onBondVisibilityChange={onBondVisibilityChange}
          onCutoffChange={onCutoffChange}
          onFamilyReset={onFamilyReset}
          onFamilyVisibilityChange={onFamilyVisibilityChange}
          resetToken={bondObjectsResetToken}
          scene={scene}
          selectedBondId={selectedBondId}
          style={style}
          visibilityOverrides={bondVisibilityOverrides}
        />
      </TabsContent>
    </Tabs>
  );
}

function ObjectsAtomsTable({
  atomLocateRequest,
  atomsVisible,
  onAtomLocateRequestHandled,
  onAtomSelect,
  onElementColorChange,
  onStyleChange,
  scene,
  selectedAtomId,
  style,
}: {
  atomLocateRequest: AtomLocateRequest | null;
  atomsVisible: boolean;
  onAtomLocateRequestHandled: (token: number) => void;
  onAtomSelect: (atomId: string) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  const { t } = useTranslation();
  const [expandedElements, setExpandedElements] = useState<Record<string, boolean>>({});
  const [pendingLocateAtomId, setPendingLocateAtomId] = useState<string | null>(null);
  const [virtualViewport, setVirtualViewport] = useState<VirtualViewport>(() => ({
    height: OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT,
    scrollTop: 0,
  }));
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpandedElements({});
    setPendingLocateAtomId(null);
  }, [scene]);

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
  const atomById = useMemo(() => {
    const canonicalAtomBySiteId = new Map<string, AtomSpec>();
    for (const atom of scene.atoms) {
      if (!atom.isPeriodicImage) {
        canonicalAtomBySiteId.set(atom.siteId, atom);
      }
    }

    const atoms = new Map<string, AtomSpec>();
    for (const atom of scene.atoms) {
      atoms.set(atom.id, canonicalAtomBySiteId.get(atom.siteId) ?? atom);
    }
    return atoms;
  }, [scene.atoms]);
  const selectedObjectAtomId = selectedAtomId
    ? atomById.get(selectedAtomId)?.id ?? selectedAtomId
    : null;
  const rows = useMemo(
    () => rowsForElementGroups(elementGroups, expandedElements),
    [elementGroups, expandedElements],
  );
  const rowOffsets = useMemo(() => rowOffsetsForRows(rows), [rows]);
  const rowIndexByAtomId = useMemo(() => rowIndexByAtomIdForRows(rows), [rows]);
  const elementAppearanceByElement = useMemo(
    () =>
      elementAppearanceByElementForGroups(
        elementGroups,
        style,
        colorScheme,
        colorOverrides,
        atomsVisible,
      ),
    [atomsVisible, colorOverrides, colorScheme, elementGroups, style],
  );
  const refreshVirtualViewport = useCallback(() => {
    const tableContainer = tableContainerRef.current;
    const scrollContainer = inspectorScrollContainerForTable(tableContainer);
    if (!tableContainer || !scrollContainer) {
      return;
    }

    const nextViewport = measureObjectsTableViewport(tableContainer, scrollContainer);
    setVirtualViewport((currentViewport) =>
      sameVirtualViewport(currentViewport, nextViewport)
        ? currentViewport
        : nextViewport,
    );
  }, []);

  useLayoutEffect(() => {
    refreshVirtualViewport();
    const scrollContainer = inspectorScrollContainerForTable(tableContainerRef.current);
    if (!scrollContainer) {
      return;
    }

    scrollContainer.addEventListener("scroll", refreshVirtualViewport, {
      passive: true,
    });
    window.addEventListener("resize", refreshVirtualViewport);
    return () => {
      scrollContainer.removeEventListener("scroll", refreshVirtualViewport);
      window.removeEventListener("resize", refreshVirtualViewport);
    };
  }, [refreshVirtualViewport]);

  useLayoutEffect(() => {
    refreshVirtualViewport();
  }, [refreshVirtualViewport, rows.length]);

  useEffect(() => {
    if (!atomLocateRequest) {
      return;
    }

    const atom = atomById.get(atomLocateRequest.atomId);
    if (!atom) {
      onAtomLocateRequestHandled(atomLocateRequest.token);
      return;
    }

    setExpandedElements((currentExpandedElements) => {
      if (currentExpandedElements[atom.element] === true) {
        return currentExpandedElements;
      }

      return {
        ...currentExpandedElements,
        [atom.element]: true,
      };
    });
    setPendingLocateAtomId(atom.id);
    onAtomLocateRequestHandled(atomLocateRequest.token);
  }, [atomById, atomLocateRequest, onAtomLocateRequestHandled]);

  useLayoutEffect(() => {
    if (!pendingLocateAtomId) {
      return;
    }

    const rowIndex = rowIndexByAtomId.get(pendingLocateAtomId);
    if (rowIndex === undefined) {
      return;
    }

    scrollRowIndexIntoInspectorBody(
      tableContainerRef.current,
      rowOffsets[rowIndex] ?? 0,
      rowHeight(rows[rowIndex]!),
    );
    refreshVirtualViewport();
    setPendingLocateAtomId(null);
  }, [pendingLocateAtomId, refreshVirtualViewport, rowIndexByAtomId, rowOffsets, rows]);

  function toggleElementExpanded(element: string) {
    setExpandedElements((currentExpandedElements) => ({
      ...currentExpandedElements,
      [element]: !currentExpandedElements[element],
    }));
  }

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

    onStyleChange({
      ...nextStyle,
      objectStyles,
    });
  }

  function setAtomRadius(atom: AtomSpec, radius: number) {
    const nextStyle = ensureCustomRadiusStyle(style, objectAtoms);
    onStyleChange({
      ...nextStyle,
      objectStyles: setAtomOverrideProperty(
        nextStyle.objectStyles,
        atom.id,
        "radius",
        radius,
      ),
    });
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
    const nextStyle = {
      ...style,
      objectStyles,
    };

    onStyleChange(nextStyle);
  }

  function setAtomVisible(atom: AtomSpec, visible: boolean) {
    const nextStyle = {
      ...style,
      objectStyles: setAtomOverrideProperty(
        style.objectStyles,
        atom.id,
        "visible",
        visible,
      ),
    };

    onStyleChange(nextStyle);
  }

  function setAtomColor(atom: AtomSpec, color: string) {
    const nextStyle = ensureCustomColorStyle(style, objectAtoms);
    onStyleChange({
      ...nextStyle,
      objectStyles: setAtomOverrideProperty(
        nextStyle.objectStyles,
        atom.id,
        "color",
        color,
      ),
    });
  }

  function applyElementToAllAtoms(group: ElementGroup) {
    const elementAppearance = elementRowAppearance(
      group,
      style,
      colorScheme,
      colorOverrides,
      atomsVisible,
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
      "visible",
      elementAppearance.visible,
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      objectAtoms,
      group.element,
      "radius",
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      objectAtoms,
      group.element,
      "visible",
    );
    objectStyles = clearAtomOverridePropertyForElement(
      objectStyles,
      objectAtoms,
      group.element,
      "color",
    );
    const nextStyleWithObjectStyles = {
      ...nextStyle,
      objectStyles,
    };

    onStyleChange(nextStyleWithObjectStyles);
    onElementColorChange(group.element, elementAppearance.color);
  }

  function renderObjectsAtomCell(
    item: ObjectsAtomRow,
    columnId: ObjectsAtomColumnId,
  ) {
    switch (columnId) {
      case "site": {
        if (item.kind === "element") {
          const group = { atoms: item.atoms, element: item.element };
          const appearance =
            elementAppearanceByElement.get(item.element) ??
            elementRowAppearance(
              group,
              style,
              colorScheme,
              colorOverrides,
              atomsVisible,
            );
          return (
            <ElementSiteCell
              atomCount={item.atoms.length}
              color={appearance.color}
              expanded={expandedElements[item.element] === true}
              element={item.element}
              inputLabel={t("colorPicker.colorValue", { target: item.element })}
              onColorChange={(color) => onElementColorChange(item.element, color)}
              onToggle={() => toggleElementExpanded(item.element)}
              pickerId={objectsElementColorPickerId(item.element)}
            />
          );
        }

        const appearance = resolveAtomAppearanceForRow(
          item.atom,
          style,
          colorScheme,
          colorOverrides,
          atomsVisible,
        );
        return (
          <AtomSiteCell
            atom={item.atom}
            color={appearance.color}
            inputLabel={t("colorPicker.colorValue", { target: formatAtomSite(item.atom) })}
            onColorChange={(color) => setAtomColor(item.atom, color)}
            pickerId={objectsAtomColorPickerId(item.atom.id)}
          />
        );
      }
      case "radius": {
        if (item.kind === "element") {
          const group = { atoms: item.atoms, element: item.element };
          const appearance =
            elementAppearanceByElement.get(item.element) ??
            elementRowAppearance(
              group,
              style,
              colorScheme,
              colorOverrides,
              atomsVisible,
            );
          return (
            <RadiusCell
              ariaLabel={t("objectsPanel.radiusControl", { target: item.element })}
              value={appearance.radius}
              onCommit={(radius) => setElementRadius(item.element, radius)}
            />
          );
        }

        const appearance = resolveAtomAppearanceForRow(
          item.atom,
          style,
          colorScheme,
          colorOverrides,
          atomsVisible,
        );
        return (
          <RadiusCell
            ariaLabel={t("objectsPanel.radiusControl", { target: formatAtomSite(item.atom) })}
            value={appearance.radius}
            onCommit={(radius) => setAtomRadius(item.atom, radius)}
          />
        );
      }
      case "visible": {
        if (item.kind === "element") {
          const group = { atoms: item.atoms, element: item.element };
          const appearance =
            elementAppearanceByElement.get(item.element) ??
            elementRowAppearance(
              group,
              style,
              colorScheme,
              colorOverrides,
              atomsVisible,
            );
          return (
            <VisibilityCell
              ariaLabel={t("objectsPanel.visibility", { target: item.element })}
              visible={appearance.visible}
              onToggle={() => setElementVisible(item.element, !appearance.visible)}
            />
          );
        }

        const appearance = resolveAtomAppearanceForRow(
          item.atom,
          style,
          colorScheme,
          colorOverrides,
          atomsVisible,
        );
        return (
          <VisibilityCell
            ariaLabel={t("objectsPanel.visibility", { target: formatAtomSite(item.atom) })}
            visible={appearance.visible}
            onToggle={() => setAtomVisible(item.atom, !appearance.visible)}
          />
        );
      }
    }
  }

  const table = useReactTable({
    columns: OBJECTS_ATOM_COLUMN_DEFS,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const tableRows = table.getRowModel().rows;
  const virtualRange = virtualRowRangeForViewport(rowOffsets, virtualViewport);
  const virtualRows = tableRows.slice(virtualRange.startIndex, virtualRange.endIndex);
  const topSpacerHeight = rowOffsets[virtualRange.startIndex] ?? 0;
  const totalRowsHeight = rowOffsets.at(-1) ?? 0;
  const bottomSpacerHeight =
    totalRowsHeight - (rowOffsets[virtualRange.endIndex] ?? totalRowsHeight);

  return (
    <div ref={tableContainerRef} className={cn("min-h-0", OBJECTS_BODY_TEXT_CLASS)}>
      <Table className="table-fixed border-separate border-spacing-0 text-[13px]">
        <colgroup>
          <col className="w-[61%]" />
          <col className="w-[23%]" />
          <col className="w-[16%]" />
        </colgroup>
        <TableHeader>
          <TableRow className="border-border/70 hover:bg-transparent">
            {OBJECTS_ATOM_COLUMNS.map((column) => (
              <TableHead
                key={column.id}
                className={cn(
                  "h-7 px-1.5 py-0",
                  OBJECTS_HEADER_TEXT_CLASS,
                  column.id === "visible" ? "text-center" : null,
                )}
              >
                {objectsAtomColumnHeader(column.id, t)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {topSpacerHeight > 0 ? (
            <TableRow
              aria-hidden="true"
              className="border-0 hover:bg-transparent"
              style={{ height: topSpacerHeight }}
            >
              <TableCell
                colSpan={OBJECTS_ATOM_COLUMNS.length}
                className="h-0 border-0 p-0"
              />
            </TableRow>
          ) : null}
          {virtualRows.map((tableRow) => {
            const item = tableRow.original;
            const elementExpanded =
              item.kind === "element" && expandedElements[item.element] === true;
            const isFirstElement =
              item.kind === "element" && item.element === elementGroups[0]?.element;
            const selected =
              item.kind === "atom" && item.atom.id === selectedObjectAtomId;
            const row = (
              <TableRow
                key={tableRow.id}
                data-state={selected ? "selected" : undefined}
                className={cn(
                  "group border-0",
                  item.kind === "element"
                    ? cn(
                        elementExpanded
                          ? "bg-muted/30 hover:bg-muted/45"
                          : "bg-transparent hover:bg-muted/30",
                        isFirstElement
                          ? null
                          : "[&>td]:border-t [&>td]:border-border/45",
                      )
                    : "cursor-default hover:bg-muted/35",
                  selected ? "bg-accent hover:bg-accent" : null,
                )}
                onDoubleClick={() => {
                  if (item.kind === "atom") {
                    onAtomSelect(item.atom.id);
                  }
                }}
              >
                {OBJECTS_ATOM_COLUMNS.map((column) => (
                  <TableCell
                    key={`${tableRow.id}:${column.id}`}
                    className={cn(
                      OBJECTS_CELL_CLASS,
                      item.kind === "element" ? "h-9" : null,
                      column.id === "visible" ? "text-center" : null,
                    )}
                  >
                    {renderObjectsAtomCell(item, column.id)}
                  </TableCell>
                ))}
              </TableRow>
            );

            if (item.kind === "atom") {
              return row;
            }

            return (
              <ContextMenu key={tableRow.id}>
                <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
                <ContextMenuContent className="min-w-48">
                  <ContextMenuItem
                    onSelect={() => applyElementToAllAtoms(item)}
                  >
                    {t("objectsPanel.applyElementStyleToAtoms", {
                      element: item.element,
                    })}
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
          {bottomSpacerHeight > 0 ? (
            <TableRow
              aria-hidden="true"
              className="border-0 hover:bg-transparent"
              style={{ height: bottomSpacerHeight }}
            >
              <TableCell
                colSpan={OBJECTS_ATOM_COLUMNS.length}
                className="h-0 border-0 p-0"
              />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function ElementSiteCell({
  atomCount,
  color,
  element,
  expanded,
  inputLabel,
  onColorChange,
  onToggle,
  pickerId,
}: {
  atomCount: number;
  color: string;
  element: string;
  expanded: boolean;
  inputLabel: string;
  onColorChange: (color: string) => void;
  onToggle: () => void;
  pickerId: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 grid-cols-[1.25rem_16px_2.1ch_2ch_1fr] items-center gap-x-2.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={
          expanded
            ? t("objectsPanel.collapseElement", { element })
            : t("objectsPanel.expandElement", { element })
        }
        className={cn(
          TOOL_ICON_BUTTON_CLASS,
          "size-5 rounded-[7px] [&_svg]:size-3",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "transition-transform",
            expanded ? "rotate-90" : null,
          )}
        />
      </Button>
      <ColorCell
        ariaLabel={t("objectsPanel.setElementColor", { element })}
        color={color}
        inputLabel={inputLabel}
        onChange={onColorChange}
        pickerId={pickerId}
      />
      <span className="min-w-0 truncate font-semibold leading-tight text-foreground">
        {element}
      </span>
      <span className="shrink-0 text-left text-[11px] leading-none text-muted-foreground tabular-nums">
        {atomCount}
      </span>
      <span aria-hidden="true" />
    </div>
  );
}

function AtomSiteCell({
  atom,
  color,
  inputLabel,
  onColorChange,
  pickerId,
}: {
  atom: AtomSpec;
  color: string;
  inputLabel: string;
  onColorChange: (color: string) => void;
  pickerId: string;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid min-w-0 grid-cols-[1.25rem_16px_minmax(0,1fr)] items-center gap-x-2.5 leading-tight text-foreground">
      <span aria-hidden="true" />
      <ColorCell
        ariaLabel={t("objectsPanel.setAtomColor", { atom: formatAtomSite(atom) })}
        color={color}
        inputLabel={inputLabel}
        onChange={onColorChange}
        pickerId={pickerId}
      />
      <span className="block truncate font-mono text-[12px]">{formatAtomSite(atom)}</span>
    </div>
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
  const [valueText, setValueText] = useState(formatRadius(value));
  const [hasEdited, setHasEdited] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const cancelCommitRef = useRef(false);
  const displayedValue = isFocused && !hasEdited ? "" : valueText;

  useEffect(() => {
    setValueText(formatRadius(value));
  }, [value]);

  function commitValueText(text: string) {
    const parsedRadius = parseRadiusInput(text);
    if (parsedRadius === null) {
      setValueText(formatRadius(value));
      return;
    }

    const nextRadius = clampAtomRadius(parsedRadius);
    setValueText(formatRadius(nextRadius));
    onCommit(nextRadius);
  }

  function handleFocus() {
    cancelCommitRef.current = false;
    setIsFocused(true);
    setHasEdited(false);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);

    if (cancelCommitRef.current || !hasEdited) {
      cancelCommitRef.current = false;
      setValueText(formatRadius(value));
      return;
    }

    commitValueText(event.currentTarget.value);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasEdited(true);
    setValueText(event.currentTarget.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }

    if (event.key === "Escape") {
      cancelCommitRef.current = true;
      setValueText(formatRadius(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? RADIUS_STEP : -RADIUS_STEP;
      const nextRadius = clampAtomRadius(value + direction);
      setHasEdited(true);
      setValueText(formatRadius(nextRadius));
      onCommit(nextRadius);
    }
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={displayedValue}
      className="h-[22px] w-12 rounded-md px-1.5 py-0 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]"
      onBlur={handleBlur}
      onChange={handleChange}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onFocus={handleFocus}
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
    <span
      className="inline-flex h-6 items-center justify-center"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
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
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

function inspectorScrollContainerForTable(
  tableContainer: HTMLElement | null,
): HTMLElement | null {
  return tableContainer?.closest<HTMLElement>('[data-slot="inspector-body"]') ?? null;
}

function measureObjectsTableViewport(
  tableContainer: HTMLElement,
  scrollContainer: HTMLElement,
): VirtualViewport {
  const tableRect = tableContainer.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const tableTop = tableRect.top - containerRect.top + scrollContainer.scrollTop;
  const rowsTop = tableTop + OBJECTS_TABLE_HEADER_HEIGHT;
  const height =
    scrollContainer.clientHeight > 0
      ? scrollContainer.clientHeight
      : OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT;

  return {
    height,
    scrollTop: Math.max(0, scrollContainer.scrollTop - rowsTop),
  };
}

function sameVirtualViewport(left: VirtualViewport, right: VirtualViewport): boolean {
  return left.height === right.height && left.scrollTop === right.scrollTop;
}

function virtualRowRangeForViewport(
  rowOffsets: readonly number[],
  viewport: VirtualViewport,
): VirtualRowRange {
  const rowCount = Math.max(0, rowOffsets.length - 1);
  if (rowCount <= 0) {
    return { endIndex: 0, startIndex: 0 };
  }

  const visibleStartIndex = rowIndexAtOffset(rowOffsets, viewport.scrollTop);
  const visibleEndIndex = rowIndexAtOffset(
    rowOffsets,
    viewport.scrollTop + viewport.height,
  );
  const startIndex = Math.min(
    rowCount - 1,
    Math.max(0, visibleStartIndex - OBJECTS_TABLE_VIRTUAL_OVERSCAN),
  );
  const endIndex = Math.max(
    startIndex + 1,
    Math.min(
      rowCount,
      visibleEndIndex + 1 + OBJECTS_TABLE_VIRTUAL_OVERSCAN,
    ),
  );

  return {
    endIndex,
    startIndex,
  };
}

function rowIndexAtOffset(rowOffsets: readonly number[], offset: number): number {
  const rowCount = Math.max(0, rowOffsets.length - 1);
  let low = 0;
  let high = rowCount;

  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((rowOffsets[middle + 1] ?? Infinity) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  return Math.min(Math.max(0, low), Math.max(0, rowCount - 1));
}

function scrollRowIndexIntoInspectorBody(
  tableContainer: HTMLElement | null,
  rowOffset: number,
  rowHeight: number,
) {
  const scrollContainer = inspectorScrollContainerForTable(tableContainer);
  if (!tableContainer || !scrollContainer) {
    return;
  }

  const tableRect = tableContainer.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const tableTop = tableRect.top - containerRect.top + scrollContainer.scrollTop;
  const rowTop = tableTop + OBJECTS_TABLE_HEADER_HEIGHT + rowOffset;
  const rowBottom = rowTop + rowHeight;
  const viewportTop = scrollContainer.scrollTop;
  const viewportBottom =
    viewportTop +
    (scrollContainer.clientHeight > 0
      ? scrollContainer.clientHeight
      : OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT);

  if (rowTop < viewportTop) {
    scrollContainer.scrollTop = Math.max(0, rowTop - 8);
    return;
  }

  if (rowBottom > viewportBottom) {
    scrollContainer.scrollTop = Math.max(
      0,
      rowBottom -
        (scrollContainer.clientHeight > 0
          ? scrollContainer.clientHeight
          : OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT) +
        8,
    );
  }
}

function groupAtomsByElement(atoms: readonly AtomSpec[]): ElementGroup[] {
  const groups: ElementGroup[] = [];
  const groupByElement = new Map<string, ElementGroup>();

  for (const atom of atoms) {
    let group = groupByElement.get(atom.element);
    if (!group) {
      group = {
        atoms: [],
        element: atom.element,
      };
      groupByElement.set(atom.element, group);
      groups.push(group);
    }
    group.atoms.push(atom);
  }

  return groups;
}

function rowsForElementGroups(
  elementGroups: readonly ElementGroup[],
  expandedElements: Record<string, boolean>,
): ObjectsAtomRow[] {
  const rows: ObjectsAtomRow[] = [];

  for (const group of elementGroups) {
    rows.push({
      atoms: group.atoms,
      element: group.element,
      id: `element:${group.element}`,
      kind: "element",
    });

    if (expandedElements[group.element] !== true) {
      continue;
    }

    for (const atom of group.atoms) {
      rows.push({
        atom,
        id: atom.id,
        kind: "atom",
      });
    }
  }

  return rows;
}

function rowHeight(row: ObjectsAtomRow): number {
  return row.kind === "element"
    ? OBJECTS_ELEMENT_ROW_HEIGHT
    : OBJECTS_ATOM_ROW_HEIGHT;
}

function rowOffsetsForRows(rows: readonly ObjectsAtomRow[]): number[] {
  const offsets = [0];

  for (const row of rows) {
    offsets.push(offsets[offsets.length - 1]! + rowHeight(row));
  }

  return offsets;
}

function rowIndexByAtomIdForRows(rows: readonly ObjectsAtomRow[]): Map<string, number> {
  const rowIndexByAtomId = new Map<string, number>();

  rows.forEach((row, rowIndex) => {
    if (row.kind === "atom") {
      rowIndexByAtomId.set(row.atom.id, rowIndex);
    }
  });

  return rowIndexByAtomId;
}

function elementAppearanceByElementForGroups(
  elementGroups: readonly ElementGroup[],
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
): Map<string, AtomAppearance> {
  const appearanceByElement = new Map<string, AtomAppearance>();

  for (const group of elementGroups) {
    appearanceByElement.set(
      group.element,
      elementRowAppearance(group, style, colorScheme, colorOverrides, atomsVisible),
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
) {
  const representativeAtom = group.atoms[0];
  const elementOverride = style.objectStyles.elementOverrides[group.element];

  if (!representativeAtom) {
    return {
      color: "#808080",
      radius: 1,
      visible: (elementOverride?.visible ?? true) && atomsVisible,
    };
  }

  const atomAppearance = resolveAtomAppearanceForRow(
    representativeAtom,
    {
      ...style,
      objectStyles: {
        ...style.objectStyles,
        atomOverrides: {},
      },
    },
    colorScheme,
    colorOverrides,
    atomsVisible,
  );

  return {
    ...atomAppearance,
    radius:
      elementOverride?.radius ??
      baseAtomRadiusForStyle(representativeAtom, style),
    visible: (elementOverride?.visible ?? true) && atomsVisible,
  };
}

function resolveAtomAppearanceForRow(
  atom: AtomSpec,
  style: StyleState,
  colorScheme: StyleState["colorScheme"],
  colorOverrides: ReturnType<typeof elementColorOverridesForStyle>,
  atomsVisible: boolean,
) {
  return resolveAtomAppearance({
    atom,
    colorOverrides,
    colorScheme,
    style: {
      ...style,
      globalAtomsVisible: atomsVisible,
    },
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
  const objectStylesWithoutRadius = clearObjectStyleProperty(
    style.objectStyles,
    "radius",
  );

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
  return String(Math.round(value * 100) / 100);
}

function parseRadiusInput(value: string): number | null {
  const parsedValue = Number(value.trim());
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return null;
  }
  return parsedValue;
}
