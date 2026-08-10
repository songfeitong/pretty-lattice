import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BACKEND_UNAVAILABLE_MESSAGE,
  BACKEND_UNAVAILABLE_TITLE,
  DEFAULT_BOND_ALGORITHM,
  STATIC_SCENE_PREVIEW_NAME,
  StructurePreviewError,
  defaultBondAlgorithmForScene,
  hasStaticScenePreview,
  isBackendUnavailablePreviewError,
  loadStaticScenePreview,
  uploadStructurePreview,
  type BondAlgorithm,
  type BondCutoffRange,
  type SceneSpec,
} from "../../api/scene";
import {
  CUSTOM_BONDING_MODE,
  type BondingMode,
  type CustomBondingProfile,
} from "../../model/bondObjects";
import type { PreviewStatus } from "../previewState";
import { MAX_STRUCTURE_UPLOAD_BYTES } from "../../model/structureLimits";
import { LatestRequestRunner } from "./latestRequest";

const STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview.";
const STRUCTURE_PARSE_ERROR_MESSAGE = "pymatgen could not parse this file.";
export type StructurePreviewErrorKind =
  | "backend-unavailable"
  | "bonding-error"
  | "file-too-large"
  | "parse-error"
  | "static-example";
export type ConnectivityIntent = "bonds" | "polyhedra" | "oneHopBondedAtoms" | "objects" | "preserve";
export type ConnectivityStatus = "deferred" | "loading" | "ready" | "error";

const DETERMINISTIC_CONNECTIVITY_ERROR_CODES = new Set([
  "scene-too-many-atoms", "scene-too-many-bonds", "scene-too-many-polyhedra",
  "bond-cutoff-search-too-expensive", "scene-response-too-large", "structure-too-many-atoms",
]);

interface ResetLoadedPreviewOptions {
  preserveActiveCommonPanelTab?: boolean;
  preserveInspectorOpen?: boolean;
}

interface UseStructurePreviewOptions {
  onBondAlgorithmSceneLoaded: (nextScene: SceneSpec) => void;
  onPreviewCleared: () => void;
  resetLoadedPreviewState: (
    nextScene: SceneSpec | null,
    options?: ResetLoadedPreviewOptions,
  ) => void;
}

interface LoadedPreviewSession {
  bondingMode: BondingMode;
  customBondingProfile: CustomBondingProfile | null;
  file: File | null;
  fileName: string;
  scene: SceneSpec;
}

