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
  loadStartupStructurePreview,
  shouldLoadStartupStructurePreview,
  uploadStructurePreview,
  type BondAlgorithm,
  type SceneSpec,
} from "../../api/scene";
import type { PreviewStatus } from "../previewState";

const MAX_STRUCTURE_UPLOAD_BYTES = 1 * 1024 * 1024;
const STRUCTURE_FILE_TOO_LARGE_MESSAGE = "File is too large to preview.";
const STRUCTURE_PARSE_ERROR_MESSAGE = "pymatgen could not parse this file.";

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

type PreviewSource = "static" | "startup" | "upload";

export function useStructurePreview({
  onBondAlgorithmSceneLoaded,
  onPreviewCleared,
  resetLoadedPreviewState,
}: UseStructurePreviewOptions) {
  const isStaticScenePreview = hasStaticScenePreview();
  const shouldLoadStartupStructure = shouldLoadStartupStructurePreview();
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>(() =>
    isStaticScenePreview || shouldLoadStartupStructure ? "loading" : "idle",
  );
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [previewSource, setPreviewSource] = useState<PreviewSource | null>(null);
  const [bondAlgorithm, setBondAlgorithm] =
    useState<BondAlgorithm>(DEFAULT_BOND_ALGORITHM);

  const loadStartupPreview = useCallback(
    async (isCurrent: () => boolean) => {
      try {
        const preview = await loadStartupStructurePreview();
        if (!isCurrent()) {
          return;
        }

        setScene(preview.scene);
        setSelectedFileName(preview.fileName);
        setCurrentFile(null);
        setPreviewSource("startup");
        setBondAlgorithm(defaultBondAlgorithmForScene(preview.scene));
        resetLoadedPreviewState(preview.scene);
        setPreviewStatus("ready");
      } catch (error) {
        if (!isCurrent()) {
          return;
        }

        if (!shouldLoadStartupStructure && isBackendUnavailablePreviewError(error)) {
          return;
        }

        setScene(null);
        setCurrentFile(null);
        onPreviewCleared();
        setSelectedFileName(null);
        setPreviewSource(null);
        setPreviewStatus("error");
        setErrorMessage(
          isBackendUnavailablePreviewError(error)
            ? error.message
            : STRUCTURE_PARSE_ERROR_MESSAGE,
        );
      }
    },
    [onPreviewCleared, resetLoadedPreviewState, shouldLoadStartupStructure],
  );

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
        setPreviewSource("static");
        setBondAlgorithm(defaultBondAlgorithmForScene(nextScene));
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } catch {
        if (!isCurrent) {
          return;
        }

        setScene(null);
        onPreviewCleared();
        setSelectedFileName(null);
        setPreviewSource(null);
        setPreviewStatus("error");
        setErrorMessage("Static example could not be loaded.");
      }
    }

    void loadExampleScene();

    return () => {
      isCurrent = false;
    };
  }, [isStaticScenePreview, onPreviewCleared, resetLoadedPreviewState]);

  useEffect(() => {
    if (isStaticScenePreview || !shouldLoadStartupStructure) {
      return;
    }

    let isCurrent = true;

    void loadStartupPreview(() => isCurrent);

    return () => {
      isCurrent = false;
    };
  }, [isStaticScenePreview, loadStartupPreview, shouldLoadStartupStructure]);

  useEffect(() => {
    if (isStaticScenePreview || shouldLoadStartupStructure) {
      return;
    }

    let isCurrent = true;

    void loadStartupPreview(() => isCurrent);

    return () => {
      isCurrent = false;
    };
  }, [isStaticScenePreview, loadStartupPreview, shouldLoadStartupStructure]);

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) {
        return;
      }

      if (isStaticScenePreview) {
        setErrorMessage(BACKEND_UNAVAILABLE_MESSAGE);
        return;
      }

      if (file.size > MAX_STRUCTURE_UPLOAD_BYTES) {
        setSelectedFileName(null);
        setPreviewStatus("error");
        setErrorMessage(STRUCTURE_FILE_TOO_LARGE_MESSAGE);
        setScene(null);
        setCurrentFile(null);
        setPreviewSource(null);
        onPreviewCleared();
        return;
      }

      setSelectedFileName(file.name);
      setPreviewStatus("loading");
      setErrorMessage(null);
      setScene(null);
      setCurrentFile(file);
      setPreviewSource("upload");
      setBondAlgorithm(DEFAULT_BOND_ALGORITHM);
      resetLoadedPreviewState(null);

      try {
        const nextScene = await uploadStructurePreview(file);
        setScene(nextScene);
        setBondAlgorithm(defaultBondAlgorithmForScene(nextScene));
        resetLoadedPreviewState(nextScene);
        setPreviewStatus("ready");
      } catch (error) {
        setScene(null);
        setCurrentFile(null);
        setSelectedFileName(null);
        setPreviewSource(null);
        onPreviewCleared();
        setPreviewStatus("error");
        setErrorMessage(
          isBackendUnavailablePreviewError(error)
            ? error.message
            : STRUCTURE_PARSE_ERROR_MESSAGE,
        );
      }
    },
    [isStaticScenePreview, onPreviewCleared, resetLoadedPreviewState],
  );

  const handleBondAlgorithmChange = useCallback(
    async (nextBondAlgorithm: BondAlgorithm) => {
      if (!currentFile && previewSource !== "startup") {
        if (scene) {
          setErrorMessage(BACKEND_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      setPreviewStatus("loading");
      setErrorMessage(null);

      try {
        const nextScene = currentFile
          ? await uploadStructurePreview(currentFile, {
              bondAlgorithm: nextBondAlgorithm,
            })
          : (await loadStartupStructurePreview({ bondAlgorithm: nextBondAlgorithm })).scene;
        setBondAlgorithm(nextBondAlgorithm);
        setScene(nextScene);
        onBondAlgorithmSceneLoaded(nextScene);
        setPreviewStatus("ready");
      } catch (error) {
        if (isBackendUnavailablePreviewError(error)) {
          setPreviewStatus(scene ? "ready" : "error");
          setErrorMessage(error.message);
          return;
        }

        setScene(null);
        setCurrentFile(null);
        setSelectedFileName(null);
        setPreviewSource(null);
        onPreviewCleared();
        setPreviewStatus("error");
        setErrorMessage(STRUCTURE_PARSE_ERROR_MESSAGE);
      }
    },
    [currentFile, onBondAlgorithmSceneLoaded, onPreviewCleared, previewSource, scene],
  );

  const handleResetAllSettings = useCallback(async () => {
    if (!scene || previewStatus === "loading") {
      return;
    }

    const defaultBondAlgorithm = defaultBondAlgorithmForScene(scene);

    if (
      bondAlgorithm === defaultBondAlgorithm ||
      (!currentFile && previewSource !== "startup")
    ) {
      setBondAlgorithm(defaultBondAlgorithm);
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
      const nextScene = currentFile
        ? await uploadStructurePreview(currentFile)
        : (await loadStartupStructurePreview()).scene;
      setBondAlgorithm(defaultBondAlgorithmForScene(nextScene));
      setScene(nextScene);
      resetLoadedPreviewState(nextScene, {
        preserveActiveCommonPanelTab: true,
        preserveInspectorOpen: true,
      });
      setPreviewStatus("ready");
    } catch (error) {
      setPreviewStatus(scene ? "ready" : "error");
      setErrorMessage(
        isBackendUnavailablePreviewError(error)
          ? error.message
          : STRUCTURE_PARSE_ERROR_MESSAGE,
      );
    }
  }, [
    bondAlgorithm,
    currentFile,
    previewSource,
    previewStatus,
    resetLoadedPreviewState,
    scene,
  ]);

  const errorTitle = useMemo(
    () =>
      errorMessage === BACKEND_UNAVAILABLE_MESSAGE
        ? BACKEND_UNAVAILABLE_TITLE
        : "Unsupported file",
    [errorMessage],
  );

  return {
    bondAlgorithm,
    errorMessage,
    errorTitle,
    handleBondAlgorithmChange,
    handleFileChange,
    handleResetAllSettings,
    isStaticScenePreview,
    previewStatus,
    scene,
    selectedFileName,
    setErrorMessage,
  };
}
