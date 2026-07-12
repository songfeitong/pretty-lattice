import { Check, SquarePen, X } from "lucide-react";
import { type Dispatch, type KeyboardEvent, type ReactNode, type SetStateAction, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  BOND_ALGORITHM_OPTIONS,
  type BondCutoffRange,
  type BondSpec,
  type SceneSpec,
} from "../../api/scene";
import {
  CUSTOM_BONDING_MODE,
  STYLE_SCALE_MAX,
  STYLE_SCALE_MIN,
  type BondVisibilityOverrides,
  type BondingMode,
  type StyleState,
} from "../../model";
import { PercentSliderRow, clampPercentValue } from "../controls/commonPanel/sharedControls";
import { TOOL_ICON_BUTTON_CLASS } from "../surface";
import { AtomsPanel, type AtomLocateRequest } from "./AtomsPanel";
import {
  BondsPanel,
  type BondLocateRequest,
} from "./BondsPanel";
import {
  buildBondCutoffSubmission,
  createBondCutoffDrafts,
  formatBondCutoffDrafts,
  suggestedBondCutoffDraft,
  type BondCutoffDrafts,
  type BondCutoffField,
} from "./bondCutoffEditor";

export type ObjectsPanelTab = "atoms" | "bonds";

export function ObjectsPanel({
  activeTab,
  atomLocateRequest,
  atomOpacity,
  atomsVisible,
  bondAlgorithm,
  bondLocateRequest,
  bondOpacity,
  bondsVisible,
  bondVisibilityOverrides,
  cutoffOverrides,
  hasCustomBondingProfile,
  isSceneLoading,
  onActiveTabChange,
  onAtomLocateRequestHandled,
  onBondLocateRequestHandled,
  onBondAlgorithmChange,
  onBondVisibilityChange,
  onBondCutoffEditingStart,
  onCutoffChange,
  onElementColorChange,
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
  atomOpacity: number;
  atomsVisible: boolean;
  bondAlgorithm: BondingMode;
  bondLocateRequest: BondLocateRequest | null;
  bondOpacity: number;
  bondsVisible: boolean;
  bondVisibilityOverrides: BondVisibilityOverrides;
  cutoffOverrides: Record<string, BondCutoffRange>;
  hasCustomBondingProfile: boolean;
  isSceneLoading: boolean;
  onActiveTabChange: (tab: ObjectsPanelTab) => void;
  onAtomLocateRequestHandled: (token: number) => void;
  onBondLocateRequestHandled: (token: number) => void;
  onBondAlgorithmChange: (bondAlgorithm: BondingMode) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onBondCutoffEditingStart: () => void;
  onCutoffChange: (cutoffOverrides: Record<string, BondCutoffRange>) => Promise<boolean>;
  onElementColorChange: (element: string, color: string) => void;
  onFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  bondObjectsResetToken: number;
  selectedBondId: string | null;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  const { t } = useTranslation();
  const [cutoffEditing, setCutoffEditing] = useState(false);
  const [cutoffDrafts, setCutoffDrafts] = useState<BondCutoffDrafts>({});
  const [invalidCutoffFields, setInvalidCutoffFields] = useState<ReadonlySet<string>>(new Set());
  const [invalidCutoffFeedbackPhase, setInvalidCutoffFeedbackPhase] = useState<"a" | "b" | null>(null);

  useEffect(() => {
    setCutoffEditing(false);
    setCutoffDrafts({});
    setInvalidCutoffFields(new Set());
  }, [bondObjectsResetToken]);

  function startCutoffEditing() {
    setCutoffDrafts(createBondCutoffDrafts(scene, cutoffOverrides));
    setInvalidCutoffFields(new Set());
    setCutoffEditing(true);
    onBondCutoffEditingStart();
  }

  function cancelCutoffEditing() {
    if (isSceneLoading) return;
    setCutoffEditing(false);
    setCutoffDrafts({});
    setInvalidCutoffFields(new Set());
  }

  function changeCutoffDraft(familyKey: string, field: BondCutoffField, value: string) {
    setCutoffDrafts((current) => ({
      ...current,
      [familyKey]: {
        ...current[familyKey]!,
        [field === "min" ? "minText" : "maxText"]: value,
      },
    }));
    setInvalidCutoffFields((current) => {
      if (!current.has(`${familyKey}:${field}`)) return current;
      const next = new Set(current);
      next.delete(`${familyKey}:${field}`);
      return next;
    });
  }

  function toggleCutoffRestore(familyKey: string) {
    const family = scene.bondFamilies.find((candidate) => candidate.key === familyKey);
    if (!family) return;
    setCutoffDrafts((current) => {
      const draft = current[familyKey];
      if (!draft) return current;
      if (draft.pendingRemoval) {
        return { ...current, [familyKey]: { ...draft, pendingRemoval: false } };
      }
      if (draft.initialOverride) {
        return { ...current, [familyKey]: { ...draft, pendingRemoval: true } };
      }
      return {
        ...current,
        [familyKey]: suggestedBondCutoffDraft(family),
      };
    });
    setInvalidCutoffFields((current) => {
      const next = new Set(current);
      next.delete(`${familyKey}:min`);
      next.delete(`${familyKey}:max`);
      return next;
    });
  }

  async function applyCutoffDrafts() {
    if (isSceneLoading) return;
    const formattedDrafts = formatBondCutoffDrafts(cutoffDrafts);
    setCutoffDrafts(formattedDrafts);
    const submission = buildBondCutoffSubmission(
      scene.bondFamilies,
      cutoffOverrides,
      formattedDrafts,
    );

    if (submission.invalidFields.size > 0) {
      setInvalidCutoffFields(submission.invalidFields);
      setInvalidCutoffFeedbackPhase((current) => current === "a" ? "b" : "a");
      return;
    }
    if (!submission.changed) {
      cancelCutoffEditing();
      return;
    }
    const succeeded = await onCutoffChange(submission.nextOverrides);
    if (succeeded) {
      setCutoffEditing(false);
      setCutoffDrafts({});
      setInvalidCutoffFields(new Set());
    }
  }

  function handleCutoffEditorKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void applyCutoffDrafts();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelCutoffEditing();
    }
  }

  function setBondRadiusScale(bondThickness: number) {
    onStyleChange((currentStyle) => ({
      ...currentStyle,
      bondThickness: clampPercentValue(
        bondThickness,
        STYLE_SCALE_MIN.bondThickness,
        STYLE_SCALE_MAX.bondThickness,
      ),
    }));
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onActiveTabChange(value as ObjectsPanelTab)}
      className="flex min-h-0 flex-col gap-3"
    >
      <TabsList className="!h-8 w-fit justify-start rounded-lg bg-muted/70 p-1">
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
          <span className="flex items-center gap-1.5">
            {t("objectsPanel.bonds")}
            {isSceneLoading ? <LoadingSpinner className="text-muted-foreground" /> : null}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="atoms" className="m-0 min-h-0">
        <AtomsPanel
          atomLocateRequest={atomLocateRequest}
          atomOpacity={atomOpacity}
          atomsVisible={atomsVisible}
          onAtomLocateRequestHandled={onAtomLocateRequestHandled}
          onElementColorChange={onElementColorChange}
          onStyleChange={onStyleChange}
          scene={scene}
          selectedAtomId={selectedAtomId}
          style={style}
        />
      </TabsContent>

      <TabsContent value="bonds" className="m-0 min-h-0">
        <div data-slot="bond-global-controls" className="mb-3 flex flex-col gap-1 text-[13px]">
          <PercentSliderRow
            accessibleLabel={t("style.bond")}
            label={t("style.atomRadiusScale")}
            max={STYLE_SCALE_MAX.bondThickness}
            min={STYLE_SCALE_MIN.bondThickness}
            value={style.bondThickness}
            valueLabel={t("style.scale")}
            onValueChange={setBondRadiusScale}
          />
          <div className="grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.6rem] items-center gap-2 rounded-md px-1.5">
            <span className="min-w-0 leading-tight">{t("settings.bondingAlgorithm")}</span>
            <Select
              value={bondAlgorithm}
              disabled={isSceneLoading || cutoffEditing}
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
          <TooltipProvider delayDuration={500}>
            <div className="grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.6rem] items-center gap-2 rounded-md px-1.5">
              <span className="min-w-0 leading-tight">{t("objectsPanel.customCutoff")}</span>
              <div className="flex justify-end gap-1">
                {cutoffEditing ? (
                  <div
                    key="editing"
                    className="bond-cutoff-mode-actions-enter flex gap-1"
                  >
                    <CutoffModeButton
                      disabled={isSceneLoading}
                      label={t("objectsPanel.cancelCutoffEditing")}
                      onClick={cancelCutoffEditing}
                      tooltip={null}
                    >
                      <X aria-hidden="true" />
                    </CutoffModeButton>
                    <CutoffModeButton
                      disabled={isSceneLoading}
                      label={t("objectsPanel.applyCutoffEditing")}
                      onClick={() => void applyCutoffDrafts()}
                      tooltip={null}
                    >
                      {isSceneLoading ? <LoadingSpinner /> : <Check aria-hidden="true" />}
                    </CutoffModeButton>
                  </div>
                ) : (
                  <div key="idle" className="bond-cutoff-mode-actions-enter flex">
                    <CutoffModeButton
                      active={hasCustomBondingProfile}
                      disabled={isSceneLoading}
                      entry
                      label={t("objectsPanel.editCustomCutoff")}
                      onClick={startCutoffEditing}
                    >
                      <SquarePen aria-hidden="true" />
                    </CutoffModeButton>
                  </div>
                )}
              </div>
            </div>
          </TooltipProvider>
        </div>
        <Separator className="mb-3" />
        {isSceneLoading && !cutoffEditing ? <BondFamiliesSkeleton /> : null}
        <div className={cn(isSceneLoading && !cutoffEditing ? "hidden" : null)}>
          <BondsPanel
            bondLocateRequest={bondLocateRequest}
            bondOpacity={bondOpacity}
            bondsVisible={bondsVisible}
            cutoffDrafts={cutoffDrafts}
            cutoffEditing={cutoffEditing}
            invalidCutoffFields={invalidCutoffFields}
            invalidCutoffFeedbackPhase={invalidCutoffFeedbackPhase}
            isSceneLoading={isSceneLoading}
            onBondLocateRequestHandled={onBondLocateRequestHandled}
            onBondVisibilityChange={onBondVisibilityChange}
            onCutoffDraftChange={changeCutoffDraft}
            onCutoffEditorKeyDown={handleCutoffEditorKeyDown}
            onCutoffRestoreToggle={toggleCutoffRestore}
            onFamilyVisibilityChange={onFamilyVisibilityChange}
            onStyleChange={onStyleChange}
            resetToken={bondObjectsResetToken}
            scene={scene}
            selectedBondId={selectedBondId}
            style={style}
            visibilityOverrides={bondVisibilityOverrides}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function CutoffModeButton({
  active = false,
  children,
  disabled,
  entry = false,
  label,
  onClick,
  tooltip,
}: {
  active?: boolean;
  children: ReactNode;
  disabled: boolean;
  entry?: boolean;
  label: string;
  onClick: () => void;
  tooltip?: string | null;
}) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      disabled={disabled}
      className={cn(
        TOOL_ICON_BUTTON_CLASS,
        "size-6 rounded-[8px]",
            entry && "border-border/70 bg-background/70 hover:border-border",
        active && "bg-muted text-foreground",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
  if (tooltip === null) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {button}
      </TooltipTrigger>
      <TooltipContent side="left">{tooltip ?? label}</TooltipContent>
    </Tooltip>
  );
}


function BondFamiliesSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-label="Loading bonds">
      {["w-3/4", "w-2/3", "w-4/5", "w-1/2"].map((width, index) => (
        <div
          key={index}
          className="grid h-10 grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 border-b border-border/45 px-1.5"
        >
          <Skeleton className={`h-3 ${width}`} />
          <Skeleton className="h-3 w-14" />
        </div>
      ))}
    </div>
  );
}
