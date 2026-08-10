import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Atom, PanelRight, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { BondCutoffRange, BondSpec, SceneSpec } from "../../api/scene";
import type {
  BondingMode,
  BondVisibilityOverrides,
  StyleState,
} from "../../model";
import {
  TOOL_ICON_BUTTON_ACTIVE_CLASS,
  TOOL_ICON_BUTTON_CLASS,
} from "../surface";
import {
  InspectorSettingsPanel,
  type InspectorSettingsActions,
  type InspectorSettingsModel,
} from "./InspectorSettingsPanel";
import { ObjectsPanel, type ObjectsPanelTab } from "./ObjectsPanel";

export type InspectorSidebarTab = "settings" | "objects";

export function InspectorToggle({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const { t } = useTranslation();
  const label = t("nav.sidebar");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-controls="inspector-sidebar"
            aria-expanded={isOpen}
            aria-label={label}
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "absolute right-4 top-4 z-30 size-8 rounded-[10px] [&_svg]:size-4",
              isOpen
                ? TOOL_ICON_BUTTON_ACTIVE_CLASS
                : "border-foreground/10 bg-card/80 backdrop-blur-xl backdrop-saturate-150",
            )}
            onClick={() => onOpenChange(!isOpen)}
          >
            <PanelRight aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function InspectorSidebar({
  activeObjectsTab,
  activeTab,
  atomLocateRequest,
  atomOpacity,
  atomsVisible,
  bondAlgorithm,
  bondLocateRequest,
  bondOpacity,
  bondObjectsResetToken,
  bondsVisible,
  bondVisibilityOverrides,
  cutoffOverrides,
  hasCustomBondingProfile,
  isOpen,
  isSceneLoading,
  scene,
  selectedAtomId,
  selectedBondId,
  settingsActions,
  settingsModel,
  style,
  onActiveObjectsTabChange,
  onActiveTabChange,
  onAtomLocateRequestHandled,
  onBondCutoffChange,
  onBondCutoffEditingStart,
  onBondFamilyVisibilityChange,
  onBondLocateRequestHandled,
  onBondVisibilityChange,
  onBondAlgorithmChange,
  onElementColorChange,
  onStyleChange,
}: {
  activeObjectsTab: ObjectsPanelTab;
  activeTab: InspectorSidebarTab;
  atomLocateRequest: { atomId: string; token: number } | null;
  atomOpacity: number;
  atomsVisible: boolean;
  bondAlgorithm: BondingMode;
  bondLocateRequest: { bondId: string; token: number } | null;
  bondOpacity: number;
  bondObjectsResetToken: number;
  bondsVisible: boolean;
  bondVisibilityOverrides: BondVisibilityOverrides;
  cutoffOverrides: Record<string, BondCutoffRange>;
  hasCustomBondingProfile: boolean;
  isOpen: boolean;
  isSceneLoading: boolean;
  scene: SceneSpec;
  selectedAtomId: string | null;
  selectedBondId: string | null;
  settingsActions: InspectorSettingsActions;
  settingsModel: InspectorSettingsModel;
  style: StyleState;
  onActiveObjectsTabChange: (tab: ObjectsPanelTab) => void;
  onActiveTabChange: (tab: InspectorSidebarTab) => void;
  onAtomLocateRequestHandled: (token: number) => void;
  onBondAlgorithmChange: (bondAlgorithm: BondingMode) => void;
  onBondCutoffChange: (
    cutoffOverrides: Record<string, BondCutoffRange>,
  ) => Promise<boolean>;
  onBondCutoffEditingStart: () => void;
  onBondFamilyVisibilityChange: (familyKey: string, visible: boolean) => void;
  onBondLocateRequestHandled: (token: number) => void;
  onBondVisibilityChange: (bond: BondSpec, visible: boolean) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
}) {
  const { t } = useTranslation();

  return (
    <aside
      id="inspector-sidebar"
      aria-label={t("nav.sidebar")}
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={cn(
        "absolute inset-y-0 right-0 z-20 flex w-[360px] max-w-[calc(100vw-1rem)] flex-col border-l border-border bg-card text-foreground",
        "transition-transform duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      <Tabs
        value={activeTab}
        onValueChange={(value) =>
          onActiveTabChange(value as InspectorSidebarTab)
        }
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <header className="flex h-[60px] shrink-0 items-start px-4 pt-3 pr-16">
          <TabsList
            variant="line"
            data-inspector-sidebar-tabs=""
            className="h-8 w-full justify-start gap-4 rounded-none p-0"
          >
            <TabsTrigger
              value="settings"
              className="h-8 flex-none px-0 text-[0.875rem] font-semibold"
            >
              <Settings aria-hidden="true" />
              {t("nav.settings")}
            </TabsTrigger>
            <TabsTrigger
              value="objects"
              className="h-8 flex-none px-0 text-[0.875rem] font-semibold"
            >
              <Atom aria-hidden="true" />
              {t("nav.objects")}
            </TabsTrigger>
          </TabsList>
        </header>

        <div
          data-slot="inspector-body"
          className="stable-scrollbar-gutter min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          <TabsContent value="settings" className="m-0">
            <InspectorSettingsPanel
              model={settingsModel}
              actions={settingsActions}
            />
          </TabsContent>
          <TabsContent value="objects" className="-mt-2 min-h-0">
            <ObjectsPanel
              activeTab={activeObjectsTab}
              atomLocateRequest={atomLocateRequest}
              atomOpacity={atomOpacity}
              atomsVisible={atomsVisible}
              bondLocateRequest={bondLocateRequest}
              bondOpacity={bondOpacity}
              bondAlgorithm={bondAlgorithm}
              bondObjectsResetToken={bondObjectsResetToken}
              bondsVisible={bondsVisible}
              bondVisibilityOverrides={bondVisibilityOverrides}
              cutoffOverrides={cutoffOverrides}
              hasCustomBondingProfile={hasCustomBondingProfile}
              isSceneLoading={isSceneLoading}
              onActiveTabChange={onActiveObjectsTabChange}
              onAtomLocateRequestHandled={onAtomLocateRequestHandled}
              onBondLocateRequestHandled={onBondLocateRequestHandled}
              onBondAlgorithmChange={onBondAlgorithmChange}
              onBondVisibilityChange={onBondVisibilityChange}
              onBondCutoffEditingStart={onBondCutoffEditingStart}
              onCutoffChange={onBondCutoffChange}
              onElementColorChange={onElementColorChange}
              onFamilyVisibilityChange={onBondFamilyVisibilityChange}
              onStyleChange={onStyleChange}
              scene={scene}
              selectedAtomId={selectedAtomId}
              selectedBondId={selectedBondId}
              style={style}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
