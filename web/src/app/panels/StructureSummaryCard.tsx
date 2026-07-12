import { AlertTriangleIcon, ChevronDown, ChevronUp, FolderOpen } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
import { AboutPrettyLatticeDialog } from "./AboutPrettyLatticeDialog";
import { PrettyLatticeLogo } from "./PrettyLatticeLogo";

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
  const { t } = useTranslation();
  const summary = useMemo(() => summarizeScene(scene), [scene]);
  const expandableContentId = useId();
  const [isLogoHovered, setIsLogoHovered] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState<{
    codes: Set<string>;
    scene: SceneSpec | null;
  }>(() => ({ codes: new Set(), scene: null }));
  const hasExpandableContent = Boolean(scene);
  const visibleWarnings = useMemo(() => {
    const dismissedWarningCodes =
      dismissedWarnings.scene === scene ? dismissedWarnings.codes : null;
    return scene?.warnings?.filter((warning) => !dismissedWarningCodes?.has(warning.code)) ?? [];
  }, [dismissedWarnings, scene]);
  const toggleDetailsLabel = isCollapsed
    ? t("summary.expandDetails")
    : t("summary.collapseDetails");

  return (
    <aside
      className={cn(
        "rounded-xl border px-3 py-3.5 shadow-xl shadow-foreground/10",
        GLASS_SURFACE_CLASS,
      )}
      aria-label={t("summary.currentStructure")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Dialog open={isAboutDialogOpen} onOpenChange={setIsAboutDialogOpen}>
            <TooltipProvider delayDuration={500}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("app.aboutPrettyLattice")}
                    className="grid size-7 shrink-0 place-items-center rounded-[8px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    onBlur={() => setIsLogoHovered(false)}
                    onClick={() => {
                      setIsLogoHovered(false);
                      setIsAboutDialogOpen(true);
                    }}
                    onPointerEnter={() => setIsLogoHovered(true)}
                    onPointerLeave={() => setIsLogoHovered(false)}
                  >
                    <PrettyLatticeLogo
                      className="size-7"
                      isHovered={isLogoHovered}
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{t("app.about")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <AboutPrettyLatticeDialog />
          </Dialog>
          <div className="flex min-w-0 items-center gap-1">
            <h1 className="truncate text-[0.95rem] font-semibold leading-tight">
              {t("app.prettyLattice")}
            </h1>
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
          aria-label={t("actions.openStructure")}
          className="continuous-pill h-7 gap-1.5 rounded-full px-2.5 text-xs transition-[background-color,transform] duration-100 ease-out enabled:cursor-pointer active:translate-y-[0.5px] active:bg-primary/80 [&_svg]:size-3.5"
          disabled={previewStatus === "loading"}
          onClick={onOpenStructure}
        >
          <FolderOpen data-icon="inline-start" aria-hidden="true" />
          <span>{t("actions.open")}</span>
        </Button>
      </div>

      {selectedFileName ? <Separator className="my-2.5" /> : null}

      <div className="flex flex-col gap-1">
        {selectedFileName ? (
          <SummaryRow
            label={t("summary.file")}
            value={selectedFileName}
            title={selectedFileName}
          />
        ) : null}

        {scene ? (
          <>
            <SummaryRow
              label={t("summary.formula")}
              value={renderFormula(summary.formula)}
              mono={false}
            />
            <SummaryRow label={t("summary.atoms")} value={summary.atomCount} />
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
                setDismissedWarnings((currentWarnings) => {
                  const currentCodes =
                    currentWarnings.scene === scene ? currentWarnings.codes : new Set<string>();
                  return {
                    codes: new Set(currentCodes).add(warning.code),
                    scene,
                  };
                });
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
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduced:transition-none",
            isCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
          )}
        >
          <div
            data-slot="structure-summary-details-body"
            aria-hidden={isCollapsed ? "true" : undefined}
            className="min-h-0 overflow-hidden"
          >
            <div data-slot="structure-summary-details-content" className="pt-2.5">
              {scene ? (
                <div className="flex flex-col gap-2.5 max-[760px]:hidden">
                  <Separator data-structure-summary-details-separator />
                  <div>
                    <span className="block text-xs font-bold text-muted-foreground">
                      {t("summary.symmetry")}
                    </span>
                    {summary.symmetry?.available ? (
                      <dl className={cn("mt-1.5 flex flex-col gap-1", COMMON_PANEL_BODY_TEXT_CLASS)}>
                        <SymmetryMetric
                          label={t("summary.spaceGroup")}
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
                          label={t("summary.pointGroup")}
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
                          label={t("summary.crystalSystem")}
                          value={summary.symmetry.crystalSystem ?? "-"}
                        />
                      </dl>
                    ) : (
                      <dl className={cn("mt-1.5 flex flex-col gap-1", COMMON_PANEL_BODY_TEXT_CLASS)}>
                        <SymmetryMetric label={t("summary.spaceGroup")} value="N/A" />
                        <SymmetryMetric label={t("summary.pointGroup")} value="N/A" />
                        <SymmetryMetric label={t("summary.crystalSystem")} value="N/A" />
                      </dl>
                    )}
                  </div>

                  {summary.cell ? (
                    <>
                      <Separator />
                      <div>
                        <span className="block text-xs font-bold text-muted-foreground">
                          {t("summary.latticeParameters")}
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
        </div>
      ) : null}
    </aside>
  );
}
