import {
  FolderOpen,
  ImageDown,
  Lock,
  Palette,
  PanelRightClose,
  RotateCcw,
  Rotate3d as CameraIcon,
  SlidersHorizontal,
  Unlock,
  View as DisplayIcon,
  type LucideIcon,
} from "lucide-react";
import { Quaternion } from "three";
import {
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  BOND_ALGORITHM_OPTIONS,
  DEFAULT_BOND_ALGORITHM,
  uploadStructurePreview,
  type BondAlgorithm,
  type SceneSpec,
} from "../api/scene";
import {
  LatticeScene,
  previewSafeAreaForViewport,
  type PreviewSafeArea,
} from "../scene/LatticeScene";
import { OrientationGizmo } from "../scene/OrientationGizmo";
import {
  createDefaultComponentVisibility,
  previewSafeAreaForSettings,
  visibleSceneForComponents,
  type ComponentVisibilityState,
} from "./settings";
import { deriveElementLegendEntries, type ElementLegendEntry } from "./elementLegend";
import { summarizeScene, type PreviewStatus } from "./previewState";
import { renderHermannMauguin } from "./symmetryNotation";
import {
  INTERACTION_MODE_OPTIONS,
  formatZoomPercent,
  parseZoomPercentInput,
  resetPreviewViewState,
  setPreviewInteractionLocked,
  setPreviewInteractionMode,
  setPreviewViewScale,
  sliderPositionToViewScale,
  snapZoomSliderPosition,
  viewScaleToSliderPosition,
  createPreviewViewState,
  type InteractionMode,
} from "./viewState";

const GLASS_SURFACE_CLASS =
  "border-foreground/10 bg-card/72 backdrop-blur-2xl backdrop-saturate-150";
const LOCKED_INTERACTION_DRAG_THRESHOLD_PX = 4;
const LOCKED_INTERACTION_FEEDBACK_ANIMATION_MS = 420;
const LOCKED_INTERACTION_WHEEL_IDLE_MS = 150;
const MAX_ORIENTATION_GIZMO_SIZE_PX = 280;
const MIN_ORIENTATION_GIZMO_SIZE_PX = 160;
const RESET_VIEW_FEEDBACK_ANIMATION_MS = 150;
const ORIENTATION_GIZMO_AVAILABLE_SIDE_RATIO = 0.35;
const ZOOM_SLIDER_BLUR_DELAY_MS = 500;
const ZOOM_SLIDER_HEIGHT_PX = 180;
const ZOOM_SLIDER_THUMB_SIZE_PX = 14;

type CommonPanelTab = "camera" | "display" | "style" | "export";

interface LockedInteractionPointer {
  pointerId: number;
  startX: number;
  startY: number;
  triggered: boolean;
}

interface ViewportSize {
  height: number;
  width: number;
}

interface TabIndicatorRect {
  left: number;
  width: number;
}