export function useStructurePreview({
  onBondAlgorithmSceneLoaded,
  onPreviewCleared,
  resetLoadedPreviewState,
}: UseStructurePreviewOptions) {
  const isStaticScenePreview = hasStaticScenePreview();
  const [session, setSession] = useState<LoadedPreviewSession | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>(() =>
    isStaticScenePreview ? "loading" : "idle",
  );
  const [errorMessage, setRawErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<StructurePreviewErrorKind | null>(null);
  const [connectivityStatus, setConnectivityStatus] = useState<ConnectivityStatus>("ready");
  const [connectivityIntent, setConnectivityIntent] = useState<ConnectivityIntent | null>(null);
  const [connectivityRetryable, setConnectivityRetryable] = useState(false);
  const requestRunnerRef = useRef<LatestRequestRunner | null>(null);
  if (!requestRunnerRef.current) {
    requestRunnerRef.current = new LatestRequestRunner();
  }
  const requestRunner = requestRunnerRef.current;
  const scene = session?.scene ?? null;
  const selectedFileName = session?.fileName ?? null;
  const bondingMode = session?.bondingMode ?? DEFAULT_BOND_ALGORITHM;
  const customBondingProfile = session?.customBondingProfile ?? null;

  const setErrorMessage = useCallback((message: string | null) => {
    if (message === null) {
      setErrorKind(null);
    }
    setRawErrorMessage(message);
  }, []);

  const setPreviewError = useCallback((kind: StructurePreviewErrorKind, message: string) => {
    setErrorKind(kind);
    setRawErrorMessage(message);
  }, []);

  useEffect(() => () => requestRunner.cancel(), [requestRunner]);

  useEffect(() => {
    if (!isStaticScenePreview) {
      return;
    }

    async function loadExampleScene() {
      const outcome = await requestRunner.run((signal) => loadStaticScenePreview(signal));
      if (outcome.status === "success" && outcome.value) {
        const nextScene = outcome.value;
        setSession({
          bondingMode: defaultBondAlgorithmForScene(nextScene),
          customBondingProfile: null,
          file: null,
          fileName: STATIC_SCENE_PREVIEW_NAME,
          scene: nextScene,
        });
        setConnectivityStatus(nextScene.connectivity ?? "ready");
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } else if (outcome.status === "error") {
        setSession(null);
        onPreviewCleared();
        setPreviewStatus("error");
        setPreviewError("static-example", "Static example could not be loaded.");
      }
    }

    void loadExampleScene();

    return () => {
      requestRunner.cancel();
    };
  }, [isStaticScenePreview, onPreviewCleared, requestRunner, resetLoadedPreviewState, setPreviewError]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      if (isStaticScenePreview) {
        setPreviewError("backend-unavailable", BACKEND_UNAVAILABLE_MESSAGE);
        return;
      }

      if (file.size > MAX_STRUCTURE_UPLOAD_BYTES) {
        requestRunner.cancel();
        setPreviewStatus(session ? "ready" : "error");
        setPreviewError("file-too-large", STRUCTURE_FILE_TOO_LARGE_MESSAGE);
        setConnectivityStatus(session?.scene.connectivity ?? "ready");
        return;
      }

      setPreviewStatus("loading");
      setErrorMessage(null);
      setConnectivityRetryable(false);

      const outcome = await requestRunner.run((signal) =>
        uploadStructurePreview(file, { signal }),
      );
      if (outcome.status === "success") {
        const nextScene = outcome.value;
        setSession({
          bondingMode: defaultBondAlgorithmForScene(nextScene),
          customBondingProfile: null,
          file,
          fileName: file.name,
          scene: nextScene,
        });
        setConnectivityStatus(nextScene.connectivity ?? "ready");
        setConnectivityIntent(null);
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } else if (outcome.status === "error") {
        const error = outcome.error;
        setConnectivityStatus(session?.scene.connectivity ?? "ready");
        setPreviewStatus(session ? "ready" : "error");
        setPreviewError(
          isBackendUnavailablePreviewError(error)
            ? "backend-unavailable"
            : "parse-error",
          isBackendUnavailablePreviewError(error)
            ? error.message
            : STRUCTURE_PARSE_ERROR_MESSAGE,
        );
      }
    },
    [isStaticScenePreview, requestRunner, resetLoadedPreviewState, session, setErrorMessage, setPreviewError],
  );

  const handleConnectivityFailure = useCallback((error: unknown, allowRetry: boolean) => {
    const code = error instanceof StructurePreviewError ? error.code : null;
    setConnectivityStatus("error");
    setConnectivityRetryable(
      allowRetry && (!code || !DETERMINISTIC_CONNECTIVITY_ERROR_CODES.has(code)),
    );
    setPreviewError(
      isBackendUnavailablePreviewError(error)
        ? "backend-unavailable"
        : "bonding-error",
      error instanceof Error ? error.message : STRUCTURE_PARSE_ERROR_MESSAGE,
    );
  }, [setPreviewError]);

  const runSceneUpdate = useCallback(async (
    request: (signal: AbortSignal) => Promise<SceneSpec>,
    commit: (current: LoadedPreviewSession, nextScene: SceneSpec) => LoadedPreviewSession,
    allowRetry = false,
  ): Promise<SceneSpec | null> => {
    setConnectivityStatus("loading");
    setConnectivityRetryable(false);
    setErrorMessage(null);

    const outcome = await requestRunner.run(request);
    if (outcome.status === "success") {
      const nextScene = outcome.value;
      setSession((current) => current ? commit(current, nextScene) : current);
      setConnectivityStatus("ready");
      return nextScene;
    }
    if (outcome.status === "error") {
      handleConnectivityFailure(outcome.error, allowRetry);
    }
    return null;
  }, [handleConnectivityFailure, requestRunner, setErrorMessage]);

  const requestConnectivity = useCallback(async (intent: ConnectivityIntent = "preserve") => {
    if (!session?.file || connectivityStatus === "loading") return false;
    if (session.scene.connectivity === "ready") return true;
    const file = session.file;
    setConnectivityIntent(intent);

    const profile = session.bondingMode === CUSTOM_BONDING_MODE
      ? session.customBondingProfile
      : null;
    const nextScene = await runSceneUpdate(
      (signal) => uploadStructurePreview(file, {
        bondAlgorithm: profile?.baseAlgorithm ?? (session.bondingMode as BondAlgorithm),
        cutoffOverrides: profile?.cutoffOverrides,
        includeConnectivity: true,
        signal,
      }),
      (current, scene) => ({ ...current, scene }),
      true,
    );
    if (nextScene) {
      onBondAlgorithmSceneLoaded(nextScene);
      return true;
    }
    return false;
  }, [connectivityStatus, onBondAlgorithmSceneLoaded, runSceneUpdate, session]);

  const handleBondAlgorithmChange = useCallback(
    async (nextBondingMode: BondingMode) => {
      if (!session?.file) {
        if (scene) {
          setPreviewError("backend-unavailable", BACKEND_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      const nextProfile =
        nextBondingMode === CUSTOM_BONDING_MODE
          ? session.customBondingProfile
          : null;
      if (nextBondingMode === CUSTOM_BONDING_MODE && !nextProfile) return;
      const file = session.file;

      setConnectivityIntent("preserve");
      const nextScene = await runSceneUpdate(
        (signal) => uploadStructurePreview(file, {
          bondAlgorithm:
            nextProfile?.baseAlgorithm ?? (nextBondingMode as BondAlgorithm),
          cutoffOverrides: nextProfile?.cutoffOverrides,
          includeConnectivity: true,
          signal,
        }),
        (current, nextScene) => ({
          ...current,
          bondingMode: nextBondingMode,
          customBondingProfile:
            nextBondingMode === CUSTOM_BONDING_MODE ? nextProfile : null,
          scene: nextScene,
        }),
      );
      if (nextScene) {
        onBondAlgorithmSceneLoaded(nextScene);
      }
    },
    [
      onBondAlgorithmSceneLoaded,
      runSceneUpdate,
      scene,
      session,
      setPreviewError,
    ],
  );

  const handleBondCutoffOverridesChange = useCallback(
    async (cutoffOverrides: Record<string, BondCutoffRange>) => {
      if (!session?.file) {
        if (scene) {
          setPreviewError("backend-unavailable", BACKEND_UNAVAILABLE_MESSAGE);
        }
        return false;
      }

      const baseAlgorithm =
        session.bondingMode === CUSTOM_BONDING_MODE
          ? session.customBondingProfile?.baseAlgorithm ?? DEFAULT_BOND_ALGORITHM
          : session.bondingMode;
      const hasOverrides = Object.keys(cutoffOverrides).length > 0;
      const nextProfile = hasOverrides
        ? { baseAlgorithm, cutoffOverrides }
        : null;
      const file = session.file;

      setConnectivityIntent("preserve");
      const nextScene = await runSceneUpdate(
        (signal) => uploadStructurePreview(file, {
          bondAlgorithm: baseAlgorithm,
          cutoffOverrides: nextProfile?.cutoffOverrides,
          includeConnectivity: true,
          signal,
        }),
        (current, nextScene) => ({
          ...current,
          bondingMode: hasOverrides ? CUSTOM_BONDING_MODE : baseAlgorithm,
          customBondingProfile: nextProfile,
          scene: nextScene,
        }),
      );
      if (nextScene) {
        onBondAlgorithmSceneLoaded(nextScene);
        return true;
      }
      return false;
    },
    [
      onBondAlgorithmSceneLoaded,
      runSceneUpdate,
      scene,
      session,
      setPreviewError,
    ],
  );

  const handleResetAllSettings = useCallback(async () => {
    if (!scene || previewStatus === "loading" || connectivityStatus === "loading") {
      return;
    }

    const defaultBondAlgorithm = defaultBondAlgorithmForScene(scene);

    if (bondingMode === defaultBondAlgorithm || !session?.file) {
      setSession((current) => current ? {
        ...current,
        bondingMode: defaultBondAlgorithm,
        customBondingProfile: null,
      } : current);
      setPreviewStatus("ready");
      resetLoadedPreviewState(scene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
      return;
    }

    setConnectivityIntent("preserve");
    const file = session.file;

    const nextScene = await runSceneUpdate(
      (signal) => uploadStructurePreview(file, { includeConnectivity: true, signal }),
      (current, scene) => ({
        ...current,
        bondingMode: defaultBondAlgorithmForScene(scene),
        customBondingProfile: null,
        scene,
      }),
    );
    if (nextScene) {
      resetLoadedPreviewState(nextScene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
    }
  }, [
    bondingMode,
    connectivityStatus,
    previewStatus,
    resetLoadedPreviewState,
    runSceneUpdate,
    scene,
    session,
  ]);

  const errorTitle = useMemo(
    () =>
      errorMessage === BACKEND_UNAVAILABLE_MESSAGE
        ? BACKEND_UNAVAILABLE_TITLE
        : "Unsupported file",
    [errorMessage],
  );

  return {
    bondAlgorithm: bondingMode,
    customBondingProfile,
    connectivityIntent,
    connectivityRetryable,
    connectivityStatus,
    errorKind,
    errorMessage,
    errorTitle,
    handleBondAlgorithmChange,
    handleBondCutoffOverridesChange,
    handleFileChange,
    handleResetAllSettings,
    requestConnectivity,
    isStaticScenePreview,
    previewStatus,
    scene,
    selectedFileName,
    setErrorMessage,
  };
}
