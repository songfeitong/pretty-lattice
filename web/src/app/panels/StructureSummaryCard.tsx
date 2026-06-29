import { AlertTriangleIcon, ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { SceneSpec } from "../../api/scene";
import {
  CellMetric,
  SummaryRow,
  SymmetryMetric,
  formatPointGroupTitle,
  formatSpaceGroupTitle,
  renderFormula,
  renderPointGroup,
  renderSpaceGroup,
} from "./structureSummaryFormatting";
import { summarizeScene, type PreviewStatus } from "../previewState";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "../surface";
import { COMMON_PANEL_BODY_TEXT_CLASS } from "../controls/commonPanel/styles";

export function StructureSummaryCard({
  isCollapsed,
  onCollapsedChange,
  onOpenStructure,
  previewStatus,
  scene,
  selectedFileName,
}: {
  isCollapsed: boolean;
  onCollapsedChange: (isCollapsed: boolean) => void;
  onOpenStructure: () => void;
  previewStatus: PreviewStatus;
  scene: SceneSpec | null;
  selectedFileName: string | null;
}) {
  const summary = useMemo(() => summarizeScene(scene), [scene]);
  const expandableContentId = useId();
  const expandableContentRef = useRef<HTMLDivElement>(null);
  const [expandableContentHeight, setExpandableContentHeight] = useState<number | null>(null);
  const [dismissedWarningCodes, setDismissedWarningCodes] = useState<Set<string>>(
    () => new Set(),
  );
  const hasExpandableContent = Boolean(scene);
  const visibleWarnings = useMemo(
    () =>
      scene?.warnings?.filter((warning) => !dismissedWarningCodes.has(warning.code)) ?? [],
    [dismissedWarningCodes, scene?.warnings],
  );
  const toggleDetailsLabel = isCollapsed ? "Expand details" : "Collapse details";
  const expandableContentStyle = {
    height: hasExpandableContent && !isCollapsed
      ? (expandableContentHeight === null ? "auto" : `${expandableContentHeight}px`)
      : "0px",
  } as CSSProperties;

  useEffect(() => {
    setDismissedWarningCodes(new Set());
  }, [scene]);

  useEffect(() => {
    const expandableContentElement = expandableContentRef.current;
    if (!expandableContentElement) {
      return;
    }

    const measuredContentElement = expandableContentElement;

    function updateExpandableContentHeight() {
      const nextHeight = measuredContentElement.scrollHeight;
      setExpandableContentHeight(nextHeight > 0 ? nextHeight : null);
    }

    updateExpandableContentHeight();
    const animationFrame = window.requestAnimationFrame(updateExpandableContentHeight);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateExpandableContentHeight);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateExpandableContentHeight);
      };
    }

    const resizeObserver = new ResizeObserver(updateExpandableContentHeight);
    resizeObserver.observe(expandableContentElement);
    window.addEventListener("resize", updateExpandableContentHeight);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateExpandableContentHeight);
    };
  }, [hasExpandableContent, scene]);

  return (
    <aside
      className={cn(
        "rounded-xl border px-3 py-3.5 shadow-xl shadow-foreground/10",
        GLASS_SURFACE_CLASS,
      )}
      aria-label="Current structure"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <img
            src="/favicon.svg"
            alt=""
            className="size-7 shrink-0"
          />
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="truncate text-[0.95rem] font-semibold leading-tight">Pretty Lattice</h1>
            {hasExpandableContent ? (
              <TooltipProvider delayDuration={500}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-controls={expandableContentId}
                      aria-expanded={!isCollapsed}
                      aria-label={toggleDetailsLabel}
                      className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                      onClick={() => onCollapsedChange(!isCollapsed)}
                    >
                      {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">{toggleDetailsLabel}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
          </div>
        </div>

        <Button
          size="sm"
          aria-label="Open structure"
          className="h-7 gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,transform] duration-100 ease-out active:translate-y-[0.5px] active:bg-primary/80 [&_svg]:size-3.5"
          disabled={previewStatus === "loading"}
          onClick={onOpenStructure}
        >
          <FolderOpen data-icon="inline-start" aria-hidden="true" />
          <span>Open</span>
        </Button>
      </div>

      {selectedFileName ? <Separator className="my-2.5" /> : null}

      <div className="flex flex-col gap-1">
        {selectedFileName ? (
          <SummaryRow
            label="File"
            value={selectedFileName}
            title={selectedFileName}
          />
        ) : null}

        {scene ? (
          <>
            <SummaryRow
              label="Formula"
              value={renderFormula(summary.formula)}
              mono={false}
            />
            <SummaryRow label="Atoms" value={summary.atomCount} />
          </>
        ) : null}
      </div>

      {visibleWarnings.length > 0 ? (
        <div className="mt-2.5 flex flex-col gap-2">
          {visibleWarnings.map((warning) => (
            <Alert
              key={warning.code}
              className="rounded-md px-2.5 py-2"
              onDismiss={() => {
                setDismissedWarningCodes(
                  (currentWarningCodes) =>
                    new Set(currentWarningCodes).add(warning.code),
                );
              }}
            >
              <AlertTriangleIcon aria-hidden="true" />
              <AlertDescription className="text-xs leading-snug">
                {warning.message}
              </AlertDescription>
            </Alert>
          ))}
        </div>
      ) : null}

      {hasExpandableContent ? (
        <div
          id={expandableContentId}
          data-slot="structure-summary-details"
          className="overflow-hidden transition-[height] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={expandableContentStyle}
        >
          <div
            ref={expandableContentRef}
            aria-hidden={isCollapsed ? "true" : undefined}
            className="pt-2.5"
          >
            {scene ? (
              <div className="flex flex-col gap-2.5 max-[760px]:hidden">
                <Separator />
                <div>
                  <span className="block text-xs font-bold text-muted-foreground">Symmetry</span>
                  {summary.symmetry?.available ? (
                    <dl className={cn("mt-1.5 flex flex-col gap-1", COMMON_PANEL_BODY_TEXT_CLASS)}>
                      <SymmetryMetric
                        label="Space group"
                        value={renderSpaceGroup(
                          summary.symmetry.spaceGroup,
                          summary.symmetry.spaceGroupNumber,
                        )}
                        title={formatSpaceGroupTitle(
                          summary.symmetry.spaceGroup,
                          summary.symmetry.spaceGroupNumber,
                        )}
                      />
                      <SymmetryMetric
                        label="Point group"
                        value={renderPointGroup(
                          summary.symmetry.pointGroup,
                          summary.symmetry.pointGroupSchoenflies,
                        )}
                        title={formatPointGroupTitle(
                          summary.symmetry.pointGroup,
                          summary.symmetry.pointGroupSchoenflies,
                        )}
                      />
                      <SymmetryMetric
                        label="Crystal system"
                        value={summary.symmetry.crystalSystem ?? "-"}
                      />
                    </dl>
                  ) : (
                    <dl className={cn("mt-1.5 flex flex-col gap-1", COMMON_PANEL_BODY_TEXT_CLASS)}>
                      <SymmetryMetric label="Space group" value="N/A" />
                      <SymmetryMetric label="Point group" value="N/A" />
                      <SymmetryMetric label="Crystal system" value="N/A" />
                    </dl>
                  )}
                </div>

                {summary.cell ? (
                  <>
                    <Separator />
                    <div>
                      <span className="block text-xs font-bold text-muted-foreground">
                        Lattice Parameters
                      </span>
                      <dl className={cn("mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 font-mono", COMMON_PANEL_BODY_TEXT_CLASS)}>
                        <CellMetric label="a" value={summary.cell.a} unit="Å" />
                        <CellMetric label="b" value={summary.cell.b} unit="Å" />
                        <CellMetric label="c" value={summary.cell.c} unit="Å" />
                        <CellMetric label="α" value={summary.cell.alpha} unit="°" />
                        <CellMetric label="β" value={summary.cell.beta} unit="°" />
                        <CellMetric label="γ" value={summary.cell.gamma} unit="°" />
                      </dl>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