export function App() {
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [bondAlgorithm, setBondAlgorithm] =
    useState<BondAlgorithm>(DEFAULT_BOND_ALGORITHM);
  const [componentVisibility, setComponentVisibility] = useState(
    createDefaultComponentVisibility,
  );
  const [commonPanelTab, setCommonPanelTab] = useState<CommonPanelTab>("display");
  const [viewState, setViewState] = useState(createPreviewViewState);
  const [lockedInteractionFeedbackCount, setLockedInteractionFeedbackCount] = useState(0);
  const viewportSize = useViewportSize();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraOrientationRef = useRef(new Quaternion());
  const lockedInteractionPointerRef = useRef<LockedInteractionPointer | null>(null);
  const lockedInteractionWheelIdleTimeoutRef = useRef<number | null>(null);

  const handleViewScaleChange = useCallback((viewScale: number) => {
    setViewState((currentViewState) => setPreviewViewScale(currentViewState, viewScale));
  }, []);

  const handleInteractionModeChange = useCallback((interactionMode: InteractionMode) => {
    setViewState((currentViewState) =>
      setPreviewInteractionMode(currentViewState, interactionMode),
    );
  }, []);

  const handleInteractionLockedChange = useCallback((interactionLocked: boolean) => {
    setViewState((currentViewState) =>
      setPreviewInteractionLocked(currentViewState, interactionLocked),
    );
  }, []);

  const handleResetView = useCallback(() => {
    setViewState(resetPreviewViewState);
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setPreviewStatus("loading");
    setErrorMessage(null);
    setScene(null);
    setCurrentFile(file);
    setIsSettingsOpen(false);
    setBondAlgorithm(DEFAULT_BOND_ALGORITHM);
    setComponentVisibility(createDefaultComponentVisibility());
    setCommonPanelTab("display");
    setViewState(createPreviewViewState());

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setPreviewStatus("ready");
    } catch (error) {
      setScene(null);
      setCurrentFile(null);
      setIsSettingsOpen(false);
      setPreviewStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not parse structure.");
    }
  }

  const handleBondAlgorithmChange = useCallback(
    async (nextBondAlgorithm: BondAlgorithm) => {
      setBondAlgorithm(nextBondAlgorithm);
      if (!currentFile) {
        return;
      }

      setPreviewStatus("loading");
      setErrorMessage(null);

      try {
        const nextScene = await uploadStructurePreview(currentFile, {
          bondAlgorithm: nextBondAlgorithm,
        });
        setScene(nextScene);
        setPreviewStatus("ready");
      } catch (error) {
        setScene(null);
        setCurrentFile(null);
        setIsSettingsOpen(false);
        setPreviewStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Could not parse structure.");
      }
    },
    [currentFile],
  );

  const summary = useMemo(() => summarizeScene(scene), [scene]);
  const legendEntries = useMemo(() => deriveElementLegendEntries(scene), [scene]);
  const visibleScene = useMemo(
    () => visibleSceneForComponents(scene, componentVisibility),
    [componentVisibility, scene],
  );
  const hasVisibleScene = visibleScene !== null;
  const previewSafeArea = previewSafeAreaForSettings();
  const effectivePreviewSafeArea = useMemo(
    () => previewSafeAreaForViewport(previewSafeArea, viewportSize.width),
    [previewSafeArea, viewportSize.width],
  );
  const orientationGizmoSize = useMemo(
    () => orientationGizmoSizeForViewport(viewportSize, effectivePreviewSafeArea),
    [effectivePreviewSafeArea, viewportSize],
  );
  const triggerLockedInteractionFeedback = useCallback(() => {
    setLockedInteractionFeedbackCount((count) => count + 1);
  }, []);

  const clearLockedInteractionWheelGate = useCallback(() => {
    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    lockedInteractionWheelIdleTimeoutRef.current = null;
  }, []);

  useEffect(() => () => clearLockedInteractionWheelGate(), [clearLockedInteractionWheelGate]);

  useEffect(() => {
    if (!hasVisibleScene || !viewState.interactionLocked) {
      clearLockedInteractionWheelGate();
    }
  }, [clearLockedInteractionWheelGate, hasVisibleScene, viewState.interactionLocked]);

  const handleSceneWheelCapture = useCallback(() => {
    if (!hasVisibleScene || !viewState.interactionLocked) {
      clearLockedInteractionWheelGate();
      return;
    }

    if (lockedInteractionWheelIdleTimeoutRef.current === null) {
      triggerLockedInteractionFeedback();
    } else {
      window.clearTimeout(lockedInteractionWheelIdleTimeoutRef.current);
    }

    lockedInteractionWheelIdleTimeoutRef.current = window.setTimeout(() => {
      lockedInteractionWheelIdleTimeoutRef.current = null;
    }, LOCKED_INTERACTION_WHEEL_IDLE_MS);
  }, [
    clearLockedInteractionWheelGate,
    hasVisibleScene,
    triggerLockedInteractionFeedback,
    viewState.interactionLocked,
  ]);

  const handleScenePointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!hasVisibleScene || !viewState.interactionLocked || event.button !== 0) {
        lockedInteractionPointerRef.current = null;
        return;
      }

      lockedInteractionPointerRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        triggered: false,
      };
    },
    [hasVisibleScene, viewState.interactionLocked],
  );

  const handleScenePointerMoveCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const lockedPointer = lockedInteractionPointerRef.current;
      if (
        !hasVisibleScene ||
        !viewState.interactionLocked ||
        !lockedPointer ||
        lockedPointer.pointerId !== event.pointerId ||
        lockedPointer.triggered
      ) {
        return;
      }

      const dragDistance = Math.hypot(
        event.clientX - lockedPointer.startX,
        event.clientY - lockedPointer.startY,
      );
      if (dragDistance < LOCKED_INTERACTION_DRAG_THRESHOLD_PX) {
        return;
      }

      lockedPointer.triggered = true;
      triggerLockedInteractionFeedback();
    },
    [hasVisibleScene, triggerLockedInteractionFeedback, viewState.interactionLocked],
  );

  const handleScenePointerEndCapture = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (lockedInteractionPointerRef.current?.pointerId === event.pointerId) {
      lockedInteractionPointerRef.current = null;
    }
  }, []);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <section
        className="scene-stage absolute inset-0"
        aria-label="Crystal structure preview"
        onPointerCancelCapture={handleScenePointerEndCapture}
        onPointerDownCapture={handleScenePointerDownCapture}
        onPointerMoveCapture={handleScenePointerMoveCapture}
        onPointerUpCapture={handleScenePointerEndCapture}
        onWheelCapture={handleSceneWheelCapture}
      >
        {visibleScene ? (
          <LatticeScene
            cameraOrientationRef={cameraOrientationRef}
            interactionLocked={viewState.interactionLocked}
            interactionMode={viewState.interactionMode}
            layoutScene={scene ?? visibleScene}
            onViewScaleChange={handleViewScaleChange}
            resetCounter={viewState.resetCounter}
            safeArea={previewSafeArea}
            scene={visibleScene}
            showAtoms={componentVisibility.atoms}
            showUnitCell={componentVisibility.unitCell}
            viewScale={viewState.viewScale}
          />
        ) : (
          <div
            className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground"
            data-state={previewStatus}
          >
            {previewStatus === "loading" ? "Loading structure" : "No structure loaded"}
          </div>
        )}
      </section>

      {visibleScene ? (
        <OrientationGizmo
          cameraOrientationRef={cameraOrientationRef}
          cellVectors={visibleScene.cell.vectors}
          className="pointer-events-none absolute"
          style={orientationGizmoContainerStyle(effectivePreviewSafeArea, orientationGizmoSize)}
        />
      ) : null}

      {legendEntries.length > 0 ? (
        <ElementLegend entries={legendEntries} safeArea={previewSafeArea} />
      ) : null}

      <div
        className={cn(
          "absolute left-4 top-4 flex w-[296px] max-w-[calc(100vw-2rem)] flex-col gap-4",
          isSettingsOpen ? "max-[760px]:hidden" : null,
        )}
      >
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
              <div className="min-w-0">
                <h1 className="truncate text-[0.95rem] font-semibold leading-tight">Pretty Lattice</h1>
              </div>
            </div>

            <Button
              size="sm"
              aria-label="Open structure"
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs transition-colors duration-150 ease-out active:bg-primary/80 [&_svg]:size-3.5"
              disabled={previewStatus === "loading"}
              onClick={() => fileInputRef.current?.click()}
            >
              <FolderOpen data-icon="inline-start" aria-hidden="true" />
              <span>Open</span>
            </Button>
          </div>

          {selectedFileName ? <Separator className="my-2.5" /> : null}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            tabIndex={-1}
            onChange={(event) => void handleFileChange(event)}
          />

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

          {errorMessage ? (
            <Alert variant="destructive" className="mt-2 rounded-md px-2.5 py-2">
              <AlertDescription className="font-mono text-xs leading-snug">
                {errorMessage}
              </AlertDescription>
            </Alert>
          ) : null}

          {scene?.warnings?.map((warning) => (
            <Alert key={warning.code} className="mt-2 rounded-md px-2.5 py-2">
              <AlertDescription className="text-xs leading-snug">
                {warning.message}
              </AlertDescription>
            </Alert>
          ))}

          {scene ? (
            <div className="mt-2.5 flex flex-col gap-2.5 max-[760px]:hidden">
              <Separator />
              <div>
                <span className="block text-xs font-bold text-muted-foreground">Symmetry</span>
                {summary.symmetry?.available ? (
                  <dl className="mt-1.5 flex flex-col gap-1 text-sm">
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
                  <p className="mt-1 text-sm text-muted-foreground">Symmetry unavailable</p>
                )}
              </div>

              {summary.cell ? (
                <>
                  <Separator />
                  <div>
                    <span className="block text-xs font-bold text-muted-foreground">
                      Lattice Parameters
                    </span>
                    <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-sm">
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
        </aside>

        {scene ? (
          <CommonControlsPanel
            activeTab={commonPanelTab}
            componentVisibility={componentVisibility}
            onActiveTabChange={setCommonPanelTab}
            onComponentVisibilityChange={setComponentVisibility}
          />
        ) : null}
      </div>

      {scene ? (
        <>
          <ViewControlRail
            className={cn(isSettingsOpen ? "max-[760px]:hidden" : null)}
            interactionLocked={viewState.interactionLocked}
            lockedInteractionFeedbackCount={lockedInteractionFeedbackCount}
            onInteractionLockedChange={handleInteractionLockedChange}
            onResetView={handleResetView}
            onViewScaleChange={handleViewScaleChange}
            viewScale={viewState.viewScale}
          />

          <SettingsTrigger
            isOpen={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
          />

          <SettingsDrawer
            bondAlgorithm={bondAlgorithm}
            interactionMode={viewState.interactionMode}
            isOpen={isSettingsOpen}
            isSceneLoading={previewStatus === "loading"}
            onBondAlgorithmChange={(nextBondAlgorithm) => {
              void handleBondAlgorithmChange(nextBondAlgorithm);
            }}
            onInteractionModeChange={handleInteractionModeChange}
            onOpenChange={setIsSettingsOpen}
          />
        </>
      ) : null}
    </main>
  );
}

const COMMON_PANEL_TABS: {
  Icon: LucideIcon;
  label: string;
  value: CommonPanelTab;
}[] = [
  { Icon: CameraIcon, label: "Camera", value: "camera" },
  { Icon: DisplayIcon, label: "Display", value: "display" },
  { Icon: Palette, label: "Style", value: "style" },
  { Icon: ImageDown, label: "Export", value: "export" },
];

function CommonControlsPanel({
  activeTab,
  componentVisibility,
  onActiveTabChange,
  onComponentVisibilityChange,
}: {
  activeTab: CommonPanelTab;
  componentVisibility: ComponentVisibilityState;
  onActiveTabChange: (tab: CommonPanelTab) => void;
  onComponentVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
}) {
  const tabTriggerRefs = useRef<Record<CommonPanelTab, HTMLButtonElement | null>>({
    camera: null,
    display: null,
    export: null,
    style: null,
  });
  const [tabIndicatorRect, setTabIndicatorRect] = useState<TabIndicatorRect | null>(null);
  const contentHeight =
    activeTab === "display"
      ? "h-[144px]"
      : "h-[76px]";

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
          onValueChange={(value) => onActiveTabChange(value as CommonPanelTab)}
        >
          <TabsList className="relative flex !h-8 w-full overflow-hidden rounded-lg bg-muted/70 p-1">
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
                  style={{ flexGrow: isActive ? 1.65 : 0.9 }}
                  className={cn(
                    "z-10 !h-6 min-w-0 basis-0 rounded-md !bg-transparent text-xs !shadow-none transition-[flex-grow,color,padding] duration-[420ms] ease-[cubic-bezier(0.16,1,0.3,1)] data-[state=active]:!bg-transparent data-[state=active]:!shadow-none motion-reduce:transition-none [&_svg]:size-3.5",
                    isActive ? "px-2 text-foreground" : "px-0.5 text-muted-foreground",
                  )}
                >
                  <Icon aria-hidden="true" />
                  {isActive ? <span className="truncate">{label}</span> : null}
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
            data-slot="common-controls-content"
            className={cn(
              "overflow-hidden transition-[height] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              contentHeight,
            )}
          >
            <TabsContent value="camera" className="mt-1.5">
              <ReservedTabContent />
            </TabsContent>
            <TabsContent value="display" className="mt-1.5">
              <DisplayTabContent
                visibility={componentVisibility}
                onVisibilityChange={onComponentVisibilityChange}
              />
            </TabsContent>
            <TabsContent value="style" className="mt-1.5">
              <ReservedTabContent />
            </TabsContent>
            <TabsContent value="export" className="mt-1.5">
              <ReservedTabContent />
            </TabsContent>
          </div>
        </Tabs>
      </aside>
    </TooltipProvider>
  );
}

function ReservedTabContent() {
  return (
    <div className="flex min-h-[64px] items-center justify-center rounded-md border border-dashed border-border/80 bg-background/40 text-xs text-muted-foreground">
      No controls
    </div>
  );
}

function DisplayTabContent({
  onVisibilityChange,
  visibility,
}: {
  onVisibilityChange: Dispatch<SetStateAction<ComponentVisibilityState>>;
  visibility: ComponentVisibilityState;
}) {
  function setVisibility(key: keyof ComponentVisibilityState, value: boolean) {
    onVisibilityChange((currentVisibility) => ({
      ...currentVisibility,
      [key]: value,
    }));
  }

  return (
    <div className="flex flex-col gap-1.5">
      <section aria-label="Display components">
        <div className="grid grid-cols-2 gap-0.5">
          <ComponentCheckboxRow
            checked={visibility.atoms}
            label="Atoms"
            onCheckedChange={(checked) => setVisibility("atoms", checked)}
          />
          <ComponentCheckboxRow
            checked={visibility.unitCell}
            label="Unit cell"
            onCheckedChange={(checked) => setVisibility("unitCell", checked)}
          />
          <ComponentCheckboxRow
            checked={visibility.bonds}
            label="Bonds"
            onCheckedChange={(checked) => setVisibility("bonds", checked)}
          />
          <ComponentCheckboxRow
            checked={false}
            disabled
            label="Polyhedra"
            onCheckedChange={() => {}}
          />
        </div>
      </section>

      <Separator className="my-1" />

      <section aria-labelledby="image-components-label">
        <h2
          id="image-components-label"
          className="text-xs font-bold leading-tight text-muted-foreground"
        >
          Images
        </h2>
        <div className="mt-0.5 flex flex-col gap-0.5">
          <ImageSwitchRow
            checked={visibility.boundaryAtoms}
            label="Cell-boundary atoms"
            onCheckedChange={(checked) => setVisibility("boundaryAtoms", checked)}
          />
          <ImageSwitchRow
            checked={visibility.oneHopBondedAtoms}
            label="One-hop bonded atoms"
            onCheckedChange={(checked) => setVisibility("oneHopBondedAtoms", checked)}
          />
        </div>
      </section>
    </div>
  );
}

function ComponentCheckboxRow({
  checked,
  disabled = false,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex h-6 min-w-0 items-center justify-between gap-1.5 rounded-md px-1.5 text-sm transition-colors",
        disabled ? "cursor-not-allowed text-muted-foreground/55" : "hover:bg-accent/60",
      )}
    >
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Checkbox
        checked={checked}
        disabled={disabled}
        aria-label={label}
        className="size-3.5 rounded-[3px]"
        iconClassName="size-3"
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </label>
  );
}

