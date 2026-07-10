import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  BACKEND_UNAVAILABLE_MESSAGE,
  BACKEND_UNAVAILABLE_TITLE,
  DEFAULT_BOND_ALGORITHM,
  STATIC_SCENE_PREVIEW_NAME,
  defaultBondAlgorithmForScene,
  hasStaticScenePreview,
  isBackendUnavailablePreviewError,
  loadStaticScenePreview,
  uploadStructurePreview,
  type BondAlgorithm,
  type SceneSpec,
} from "../../api/scene";
import {
  CUSTOM_BONDING_MODE,
  type BondingMode,
  type CustomBondingProfile,
} from "../../model/bondObjects";
import type { PreviewStatus } from "../previewState";

const MAX_STRUCTURE_UPLOAD_BYTES = 1 * 1024 * 1024;
const STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview.";
const STRUCTURE_PARSE_ERROR_MESSAGE = "pymatgen could not parse this file.";
export type StructurePreviewErrorKind =
  | "backend-unavailable"
  | "bonding-error"
  | "file-too-large"
  | "parse-error"
  | "static-example";

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

export function useStructurePreview({
  onBondAlgorithmSceneLoaded,
  onPreviewCleared,
  resetLoadedPreviewState,
}: UseStructurePreviewOptions) {
  const isStaticScenePreview = hasStaticScenePreview();
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>(() =>
    isStaticScenePreview ? "loading" : "idle",
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setRawErrorMessage] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<StructurePreviewErrorKind | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [bondingMode, setBondingMode] =
    useState<BondingMode>(DEFAULT_BOND_ALGORITHM);
  const [customBondingProfile, setCustomBondingProfile] =
    useState<CustomBondingProfile | null>(null);

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

  useEffect(() => {
    if (!isStaticScenePreview) {
      return;
    }

    let isCurrent = true;

    async function loadExampleScene() {
      try {
        const nextScene = await loadStaticScenePreview();
        if (!isCurrent || !nextScene) {
          return;
        }

        setScene(nextScene);
        setSelectedFileName(STATIC_SCENE_PREVIEW_NAME);
        setBondingMode(defaultBondAlgorithmForScene(nextScene));
        setCustomBondingProfile(null);
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } catch {
        if (!isCurrent) {
          return;
        }

        setScene(null);
        onPreviewCleared();
        setSelectedFileName(null);
        setPreviewStatus("error");
        setPreviewError("static-example", "Static example could not be loaded.");
      }
    }

    void loadExampleScene();

    return () => {
      isCurrent = false;
    };
  }, [isStaticScenePreview, onPreviewCleared, resetLoadedPreviewState, setPreviewError]);

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
        setSelectedFileName(null);
        setPreviewStatus("error");
        setPreviewError("file-too-large", STRUCTURE_FILE_TOO_LARGE_MESSAGE);
        setScene(null);
        setCurrentFile(null);
        onPreviewCleared();
        return;
      }

      setSelectedFileName(file.name);
      setPreviewStatus("loading");
      setErrorMessage(null);
      setScene(null);
      setCurrentFile(file);
      setBondingMode(DEFAULT_BOND_ALGORITHM);
      setCustomBondingProfile(null);
      resetLoadedPreviewState(null);

      try {
        const nextScene = await uploadStructurePreview(file);
        setScene(nextScene);
        setBondingMode(defaultBondAlgorithmForScene(nextScene));
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } catch (error) {
        setScene(null);
        setCurrentFile(null);
        setSelectedFileName(null);
        onPreviewCleared();
        setPreviewStatus("error");
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
    [isStaticScenePreview, onPreviewCleared, resetLoadedPreviewState, setErrorMessage, setPreviewError],
  );

  const handleBondAlgorithmChange = useCallback(
    async (nextBondingMode: BondingMode) => {
      if (!currentFile) {
        if (scene) {
          setPreviewError("backend-unavailable", BACKEND_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      setPreviewStatus("loading");
      setErrorMessage(null);

      try {
        const nextProfile =
          nextBondingMode === CUSTOM_BONDING_MODE
            ? customBondingProfile
            : null;
        if (nextBondingMode === CUSTOM_BONDING_MODE && !nextProfile) {
          setPreviewStatus("ready");
          return;
        }
        const nextScene = await uploadStructurePreview(currentFile, {
          bondAlgorithm:
            nextProfile?.baseAlgorithm ?? (nextBondingMode as BondAlgorithm),
          cutoffOverrides: nextProfile?.cutoffOverrides,
        });
        setBondingMode(nextBondingMode);
        setScene(nextScene);
        onBondAlgorithmSceneLoaded(nextScene);
        setPreviewStatus("ready");
      } catch (error) {
        setPreviewStatus(scene ? "ready" : "error");
        setPreviewError(
          isBackendUnavailablePreviewError(error)
            ? "backend-unavailable"
            : "bonding-error",
          error instanceof Error ? error.message : STRUCTURE_PARSE_ERROR_MESSAGE,
        );
      }
    },
    [
      currentFile,
      customBondingProfile,
      onBondAlgorithmSceneLoaded,
      scene,
      setErrorMessage,
      setPreviewError,
    ],
  );

  const handleBondCutoffOverrideChange = useCallback(
    async (familyKey: string, cutoff: number | null) => {
      if (!currentFile) {
        if (scene) {
          setPreviewError("backend-unavailable", BACKEND_UNAVAILABLE_MESSAGE);
        }
        return false;
      }

      const baseAlgorithm =
        bondingMode === CUSTOM_BONDING_MODE
          ? customBondingProfile?.baseAlgorithm ?? DEFAULT_BOND_ALGORITHM
          : bondingMode;
      const cutoffOverrides = {
        ...(customBondingProfile?.cutoffOverrides ?? {}),
      };
      if (cutoff === null) {
        delete cutoffOverrides[familyKey];
      } else {
        cutoffOverrides[familyKey] = cutoff;
      }
      const hasOverrides = Object.keys(cutoffOverrides).length > 0;
      const nextProfile = hasOverrides
        ? { baseAlgorithm, cutoffOverrides }
        : null;

      setPreviewStatus("loading");
      setErrorMessage(null);
      try {
        const nextScene = await uploadStructurePreview(currentFile, {
          bondAlgorithm: baseAlgorithm,
          cutoffOverrides: nextProfile?.cutoffOverrides,
        });
        setScene(nextScene);
        setCustomBondingProfile(nextProfile);
        setBondingMode(hasOverrides ? CUSTOM_BONDING_MODE : baseAlgorithm);
        onBondAlgorithmSceneLoaded(nextScene);
        setPreviewStatus("ready");
        return true;
      } catch (error) {
        setPreviewStatus(scene ? "ready" : "error");
        setPreviewError(
          isBackendUnavailablePreviewError(error)
            ? "backend-unavailable"
            : "bonding-error",
          error instanceof Error ? error.message : STRUCTURE_PARSE_ERROR_MESSAGE,
        );
        return false;
      }
    },
    [
      bondingMode,
      currentFile,
      customBondingProfile,
      onBondAlgorithmSceneLoaded,
      scene,
      setErrorMessage,
      setPreviewError,
    ],
  );

  const handleResetAllSettings = useCallback(async () => {
    if (!scene || previewStatus === "loading") {
      return;
    }

    const defaultBondAlgorithm = defaultBondAlgorithmForScene(scene);

    if (bondingMode === defaultBondAlgorithm || !currentFile) {
      setBondingMode(defaultBondAlgorithm);
      setCustomBondingProfile(null);
      setPreviewStatus("ready");
      resetLoadedPreviewState(scene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
      return;
    }

    setPreviewStatus("loading");
    setErrorMessage(null);

    try {
      const nextScene = await uploadStructurePreview(currentFile);
      setBondingMode(defaultBondAlgorithmForScene(nextScene));
      setCustomBondingProfile(null);
      setScene(nextScene);
      resetLoadedPreviewState(nextScene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
      setPreviewStatus("ready");
    } catch (error) {
      setPreviewStatus(scene ? "ready" : "error");
      setPreviewError(
        isBackendUnavailablePreviewError(error)
          ? "backend-unavailable"
          : "bonding-error",
        error instanceof Error ? error.message : STRUCTURE_PARSE_ERROR_MESSAGE,
      );
    }
  }, [
    bondingMode,
    currentFile,
    previewStatus,
    resetLoadedPreviewState,
    scene,
    setErrorMessage,
    setPreviewError,
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
    errorKind,
    errorMessage,
    errorTitle,
    handleBondAlgorithmChange,
    handleBondCutoffOverrideChange,
    handleFileChange,
    handleResetAllSettings,
    isStaticScenePreview,
    previewStatus,
    scene,
    selectedFileName,
    setErrorMessage,
  };
}
