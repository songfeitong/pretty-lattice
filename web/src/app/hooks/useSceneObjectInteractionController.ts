import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DEFAULT_SELECTION_ACTIVATION,
  readSelectionActivation,
  writeSelectionActivation,
  type SelectionActivation,
} from "@/selection/selectionActivationPreference";

import type { SceneSpec } from "../../api/scene";
import { inspectedBondInfoForId, type ComponentVisibilityState } from "../../model";
import { ATOM_HIGHLIGHT_PULSE_MS } from "../../scene/atomHighlight";
import { inspectedAtomInfoForId } from "../atomInspector";
import type { InspectorSidebarTab } from "../inspector/InspectorSidebar";
import type { ObjectsPanelTab } from "../inspector/ObjectsPanel";
import { useHideSelectedObjectShortcut } from "./useHideSelectedObjectShortcut";
import type {
  ConnectivityIntent,
  ConnectivityStatus,
} from "./useStructurePreview";

type InspectedSceneObject =
  | { kind: "atom"; id: string }
  | { kind: "bond"; id: string }
  | null;

type PulsedSceneObject = Exclude<InspectedSceneObject, null> & { token: number };

interface SceneObjectInteractionControllerOptions {
  closeActiveColorPicker: () => void;
  componentVisibility: ComponentVisibilityState;
  connectivityStatus: ConnectivityStatus;
  hideAtom: (atomId: string) => void;
  requestConnectivity: (intent?: ConnectivityIntent) => Promise<boolean>;
  setBondVisible: (bond: SceneSpec["bonds"][number], visible: boolean) => void;
  visibleScene: SceneSpec | null;
}