function ImageSwitchRow({
  checked,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-6 items-center justify-between gap-1.5 rounded-md px-1.5 text-sm transition-colors hover:bg-accent/60">
      <span className="min-w-0 truncate leading-tight">{label}</span>
      <Switch
        checked={checked}
        aria-label={label}
        className="h-4 w-7 p-0.5"
        thumbClassName="size-3 data-[state=checked]:translate-x-3"
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}

function ViewControlRail({
  className,
  interactionLocked,
  lockedInteractionFeedbackCount,
  onInteractionLockedChange,
  onResetView,
  onViewScaleChange,
  viewScale,
}: {
  className?: string;
  interactionLocked: boolean;
  lockedInteractionFeedbackCount: number;
  onInteractionLockedChange: (interactionLocked: boolean) => void;
  onResetView: () => void;
  onViewScaleChange: (viewScale: number) => void;
  viewScale: number;
}) {
  const [lockFeedbackPhase, setLockFeedbackPhase] = useState<"a" | "b" | null>(null);
  const [resetFeedbackPhase, setResetFeedbackPhase] = useState<"a" | "b" | null>(null);
  const [zoomText, setZoomText] = useState(formatZoomPercent(viewScale));
  const lastLockFeedbackCountRef = useRef(0);
  const lockFeedbackTimeoutRef = useRef<number | null>(null);
  const resetFeedbackTickRef = useRef(0);
  const resetFeedbackTimeoutRef = useRef<number | null>(null);
  const zoomSliderRef = useRef<HTMLInputElement>(null);
  const zoomSliderBlurTimeoutRef = useRef<number | null>(null);
  const isZoomSliderPointerActiveRef = useRef(false);
  const sliderPosition = viewScaleToSliderPosition(viewScale);
  const sliderValue = Math.round(sliderPosition * 1000);
  const sliderThumbTravelPx = ZOOM_SLIDER_HEIGHT_PX - ZOOM_SLIDER_THUMB_SIZE_PX;
  const sliderThumbTopPx =
    ZOOM_SLIDER_THUMB_SIZE_PX / 2 + (1 - sliderPosition) * sliderThumbTravelPx;
  const sliderStyle = {
    "--zoom-slider-thumb-top": `${sliderThumbTopPx}px`,
  } as CSSProperties;

  useEffect(() => {
    setZoomText(formatZoomPercent(viewScale));
  }, [viewScale]);

  useEffect(
    () => () => {
      if (lockFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(lockFeedbackTimeoutRef.current);
      }
      if (resetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(resetFeedbackTimeoutRef.current);
      }
      if (zoomSliderBlurTimeoutRef.current !== null) {
        window.clearTimeout(zoomSliderBlurTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (
      lockedInteractionFeedbackCount === 0 ||
      lockedInteractionFeedbackCount === lastLockFeedbackCountRef.current
    ) {
      return;
    }

    lastLockFeedbackCountRef.current = lockedInteractionFeedbackCount;
    if (!interactionLocked) {
      return;
    }

    if (lockFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(lockFeedbackTimeoutRef.current);
    }

    setLockFeedbackPhase(lockedInteractionFeedbackCount % 2 === 0 ? "b" : "a");
    lockFeedbackTimeoutRef.current = window.setTimeout(() => {
      setLockFeedbackPhase(null);
      lockFeedbackTimeoutRef.current = null;
    }, LOCKED_INTERACTION_FEEDBACK_ANIMATION_MS);
  }, [interactionLocked, lockedInteractionFeedbackCount]);

  useEffect(() => {
    if (!interactionLocked) {
      setLockFeedbackPhase(null);
    }
  }, [interactionLocked]);

  function handleResetClick() {
    onResetView();

    if (resetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(resetFeedbackTimeoutRef.current);
    }

    resetFeedbackTickRef.current += 1;
    setResetFeedbackPhase(resetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    resetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setResetFeedbackPhase(null);
      resetFeedbackTimeoutRef.current = null;
    }, RESET_VIEW_FEEDBACK_ANIMATION_MS);
  }

  function clearZoomSliderBlurTimeout() {
    if (zoomSliderBlurTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(zoomSliderBlurTimeoutRef.current);
    zoomSliderBlurTimeoutRef.current = null;
  }

  function scheduleZoomSliderBlur() {
    clearZoomSliderBlurTimeout();
    zoomSliderBlurTimeoutRef.current = window.setTimeout(() => {
      zoomSliderRef.current?.blur();
      isZoomSliderPointerActiveRef.current = false;
      zoomSliderBlurTimeoutRef.current = null;
    }, ZOOM_SLIDER_BLUR_DELAY_MS);
  }

  function handleZoomSliderPointerDown() {
    isZoomSliderPointerActiveRef.current = true;
    clearZoomSliderBlurTimeout();
  }

  function handleZoomSliderPointerEnd() {
    if (isZoomSliderPointerActiveRef.current) {
      scheduleZoomSliderBlur();
    }
  }

  function commitZoomText() {
    const nextScale = parseZoomPercentInput(zoomText);
    if (nextScale === null) {
      setZoomText(formatZoomPercent(viewScale));
      return;
    }

    onViewScaleChange(nextScale);
  }

  function handleZoomKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      commitZoomText();
      return;
    }

    if (event.key === "Escape") {
      setZoomText(formatZoomPercent(viewScale));
      event.currentTarget.blur();
    }
  }

  return (
    <TooltipProvider>
      <aside
        aria-label="View controls"
        className={cn(
          "absolute left-[328px] top-4 flex w-[42px] flex-col items-center max-[760px]:bottom-[8.5rem] max-[760px]:left-auto max-[760px]:right-4 max-[760px]:top-auto",
          className,
        )}
      >
        <div
          className={cn(
            "flex w-[42px] flex-col items-center gap-1.5 rounded-xl border px-1 pb-2 pt-2 shadow-xl shadow-foreground/10",
            GLASS_SURFACE_CLASS,
          )}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Reset view"
                className={cn(
                  "view-rail-button size-7 rounded-[10px] border border-transparent bg-transparent text-muted-foreground shadow-none transition-[background-color,border-color,color,box-shadow] duration-150 [&_svg]:size-3.5",
                  resetFeedbackPhase === "a" ? "view-rail-button-reset-feedback-a" : null,
                  resetFeedbackPhase === "b" ? "view-rail-button-reset-feedback-b" : null,
                )}
                onClick={handleResetClick}
              >
                <RotateCcw aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Reset view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-pressed={interactionLocked}
                aria-label={
                  interactionLocked ? "Unlock canvas interaction" : "Lock canvas interaction"
                }
                className={cn(
                  "view-rail-button size-7 rounded-[10px] border border-transparent bg-transparent shadow-none transition-[background-color,border-color,color,box-shadow] duration-100 ease-out motion-reduce:transition-none [&_svg]:size-3.5",
                  interactionLocked
                    ? "view-rail-button-active"
                    : "text-muted-foreground",
                  lockFeedbackPhase === "a" ? "view-rail-button-lock-feedback-a" : null,
                  lockFeedbackPhase === "b" ? "view-rail-button-lock-feedback-b" : null,
                )}
                onClick={() => onInteractionLockedChange(!interactionLocked)}
              >
                {interactionLocked ? <Lock aria-hidden="true" /> : <Unlock aria-hidden="true" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {interactionLocked ? "Unlock interaction" : "Lock interaction"}
            </TooltipContent>
          </Tooltip>

          <div className="zoom-slider-shell relative h-[180px] w-7" style={sliderStyle}>
            <input
              ref={zoomSliderRef}
              type="range"
              min={0}
              max={1000}
              step={1}
              value={sliderValue}
              aria-label="Zoom percentage"
              aria-valuetext={`${formatZoomPercent(viewScale)}%`}
              className="zoom-slider absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
              data-testid="zoom-slider"
              onChange={(event) => {
                const snappedPosition = snapZoomSliderPosition(Number(event.target.value) / 1000);

                onViewScaleChange(sliderPositionToViewScale(snappedPosition));
                if (isZoomSliderPointerActiveRef.current) {
                  scheduleZoomSliderBlur();
                }
              }}
              onBlur={() => {
                isZoomSliderPointerActiveRef.current = false;
                clearZoomSliderBlurTimeout();
              }}
              onPointerCancel={handleZoomSliderPointerEnd}
              onPointerDown={handleZoomSliderPointerDown}
              onPointerUp={handleZoomSliderPointerEnd}
            />
            <span
              aria-hidden="true"
              className="zoom-slider-track pointer-events-none"
            />
            <span
              aria-hidden="true"
              className="zoom-slider-snap-marker pointer-events-none"
            />
            <span
              aria-hidden="true"
              className="zoom-slider-thumb pointer-events-none"
            />
          </div>

          <label className="zoom-percent-control group -mt-1 flex h-[22px] w-[34px] items-baseline justify-center gap-0 rounded-md border px-0.5 transition-[background-color,border-color,box-shadow] duration-150">
            <span className="sr-only">Zoom percentage</span>
            <input
              type="text"
              inputMode="decimal"
              value={zoomText}
              aria-label="Zoom percentage input"
              className="zoom-percent-input h-full w-[1.35rem] border-0 bg-transparent px-0 text-center font-mono text-[0.68rem] leading-none tabular-nums outline-none"
              data-testid="zoom-input"
              onBlur={commitZoomText}
              onChange={(event) => setZoomText(event.target.value)}
              onKeyDown={handleZoomKeyDown}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none font-mono text-[0.68rem] font-normal leading-none text-muted-foreground"
            >
              %
            </span>
          </label>
        </div>
      </aside>
    </TooltipProvider>
  );
}

function SettingsTrigger({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-controls="settings-drawer"
            aria-expanded={isOpen}
            aria-label="Open advanced settings"
            className={cn(
              "absolute right-4 top-4 rounded-full shadow-xl shadow-foreground/10 transition-[opacity,translate] duration-200 ease-out hover:-translate-x-0.5",
              GLASS_SURFACE_CLASS,
              isOpen ? "pointer-events-none translate-x-1 opacity-0" : "opacity-100",
            )}
            onClick={() => onOpenChange(true)}
          >
            <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Advanced settings</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SettingsDrawer({
  bondAlgorithm,
  interactionMode,
  isOpen,
  isSceneLoading,
  onBondAlgorithmChange,
  onInteractionModeChange,
  onOpenChange,
}: {
  bondAlgorithm: BondAlgorithm;
  interactionMode: InteractionMode;
  isOpen: boolean;
  isSceneLoading: boolean;
  onBondAlgorithmChange: (bondAlgorithm: BondAlgorithm) => void;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
  onOpenChange: (isOpen: boolean) => void;
}) {
  return (
    <>
      <aside
        id="settings-drawer"
        aria-labelledby="settings-drawer-title"
        aria-hidden={!isOpen}
        className={cn(
          "absolute inset-y-0 right-0 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden border-l shadow-2xl shadow-foreground/10",
          GLASS_SURFACE_CLASS,
          "transition-transform duration-200 ease-out motion-reduce:transition-none",
          isOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-4 pr-16">
          <h2 id="settings-drawer-title" className="text-[0.95rem] font-semibold leading-tight">
            Advanced Settings
          </h2>
        </div>

        <Separator />

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
          <section
            aria-labelledby="interaction-mode-label"
            className={cn("rounded-md border px-3 py-2.5", GLASS_SURFACE_CLASS)}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="interaction-mode-label"
                className="min-w-0 truncate text-sm font-medium leading-tight"
              >
                Rotation mode
              </h3>
            </div>
            <InteractionModeControl
              disabled={!isOpen}
              interactionMode={interactionMode}
              onInteractionModeChange={onInteractionModeChange}
            />
          </section>

          <section
            aria-labelledby="bond-algorithm-label"
            className={cn("rounded-md border px-3 py-2.5", GLASS_SURFACE_CLASS)}
          >
            <div className="flex items-center justify-between gap-3">
              <h3
                id="bond-algorithm-label"
                className="min-w-0 truncate text-sm font-medium leading-tight"
              >
                Bond algorithm
              </h3>
            </div>
            <Select
              value={bondAlgorithm}
              disabled={!isOpen || isSceneLoading}
              onValueChange={(value) => onBondAlgorithmChange(value as BondAlgorithm)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Bond algorithm"
                className="mt-2 w-full bg-background/70"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectGroup>
                  {BOND_ALGORITHM_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </section>
        </div>
      </aside>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-controls="settings-drawer"
              aria-expanded={isOpen}
              aria-label="Collapse settings"
              className={cn(
                "absolute right-4 top-4 rounded-full shadow-xl shadow-foreground/10 transition-[opacity,translate] duration-200 ease-out hover:-translate-x-0.5",
                GLASS_SURFACE_CLASS,
                isOpen ? "opacity-100" : "pointer-events-none translate-x-1 opacity-0",
              )}
              tabIndex={isOpen ? undefined : -1}
              onClick={() => onOpenChange(false)}
            >
              <PanelRightClose data-icon="inline-start" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Collapse</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}

function InteractionModeControl({
  disabled,
  interactionMode,
  onInteractionModeChange,
}: {
  disabled: boolean;
  interactionMode: InteractionMode;
  onInteractionModeChange: (interactionMode: InteractionMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Rotation interaction mode"
      className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-input bg-background/70 p-1"
    >
      {INTERACTION_MODE_OPTIONS.map((option) => {
        const isSelected = option.value === interactionMode;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={cn(
              "h-8 rounded-md px-2 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
              isSelected
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
            disabled={disabled}
            onClick={() => onInteractionModeChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ElementLegend({
  entries,
  safeArea,
}: {
  entries: ElementLegendEntry[];
  safeArea: PreviewSafeArea;
}) {
  return (
    <nav
      aria-label="Element legend"
      className={cn(
        "pointer-events-none absolute bottom-7 -translate-x-1/2 rounded-full border px-4 py-2 shadow-lg shadow-foreground/10",
        GLASS_SURFACE_CLASS,
      )}
      style={legendContainerStyle(safeArea)}
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {entries.map((entry) => (
          <li key={entry.element} className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden="true"
              className="size-[18px] shrink-0 rounded-full border border-foreground/10 shadow-sm"
              style={legendSphereStyle(entry.color)}
            />
            <span className="font-sans text-[0.95rem] font-normal leading-none text-foreground">
              {entry.element}
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function legendContainerStyle(safeArea: PreviewSafeArea): CSSProperties {
  return {
    left: `calc(50% + ${(safeArea.left - safeArea.right) / 2}px)`,
    maxWidth: `min(calc(100vw - ${safeArea.left + safeArea.right + 32}px), 760px)`,
  };
}

function orientationGizmoContainerStyle(
  safeArea: PreviewSafeArea,
  size: number,
): CSSProperties {
  return {
    bottom: Math.max(16, safeArea.bottom - 100),
    height: size,
    left: Math.max(16, safeArea.left - 78),
    width: size,
  };
}

function orientationGizmoSizeForViewport(
  viewportSize: ViewportSize,
  safeArea: PreviewSafeArea,
): number {
  const availableWidth = Math.max(1, viewportSize.width - safeArea.left - safeArea.right);
  const availableHeight = Math.max(1, viewportSize.height - safeArea.top - safeArea.bottom);

  return Math.max(
    MIN_ORIENTATION_GIZMO_SIZE_PX,
    Math.min(
      Math.min(availableWidth, availableHeight) * ORIENTATION_GIZMO_AVAILABLE_SIDE_RATIO,
      MAX_ORIENTATION_GIZMO_SIZE_PX,
    ),
  );
}

function useViewportSize(): ViewportSize {
  const [viewportSize, setViewportSize] = useState(getViewportSize);

  useEffect(() => {
    function handleResize() {
      setViewportSize(getViewportSize());
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return viewportSize;
}

function getViewportSize(): ViewportSize {
  return {
    height: window.innerHeight,
    width: window.innerWidth,
  };
}

function legendSphereStyle(color: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 32% 26%, rgba(255, 255, 255, 0.96) 0 8%, ${color} 36%, ${color} 72%, rgba(0, 0, 0, 0.42) 100%)`,
  };
}

function SummaryRow({
  label,
  mono = true,
  title,
  value,
  valueClassName,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-2 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span title={title}>
        <span
          className={cn(
            "block truncate font-normal leading-snug tabular-nums",
            mono ? "font-mono" : "font-sans",
            valueClassName,
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function SymmetryMetric({
  label,
  mono = false,
  title,
  value,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-baseline gap-2">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate font-normal leading-snug tabular-nums",
          mono ? "font-mono" : "font-sans",
        )}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function renderSpaceGroup(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  if (spaceGroupNumber === null) {
    return renderHermannMauguin(symbol);
  }

  return (
    <>
      {renderHermannMauguin(symbol)}
      <span className="ml-1">(No. {spaceGroupNumber})</span>
    </>
  );
}

function formatSpaceGroupTitle(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  return spaceGroupNumber === null ? symbol : `${symbol}  (No. ${spaceGroupNumber})`;
}

function renderPointGroup(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  if (!schoenflies) {
    return renderHermannMauguin(symbol);
  }

  return (
    <>
      {renderHermannMauguin(symbol)}
      <span className="ml-1">(</span>
      {renderSchoenflies(schoenflies)}
      <span>)</span>
    </>
  );
}

function formatPointGroupTitle(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  return schoenflies ? `${symbol}  (${schoenflies})` : symbol;
}

function renderSchoenflies(symbol: string) {
  if (symbol.length <= 1) {
    return symbol;
  }

  return (
    <>
      {symbol.slice(0, 1)}
      <sub className="text-[0.68em] leading-none">{symbol.slice(1)}</sub>
    </>
  );
}

function renderFormula(formula: string) {
  return formula.split(/(\d+)/).map((part, index) =>
    /^\d+$/.test(part) ? (
      <sub key={`${part}-${index}`} className="text-[0.68em] leading-none">
        {part}
      </sub>
    ) : (
      part
    ),
  );
}

function CellMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="shrink-0 text-[0.78rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate tabular-nums">
        {value}
        {unit === "Å" ? "\u2009" : ""}
        {unit}
      </dd>
    </div>
  );
}
