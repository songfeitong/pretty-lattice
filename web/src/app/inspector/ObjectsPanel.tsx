import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ChevronRight,
  CopyCheck,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomSpec, SceneSpec } from "../../api/scene";
import {
  CUSTOM_ATOM_RADIUS_MODEL,
  baseAtomRadiusForStyle,
  baseColorSchemeForStyle,
  canonicalAtomsForObjectStyles,
  clampAtomRadius,
  clearAtomOverridePropertyForElement,
  clearObjectStyleProperty,
  createCustomAtomRadii,
  createCustomColormapFromStyle,
  elementColorOverridesForStyle,
  resolveAtomAppearance,
  setAtomOverrideProperty,
  setElementOverrideProperty,
  type AtomAppearance,
  type StyleState,
} from "../../model";
import { HexColorPicker, normalizeHexColor } from "../controls/HexColorPicker";
import {
  TOOL_ICON_BUTTON_CLASS,
} from "../surface";

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
const OBJECTS_TABLE_ROW_HEIGHT = 32;
const OBJECTS_TABLE_VIRTUAL_OVERSCAN = 8;
const OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT = 640;
const RADIUS_STEP = 0.01;

export function ObjectsPanel({
  activeTab,
  atomLocateRequest,
  atomsVisible,
  onActiveTabChange,
  onAtomSelect,
  onElementColorChange,
  onStyleChange,
  scene,
  selectedAtomId,
  style,
}: {
  activeTab: ObjectsPanelTab;
  atomLocateRequest: AtomLocateRequest | null;
  atomsVisible: boolean;
  onActiveTabChange: (tab: ObjectsPanelTab) => void;
  onAtomSelect: (atomId: string) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  return (
    <TooltipProvider delayDuration={500}>
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
          Atoms
        </TabsTrigger>
        <TabsTrigger
          value="bonds"
          className="!h-6 flex-none rounded-lg px-2.5 text-xs font-medium"
        >
          Bonds
        </TabsTrigger>
      </TabsList>

      <TabsContent value="atoms" className="m-0 min-h-0">
        <ObjectsAtomsTable
          atomLocateRequest={atomLocateRequest}
          atomsVisible={atomsVisible}
          onAtomSelect={onAtomSelect}
          onElementColorChange={onElementColorChange}
          onStyleChange={onStyleChange}
          scene={scene}
          selectedAtomId={selectedAtomId}
          style={style}
        />
      </TabsContent>

      <TabsContent value="bonds" className="m-0 min-h-0">
        <div className="h-24 rounded-md border border-dashed border-border/70" />
      </TabsContent>
    </Tabs>
    </TooltipProvider>
  );
}

function ObjectsAtomsTable({
  atomLocateRequest,
  atomsVisible,
  onAtomSelect,
  onElementColorChange,
  onStyleChange,
  scene,
  selectedAtomId,
  style,
}: {
  atomLocateRequest: AtomLocateRequest | null;
  atomsVisible: boolean;
  onAtomSelect: (atomId: string) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  const [expandedElements, setExpandedElements] = useState<Record<string, boolean>>({});
  const [activeColorPickerId, setActiveColorPickerId] = useState<string | null>(null);
  const [pendingLocateAtomId, setPendingLocateAtomId] = useState<string | null>(null);
  const [virtualViewport, setVirtualViewport] = useState<VirtualViewport>(() => ({
    height: OBJECTS_TABLE_DEFAULT_VIEWPORT_HEIGHT,
    scrollTop: 0,
  }));
  const tableContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpandedElements({});
    setActiveColorPickerId(null);
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
  }, [atomById, atomLocateRequest]);

  useLayoutEffect(() => {
    if (!pendingLocateAtomId) {
      return;
    }

    const rowIndex = rowIndexByAtomId.get(pendingLocateAtomId);
    if (rowIndex === undefined) {
      return;
    }

    scrollRowIndexIntoInspectorBody(tableContainerRef.current, rowIndex);
    refreshVirtualViewport();
    setPendingLocateAtomId(null);
  }, [pendingLocateAtomId, refreshVirtualViewport, rowIndexByAtomId]);

  const handleColorPickerOpenChange = useCallback((pickerId: string, open: boolean) => {
    setActiveColorPickerId((currentPickerId) => {
      if (open) {
        return pickerId;
      }

      return currentPickerId === pickerId ? null : currentPickerId;
    });
  }, []);

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

  const columns = useMemo<ColumnDef<ObjectsAtomRow>[]>(
    () => [
      {
        id: "site",
        header: "Site",
        cell: ({ row }) => {
          const item = row.original;
          if (item.kind === "element") {
            return (
              <ElementSiteCell
                atomCount={item.atoms.length}
                expanded={expandedElements[item.element] === true}
                element={item.element}
                onApply={() => applyElementToAllAtoms(item)}
                onToggle={() => toggleElementExpanded(item.element)}
              />
            );
          }

          return <AtomSiteCell atom={item.atom} />;
        },
      },
      {
        id: "radius",
        header: "R (Å)",
        cell: ({ row }) => {
          const item = row.original;
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
                ariaLabel={`${item.element} radius`}
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
              ariaLabel={`${formatAtomSite(item.atom)} radius`}
              value={appearance.radius}
              onCommit={(radius) => setAtomRadius(item.atom, radius)}
            />
          );
        },
      },
      {
        id: "color",
        header: "Color",
        cell: ({ row }) => {
          const item = row.original;
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
              <ColorCell
                active={activeColorPickerId === elementColorPickerId(item.element)}
                ariaLabel={`Set ${item.element} color`}
                color={appearance.color}
                inputLabel={`${item.element} color value`}
                onChange={(color) => onElementColorChange(item.element, color)}
                onOpenChange={(open) =>
                  handleColorPickerOpenChange(elementColorPickerId(item.element), open)
                }
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
            <ColorCell
              active={activeColorPickerId === atomColorPickerId(item.atom.id)}
              ariaLabel={`Set ${formatAtomSite(item.atom)} color`}
              color={appearance.color}
              inputLabel={`${formatAtomSite(item.atom)} color value`}
              onChange={(color) => setAtomColor(item.atom, color)}
              onOpenChange={(open) =>
                handleColorPickerOpenChange(atomColorPickerId(item.atom.id), open)
              }
            />
          );
        },
      },
      {
        id: "visible",
        header: "Visible",
        cell: ({ row }) => {
          const item = row.original;
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
                ariaLabel={`${item.element} visibility`}
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
              ariaLabel={`${formatAtomSite(item.atom)} visibility`}
              visible={appearance.visible}
              onToggle={() => setAtomVisible(item.atom, !appearance.visible)}
            />
          );
        },
      },
    ],
    [
      expandedElements,
      activeColorPickerId,
      handleColorPickerOpenChange,
      onElementColorChange,
      atomsVisible,
      elementAppearanceByElement,
      objectAtoms,
      style,
      colorOverrides,
      colorScheme,
    ],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });
  const tableRows = table.getRowModel().rows;
  const virtualRange = virtualRowRangeForViewport(tableRows.length, virtualViewport);
  const virtualRows = tableRows.slice(virtualRange.startIndex, virtualRange.endIndex);
  const topSpacerHeight = virtualRange.startIndex * OBJECTS_TABLE_ROW_HEIGHT;
  const bottomSpacerHeight =
    (tableRows.length - virtualRange.endIndex) * OBJECTS_TABLE_ROW_HEIGHT;

  return (
    <div ref={tableContainerRef} className={cn("min-h-0", OBJECTS_BODY_TEXT_CLASS)}>
      <Table className="table-fixed border-separate border-spacing-0 text-[13px]">
        <colgroup>
          <col className="w-[45%]" />
          <col className="w-[23%]" />
          <col className="w-[16%]" />
          <col className="w-[16%]" />
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-border/70 hover:bg-transparent"
            >
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    "h-7 px-1.5 py-0",
                    OBJECTS_HEADER_TEXT_CLASS,
                    header.id === "visible" ? "text-center" : null,
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {topSpacerHeight > 0 ? (
            <TableRow
              aria-hidden="true"
              className="border-0 hover:bg-transparent"
              style={{ height: topSpacerHeight }}
            >
              <TableCell colSpan={4} className="h-0 border-0 p-0" />
            </TableRow>
          ) : null}
          {virtualRows.map((tableRow) => {
            const item = tableRow.original;
            const selected =
              item.kind === "atom" && item.atom.id === selectedObjectAtomId;
            return (
              <TableRow
                key={tableRow.id}
                data-state={selected ? "selected" : undefined}
                className={cn(
                  "group border-border/45",
                  item.kind === "element"
                    ? "bg-muted/40 hover:bg-muted/55"
                    : "cursor-default hover:bg-muted/35",
                  selected ? "bg-accent hover:bg-accent" : null,
                )}
                onDoubleClick={() => {
                  if (item.kind === "atom") {
                    onAtomSelect(item.atom.id);
                  }
                }}
              >
                {tableRow.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      OBJECTS_CELL_CLASS,
                      cell.column.id === "visible" || cell.column.id === "color"
                        ? "text-center"
                        : null,
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {bottomSpacerHeight > 0 ? (
            <TableRow
              aria-hidden="true"
              className="border-0 hover:bg-transparent"
              style={{ height: bottomSpacerHeight }}
            >
              <TableCell colSpan={4} className="h-0 border-0 p-0" />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

function ElementSiteCell({
  atomCount,
  element,
  expanded,
  onApply,
  onToggle,
}: {
  atomCount: number;
  element: string;
  expanded: boolean;
  onApply: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="grid min-w-0 grid-cols-[1.25rem_2.1ch_2ch_1fr_auto] items-center gap-x-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={expanded ? `Collapse ${element}` : `Expand ${element}`}
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
      <span className="min-w-0 truncate font-semibold leading-tight text-foreground">
        {element}
      </span>
      <span className="shrink-0 text-left text-[11px] leading-none text-muted-foreground tabular-nums">
        {atomCount}
      </span>
      <span aria-hidden="true" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Apply ${element} style to all atoms`}
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "size-6 rounded-[8px] text-muted-foreground/70 [&_svg]:size-3.5",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onApply();
            }}
            onDoubleClick={(event) => event.stopPropagation()}
          >
            <CopyCheck aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Apply to all atoms</TooltipContent>
      </Tooltip>
    </div>
  );
}

function AtomSiteCell({ atom }: { atom: AtomSpec }) {
  return (
    <div className="grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] gap-x-1.5 leading-tight text-foreground">
      <span aria-hidden="true" />
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

  useEffect(() => {
    setValueText(formatRadius(value));
  }, [value]);

  function commitValueText() {
    const parsedRadius = parseRadiusInput(valueText);
    if (parsedRadius === null) {
      setValueText(formatRadius(value));
      return;
    }

    const nextRadius = clampAtomRadius(parsedRadius);
    setValueText(formatRadius(nextRadius));
    onCommit(nextRadius);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitValueText();
      return;
    }

    if (event.key === "Escape") {
      setValueText(formatRadius(value));
      event.currentTarget.blur();
      return;
    }

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const direction = event.key === "ArrowUp" ? RADIUS_STEP : -RADIUS_STEP;
      onCommit(clampAtomRadius(value + direction));
    }
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={valueText}
      className="h-[22px] w-[3.25rem] rounded-md px-1.5 py-0 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]"
      onBlur={commitValueText}
      onChange={(event) => setValueText(event.currentTarget.value)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    />
  );
}

function ColorCell({
  active,
  ariaLabel,
  color,
  inputLabel,
  onChange,
  onOpenChange,
}: {
  active: boolean;
  ariaLabel: string;
  color: string;
  inputLabel: string;
  onChange: (color: string) => void;
  onOpenChange: (open: boolean) => void;
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
        open={active}
        side="left"
        value={hexColor}
        swatchClassName="shadow-none"
        onOpenChange={onOpenChange}
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
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent side="left">
        {visible ? "Visible" : "Invisible"}
      </TooltipContent>
    </Tooltip>
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
  rowCount: number,
  viewport: VirtualViewport,
): VirtualRowRange {
  if (rowCount <= 0) {
    return { endIndex: 0, startIndex: 0 };
  }

  const visibleStartIndex = Math.floor(viewport.scrollTop / OBJECTS_TABLE_ROW_HEIGHT);
  const startIndex = Math.min(
    rowCount - 1,
    Math.max(0, visibleStartIndex - OBJECTS_TABLE_VIRTUAL_OVERSCAN),
  );
  const visibleRowCount = Math.ceil(viewport.height / OBJECTS_TABLE_ROW_HEIGHT);
  const endIndex = Math.max(
    startIndex + 1,
    Math.min(
      rowCount,
      visibleStartIndex + visibleRowCount + OBJECTS_TABLE_VIRTUAL_OVERSCAN,
    ),
  );

  return {
    endIndex,
    startIndex,
  };
}

function scrollRowIndexIntoInspectorBody(
  tableContainer: HTMLElement | null,
  rowIndex: number,
) {
  const scrollContainer = inspectorScrollContainerForTable(tableContainer);
  if (!tableContainer || !scrollContainer) {
    return;
  }

  const tableRect = tableContainer.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const tableTop = tableRect.top - containerRect.top + scrollContainer.scrollTop;
  const rowTop =
    tableTop + OBJECTS_TABLE_HEADER_HEIGHT + rowIndex * OBJECTS_TABLE_ROW_HEIGHT;
  const rowBottom = rowTop + OBJECTS_TABLE_ROW_HEIGHT;
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

function elementColorPickerId(element: string): string {
  return `element:${element}`;
}

function atomColorPickerId(atomId: string): string {
  return `atom:${atomId}`;
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
