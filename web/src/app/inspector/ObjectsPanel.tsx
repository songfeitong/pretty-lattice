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
  type BondVisibilityOverrides,
  type BondingMode,
  type StyleState,
} from "../../model";
import { AtomsPanel, type AtomLocateRequest } from "./AtomsPanel";
import { BondsPanel, type BondLocateRequest } from "./BondsPanel";

export type ObjectsPanelTab = "atoms" | "bonds";

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
        {isSceneLoading ? <BondFamiliesSkeleton /> : null}
        <div className={cn(isSceneLoading ? "hidden" : null)}>
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
