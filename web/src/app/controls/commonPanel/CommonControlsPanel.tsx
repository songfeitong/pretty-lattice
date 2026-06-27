import {
  ImageDown,
  Palette,
  Rotate3d as CameraIcon,
  View as DisplayIcon,
  type LucideIcon,
} from "lucide-react";
import {
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { AtomRadiusModel } from "../../../api/scene";
import type {
  ComponentOpacityState,
  ComponentVisibilityState,
  CrystalCameraPrimaryDirection,
  CrystalCameraScreenDirection,
  CrystalCameraState,
  ExportProjectedSize,
  ExportSettingsState,
  StyleState,
  VectorTuple,
} from "../../../model";
import { GLASS_SURFACE_CLASS } from "../../surface";
import { DisplayTabContent } from "./DisplayTab";
import { ExportTabContent } from "./ExportTab";
import { OrientationTabContent } from "./OrientationTab";
import { StyleTabContent } from "./StyleTab";

export type CommonPanelTab = "camera" | "display" | "style" | "export";

interface TabIndicatorRect {
  left: number;
  width: number;
}

const COMMON_PANEL_TABS: {
  Icon: LucideIcon;
  label: string;
  value: CommonPanelTab;
}[] = [
  { Icon: DisplayIcon, label: "Display", value: "display" },
  { Icon: CameraIcon, label: "Pose", value: "camera" },
  { Icon: Palette, label: "Style", value: "style" },
  { Icon: ImageDown, label: "Export", value: "export" },
];

export function CommonControlsPanel({
  cameraState,
  cellVectors,
  componentOpacity,
  componentVisibility,
  exportError,
  exportProjectedSize,
  exportSettings,
  hasPolyhedra,
  isExporting,
  onComponentOpacityChange,
  onComponentVisibilityChange,
  onAtomRadiusModelChange,
  onCameraPrimaryChange,
  onCameraRollPreviewChange,
  onCameraRollPreviewStart,
  onCameraRollChange,
  onCameraSecondaryChange,
  onCameraStateChange,
  onActiveTabChange,
  onExport,
  onExportSettingsChange,
  onStyleChange,
  style,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  componentOpacity: ComponentOpacityState;
  componentVisibility: ComponentVisibilityState;
  exportError: string | null;
  exportProjectedSize?: ExportProjectedSize;
  exportSettings: ExportSettingsState;
  hasPolyhedra: boolean;
  isExporting: boolean;
  onAtomRadiusModelChange: (atomRadiusModel: AtomRadiusModel) => void;
  onCameraPrimaryChange: (primary: CrystalCameraPrimaryDirection) => void;
  onCameraRollPreviewChange: (rollDegrees: number) => void;
  onCameraRollPreviewStart: () => void;
  onCameraRollChange: (rollDegrees: number) => void;
  onCameraSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
  onActiveTabChange?: (tab: CommonPanelTab) => void;
  onComponentOpacityChange: Dispatch<SetStateAction<ComponentOpacityState>>;
  onComponentVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  onExport: () => void;
  onExportSettingsChange: (settings: ExportSettingsState) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  style: StyleState;
}) {
  const tabTriggerRefs = useRef<Record<CommonPanelTab, HTMLButtonElement | null>>({
    camera: null,
    display: null,
    export: null,
    style: null,
  });
  const contentRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<CommonPanelTab>("display");
  const [hasMountedCameraTab, setHasMountedCameraTab] = useState(() => cellVectors.length > 0);
  const [tabIndicatorRect, setTabIndicatorRect] = useState<TabIndicatorRect | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const contentStyle = contentHeight === null
    ? undefined
    : ({ height: `${contentHeight}px` } as CSSProperties);
  const tabListStyle = {
    gridTemplateColumns: COMMON_PANEL_TABS.map(({ value }) =>
      value === activeTab ? "1.65fr" : "0.9fr",
    ).join(" "),
  } as const;

  useEffect(() => {
    if (cellVectors.length > 0) {
      setHasMountedCameraTab(true);
    }
  }, [cellVectors.length]);

  useEffect(() => {
    const updateIndicatorRect = () => {
      const activeTrigger = tabTriggerRefs.current[activeTab];
      if (!activeTrigger) {
        return;
      }

      setTabIndicatorRect({
        left: activeTrigger.offsetLeft,
        width: activeTrigger.offsetWidth,
      });
    };

    updateIndicatorRect();
    const animationFrame = window.requestAnimationFrame(updateIndicatorRect);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateIndicatorRect);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateIndicatorRect);
      };
    }

    const resizeObserver = new ResizeObserver(updateIndicatorRect);
    for (const trigger of Object.values(tabTriggerRefs.current)) {
      if (trigger) {
        resizeObserver.observe(trigger);
      }
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
    };
  }, [activeTab]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    function updateContentHeight() {
      const activeContent = contentElement?.querySelector<HTMLElement>(
        "[data-slot='tabs-content'][data-state='active']",
      );
      const nextHeight = activeContent?.scrollHeight ?? 0;

      setContentHeight(nextHeight > 0 ? nextHeight : null);
    }

    let resizeObserver: ResizeObserver | null = null;
    const animationFrame = window.requestAnimationFrame(() => {
      updateContentHeight();

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      resizeObserver = new ResizeObserver(updateContentHeight);
      const activeContent = contentElement.querySelector<HTMLElement>(
        "[data-slot='tabs-content'][data-state='active']",
      );
      if (activeContent) {
        resizeObserver.observe(activeContent);
      }
    });
    window.addEventListener("resize", updateContentHeight);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.cancelAnimationFrame(animationFrame);
        window.removeEventListener("resize", updateContentHeight);
      };
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", updateContentHeight);
      resizeObserver?.disconnect();
    };
  }, [activeTab]);

  function handleTabValueChange(value: string) {
    const nextTab = value as CommonPanelTab;
    const currentHeight = contentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setContentHeight(currentHeight);
    }

    if (nextTab === "camera") {
      setHasMountedCameraTab(true);
    }

    setActiveTab(nextTab);
    onActiveTabChange?.(nextTab);
  }

  return (
    <TooltipProvider>
      <aside
        aria-label="Common controls"
        className={cn(
          "rounded-xl border px-3 py-2 shadow-xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
        )}
      >
        <Tabs
          value={activeTab}
          onValueChange={handleTabValueChange}
        >
          <TabsList
            className="relative grid !h-8 w-full overflow-hidden rounded-lg bg-muted/70 p-1 transition-[grid-template-columns] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
            style={tabListStyle}
          >
            {tabIndicatorRect ? (
              <span
                aria-hidden="true"
                data-slot="common-controls-active-indicator"
                className="pointer-events-none absolute inset-y-1 left-0 z-0 rounded-md bg-background shadow-sm transition-[transform,width] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
                style={{
                  transform: `translateX(${tabIndicatorRect.left}px)`,
                  width: tabIndicatorRect.width,
                }}
              />
            ) : null}
            {COMMON_PANEL_TABS.map(({ Icon, label, value }) => {
              const isActive = value === activeTab;
              const trigger = (
                <TabsTrigger
                  ref={(node) => {
                    tabTriggerRefs.current[value] = node;
                  }}
                  key={value}
                  value={value}
                  aria-label={label}
                  className={cn(
                    "z-10 !h-6 min-w-0 rounded-lg !bg-transparent text-xs !shadow-none transition-[color,padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none motion-reduce:transition-none [&_svg]:size-3.5",
                    isActive ? "px-2 text-foreground" : "px-0.5 text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" />
                  <span
                    data-slot="common-controls-tab-label"
                    data-active={isActive ? "true" : "false"}
                    className={cn(
                      "overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                      isActive ? "max-w-16 opacity-100" : "max-w-0 opacity-0",
                    )}
                  >
                    {label}
                  </span>
                </TabsTrigger>
              );

              if (isActive) {
                return trigger;
              }

              return (
                <Tooltip key={value}>
                  <TooltipTrigger asChild>{trigger}</TooltipTrigger>
                  <TooltipContent side="top">{label}</TooltipContent>
                </Tooltip>
              );
            })}
          </TabsList>

          <div
            ref={contentRef}
            data-slot="common-controls-content"
            className="relative overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={contentStyle}
          >
            <TabsContent
              value="camera"
              className="common-controls-keepalive-tab"
              {...(hasMountedCameraTab ? { forceMount: true } : {})}
            >
              <OrientationTabContent
                cameraState={cameraState}
                cellVectors={cellVectors}
                onCameraPrimaryChange={onCameraPrimaryChange}
                onCameraRollPreviewChange={onCameraRollPreviewChange}
                onCameraRollPreviewStart={onCameraRollPreviewStart}
                onCameraRollChange={onCameraRollChange}
                onCameraSecondaryChange={onCameraSecondaryChange}
                onCameraStateChange={onCameraStateChange}
              />
            </TabsContent>
            <TabsContent value="display">
              <DisplayTabContent
                hasPolyhedra={hasPolyhedra}
                opacity={componentOpacity}
                onOpacityChange={onComponentOpacityChange}
                visibility={componentVisibility}
                onVisibilityChange={onComponentVisibilityChange}
              />
            </TabsContent>
            <TabsContent value="style">
              <StyleTabContent
                onAtomRadiusModelChange={onAtomRadiusModelChange}
                onStyleChange={onStyleChange}
                style={style}
              />
            </TabsContent>
            <TabsContent value="export" className="pt-1.5">
              <ExportTabContent
                error={exportError}
                exportProjectedSize={exportProjectedSize}
                isExporting={isExporting}
                onExport={onExport}
                onSettingsChange={onExportSettingsChange}
                settings={exportSettings}
              />
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </TooltipProvider>
  );
}
