import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";

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
import { cn } from "@/lib/utils";

import {
  BOND_ALGORITHM_OPTIONS,
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
import { AtomsPanel, type AtomLocateRequest } from "./AtomsPanel";
import { BondsPanel, type BondLocateRequest } from "./BondsPanel";

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
  cutoffOverrides: Record<string, number>;
  hasCustomBondingProfile: boolean;
  isSceneLoading: boolean;
  onActiveTabChange: (tab: ObjectsPanelTab) => void;
  onAtomLocateRequestHandled: (token: number) => void;
  onBondLocateRequestHandled: (token: number) => void;
  onBondAlgorithmChange: (bondAlgorithm: BondingMode) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onCutoffChange: (familyKey: string, cutoff: number | null) => Promise<boolean>;
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
          <div className="grid h-7 grid-cols-[minmax(5.5rem,1fr)_9.6rem] items-center gap-2 rounded-md px-1.5">
            <span className="min-w-0 leading-tight">{t("settings.bondingAlgorithm")}</span>
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
          <PercentSliderRow
            accessibleLabel={t("style.bond")}
            label={t("style.atomRadiusScale")}
            max={STYLE_SCALE_MAX.bondThickness}
            min={STYLE_SCALE_MIN.bondThickness}
            value={style.bondThickness}
            valueLabel={t("style.scale")}
            onValueChange={setBondRadiusScale}
          />
        </div>
        <Separator className="mb-3" />
        {isSceneLoading ? <BondFamiliesSkeleton /> : null}
        <div className={cn(isSceneLoading ? "hidden" : null)}>
          <BondsPanel
            bondLocateRequest={bondLocateRequest}
            bondOpacity={bondOpacity}
            bondsVisible={bondsVisible}
            cutoffOverrides={cutoffOverrides}
            isSceneLoading={isSceneLoading}
            onBondLocateRequestHandled={onBondLocateRequestHandled}
            onBondVisibilityChange={onBondVisibilityChange}
            onCutoffChange={onCutoffChange}
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