export function useSceneObjectInteractionController({
  closeActiveColorPicker,
  componentVisibility,
  connectivityStatus,
  hideAtom,
  requestConnectivity,
  setBondVisible,
  visibleScene,
}: SceneObjectInteractionControllerOptions) {
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorSidebarTab>("settings");
  const [activeObjectsTab, setActiveObjectsTab] =
    useState<ObjectsPanelTab>("atoms");
  const [inspectedSceneObject, setInspectedSceneObject] =
    useState<InspectedSceneObject>(null);
  const [selectionActivation, setSelectionActivation] = useState(readSelectionActivation);
  const [pulsedSceneObject, setPulsedSceneObject] =
    useState<PulsedSceneObject | null>(null);
  const [atomLocateRequest, setAtomLocateRequest] =
    useState<{ atomId: string; token: number } | null>(null);
  const [bondLocateRequest, setBondLocateRequest] =
    useState<{ bondId: string; token: number } | null>(null);
  const [bondObjectsResetToken, setBondObjectsResetToken] = useState(0);
  const inspectedSceneObjectRef = useRef<InspectedSceneObject>(null);

  const inspectedAtomId =
    inspectedSceneObject?.kind === "atom" ? inspectedSceneObject.id : null;
  const inspectedBondId =
    inspectedSceneObject?.kind === "bond" ? inspectedSceneObject.id : null;
  const inspectedAtomInfo = useMemo(
    () => inspectedAtomInfoForId(visibleScene, inspectedAtomId),
    [inspectedAtomId, visibleScene],
  );
  const inspectedBondInfo = useMemo(
    () => inspectedBondInfoForId(visibleScene, inspectedBondId),
    [inspectedBondId, visibleScene],
  );

  const clearSelection = useCallback(() => {
    inspectedSceneObjectRef.current = null;
    setInspectedSceneObject(null);
  }, []);

  const resetInteraction = useCallback((preserveInspectorOpen = false) => {
    clearSelection();
    setPulsedSceneObject(null);
    writeSelectionActivation(DEFAULT_SELECTION_ACTIVATION);
    setSelectionActivation(DEFAULT_SELECTION_ACTIVATION);
    setAtomLocateRequest(null);
    setBondLocateRequest(null);
    setBondObjectsResetToken((token) => token + 1);
    if (!preserveInspectorOpen) setIsInspectorOpen(false);
  }, [clearSelection]);

  useEffect(() => {
    inspectedSceneObjectRef.current = inspectedSceneObject;
  }, [inspectedSceneObject]);

  useEffect(() => {
    if (!pulsedSceneObject) return;
    const timeout = window.setTimeout(() => {
      setPulsedSceneObject((current) =>
        current?.token === pulsedSceneObject.token ? null : current,
      );
    }, ATOM_HIGHLIGHT_PULSE_MS);
    return () => window.clearTimeout(timeout);
  }, [pulsedSceneObject]);

  useEffect(() => {
    if (!inspectedSceneObject) return;
    const selectionStillExists = inspectedSceneObject.kind === "atom"
      ? componentVisibility.atoms && inspectedAtomInfo !== null
      : componentVisibility.bonds && inspectedBondInfo !== null;
    if (!visibleScene || !selectionStillExists) clearSelection();
  }, [
    clearSelection,
    componentVisibility.atoms,
    componentVisibility.bonds,
    inspectedAtomInfo,
    inspectedBondInfo,
    inspectedSceneObject,
    visibleScene,
  ]);

  const requestAtomLocateInObjects = useCallback((atomId: string) => {
    setAtomLocateRequest((current) => ({
      atomId,
      token: (current?.token ?? 0) + 1,
    }));
  }, []);

  const requestBondLocateInObjects = useCallback((bondId: string) => {
    setBondLocateRequest((current) => ({
      bondId,
      token: (current?.token ?? 0) + 1,
    }));
  }, []);

  const handleAtomInspect = useCallback((atomId: string | null) => {
    const nextSelection: InspectedSceneObject = atomId
      ? { kind: "atom", id: atomId }
      : null;
    inspectedSceneObjectRef.current = nextSelection;
    setInspectedSceneObject(nextSelection);
    setPulsedSceneObject(null);
    if (
      atomId &&
      isInspectorOpen &&
      activeInspectorTab === "objects" &&
      activeObjectsTab === "atoms"
    ) {
      requestAtomLocateInObjects(atomId);
    }
  }, [activeInspectorTab, activeObjectsTab, isInspectorOpen, requestAtomLocateInObjects]);

  const handleBondInspect = useCallback((bondId: string | null) => {
    const nextSelection: InspectedSceneObject = bondId
      ? { kind: "bond", id: bondId }
      : null;
    inspectedSceneObjectRef.current = nextSelection;
    setInspectedSceneObject(nextSelection);
    setPulsedSceneObject(null);
    if (
      bondId &&
      isInspectorOpen &&
      activeInspectorTab === "objects" &&
      activeObjectsTab === "bonds"
    ) {
      requestBondLocateInObjects(bondId);
    }
  }, [activeInspectorTab, activeObjectsTab, isInspectorOpen, requestBondLocateInObjects]);

  const handlePulse = useCallback((kind: "atom" | "bond", id: string) => {
    const inspected = inspectedSceneObjectRef.current;
    if (inspected?.kind === kind && inspected.id === id) return;
    clearSelection();
    setPulsedSceneObject((current) => ({
      kind,
      id,
      token: (current?.token ?? 0) + 1,
    }));
  }, [clearSelection]);

  const handleInspectorOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) closeActiveColorPicker();
    setIsInspectorOpen(isOpen);
  }, [closeActiveColorPicker]);

  const handleActiveInspectorTabChange = useCallback((tab: InspectorSidebarTab) => {
    closeActiveColorPicker();
    setActiveInspectorTab(tab);
  }, [closeActiveColorPicker]);

  const handleActiveObjectsTabChange = useCallback((tab: ObjectsPanelTab) => {
    closeActiveColorPicker();
    setActiveObjectsTab(tab);
    if (tab === "bonds" && connectivityStatus !== "ready") {
      void requestConnectivity("objects");
    }
  }, [closeActiveColorPicker, connectivityStatus, requestConnectivity]);

  const handleSelectionActivationChange = useCallback((activation: SelectionActivation) => {
    writeSelectionActivation(activation);
    setSelectionActivation(activation);
  }, []);

  const handleLocateAtomInObjects = useCallback((atomId: string) => {
    closeActiveColorPicker();
    setIsInspectorOpen(true);
    setActiveInspectorTab("objects");
    setActiveObjectsTab("atoms");
    requestAtomLocateInObjects(atomId);
  }, [closeActiveColorPicker, requestAtomLocateInObjects]);

  const handleLocateBondInObjects = useCallback((bondId: string) => {
    closeActiveColorPicker();
    setIsInspectorOpen(true);
    setActiveInspectorTab("objects");
    setActiveObjectsTab("bonds");
    requestBondLocateInObjects(bondId);
  }, [closeActiveColorPicker, requestBondLocateInObjects]);

  const handleHideAtom = useCallback((atomId: string) => {
    hideAtom(atomId);
    clearSelection();
  }, [clearSelection, hideAtom]);

  const handleBondVisibilityChange = useCallback((
    bond: SceneSpec["bonds"][number],
    visible: boolean,
  ) => {
    setBondVisible(bond, visible);
    if (!visible) clearSelection();
  }, [clearSelection, setBondVisible]);

  const handleHideBond = useCallback((bond: SceneSpec["bonds"][number]) => {
    handleBondVisibilityChange(bond, false);
  }, [handleBondVisibilityChange]);

  const handleAtomLocateRequestHandled = useCallback((token: number) => {
    setAtomLocateRequest((current) => current?.token === token ? null : current);
  }, []);

  const handleBondLocateRequestHandled = useCallback((token: number) => {
    setBondLocateRequest((current) => current?.token === token ? null : current);
  }, []);

  const handleAtomPulse = useCallback((atomId: string) => {
    handlePulse("atom", atomId);
  }, [handlePulse]);

  const handleBondPulse = useCallback((bondId: string) => {
    handlePulse("bond", bondId);
  }, [handlePulse]);

  useHideSelectedObjectShortcut({
    onHideAtom: handleHideAtom,
    onHideBond: handleHideBond,
    selectedAtomId: inspectedAtomInfo?.canonicalAtom.siteId ?? null,
    selectedBond: inspectedBondInfo?.bond ?? null,
  });

  return {
    activeInspectorTab,
    activeObjectsTab,
    atomLocateRequest,
    bondLocateRequest,
    bondObjectsResetToken,
    clearSelection,
    handleActiveInspectorTabChange,
    handleActiveObjectsTabChange,
    handleAtomInspect,
    handleAtomLocateRequestHandled,
    handleAtomPulse,
    handleBondInspect,
    handleBondLocateRequestHandled,
    handleBondPulse,
    handleBondVisibilityChange,
    handleHideAtom,
    handleHideBond,
    handleInspectorOpenChange,
    handleLocateAtomInObjects,
    handleLocateBondInObjects,
    handleSelectionActivationChange,
    inspectedAtomId,
    inspectedAtomInfo,
    inspectedBondId,
    inspectedBondInfo,
    isInspectorOpen,
    pulsedSceneObject,
    resetInteraction,
    selectionActivation,
  };
}
