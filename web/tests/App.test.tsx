import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { Quaternion, Vector3 } from "three";

import { readPrettyLatticeVersion } from "../projectMetadata";
import type { AtomSpec, SceneSpec } from "../src/api/scene";
import type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "../src/app/exportFigure";
import {
  createFigureExportZipBlob as actualCreateFigureExportZipBlob,
  createZipBlob as actualCreateZipBlob,
} from "../src/app/exportFigure";
import {
  DEFAULT_DRAG_SENSITIVITY,
  LARGE_STRUCTURE_ATOM_COUNT,
  dragSensitivityToSliderPosition,
  formatDragSensitivityPercent,
  type ExportFormat,
} from "../src/model";
import { LANGUAGE_STORAGE_KEY } from "../src/i18n";
import { MOTION_STORAGE_KEY } from "../src/motion/motionPreference";
import { SELECTION_ACTIVATION_STORAGE_KEY } from "../src/selection/selectionActivationPreference";
import { MATERIAL_PRESET_OPTIONS } from "../src/model/materialPresets";
import { THEME_STORAGE_KEY } from "../src/theme/themePreference";
import { createAppTestHarness } from "./helpers/appHarness";

class MockControls {
  enabled = true;
  maxZoom = Infinity;
  minZoom = 0;
  mouseButtons: Record<string, unknown> = {};
  noPan = false;
  noRotate = false;
  noZoom = false;
  target = new Vector3();
  touches: Record<string, unknown> = {};

  addEventListener() {}

  dispose() {}

  handleResize() {}

  removeEventListener() {}

  update() {}
}

class MockOrbitControls extends MockControls {}

class MockTrackballControls extends MockControls {}

class MockCamera {
  far = 1000;
  near = 0.01;
  position = new Vector3();
  quaternion = new Quaternion();
  up = new Vector3(0, 1, 0);

  lookAt() {}

  updateProjectionMatrix() {}
}

mock.module("@react-three/fiber", () => {
  return {
    connectivity: "ready",
    bondAlgorithm: "crystal-nn",
    Canvas: ({
      camera: _camera,
      children: _children,
      gl: _gl,
      orthographic: _orthographic,
      ...props
    }: {
      camera?: unknown;
      children: ReactNode;
      gl?: unknown;
      orthographic?: boolean;
    }) => (
      <canvas
        data-render-backend="webgl"
        onContextMenu={(event) => event.stopPropagation()}
        {...props}
      />
    ),
    useFrame: () => {},
    createRoot: () => ({
      configure: async () => {},
      render: () => ({
        getState: () => ({
          advance: () => {},
          gl: {
            domElement: document.createElement("canvas"),
            render: () => {},
          },
          scene: {},
        }),
      }),
      unmount: () => {},
    }),
    useThree: () => ({
      camera: new MockCamera(),
      gl: {
        domElement: document.createElement("canvas"),
      },
      invalidate: () => {},
      size: {
        height: 768,
        width: 1024,
      },
    }),
  };
});

mock.module("three/examples/jsm/controls/OrbitControls.js", () => ({
  OrbitControls: MockOrbitControls,
}));

mock.module("three/examples/jsm/controls/TrackballControls.js", () => ({
  TrackballControls: MockTrackballControls,
}));

mock.module("../src/scene/OrientationGizmo", () => ({
  OrientationGizmo: ({
    onAxisClick,
    showLabels = true,
    theme = "light",
  }: {
    onAxisClick?: (axis: "a" | "b" | "c") => void;
    showLabels?: boolean;
    theme?: "light" | "dark";
  }) => (
    <div
      data-show-labels={String(showLabels)}
      data-theme={theme}
      data-testid="mock-orientation-gizmo"
    >
      <button type="button" onClick={() => onAxisClick?.("a")}>
        gizmo a
      </button>
      <button type="button" onClick={() => onAxisClick?.("c")}>
        gizmo c
      </button>
    </div>
  ),
  ORIENTATION_GIZMO_CAMERA_POSITION: [0, 0, 5],
  ORIENTATION_GIZMO_LABEL_DISTANCE: 1.3,
  ORIENTATION_GIZMO_SCALE: 1.36,
  ORIENTATION_GIZMO_ZOOM_PER_CANVAS_PIXEL: 53 / 588,
  StaticOrientationGizmoScene: () => null,
}));

let exportRequests: CreateFigureExportOptions[] = [];
let exportDirectDownloads: { file: FigureExportFile; sourceFileName: string | null }[] = [];
let exportZipDownloads: { files: FigureExportFile[]; sourceFileName: string | null }[] = [];
let exportFailure: Error | null = null;
const DEFAULT_DRAG_SENSITIVITY_PERCENT = formatDragSensitivityPercent(
  DEFAULT_DRAG_SENSITIVITY,
);
const DEFAULT_DRAG_SENSITIVITY_SLIDER_VALUE = String(
  Math.round(dragSensitivityToSliderPosition(DEFAULT_DRAG_SENSITIVITY) * 1000),
);

async function createFigureExportFilesMock(
  options: CreateFigureExportOptions,
): Promise<FigureExportFile[]> {
  exportRequests.push(options);
  if (exportFailure) {
    throw exportFailure;
  }

  if (options.settings.combineComponents) {
    return [
      {
        blob: new Blob(["combined"], {
          type: exportMimeType(options.settings.format),
        }),
        fileName: `NaCl.${options.settings.format}`,
        format: options.settings.format,
      },
    ];
  }

  const files: FigureExportFile[] = [];
  if (options.settings.components.structure) {
    files.push({
      blob: new Blob([options.settings.format], {
        type: exportMimeType(options.settings.format),
      }),
      fileName: `NaCl.${options.settings.format}`,
      format: options.settings.format,
    });
  }
  if (options.settings.components.crystalAxes) {
    files.push({
      blob: new Blob(["crystal axes"], {
        type: exportMimeType(options.settings.format),
      }),
      fileName: `NaCl-crystal-axes.${options.settings.format}`,
      format: options.settings.format,
    });
  }
  if (options.settings.components.legend) {
    files.push({
      blob: new Blob(["legend"], {
        type: exportMimeType(options.settings.format),
      }),
      fileName: `NaCl-legend.${options.settings.format}`,
      format: options.settings.format,
    });
  }
  return files;
}

function exportMimeType(format: ExportFormat) {
  if (format === "pdf") {
    return "application/pdf";
  }

  return format === "jpg" ? "image/jpeg" : "image/png";
}

async function downloadFigureExportZipMock(
  files: FigureExportFile[],
  sourceFileName: string | null,
) {
  exportZipDownloads.push({ files, sourceFileName });
}

async function downloadFigureExportFilesMock(
  files: FigureExportFile[],
  sourceFileName: string | null,
) {
  if (files.length === 1) {
    exportDirectDownloads.push({ file: files[0]!, sourceFileName });
    return;
  }

  exportZipDownloads.push({ files, sourceFileName });
}

mock.module("../src/app/exportFigure", () => ({
  createFigureExportFiles: createFigureExportFilesMock,
  createFigureExportZipBlob: actualCreateFigureExportZipBlob,
  createZipBlob: actualCreateZipBlob,
  downloadFigureExportFiles: downloadFigureExportFilesMock,
  downloadFigureExportZip: downloadFigureExportZipMock,
}));

const { App } = await import("../src/app/App");
const { createDefaultCrystalCameraState } = await import("../src/scene/crystalCamera");
const appHarness = createAppTestHarness(App);
const {
  errorResponse,
  fetchCalls,
  getFileInput,
  htmlResponse,
  jsonResponse,
  openPreviewContextMenu,
  openSidebarContextMenu,
  queueFetchResponse,
  structureFile,
} = appHarness;

async function renderLoadedStructure(user: ReturnType<typeof userEvent.setup>, scene = sceneWithPeriodicImages()) {
  await appHarness.renderLoadedStructure(user, scene);
}

async function openBondObjectsTab(
  user: ReturnType<typeof userEvent.setup>,
  sidebar: HTMLElement,
) {
  await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));
  await user.click(within(sidebar).getByRole("tab", { name: "Bonds" }));
}

beforeEach(() => {
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: undefined,
  });
  appHarness.resetFetchMock();
  exportDirectDownloads = [];
  exportZipDownloads = [];
  exportFailure = null;
  exportRequests = [];
});

describe("App", () => {
  test("starts with an empty preview and a compact structure card", () => {
    render(<App />);

    expect(screen.getByText("No structure loaded").isConnected).toBe(true);
    expect(screen.queryByTestId("lattice-canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sidebar" })).toBeNull();

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    expect(within(structureCard).getByText("Pretty Lattice").isConnected).toBe(true);
    const openButton = within(structureCard).getByRole("button", { name: "Open structure" });
    expect(openButton.isConnected).toBe(true);
    expect((openButton as HTMLButtonElement).disabled).toBe(false);
    expect(within(structureCard).queryByText("File")).toBeNull();
    expect(within(structureCard).queryByText("No file selected")).toBeNull();
    expect(structureCard.querySelector("[data-slot='separator']")).toBeNull();
  });

  test("opens the blank about dialog from the logo", async () => {
    const user = userEvent.setup();

    render(<App />);

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    const aboutButton = within(structureCard).getByRole("button", {
      name: "About Pretty Lattice",
    });

    await user.hover(aboutButton);
    expect(await screen.findByRole("tooltip", { name: "About" })).toBeTruthy();

    await user.click(aboutButton);

    const aboutDialog = await screen.findByRole("dialog", { name: "About Pretty Lattice" });
    expect(
      within(aboutDialog).queryByRole("button", { name: "Close About Pretty Lattice" }),
    ).toBeNull();
    expect(
      within(aboutDialog).getByRole("link", { name: "Open Pretty Lattice on GitHub" })
        .getAttribute("href"),
    ).toBe("https://github.com/songfeitong/pretty-lattice");
    expect(within(aboutDialog).getByText(`Version ${readPrettyLatticeVersion()}`)).toBeTruthy();
    expect(within(aboutDialog).getByText("© 2026 Feitong Song · MIT License")).toBeTruthy();
  });

  test("uploads a structure and renders the summary, legend, and view controls", async () => {
    const user = userEvent.setup();
    const scene = sceneWithPeriodicImages();
    const file = structureFile();
    queueFetchResponse(jsonResponse(scene));

    render(<App />);

    await user.upload(getFileInput(), file);

    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    const uploadRequest = fetchCalls[0]!;
    expect(uploadRequest.input).toBe("/api/structure-preview");
    expect(uploadRequest.init?.body).toBe(file);
    expect(uploadRequest.init?.method).toBe("POST");
    expect(uploadRequest.init?.headers).toEqual({
      "content-type": "chemical/x-cif",
      "x-pretty-lattice-filename": "NaCl.cif",
    });

    expect((await screen.findByTestId("lattice-canvas")).isConnected).toBe(true);
    expect(screen.getByTestId("mock-orientation-gizmo").isConnected).toBe(true);

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    expect(structureCard.querySelector("[data-slot='separator']")).not.toBeNull();
    expect(within(structureCard).getByText("NaCl.cif").isConnected).toBe(true);
    expect(within(structureCard).getByText("NaCl").isConnected).toBe(true);
    expect(within(structureCard).getByText("2").isConnected).toBe(true);
    expect(within(structureCard).getByText("Space group").isConnected).toBe(true);
    expect(within(structureCard).getByText("Point group").isConnected).toBe(true);
    expect(within(structureCard).getByText("Crystal system").isConnected).toBe(true);
    expect(within(structureCard).getAllByText("N/A")).toHaveLength(3);

    const legend = screen.getByRole("navigation", { name: "Element legend" });
    expect(within(legend).getByText("Na").isConnected).toBe(true);
    expect(within(legend).getByText("Cl").isConnected).toBe(true);
    expect(screen.getByRole("complementary", { name: "View controls" }).isConnected).toBe(true);
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const materialTokenPreloadPool = commonControls.querySelector(
      "[data-slot='material-preset-token-preload-pool']",
    );
    expect(materialTokenPreloadPool).not.toBeNull();
    expect(
      materialTokenPreloadPool?.querySelectorAll("[data-slot='material-preset-token-renderer']").length,
    ).toBe(MATERIAL_PRESET_OPTIONS.length);
    const displayTab = within(commonControls).getByRole("tab", { name: "Display" });
    expect(displayTab.isConnected).toBe(true);
    expect(within(commonControls).queryByRole("heading", { name: "Display" })).toBeNull();
    expect(within(commonControls).getByText("Periodic images").isConnected).toBe(true);
    expect(
      within(commonControls).getByRole("heading", { name: "Periodic images" }).className,
    ).toContain("px-1.5");
    expect(
      commonControls.querySelector("[data-slot='common-controls-content']")?.className,
    ).not.toContain("h-[");
    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    }) as HTMLButtonElement;
    expect(polyhedraCheckbox.disabled).toBe(false);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(
      within(commonControls)
        .getAllByRole("checkbox")
        .map((checkbox) => checkbox.getAttribute("aria-label")),
    ).toEqual(["Atoms", "Bonds", "Unit cell", "Polyhedra"]);
  });

  test("switches the legend color picker between elements", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const sodiumColorButton = screen.getByRole("button", { name: "Set Na color" });
    const chlorineColorButton = screen.getByRole("button", { name: "Set Cl color" });
    expect(sodiumColorButton.classList.contains("hover:scale-[1.08]")).toBe(true);
    expect(sodiumColorButton.classList.contains("duration-150")).toBe(true);

    await user.click(sodiumColorButton);
    expect(await screen.findByLabelText("Na color value")).toBeTruthy();

    await user.click(chlorineColorButton);

    expect(await screen.findByLabelText("Cl color value")).toBeTruthy();
    await waitFor(() => expect(screen.queryByLabelText("Na color value")).toBeNull());
  });

  test("keeps one color picker active across legend objects and style controls", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const legend = screen.getByRole("navigation", { name: "Element legend" });
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));

    await user.click(within(legend).getByRole("button", { name: "Set Na color" }));
    expect(await screen.findByLabelText("Na color value")).toBeTruthy();
    expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(1);

    await user.click(within(sidebar).getByRole("button", { name: "Set Cl color" }));
    expect(await screen.findByLabelText("Cl color value")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText("Na color value")).toBeNull();
      expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(1);
    });

    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Cl color value")).toBeNull();
      expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(0);
    });
    await user.click(within(commonControls).getByRole("combobox", { name: "Bond style" }));
    await user.click(await screen.findByRole("option", { name: "Unicolor" }));
    await user.click(within(commonControls).getByRole("button", { name: "Bond color" }));
    expect(await screen.findByLabelText("Bond color value")).toBeTruthy();
    expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(1);

    await user.click(within(legend).getByRole("button", { name: "Set Cl color" }));
    expect(await screen.findByLabelText("Cl color value")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText("Bond color value")).toBeNull();
      expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(1);
    });
  });

  test("initializes uploaded structure camera controls from the uploaded cell", async () => {
    const user = userEvent.setup();
    const scene = sceneWithPeriodicImages();
    scene.cell.vectors = [
      [10, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const defaultCamera = createDefaultCrystalCameraState(scene.cell.vectors);
    queueFetchResponse(jsonResponse(scene));

    render(<App />);

    await user.upload(getFileInput(), structureFile());
    await screen.findByTestId("lattice-canvas");
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));

    expect(
      within(commonControls).getByRole("textbox", { name: "Z a" }),
    ).toHaveProperty("value", defaultCamera.direct[0].toFixed(2));
    expect(
      within(commonControls).getByRole("textbox", { name: "Z b" }),
    ).toHaveProperty("value", defaultCamera.direct[1].toFixed(2));
    expect(
      within(commonControls).getByRole("textbox", { name: "Z c" }),
    ).toHaveProperty("value", defaultCamera.direct[2].toFixed(2));
  });

  test("keeps preview quality in the settings sidebar without rendering backend toggles", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    expect(
      within(commonControls).queryByRole("combobox", {
        name: "Atom rendering mode",
      }),
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    expect(within(sidebar).getByRole("heading", { name: "General" })).toBeTruthy();
    expect(within(sidebar).getByRole("heading", { name: "Appearance" })).toBeTruthy();
    expect(within(sidebar).getByRole("heading", { name: "Rendering" })).toBeTruthy();
    expect(within(sidebar).getByRole("heading", { name: "Interaction" })).toBeTruthy();
    expect(within(sidebar).queryByRole("heading", { name: "Analysis" })).toBeNull();
    expect(
      within(sidebar).queryByRole("combobox", { name: "Bonding algorithm" }),
    ).toBeNull();
    expect(
      within(sidebar).queryByRole("combobox", {
        name: "Atom rendering mode",
      }),
    ).toBeNull();
    expect(
      within(sidebar).queryByRole("combobox", {
        name: "Bond rendering mode",
      }),
    ).toBeNull();
    const previewMeshSelect = within(sidebar).getByRole("combobox", {
      name: "Preview quality",
    });

    expect(previewMeshSelect.textContent).toContain("Medium");

    await user.click(previewMeshSelect);
    await user.click(await screen.findByRole("option", { name: "XHigh" }));

    expect(
      within(sidebar).getByRole("combobox", { name: "Preview quality" }).textContent,
    ).toContain("XHigh");
  });

  test("switches and persists the theme from General", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));

    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    const themeGroup = within(sidebar).getByRole("radiogroup", { name: "Theme" });
    const systemThemeButton = within(sidebar).getByRole("radio", { name: "System" });
    const darkThemeButton = within(sidebar).getByRole("radio", { name: "Dark" });
    expect(themeGroup.classList.contains("theme-preference-toggle")).toBe(true);
    expect(systemThemeButton.getAttribute("data-state")).toBe("on");

    act(() => darkThemeButton.focus());
    await user.keyboard("{Enter}");

    expect(darkThemeButton.getAttribute("data-state")).toBe("on");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByTestId("mock-orientation-gizmo").dataset.theme).toBe("dark");

    await user.click(darkThemeButton);
    expect(darkThemeButton.getAttribute("data-state")).toBe("on");
  });

  test("defaults language to System and persists explicit language choices", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));

    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    const languageSelect = within(sidebar).getByRole("combobox", { name: "Language" });
    expect(languageSelect.textContent).toContain("System");

    await user.click(languageSelect);
    expect(
      (await screen.findByRole("listbox")).querySelector(
        '[data-slot="select-separator"]',
      ),
    ).toBeNull();
    expect(screen.getByRole("option", { name: "简体中文" })).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: "繁體中文" }));

    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW");
    expect(document.documentElement.lang).toBe("zh-TW");
    expect(
      within(sidebar).getByRole("combobox", { name: "語言" }).textContent,
    ).toContain("繁體中文");
    expect(within(sidebar).getByRole("tab", { name: "設定" })).toBeTruthy();
  });

  test("defaults motion to System and persists explicit motion choices", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));

    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    const motionSelect = within(sidebar).getByRole("combobox", { name: "Motion" });
    expect(motionSelect.textContent).toContain("System");

    await user.click(motionSelect);
    await user.click(await screen.findByRole("option", { name: "Reduced" }));
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");

    await user.click(within(sidebar).getByRole("combobox", { name: "Motion" }));
    await user.click(await screen.findByRole("option", { name: "Full" }));
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("full");
    expect(document.documentElement.dataset.motion).toBe("full");
  });

  test("defaults large preview structures to low mesh quality", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(
      user,
      sceneWithPeriodicImages({
        atomCount: LARGE_STRUCTURE_ATOM_COUNT,
      }),
    );

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    expect(
      within(sidebar).queryByRole("combobox", {
        name: "Atom rendering mode",
      }),
    ).toBeNull();
    expect(
      within(sidebar).queryByRole("combobox", { name: "Bond rendering mode" }),
    ).toBeNull();
    expect(
      within(sidebar).getByRole("combobox", { name: "Preview quality" }).textContent,
    ).toContain("Low");
  });

  test("shows CrystalNN as the automatic default for small uploaded structures", async () => {
    const user = userEvent.setup();
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages({ atomCount: 5 })));

    render(<App />);

    await user.upload(getFileInput(), structureFile("large.cif"));

    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    expect(fetchCalls[0]?.input).toBe("/api/structure-preview");

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);
    expect(screen.getByRole("combobox", { name: "Bonding algorithm" }).textContent).toContain(
      "CrystalNN",
    );
  });

  test("offers open and export from the preview context menu", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const fileInput = getFileInput();
    const originalClick = fileInput.click;
    let fileInputClickCount = 0;
    fileInput.click = () => {
      fileInputClickCount += 1;
    };

    try {
      await openPreviewContextMenu();
      await user.click(await screen.findByRole("menuitem", { name: "Open file" }));

      expect(fileInputClickCount).toBe(1);

      await openPreviewContextMenu();
      await user.click(await screen.findByRole("menuitem", { name: "Export" }));

      await waitFor(() => expect(exportRequests).toHaveLength(1));
      expect(exportRequests[0]?.settings.format).toBe("png");
      expect(exportDirectDownloads[0]?.sourceFileName).toBe("NaCl.cif");
      expect(exportDirectDownloads[0]?.file.fileName).toBe("NaCl.png");
    } finally {
      fileInput.click = originalClick;
    }
  });

  test("opens the preview context menu from the settings sidebar", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));

    await openSidebarContextMenu();

    expect(await screen.findByRole("menuitem", { name: "Reset view" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Open file" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Export" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Reset all" })).toBeTruthy();
  });

  test("resets local preview settings from the context menu without reuploading", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("checkbox", { name: "Atoms" }));
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    await user.click(within(commonControls).getByRole("combobox", { name: "Color scheme" }));
    await user.click(await screen.findByRole("option", { name: "Jmol" }));
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const inspector = screen.getByRole("complementary", { name: "Sidebar" });
    const singleClickSelection = within(inspector).getByRole("radio", {
      name: "Single click",
    });
    await user.click(singleClickSelection);
    expect(singleClickSelection.getAttribute("aria-checked")).toBe("true");
    expect(window.localStorage.getItem(SELECTION_ACTIVATION_STORAGE_KEY)).toBe(
      "single",
    );
    const mouseInertiaSwitch = within(inspector).getByRole("switch", {
      name: "Mouse inertia",
    });
    expect(mouseInertiaSwitch.getAttribute("aria-checked")).toBe("true");
    await user.click(mouseInertiaSwitch);
    expect(mouseInertiaSwitch.getAttribute("aria-checked")).toBe("false");
    await user.click(screen.getByRole("combobox", { name: "Mouse control" }));
    await user.click(await screen.findByRole("option", { name: "Orbit" }));
    fireEvent.change(within(inspector).getByRole("slider", { name: "Drag sensitivity" }), {
      target: { value: "1000" },
    });
    const showFpsSwitch = within(inspector).getByRole("switch", { name: "Show FPS" });
    await user.click(showFpsSwitch);
    expect(showFpsSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("fps-overlay").textContent).toBe("fps 0");

    await openPreviewContextMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Reset all" }));

    expect(fetchCalls).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-expanded")).toBe(
      "true",
    );

    const resetControls = screen.getByRole("complementary", { name: "Common controls" });
    expect(resetControls).toBe(commonControls);
    expect(
      within(resetControls).getByRole("tab", { name: "Style" }).getAttribute("aria-selected"),
    ).toBe("true");
    await user.click(within(resetControls).getByRole("tab", { name: "Display" }));
    expect(
      within(resetControls)
        .getByRole("checkbox", { name: "Atoms" })
        .getAttribute("aria-checked"),
    ).toBe("true");

    await user.click(within(resetControls).getByRole("tab", { name: "Style" }));
    expect(
      within(resetControls).getByRole("combobox", { name: "Color scheme" }).textContent,
    ).toContain("VESTA Soft");

    expect(screen.queryByTestId("fps-overlay")).toBeNull();
    const resetInspector = screen.getByRole("complementary", { name: "Sidebar" });
    expect(
      within(resetInspector)
        .getByRole("radio", { name: "Double click" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(window.localStorage.getItem(SELECTION_ACTIVATION_STORAGE_KEY)).toBe(
      "double",
    );
    expect(
      within(resetInspector).getByRole("switch", { name: "Show FPS" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("false");
    expect(
      within(resetInspector).getByRole("combobox", { name: "Mouse control" }).textContent,
    ).toContain("Trackball");
    expect(
      within(resetInspector).getByRole("switch", { name: "Mouse inertia" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(
      within(resetInspector).getByRole("slider", { name: "Drag sensitivity" }).getAttribute(
        "value",
      ),
    ).toBe(DEFAULT_DRAG_SENSITIVITY_SLIDER_VALUE);
  });

  test("shows a compact spinner while a structure is loading", async () => {
    const user = userEvent.setup();
    let resolveScene: (scene: SceneSpec) => void = () => {};
    const scenePromise = new Promise<SceneSpec>((resolve) => {
      resolveScene = resolve;
    });
    queueFetchResponse({
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => scenePromise,
      ok: true,
    } as Response);

    render(<App />);
    await user.upload(getFileInput(), structureFile());

    expect(screen.getByText("Loading structure").isConnected).toBe(true);
    const spinner = screen.getByTestId("loading-structure-spinner");
    expect(spinner.className).toContain("motion-enabled:animate-spin");

    resolveScene(sceneWithPeriodicImages());

    await screen.findByTestId("lattice-canvas");
  });

  test("does not restore a previously uploaded scene after the app remounts", async () => {
    const user = userEvent.setup();
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));
    const { unmount } = render(<App />);

    await user.upload(getFileInput(), structureFile());
    await screen.findByTestId("lattice-canvas");

    unmount();
    render(<App />);

    expect(fetchCalls).toHaveLength(1);
    expect(screen.getByText("No structure loaded").isConnected).toBe(true);
    expect(screen.queryByTestId("lattice-canvas")).toBeNull();
    expect(screen.queryByText("NaCl.cif")).toBeNull();
  });

  test("lets display controls change image visibility and inspector settings change rotation mode", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const boundaryAtomSwitch = screen.getByRole("switch", {
      name: "Cell-boundary atoms",
    });
    expect((boundaryAtomSwitch as HTMLButtonElement).disabled).toBe(false);
    expect(boundaryAtomSwitch.getAttribute("aria-checked")).toBe("true");

    await user.click(boundaryAtomSwitch);

    expect(boundaryAtomSwitch.getAttribute("aria-checked")).toBe("false");

    const oneHopSwitch = screen.getByRole("switch", {
      name: "One-hop bonded atoms",
    });
    expect(oneHopSwitch.getAttribute("aria-checked")).toBe("false");

    await user.click(oneHopSwitch);

    expect(oneHopSwitch.getAttribute("aria-checked")).toBe("true");

    const legend = screen.getByRole("navigation", { name: "Element legend" });
    expect(legend.getAttribute("style")).toContain("calc(50% + 122px)");
    const inspectorButton = screen.getByRole("button", { name: "Sidebar" });
    expect(inspectorButton.getAttribute("aria-expanded")).toBe("false");
    expect(inspectorButton.className).not.toContain("tool-icon-button-active");

    await user.click(inspectorButton);

    const inspector = screen.getByRole("complementary", { name: "Sidebar" });
    expect(inspector.isConnected).toBe(true);
    expect(within(inspector).queryByRole("heading", { name: "Inspector" })).toBeNull();
    const settingsTab = within(inspector).getByRole("tab", { name: "Settings" });
    expect(settingsTab.isConnected).toBe(true);
    expect(within(inspector).queryByText("Renderer")).toBeNull();
    expect(within(inspector).queryByRole("combobox", { name: "Renderer" })).toBeNull();
    expect(
      within(inspector).queryByRole("combobox", { name: "Atom rendering mode" }),
    ).toBeNull();
    expect(
      within(inspector).queryByRole("combobox", { name: "Bond rendering mode" }),
    ).toBeNull();
    expect(screen.queryByTestId("fps-overlay")).toBeNull();
    const showFpsSwitch = within(inspector).getByRole("switch", { name: "Show FPS" });
    expect(showFpsSwitch.getAttribute("aria-checked")).toBe("false");

    await user.click(showFpsSwitch);

    expect(showFpsSwitch.getAttribute("aria-checked")).toBe("true");
    const fpsOverlay = screen.getByTestId("fps-overlay");
    expect(fpsOverlay.textContent).toBe("fps 0");

    expect(legend.getAttribute("style")).toContain("calc(50% + 6px)");
    expect(inspectorButton.getAttribute("aria-expanded")).toBe("true");
    expect(inspectorButton.className).toContain("tool-icon-button-active");

    expect(screen.getByTestId("lattice-canvas").getAttribute("data-render-backend")).toBe(
      "webgl",
    );

    const interactionSelect = within(inspector).getByRole("combobox", { name: "Mouse control" });
    expect(interactionSelect.textContent).toContain("Trackball");
    expect(
      within(inspector).getByRole("switch", { name: "Mouse inertia" }).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    const dragSensitivitySlider = within(inspector).getByRole("slider", {
      name: "Drag sensitivity",
    });
    expect(dragSensitivitySlider.getAttribute("min")).toBe("0");
    expect(dragSensitivitySlider.getAttribute("max")).toBe("1000");
    expect(dragSensitivitySlider.getAttribute("value")).toBe(
      DEFAULT_DRAG_SENSITIVITY_SLIDER_VALUE,
    );
    expect(dragSensitivitySlider.getAttribute("aria-valuemin")).toBe("50");
    expect(dragSensitivitySlider.getAttribute("aria-valuemax")).toBe("200");
    expect(dragSensitivitySlider.getAttribute("aria-valuenow")).toBe(
      DEFAULT_DRAG_SENSITIVITY_PERCENT,
    );
    expect(dragSensitivitySlider.getAttribute("aria-valuetext")).toBe(
      `${DEFAULT_DRAG_SENSITIVITY_PERCENT}%`,
    );
    const dragSensitivityValueInput = within(inspector).getByRole("textbox", {
      name: "Drag sensitivity value",
    });
    expect(dragSensitivityValueInput.getAttribute("value")).toBe(
      DEFAULT_DRAG_SENSITIVITY_PERCENT,
    );

    const lightStrengthSlider = within(inspector).getByRole("slider", {
      name: "Light strength",
    });
    expect(lightStrengthSlider.getAttribute("min")).toBe("0");
    expect(lightStrengthSlider.getAttribute("max")).toBe("1000");
    expect(lightStrengthSlider.getAttribute("value")).toBe("500");
    expect(lightStrengthSlider.getAttribute("aria-valuemin")).toBe("50");
    expect(lightStrengthSlider.getAttribute("aria-valuemax")).toBe("200");
    expect(lightStrengthSlider.getAttribute("aria-valuenow")).toBe("100");
    expect(lightStrengthSlider.getAttribute("aria-valuetext")).toBe("100%");
    const lightStrengthValueInput = within(inspector).getByRole("textbox", {
      name: "Light strength value",
    });
    expect(lightStrengthValueInput.getAttribute("value")).toBe("100");
    expect(inspector.querySelectorAll(".opacity-slider-snap-marker")).toHaveLength(2);

    fireEvent.change(dragSensitivitySlider, { target: { value: "1000" } });

    expect(
      within(inspector).getByRole("slider", { name: "Drag sensitivity" }).getAttribute(
        "value",
      ),
    ).toBe("1000");
    expect(
      within(inspector).getByRole("textbox", { name: "Drag sensitivity value" }).getAttribute(
        "value",
      ),
    ).toBe("200");

    fireEvent.change(lightStrengthSlider, { target: { value: "1000" } });

    expect(
      within(inspector).getByRole("slider", { name: "Light strength" }).getAttribute(
        "value",
      ),
    ).toBe("1000");
    expect(
      within(inspector).getByRole("textbox", { name: "Light strength value" }).getAttribute(
        "value",
      ),
    ).toBe("200");

    await user.click(interactionSelect);
    await user.click(await screen.findByRole("option", { name: "Orbit" }));

    expect(within(inspector).getByRole("combobox", { name: "Mouse control" }).textContent).toContain(
      "Orbit",
    );

    await user.click(inspectorButton);

    expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("shows element containers in Objects and keeps Display atoms visibility one-way", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));

    expect(within(sidebar).getByRole("tab", { name: "Atoms" })).toBeTruthy();
    expect(within(sidebar).getAllByText("R (Å)")).toHaveLength(1);
    expect(within(sidebar).queryByText("Na:0")).toBeNull();
    expect(within(sidebar).queryByText(/image/)).toBeNull();

    const sodiumContainer = within(sidebar).getByRole("region", { name: "Na atoms" });
    const chlorineContainer = within(sidebar).getByRole("region", { name: "Cl atoms" });
    expect(sodiumContainer.className).toContain("rounded-xl");
    expect(chlorineContainer.className).toContain("rounded-xl");
    expect(within(sidebar).queryByRole("button", { name: "Expand Na" })).toBeNull();

    const sodiumRadiusInput = within(sidebar).getByRole("textbox", {
      name: "Na radius",
    }) as HTMLInputElement;
    const initialSodiumRadius = sodiumRadiusInput.value;
    await user.click(sodiumRadiusInput);
    expect(sodiumRadiusInput.value).toBe("");
    await user.tab();
    expect(sodiumRadiusInput.value).toBe(initialSodiumRadius);

    const sodiumColorToken = sodiumContainer.querySelector(
      '[data-color-picker-trigger=""] > span',
    );
    expect(sodiumColorToken?.classList.contains("size-4")).toBe(true);
    expect(sodiumColorToken?.classList.contains("rounded-full")).toBe(true);
    expect(sodiumColorToken?.getAttribute("style")).toContain("linear-gradient");
    expect(
      sodiumColorToken?.parentElement?.classList.contains("hover:scale-[1.08]"),
    ).toBe(true);
    fireEvent.contextMenu(sodiumContainer);
    expect(
      (await screen.findByRole("menuitem", {
        name: "Apply to all Na atoms",
      })).getAttribute("data-disabled"),
    ).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(within(sidebar).getByRole("button", { name: "Set Na color" }));
    expect(await screen.findByLabelText("Na color value")).toBeTruthy();
    expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(1);

    await user.click(within(sidebar).getByRole("button", { name: "Set Cl color" }));
    expect(await screen.findByLabelText("Cl color value")).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByLabelText("Na color value")).toBeNull();
      expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(1);
    });

    const leftControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(leftControls).getByRole("tab", { name: "Style" }));
    const colorSchemeSelect = within(leftControls).getByRole("combobox", {
      name: "Color scheme",
    });
    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Jmol" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Cl color value")).toBeNull();
      expect(screen.queryAllByLabelText(/color value$/)).toHaveLength(0);
    });
    await user.click(within(leftControls).getByRole("tab", { name: "Display" }));

    const sodiumElementVisibility = () =>
      within(sidebar).getByRole("button", {
        name: "Na visibility",
      });
    const chlorineElementVisibility = () =>
      within(sidebar).getByRole("button", {
        name: "Cl visibility",
      });
    expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("true");
    expect(chlorineElementVisibility().getAttribute("aria-pressed")).toBe("true");

    await user.click(sodiumElementVisibility());
    await waitFor(() => {
      expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("false");
    });

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const atomsCheckbox = within(commonControls).getByRole("checkbox", { name: "Atoms" });
    await user.click(atomsCheckbox);
    await waitFor(() => {
      expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("false");
    });

    await user.click(atomsCheckbox);
    await waitFor(() => {
      expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("true");
    });

    await user.click(sodiumElementVisibility());
    await waitFor(() => {
      expect(atomsCheckbox.getAttribute("aria-checked")).toBe("true");
      expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("false");
      expect(chlorineElementVisibility().getAttribute("aria-pressed")).toBe("true");
    });

    await user.click(chlorineElementVisibility());
    await waitFor(() => {
      expect(atomsCheckbox.getAttribute("aria-checked")).toBe("true");
      expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("false");
      expect(chlorineElementVisibility().getAttribute("aria-pressed")).toBe("false");
    });

    await user.click(sodiumElementVisibility());
    await waitFor(() => {
      expect(atomsCheckbox.getAttribute("aria-checked")).toBe("true");
      expect(sodiumElementVisibility().getAttribute("aria-pressed")).toBe("true");
      expect(chlorineElementVisibility().getAttribute("aria-pressed")).toBe("false");
    });
  });

  test("manages bond families, visibility, and sparse cutoff ranges", async () => {
    const user = userEvent.setup();
    const scene = sceneWithPeriodicImages();

    await renderLoadedStructure(user, scene);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);

    expect(within(sidebar).getByText("R (Å)").isConnected).toBe(true);
    expect(within(sidebar).getByText("Opacity").isConnected).toBe(true);
    expect(within(sidebar).getByText("Na").isConnected).toBe(true);
    expect(within(sidebar).getByText("Cl").isConnected).toBe(true);
    const bondFamilyCard = within(sidebar).getByRole("region", { name: "Na–Cl bonds" });
    expect(bondFamilyCard?.classList.contains("rounded-xl")).toBe(true);
    expect(bondFamilyCard?.classList.contains("bg-card")).toBe(true);
    const bondAtomTokens = bondFamilyCard?.querySelectorAll(".rounded-full");
    expect(bondAtomTokens).toHaveLength(2);
    for (const token of bondAtomTokens ?? []) {
      expect(token.classList.contains("size-3.5")).toBe(true);
      expect(token.classList.contains("rounded-full")).toBe(true);
      expect(token.className).not.toContain("transition");
      expect(token.getAttribute("style")).toContain("linear-gradient");
    }
    expect(bondFamilyCard?.textContent).not.toContain(" 1 ");

    const familyVisibility = () =>
      within(sidebar).getByRole("button", { name: "Na–Cl visibility" });
    await user.click(familyVisibility());
    expect(familyVisibility().getAttribute("aria-pressed")).toBe("false");
    expect(fetchCalls).toHaveLength(1);

    await openPreviewContextMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Export" }));
    await waitFor(() => expect(exportRequests).toHaveLength(1));
    expect(
      exportRequests[0]?.bondVisibilityOverrides.hiddenFamilies.has("Na|Cl"),
    ).toBe(true);

    const commonControls = screen.getByRole("complementary", {
      name: "Common controls",
    });
    const bondsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Bonds",
    });
    await user.click(bondsCheckbox);
    await user.click(bondsCheckbox);
    expect(familyVisibility().getAttribute("aria-pressed")).toBe("true");

    expect(within(bondFamilyCard!).queryByText("Bond length")).toBeNull();
    expect(within(sidebar).queryByText("Automatic")).toBeNull();
    const cutoffModeButton = within(sidebar).getByRole("button", {
      name: "Edit custom cutoff",
    });
    expect(cutoffModeButton.querySelector(".lucide-square-pen")).not.toBeNull();
    expect(cutoffModeButton.className).toContain("size-6");
    expect(cutoffModeButton.className).toContain("border-border/70");
    expect(cutoffModeButton.parentElement?.className).toContain(
      "bond-cutoff-mode-actions-enter",
    );
    await user.click(cutoffModeButton);
    expect(
      within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }).parentElement
        ?.className,
    ).toContain("bond-cutoff-mode-actions-enter");
    const cutoffInput = within(sidebar).getByRole("textbox", {
      name: "Maximum cutoff for Na–Cl",
    });
    expect(cutoffInput.getAttribute("value")).toBe("1.000");
    expect(within(sidebar).getByRole("textbox", { name: "Minimum cutoff for Na–Cl" }).getAttribute("value"))
      .toBe("0.000");
    expect(within(sidebar).getByRole("combobox", { name: "Bonding algorithm" }).hasAttribute("disabled"))
      .toBe(true);

    queueFetchResponse(jsonResponse(scene));
    await user.clear(cutoffInput);
    await user.type(cutoffInput, "0.8");
    await user.click(within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }));
    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[1]?.input).toBe(
      "/api/structure-preview?bondAlgorithm=crystal-nn&includeConnectivity=true",
    );
    const headers = new Headers(fetchCalls[1]?.init?.headers);
    expect(headers.get("x-pretty-lattice-bond-cutoff-overrides")).toBe(
      '{"Na|Cl":{"min":0,"max":0.8}}',
    );

    expect(
      within(sidebar).getByRole("combobox", { name: "Bonding algorithm" })
        .textContent,
    ).toContain("Custom");

    queueFetchResponse(jsonResponse(scene));
    await user.click(within(sidebar).getByRole("combobox", { name: "Bonding algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));
    await waitFor(() => expect(fetchCalls).toHaveLength(3));
    const presetHeaders = new Headers(fetchCalls[2]?.init?.headers);
    expect(presetHeaders.has("x-pretty-lattice-bond-cutoff-overrides")).toBe(false);
    expect(
      within(sidebar).getByRole("combobox", { name: "Bonding algorithm" }).textContent,
    ).toContain("Minimum distance");

    await user.click(within(sidebar).getByRole("button", { name: "Edit custom cutoff" }));
    expect(
      within(sidebar).getByRole("textbox", { name: "Maximum cutoff for Na–Cl" })
        .getAttribute("value"),
    ).toBe("1.000");
    expect(
      within(sidebar).getByRole("button", { name: "Restore Na–Cl automatic rule" })
        .hasAttribute("disabled"),
    ).toBe(true);
  });

  test("leaves cutoff editing without recalculation when no values changed", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user, sceneWithPeriodicImages());
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);
    await user.click(within(sidebar).getByRole("button", { name: "Edit custom cutoff" }));
    await user.click(within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }));

    expect(fetchCalls).toHaveLength(1);
    expect(within(sidebar).getByRole("button", { name: "Edit custom cutoff" }).isConnected)
      .toBe(true);
  });

  test("keeps preset bonding and the previous scene when a Custom cutoff fails", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user, sceneWithPeriodicImages());
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);
    queueFetchResponse(
      errorResponse(
        "Custom bonding recalculation failed: Bond analysis with CrystalNN failed",
      ),
    );
    await user.click(within(sidebar).getByRole("button", { name: "Edit custom cutoff" }));
    const cutoffInput = within(sidebar).getByRole("textbox", {
      name: "Maximum cutoff for Na–Cl",
    });
    await user.clear(cutoffInput);
    await user.type(cutoffInput, "0.8");
    await user.click(within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Custom bonding recalculation failed",
    );
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
    expect(cutoffInput.getAttribute("value")).toBe("0.800");
    expect(within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }).isConnected)
      .toBe(true);
    expect(within(sidebar).queryByText("Automatic")).toBeNull();
    expect(
      within(sidebar).getByRole("combobox", { name: "Bonding algorithm" })
        .textContent,
    ).toContain("CrystalNN");
  });

  test("rejects invalid cutoff drafts atomically with input halo feedback", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user, sceneWithPeriodicImages());
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);
    await user.click(within(sidebar).getByRole("button", { name: "Edit custom cutoff" }));
    const minimum = within(sidebar).getByRole("textbox", {
      name: "Minimum cutoff for Na–Cl",
    });
    const maximum = within(sidebar).getByRole("textbox", {
      name: "Maximum cutoff for Na–Cl",
    });
    await user.clear(minimum);
    await user.type(minimum, "2");
    await user.clear(maximum);
    await user.type(maximum, "1");
    await user.click(within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }));

    expect(fetchCalls).toHaveLength(1);
    expect(minimum.getAttribute("aria-invalid")).toBe("true");
    expect(maximum.getAttribute("aria-invalid")).toBe("true");
    expect(minimum.className).toContain("bond-cutoff-invalid-feedback-a");
    expect(within(sidebar).getByRole("button", { name: "Apply custom cutoffs" }).isConnected)
      .toBe(true);
  });

  test("keeps large Objects atom groups compact without rendering atom rows", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user, largeSodiumScene(2000));
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));

    expect(within(sidebar).getByRole("region", { name: "Na atoms" }).isConnected).toBe(true);
    expect(within(sidebar).getByText("2000").isConnected).toBe(true);
    expect(within(sidebar).queryByRole("button", { name: "Expand Na" })).toBeNull();
    expect(within(sidebar).queryByText("Na:0")).toBeNull();
    expect(within(sidebar).queryByText("Na:1999")).toBeNull();
    expect(within(sidebar).queryAllByText(/^Na:\d+$/)).toHaveLength(0);
  });

  test("exports without carrying renderer state", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    expect(fetchCalls).toHaveLength(1);
    expect(screen.getByTestId("lattice-canvas").getAttribute("data-render-backend")).toBe(
      "webgl",
    );

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const inspector = screen.getByRole("complementary", { name: "Sidebar" });
    expect(within(inspector).queryByRole("combobox", { name: "Renderer" })).toBeNull();
    const showCrystalAxisLabelsSwitch = within(inspector).getByRole("switch", {
      name: "Show crystal axis labels",
    });
    const depthFadingUnitCellSwitch = within(inspector).getByRole("switch", {
      name: "Apply depth fading to unit cell",
    });
    const distinguishSimilarColorsSwitch = within(inspector).getByRole("switch", {
      name: "Distinguish similar colors",
    });
    const unitCellLineSelect = within(inspector).getByRole("combobox", {
      name: "Unit cell line style",
    });
    const unitCellLineWidthInput = within(inspector).getByRole("textbox", {
      name: "Unit cell line width",
    }) as HTMLInputElement;
    const polyhedraEdgeWidthInput = within(inspector).getByRole("textbox", {
      name: "Polyhedra edge width",
    }) as HTMLInputElement;

    expect(showCrystalAxisLabelsSwitch.getAttribute("aria-checked")).toBe("true");
    expect(depthFadingUnitCellSwitch.getAttribute("aria-checked")).toBe("false");
    expect(distinguishSimilarColorsSwitch.getAttribute("aria-checked")).toBe("true");
    await user.click(within(inspector).getByText("Distinguish similar colors"));
    expect(distinguishSimilarColorsSwitch.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("mock-orientation-gizmo").getAttribute("data-show-labels")).toBe(
      "true",
    );
    await user.click(showCrystalAxisLabelsSwitch);
    expect(showCrystalAxisLabelsSwitch.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("mock-orientation-gizmo").getAttribute("data-show-labels")).toBe(
      "false",
    );
    await user.click(depthFadingUnitCellSwitch);
    expect(depthFadingUnitCellSwitch.getAttribute("aria-checked")).toBe("true");
    await user.click(distinguishSimilarColorsSwitch);
    expect(distinguishSimilarColorsSwitch.getAttribute("aria-checked")).toBe("false");
    await user.click(distinguishSimilarColorsSwitch);
    expect(distinguishSimilarColorsSwitch.getAttribute("aria-checked")).toBe("true");

    expect(unitCellLineSelect.textContent).toContain("Solid");
    expect(unitCellLineWidthInput.value).toBe("1.0");
    expect(polyhedraEdgeWidthInput.value).toBe("1.0");
    await user.click(
      within(inspector).getByRole("button", { name: "Unit cell line width +0.5" }),
    );
    await user.click(
      within(inspector).getByRole("button", { name: "Polyhedra edge width -0.5" }),
    );
    expect(unitCellLineWidthInput.value).toBe("1.5");
    expect(polyhedraEdgeWidthInput.value).toBe("0.5");
    await user.click(unitCellLineSelect);
    await user.click(await screen.findByRole("option", { name: "Dashed" }));

    expect(fetchCalls).toHaveLength(1);
    expect(screen.getByTestId("lattice-canvas").getAttribute("data-render-backend")).toBe(
      "webgl",
    );

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Export" }));
    await user.click(within(commonControls).getByRole("button", { name: "Export PNG" }));
    await waitFor(() => expect(exportRequests).toHaveLength(1));

    expect(exportDirectDownloads[0]?.sourceFileName).toBe("NaCl.cif");
    expect(exportDirectDownloads[0]?.file.fileName).toBe("NaCl.png");
    expect(exportZipDownloads).toHaveLength(0);
    expect(exportRequests[0]?.showCrystalAxisLabels).toBe(false);
    expect(exportRequests[0]?.unitCellLineStyle).toBe("dashed");
    expect(exportRequests[0]?.structureLineWidth).toEqual({
      polyhedra: 0.5,
      unitCell: 1.5,
    });
    expect(exportRequests[0]?.style.fogAffectsUnitCell).toBe(true);
    expect(exportRequests[0]?.style.distinguishSimilarColors).toBe(true);
  });

  test("toggles polyhedra independently from atoms, bonds, and unit cell", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const atomsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Atoms",
    });
    const bondsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Bonds",
    });
    const unitCellCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Unit cell",
    });
    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    });

    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
    await user.click(polyhedraCheckbox);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    await user.click(atomsCheckbox);
    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    await user.click(polyhedraCheckbox);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");

    await user.click(bondsCheckbox);
    await user.click(unitCellCheckbox);
    expect(bondsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(unitCellCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
  });

  test("shows disabled unchecked Polyhedra control when the scene has no polyhedra", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user, sceneWithPeriodicImages({ polyhedra: false }));

    const polyhedraCheckbox = screen.getByRole("checkbox", {
      name: "Polyhedra",
    }) as HTMLButtonElement;
    expect(polyhedraCheckbox.disabled).toBe(true);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("false");
  });

  test("manages component opacity with clamped numeric input and opacity-only reset", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const resetOpacityButton = within(commonControls).getByRole("button", {
      name: "Reset opacity",
    }) as HTMLButtonElement;
    const atomsCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Atoms",
    });
    const atomsOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Atoms opacity value",
    }) as HTMLInputElement;
    const atomsOpacitySlider = within(commonControls).getByRole("slider", {
      name: "Atoms opacity",
    }) as HTMLInputElement;
    const atomsLabel = within(commonControls).getByText("Atoms");
    const unitCellOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Unit cell opacity value",
    }) as HTMLInputElement;
    const bondsOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Bonds opacity value",
    }) as HTMLInputElement;
    const polyhedraOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Polyhedra opacity value",
    }) as HTMLInputElement;
    const polyhedraOpacitySlider = within(commonControls).getByRole("slider", {
      name: "Polyhedra opacity",
    }) as HTMLInputElement;

    expect(resetOpacityButton.disabled).toBe(false);
    expect(atomsOpacityInput.value).toBe("100");
    expect(atomsOpacityInput.parentElement?.textContent).toContain("%");
    expect(bondsOpacityInput.value).toBe("100");
    expect(polyhedraOpacityInput.value).toBe("75");
    expect(polyhedraOpacitySlider.max).toBe("100");

    await user.clear(atomsOpacityInput);
    await user.type(atomsOpacityInput, "98{Enter}");

    expect(atomsOpacityInput.value).toBe("98");
    expect(atomsOpacitySlider.value).toBe("98");

    fireEvent.change(atomsOpacitySlider, { target: { value: "99" } });

    expect(atomsOpacityInput.value).toBe("100");
    expect(atomsOpacitySlider.value).toBe("100");

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));
    const sodiumObjectOpacityInput = within(sidebar).getByRole("textbox", {
      name: "Na opacity",
    }) as HTMLInputElement;
    const chlorineObjectOpacityInput = within(sidebar).getByRole("textbox", {
      name: "Cl opacity",
    }) as HTMLInputElement;
    expect(sodiumObjectOpacityInput.value).toBe("100");
    expect(chlorineObjectOpacityInput.value).toBe("100");

    await user.click(sodiumObjectOpacityInput);
    await user.type(sodiumObjectOpacityInput, "55{Enter}");
    fireEvent.change(atomsOpacitySlider, { target: { value: "90" } });
    expect(sodiumObjectOpacityInput.value).toBe("90");
    expect(chlorineObjectOpacityInput.value).toBe("90");

    await user.click(resetOpacityButton);

    expect(resetOpacityButton.className).toContain("tool-icon-button-reset-feedback");
    expect(polyhedraOpacityInput.value).toBe("75");
    expect(sodiumObjectOpacityInput.value).toBe("100");
    expect(chlorineObjectOpacityInput.value).toBe("100");

    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    });
    await user.click(polyhedraCheckbox);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    await user.clear(polyhedraOpacityInput);
    await user.type(polyhedraOpacityInput, "80%{Enter}");

    expect(polyhedraOpacityInput.value).toBe("80");
    expect(polyhedraOpacitySlider.value).toBe("80");

    await user.clear(polyhedraOpacityInput);
    await user.type(polyhedraOpacityInput, "80%{Enter}");

    expect(polyhedraOpacityInput.value).toBe("80");
    expect(polyhedraOpacitySlider.value).toBe("80");

    await user.click(atomsCheckbox);
    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(atomsLabel.className).not.toContain("text-muted-foreground/60");
    expect(atomsOpacityInput.disabled).toBe(true);
    expect(atomsOpacitySlider.disabled).toBe(true);

    await user.clear(unitCellOpacityInput);
    await user.type(unitCellOpacityInput, "20{Enter}");

    expect(unitCellOpacityInput.value).toBe("20");

    await user.clear(unitCellOpacityInput);
    await user.type(unitCellOpacityInput, "-20{Enter}");

    expect(unitCellOpacityInput.value).toBe("20");

    await user.click(resetOpacityButton);

    expect(atomsCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(unitCellOpacityInput.value).toBe("100");
    expect(bondsOpacityInput.value).toBe("100");
    expect(polyhedraOpacityInput.value).toBe("75");
    expect(resetOpacityButton.className).toContain("tool-icon-button-reset-feedback");
    await waitFor(() =>
      expect(resetOpacityButton.className).not.toContain("tool-icon-button-reset-feedback"),
    );
    expect(resetOpacityButton.disabled).toBe(false);
  });

  test("keeps radius scales with their object panels and configures style", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));

    expect(within(commonControls).queryByText("Size")).toBeNull();
    expect(within(commonControls).queryByText("Radius scale")).toBeNull();
    expect(within(commonControls).queryByRole("combobox", { name: "Radius model" })).toBeNull();
    expect(within(commonControls).queryByRole("slider", { name: "Bond scale" })).toBeNull();
    const atomRadiusModelSelect = within(sidebar).getByRole("combobox", {
      name: "Radius model",
    });
    const atomRadiusSlider = within(sidebar).getByRole("slider", {
      name: "Atom scale",
    }) as HTMLInputElement;
    const atomRadiusInput = within(sidebar).getByRole("textbox", {
      name: "Atom scale value",
    }) as HTMLInputElement;
    const bondStyleSelect = within(commonControls).getByRole("combobox", {
      name: "Bond style",
    });
    const colorSchemeSelect = within(commonControls).getByRole("combobox", {
      name: "Color scheme",
    });
    const materialSelect = within(commonControls).getByRole("combobox", {
      name: "Material",
    });
    const fogSwitch = within(commonControls).getByRole("switch", {
      name: "Depth fading",
    });
    const fogStartSlider = within(commonControls).getByRole("slider", {
      name: "Depth fading start",
    }) as HTMLInputElement;
    const fogStartInput = within(commonControls).getByRole("textbox", {
      name: "Depth fading start value",
    }) as HTMLInputElement;
    const fogAmountSlider = within(commonControls).getByRole("slider", {
      name: "Depth fading amount",
    }) as HTMLInputElement;
    const fogAmountInput = within(commonControls).getByRole("textbox", {
      name: "Depth fading amount value",
    }) as HTMLInputElement;
    const resetFogButton = within(commonControls).getByRole("button", {
      name: "Reset depth fading",
    }) as HTMLButtonElement;

    expect(atomRadiusSlider.min).toBe("0");
    expect(atomRadiusSlider.max).toBe("100");
    expect(atomRadiusSlider.value).toBe("40");
    expect(atomRadiusInput.value).toBe("40");
    expect(atomRadiusInput.parentElement?.textContent).toContain("%");
    expect(commonControls.querySelectorAll(".opacity-slider-snap-marker")).toHaveLength(0);
    expect(within(sidebar).getByText("Radius scale").isConnected).toBe(true);
    expect(atomRadiusModelSelect.textContent).toContain("Uniform");
    expect(materialSelect.textContent).toContain("Modern Matte");
    expect(bondStyleSelect.textContent).toContain("Bicolor");
    expect(within(commonControls).queryByRole("button", { name: "Bond color" })).toBeNull();
    expect(colorSchemeSelect.textContent).toContain("VESTA Soft");
    const elementLegend = screen.getByRole("navigation", { name: "Element legend" });
    async function readSodiumColorValue() {
      await user.click(within(elementLegend).getByRole("button", { name: "Set Na color" }));
      const sodiumColorInput = await screen.findByLabelText("Na color value") as HTMLInputElement;
      const sodiumColorValue = sodiumColorInput.value;
      expect(screen.queryByLabelText("Alpha transparency percentage")).toBeNull();
      await user.click(within(elementLegend).getByRole("button", { name: "Set Na color" }));
      return sodiumColorValue;
    }

    async function setSodiumColorValue(value: string) {
      await user.click(within(elementLegend).getByRole("button", { name: "Set Na color" }));
      const sodiumColorInput = await screen.findByLabelText("Na color value") as HTMLInputElement;
      fireEvent.change(sodiumColorInput, { target: { value } });
      expect(sodiumColorInput.value).toBe(value);
      expect(screen.queryByLabelText("Alpha transparency percentage")).toBeNull();
      await user.click(within(elementLegend).getByRole("button", { name: "Set Na color" }));
    }

    await user.click(colorSchemeSelect);
    expect(await screen.findByRole("option", { name: "Custom" })).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: "Custom" }));
    expect(colorSchemeSelect.textContent).toContain("Custom");
    expect(await readSodiumColorValue()).toBe("#e7d15f");
    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Jmol" }));
    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Custom" }));
    expect(await readSodiumColorValue()).toBe("#ab5cf2");
    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "VESTA Soft" }));
    expect(fogSwitch.getAttribute("aria-checked")).toBe("true");
    expect(fogStartSlider.value).toBe("40");
    expect(fogStartInput.value).toBe("40");
    expect(fogAmountSlider.value).toBe("40");
    expect(fogAmountInput.value).toBe("40");
    expect(fogStartSlider.disabled).toBe(false);
    expect(fogStartInput.disabled).toBe(false);
    expect(fogAmountSlider.disabled).toBe(false);
    expect(fogAmountInput.disabled).toBe(false);

    await user.click(atomRadiusModelSelect);
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));

    expect(fetchCalls).toHaveLength(1);
    expect(atomRadiusModelSelect.textContent).toContain("Van der Waals");

    await user.click(bondStyleSelect);
    expect(await screen.findByRole("option", { name: "Bicolor" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Uniform (2D)" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "Unicolor" }));

    expect(bondStyleSelect.textContent).toContain("Unicolor");
    expect(
      within(within(commonControls).getByText("Material").closest("div") ?? commonControls)
        .queryByRole("button", { name: "Bond color" }),
    ).toBeNull();
    const bondColorButton = within(
      within(commonControls).getByText("Bond style").closest("div") ?? commonControls,
    ).getByRole("button", {
      name: "Bond color",
    });
    await user.click(bondColorButton);
    const bondColorInput = await screen.findByLabelText("Bond color value") as HTMLInputElement;
    expect(bondColorInput.type).toBe("text");
    expect(bondColorInput.value).toBe("#d2d2d2");
    fireEvent.change(bondColorInput, { target: { value: "#999999" } });
    expect(bondColorInput.value).toBe("#999999");
    expect(screen.queryByLabelText("Alpha transparency percentage")).toBeNull();
    await user.click(bondColorButton);
    await user.click(bondStyleSelect);
    await user.click(await screen.findByRole("option", { name: "Bicolor" }));
    expect(bondStyleSelect.textContent).toContain("Bicolor");
    expect(within(commonControls).queryByRole("button", { name: "Bond color" })).toBeNull();
    await user.click(bondStyleSelect);
    await user.click(await screen.findByRole("option", { name: "Unicolor" }));
    const resetBondColorButton = within(
      within(commonControls).getByText("Bond style").closest("div") ?? commonControls,
    ).getByRole("button", {
      name: "Bond color",
    });
    await user.click(resetBondColorButton);
    expect((await screen.findByLabelText("Bond color value") as HTMLInputElement).value).toBe(
      "#d2d2d2",
    );
    await user.click(resetBondColorButton);
    expect(fetchCalls).toHaveLength(1);

    const sodiumColorButton = within(elementLegend).getByRole("button", {
      name: "Set Na color",
    });
    expect(sodiumColorButton.isConnected).toBe(true);
    await user.click(sodiumColorButton);
    expect(await screen.findByLabelText("Na color value")).toBeTruthy();
    await user.click(within(elementLegend).getByRole("button", { name: "Set Na color" }));
    expect(screen.queryByLabelText("Na color value")).toBeNull();
    await setSodiumColorValue("#112233");
    expect(colorSchemeSelect.textContent).toContain("Custom");

    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Jmol" }));
    expect(colorSchemeSelect.textContent).toContain("Jmol");

    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Custom" }));
    expect(colorSchemeSelect.textContent).toContain("Custom");
    expect(await readSodiumColorValue()).toBe("#ab5cf2");

    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Jmol" }));

    expect(colorSchemeSelect.textContent).toContain("Jmol");
    expect(fetchCalls).toHaveLength(1);

    fireEvent.change(fogStartSlider, { target: { value: "18" } });
    fireEvent.change(fogAmountSlider, { target: { value: "72" } });

    expect(fogStartInput.value).toBe("18");
    expect(fogStartSlider.value).toBe("18");
    expect(fogAmountInput.value).toBe("72");
    expect(fogAmountSlider.value).toBe("72");

    fireEvent.change(atomRadiusSlider, { target: { value: "100" } });

    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusSlider.value).toBe("100");

    fireEvent.change(atomRadiusSlider, { target: { value: "44" } });

    expect(atomRadiusInput.value).toBe("44");
    expect(atomRadiusSlider.value).toBe("44");

    await user.click(within(sidebar).getByRole("tab", { name: "Bonds" }));
    const bondGlobalControls = sidebar.querySelector<HTMLElement>(
      '[data-slot="bond-global-controls"]',
    );
    expect(bondGlobalControls?.children[0]?.textContent).toContain("Radius scale");
    expect(bondGlobalControls?.children[1]?.textContent).toContain("Bonding algorithm");
    expect(bondGlobalControls?.children[2]?.textContent).toContain("Custom cutoff");
    expect(within(bondGlobalControls!).getByText("Bonding algorithm").isConnected).toBe(true);
    expect(within(bondGlobalControls!).getByText("Radius scale").isConnected).toBe(true);
    const bondThicknessSlider = within(bondGlobalControls!).getByRole("slider", {
      name: "Bond scale",
    }) as HTMLInputElement;
    const bondThicknessInput = within(bondGlobalControls!).getByRole("textbox", {
      name: "Bond scale value",
    }) as HTMLInputElement;
    expect(bondThicknessSlider.max).toBe("200");
    expect(bondThicknessSlider.value).toBe("100");
    expect(bondThicknessInput.value).toBe("100");

    await user.clear(bondThicknessInput);
    await user.type(bondThicknessInput, "240{Enter}");

    expect(bondThicknessInput.value).toBe("200");
    expect(bondThicknessSlider.value).toBe("200");

    await user.clear(bondThicknessInput);
    await user.type(bondThicknessInput, "240{Enter}");

    expect(bondThicknessInput.value).toBe("200");
    expect(bondThicknessSlider.value).toBe("200");

    await user.click(within(sidebar).getByRole("tab", { name: "Atoms" }));
    const restoredAtomRadiusSlider = within(sidebar).getByRole("slider", {
      name: "Atom scale",
    }) as HTMLInputElement;
    const restoredAtomRadiusInput = within(sidebar).getByRole("textbox", {
      name: "Atom scale value",
    }) as HTMLInputElement;

    await user.clear(restoredAtomRadiusInput);
    await user.type(restoredAtomRadiusInput, "50{Enter}");

    expect(restoredAtomRadiusInput.value).toBe("50");
    expect(restoredAtomRadiusSlider.value).toBe("50");

    await user.clear(restoredAtomRadiusInput);
    await user.type(restoredAtomRadiusInput, "-10{Enter}");

    expect(restoredAtomRadiusInput.value).toBe("50");
    expect(restoredAtomRadiusSlider.value).toBe("50");
    expect(within(commonControls).queryByRole("button", { name: "Reset scale" })).toBeNull();
    expect(bondStyleSelect.textContent).toContain("Unicolor");
    expect(colorSchemeSelect.textContent).toContain("Jmol");
    expect(fogSwitch.getAttribute("aria-checked")).toBe("true");
    expect(fogStartInput.value).toBe("18");
    expect(fogAmountInput.value).toBe("72");

    await user.click(resetFogButton);

    expect(resetFogButton.className).toContain("tool-icon-button-reset-feedback");
    expect(fogSwitch.getAttribute("aria-checked")).toBe("true");
    expect(fogStartInput.value).toBe("40");
    expect(fogStartSlider.value).toBe("40");
    expect(fogAmountInput.value).toBe("40");
    expect(fogAmountSlider.value).toBe("40");
    expect(fogStartSlider.disabled).toBe(false);
    expect(fogStartInput.disabled).toBe(false);
    expect(fogAmountSlider.disabled).toBe(false);
    expect(fogAmountInput.disabled).toBe(false);
  });

  test("selects material presets without re-uploading or changing other style controls", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));

    const materialSelect = within(commonControls).getByRole("combobox", {
      name: "Material",
    });
    const bondStyleSelect = within(commonControls).getByRole("combobox", {
      name: "Bond style",
    });
    const colorSchemeSelect = within(commonControls).getByRole("combobox", {
      name: "Color scheme",
    });

    await user.click(bondStyleSelect);
    await user.click(await screen.findByRole("option", { name: "Unicolor" }));
    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Jmol" }));

    await user.click(within(commonControls).getByRole("tab", { name: "Display" }));
    const atomsOpacityInput = within(commonControls).getByRole("textbox", {
      name: "Atoms opacity value",
    }) as HTMLInputElement;
    await user.clear(atomsOpacityInput);
    await user.type(atomsOpacityInput, "64{Enter}");

    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    const nextMaterialSelect = within(commonControls).getByRole("combobox", {
      name: "Material",
    });
    const nextBondStyleSelect = within(commonControls).getByRole("combobox", {
      name: "Bond style",
    });
    const nextColorSchemeSelect = within(commonControls).getByRole("combobox", {
      name: "Color scheme",
    });
    await user.click(nextMaterialSelect);
    await user.click(await screen.findByRole("option", { name: "Glossy" }));

    expect(nextMaterialSelect.textContent).toContain("Glossy");
    expect(nextBondStyleSelect.textContent).toContain("Unicolor");
    expect(nextColorSchemeSelect.textContent).toContain("Jmol");
    expect(fetchCalls).toHaveLength(1);

    await user.click(within(commonControls).getByRole("tab", { name: "Display" }));
    expect(atomsOpacityInput.value).toBe("64");
  });

  test("lets export controls update settings and route PNG and PDF actions", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Export" }));

    expect(within(commonControls).queryByText("No controls")).toBeNull();
    const widthInput = within(commonControls).getByRole("textbox", {
      name: "Export width",
    }) as HTMLInputElement;
    const heightInput = within(commonControls).getByRole("textbox", {
      name: "Export height",
    }) as HTMLInputElement;
    const twoXSupersampling = within(commonControls).getByRole("tab", {
      name: "2x supersampling",
    });
    const oneXSupersampling = within(commonControls).getByRole("tab", {
      name: "1x supersampling",
    });
    const highMeshQuality = within(commonControls).getByRole("tab", {
      name: "High 3D Mesh Quality",
    });
    const xHighMeshQuality = within(commonControls).getByRole("tab", {
      name: "XHigh 3D Mesh Quality",
    });
    const resetQualityButton = within(commonControls).getByRole("button", {
      name: "Reset Output Settings",
    }) as HTMLButtonElement;
    const formatSelect = within(commonControls).getByRole("combobox", {
      name: "Format",
    });
    let backgroundButton = within(commonControls).getByRole("button", {
      name: "Background: Transparent",
    });
    const exportPngButton = within(commonControls).getByRole("button", {
      name: "Export PNG",
    });
    const structureCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Export Structure",
    });
    const crystalAxesCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Export Crystal axes",
    });
    const legendCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Export Legend",
    });
    const combineSwitch = within(commonControls).getByRole("switch", {
      name: "Combine selected components",
    });
    const legendLayoutSelect = within(commonControls).getByRole("combobox", {
      name: "Legend layout",
    });

    expect(widthInput.value).toBe("2000");
    expect(heightInput.value).toBe("2000");
    expect(structureCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(crystalAxesCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(legendCheckbox.getAttribute("aria-checked")).toBe("false");
    expect(combineSwitch.getAttribute("aria-checked")).toBe("true");
    expect(legendLayoutSelect.textContent).toContain("Horizontal");
    expect(legendLayoutSelect.getAttribute("disabled")).not.toBeNull();
    expect(twoXSupersampling.getAttribute("aria-selected")).toBe("true");
    expect(highMeshQuality.getAttribute("aria-selected")).toBe("true");
    expect(formatSelect.textContent).toContain("PNG");
    expect(exportPngButton.isConnected).toBe(true);

    await user.click(combineSwitch);
    expect(combineSwitch.getAttribute("aria-checked")).toBe("false");

    await user.click(crystalAxesCheckbox);
    await user.click(legendCheckbox);
    expect(legendLayoutSelect.getAttribute("disabled")).toBeNull();
    await user.click(legendLayoutSelect);
    await user.click(await screen.findByRole("option", { name: "Vertical" }));
    await user.click(backgroundButton);
    expect(await screen.findByText("Background")).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: "Black" }));
    backgroundButton = within(commonControls).getByRole("button", {
      name: "Background: Black",
    });
    expect(backgroundButton.isConnected).toBe(true);

    await user.click(exportPngButton);
    await waitFor(() => expect(exportRequests).toHaveLength(1));

    expect(exportRequests[0]?.settings.format).toBe("png");
    expect(exportRequests[0]?.settings.background).toBe("black");
    expect(exportRequests[0]?.settings.components).toEqual({
      legend: true,
      crystalAxes: true,
      structure: true,
    });
    expect(exportRequests[0]?.settings.legendLayout).toBe("vertical");
    expect(exportRequests[0]?.settings.supersampling).toBe(2);
    expect(exportZipDownloads[0]?.sourceFileName).toBe("NaCl.cif");
    expect(exportZipDownloads[0]?.files.map((file) => file.fileName)).toEqual([
      "NaCl.png",
      "NaCl-crystal-axes.png",
      "NaCl-legend.png",
    ]);

    await user.clear(widthInput);
    await user.type(widthInput, "3000{Enter}");

    expect(widthInput.value).toBe("3000");
    expect(heightInput.value).toBe("2000");

    await user.click(
      within(commonControls).getByRole("button", { name: "Lock aspect ratio" }),
    );
    await user.clear(heightInput);
    await user.type(heightInput, "1000{Enter}");

    expect(widthInput.value).toBe("1084");
    expect(heightInput.value).toBe("1000");

    await user.click(oneXSupersampling);
    await user.click(xHighMeshQuality);
    await user.click(formatSelect);
    await user.click(await screen.findByRole("option", { name: "PDF" }));
    expect(formatSelect.textContent).toContain("PDF");
    backgroundButton = within(commonControls).getByRole("button", {
      name: "Background: Black",
    });
    expect(oneXSupersampling.getAttribute("aria-selected")).toBe("true");
    expect(xHighMeshQuality.getAttribute("aria-selected")).toBe("true");

    await user.click(resetQualityButton);

    expect(resetQualityButton.className).toContain("tool-icon-button-reset-feedback");
    expect(widthInput.value).toBe("2000");
    expect(heightInput.value).toBe("2000");
    expect(twoXSupersampling.getAttribute("aria-selected")).toBe("true");
    expect(highMeshQuality.getAttribute("aria-selected")).toBe("true");
    expect(formatSelect.textContent).toContain("PDF");
    backgroundButton = within(commonControls).getByRole("button", {
      name: "Background: Black",
    });
    expect(
      within(commonControls).getByRole("button", { name: "Lock aspect ratio" }).isConnected,
    ).toBe(true);

    const exportPdfButton = within(commonControls).getByRole("button", {
      name: "Export PDF",
    });
    await user.click(exportPdfButton);
    await waitFor(() => expect(exportRequests).toHaveLength(2));

    expect(exportRequests[1]?.settings).toMatchObject({
      aspectRatioLocked: false,
      background: "black",
      format: "pdf",
      height: 2000,
      meshQuality: "high",
      supersampling: 2,
      width: 2000,
    });
    expect(exportZipDownloads[1]?.sourceFileName).toBe("NaCl.cif");
    expect(exportZipDownloads[1]?.files.map((file) => file.fileName)).toEqual([
      "NaCl.pdf",
      "NaCl-crystal-axes.pdf",
      "NaCl-legend.pdf",
    ]);

    await user.click(formatSelect);
    await user.click(await screen.findByRole("option", { name: "JPG" }));
    expect(formatSelect.textContent).toContain("JPG");
    backgroundButton = within(commonControls).getByRole("button", {
      name: "Background: Black",
    });
    await user.click(backgroundButton);
    expect(screen.queryByRole("option", { name: "Transparent" })).toBeNull();
    await user.click(await screen.findByRole("option", { name: "White" }));
    backgroundButton = within(commonControls).getByRole("button", {
      name: "Background: White",
    });
    expect(backgroundButton.isConnected).toBe(true);

    const exportJpgButton = within(commonControls).getByRole("button", {
      name: "Export JPG",
    });
    await user.click(exportJpgButton);
    await waitFor(() => expect(exportRequests).toHaveLength(3));

    expect(exportRequests[2]?.settings).toMatchObject({
      background: "white",
      format: "jpg",
    });
    expect(exportZipDownloads[2]?.files.map((file) => file.fileName)).toEqual([
      "NaCl.jpg",
      "NaCl-crystal-axes.jpg",
      "NaCl-legend.jpg",
    ]);

    await user.click(combineSwitch);
    await user.click(exportJpgButton);
    await waitFor(() => expect(exportRequests).toHaveLength(4));

    expect(exportRequests[3]?.settings.combineComponents).toBe(true);
    expect(exportDirectDownloads[0]?.sourceFileName).toBe("NaCl.cif");
    expect(exportDirectDownloads[0]?.file.fileName).toBe("NaCl.jpg");
  });

  test("shows recoverable export errors without losing the loaded scene", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    exportFailure = new Error("WebGL export failed.");

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Export" }));
    await user.click(within(commonControls).getByRole("button", { name: "Export PNG" }));

    await waitFor(() =>
      expect(
        within(commonControls)
          .getByRole("status")
          .getAttribute("aria-label"),
      ).toContain("WebGL export failed."),
    );
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
    expect(exportDirectDownloads).toHaveLength(0);
    expect(exportZipDownloads).toHaveLength(0);
  });

  test("uses a single sliding active indicator for tab animation", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const content = commonControls.querySelector("[data-slot='common-controls-content']");
    expect(content?.className).toContain("transition-[height]");
    expect(content?.className).not.toContain("h-[");
    expect(content?.className).not.toContain("min-h");
    const activeIndicator = commonControls.querySelector(
      "[data-slot='common-controls-active-indicator']",
    ) as HTMLElement | null;
    const tabsList = commonControls.querySelector("[data-slot='tabs-list']") as HTMLElement | null;
    expect(tabsList?.style.gridTemplateColumns).toContain("1.65fr");
    expect(activeIndicator).not.toBeNull();
    expect(
      within(commonControls)
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("aria-label")),
    ).toEqual(["Display", "Pose", "Style", "Export"]);
    const displayTab = within(commonControls).getByRole("tab", { name: "Display" });
    const cameraTab = within(commonControls).getByRole("tab", { name: "Pose" });
    expect(displayTab.style.flexGrow).toBe("");
    expect(cameraTab.style.flexGrow).toBe("");
    expect(cameraTab.className).not.toContain("transition-[flex-grow");
    expect(
      cameraTab.querySelector("[data-slot='common-controls-tab-label']")?.className,
    ).toContain("max-w-0");
    expect(commonControls.querySelector("[data-camera-tab-keepalive]")).toBeTruthy();
    expect(
      commonControls
        .querySelector("[data-camera-tab-keepalive]")
        ?.closest("[data-slot='tabs-content']")
        ?.getAttribute("data-state"),
    ).toBe("inactive");
    expect(
      commonControls
        .querySelector("[data-camera-tab-keepalive]")
        ?.closest("[data-slot='tabs-content']")
        ?.className,
    ).toContain("common-controls-keepalive-tab");

    await user.click(cameraTab);

    expect(content?.className).not.toContain("h-[");
    expect(within(commonControls).getByRole("tab", { name: "Pose" }).textContent).toContain(
      "Pose",
    );
    expect(tabsList?.style.gridTemplateColumns).toContain("1.65fr");
    expect(
      within(commonControls)
        .getByRole("tab", { name: "Pose" })
        .querySelector("[data-slot='common-controls-tab-label']")
        ?.className,
    ).toContain("max-w-16");
    expect(
      within(commonControls)
        .getByRole("tab", { name: "Display" })
        .querySelector("[data-slot='common-controls-tab-label']")
        ?.className,
    ).toContain("max-w-0");

    await user.click(within(commonControls).getByRole("tab", { name: "Display" }));

    expect(content?.className).not.toContain("h-[");
    expect(commonControls.querySelector("[data-camera-tab-keepalive]")).toBeTruthy();
    expect(
      commonControls
        .querySelector("[data-camera-tab-keepalive]")
        ?.closest("[data-slot='tabs-content']")
        ?.getAttribute("data-state"),
    ).toBe("inactive");
    expect(
      commonControls
        .querySelector("[data-camera-tab-keepalive]")
        ?.closest("[data-slot='tabs-content']")
        ?.className,
    ).toContain("common-controls-keepalive-tab");
  });

  test("shows crystal camera controls with fixed numerical vector editing", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));

    expect(within(commonControls).queryByText("No controls")).toBeNull();
    expect(within(commonControls).getByText("Primary axis").isConnected).toBe(true);
    expect(within(commonControls).queryByText("Primary direction")).toBeNull();
    expect(
      within(commonControls).getByRole("button", { name: "Z Out" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(commonControls).getByRole("button", { name: "X Right" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      commonControls.querySelector("[data-screen-axis-label='outward']")?.className,
    ).toContain("text-[11px]");
    expect(within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuenow"))
      .toBe("344");
    expect(within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuemin"))
      .toBe("0");
    expect(within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuemax"))
      .toBe("360");
    const initialRollInput = within(commonControls).getByRole("textbox", {
      name: "Roll value",
    }) as HTMLInputElement;
    expect(initialRollInput).toHaveProperty("value", "344");
    expect(initialRollInput.style.width).toBe("3ch");
    expect(initialRollInput.nextElementSibling?.textContent).toBe("°");
    const rollSlider = within(commonControls).getByRole("slider", { name: "Roll" });
    expect(rollSlider.className).not.toContain("focus-visible:ring-[3px]");
    expect(
      rollSlider.querySelector("[data-slot='angle-slider-thumb']")?.className,
    ).toContain("group-focus-visible:ring-[2px]");

    expect(within(commonControls).getByText("Numerical input").isConnected).toBe(true);
    expect(
      within(commonControls).getByRole("button", { name: "Numerical input rules" }).isConnected,
    ).toBe(true);
    expect(
      within(commonControls)
        .getAllByRole("textbox")
        .map((textbox) => textbox.getAttribute("aria-label")),
    ).toEqual([
      "Roll value",
      "Z a",
      "Z b",
      "Z c",
      "Y a*",
      "Y b*",
      "Y c*",
    ]);
    expect(
      within(commonControls).getByRole("textbox", { name: "Z a" }),
    ).toHaveProperty("value", "1.00");
    expect(
      within(commonControls).getByRole("textbox", { name: "Z a" }).className,
    ).toContain("w-[3rem]");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z a" })
        .closest('[data-camera-vector-row="z"]')
        ?.querySelector(".grid.min-w-0")
        ?.className,
    ).toContain("grid-cols-[3rem_0.8rem_0.45rem_3rem_0.8rem_0.45rem_3rem_0.8rem]");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z a" })
        .closest('[data-camera-vector-row="z"]')
        ?.querySelector(".grid.min-w-0")
        ?.className,
    ).toContain("-translate-x-2");
    expect(
      within(commonControls).getByRole("textbox", { name: "Z b" }),
    ).toHaveProperty("value", "0.33");
    expect(
      within(commonControls).getByRole("textbox", { name: "Z c" }),
    ).toHaveProperty("value", "0.17");
    expect(
      within(commonControls).getByRole("textbox", { name: "Y b*" }),
    ).toHaveProperty("value", "-0.05");
    expect(
      within(commonControls).getByRole("textbox", { name: "Y c*" }),
    ).toHaveProperty("value", "1.00");
    expect(
      within(commonControls).getByRole("button", { name: "Y secondary axis" }).textContent,
    ).toBe("Y");
    expect(
      within(commonControls).getByRole("button", { name: "Y secondary axis" }).className,
    ).toContain("bg-background");
    expect(
      within(commonControls).getByRole("button", { name: "Y secondary axis" }).className,
    ).toContain("border-foreground/10");
    expect(
      within(commonControls).getByRole("button", { name: "Y secondary axis" }).className,
    ).toContain("shadow-[0_1px_2px_rgb(0_0_0/0.04)]");
    expect(
      within(commonControls).getByRole("button", { name: "Y secondary axis" }).className,
    ).toContain("hover:bg-accent/80");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z a" })
        .closest('[data-camera-vector-row="z"]')
        ?.getAttribute("data-primary-axis"),
    ).toBe("true");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z a" })
        .closest('[data-camera-vector-row="z"]')
        ?.querySelector("span")
        ?.className,
    ).toContain("text-xs");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z a" })
        .closest('[data-camera-vector-row="z"]')
        ?.querySelector("span")
        ?.className,
    ).not.toContain("bg-");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z a" })
        .closest('[data-camera-vector-row="z"]')
        ?.querySelector("span")
        ?.className,
    ).toContain("text-muted-foreground");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Y a*" })
        .closest('[data-camera-vector-row="y"]')
        ?.hasAttribute("data-primary-axis"),
    ).toBe(false);
  });

  test("formats roll controls as zero to 360 degrees", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));

    const rollInput = within(commonControls).getByRole("textbox", {
      name: "Roll value",
    }) as HTMLInputElement;
    await user.click(rollInput);

    expect(rollInput.value).toBe("");
    expect(rollInput.style.width).toBe("1ch");

    await user.tab();

    expect(rollInput.value).toBe("344");

    await user.click(rollInput);
    await user.type(rollInput, "-90{Enter}");

    expect(rollInput.value).toBe("270");
    expect(rollInput.style.width).toBe("3ch");
    expect(rollInput.nextElementSibling?.textContent).toBe("°");
    expect(
      within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuenow"),
    ).toBe("270");

    await user.click(rollInput);
    await user.type(rollInput, "-0.00001{Enter}");

    expect(rollInput.value).toBe("0");
    expect(rollInput.style.width).toBe("1ch");
    expect(
      within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuenow"),
    ).toBe("0");

    const resetRollButton = within(commonControls).getByRole("button", { name: "Reset roll" });
    await user.click(resetRollButton);

    expect(rollInput.value).toBe("0");
    expect(
      within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuenow"),
    ).toBe("0");
    expect(resetRollButton.className).toContain("tool-icon-button-reset-feedback");
  });

  test("batch-applies camera vector drafts and resets the draft from current state", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));

    const outwardA = within(commonControls).getByRole("textbox", {
      name: "Z a",
    }) as HTMLInputElement;
    const outwardC = within(commonControls).getByRole("textbox", {
      name: "Z c",
    }) as HTMLInputElement;

    await user.click(outwardA);
    expect(outwardA.value).toBe("");

    await user.tab();
    expect(outwardA.value).toBe("1.00");

    await user.clear(outwardA);
    await user.type(outwardA, "1");

    expect(outwardA.value).toBe("1");
    expect(outwardC.value).toBe("0.17");

    const resetDraftButton = within(commonControls).getByRole("button", {
      name: "Reset vectors draft",
    });
    await user.click(resetDraftButton);

    expect(outwardA.value).toBe("1.00");
    expect(outwardC.value).toBe("0.17");
    expect(resetDraftButton.className).toContain("tool-icon-button-reset-feedback");

    await user.clear(outwardA);
    await user.type(outwardA, "1");
    const applyVectorsButton = within(commonControls).getByRole("button", {
      name: "Apply vectors",
    });
    await user.click(applyVectorsButton);

    expect(outwardA.value).toBe("1.00");
    expect(outwardC.value).toBe("0.17");
    expect(applyVectorsButton.className).toContain("tool-icon-button-reset-feedback");

    await user.clear(outwardA);
    await user.type(outwardA, "not-a-number");
    await user.click(applyVectorsButton);

    expect(outwardA.value).toBe("1.00");
  });

  test("swaps camera vector bases when primary direction changes", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));
    await user.click(within(commonControls).getByRole("button", { name: "Y Up" }));

    expect(
      within(commonControls).getByRole("button", { name: "Y Up" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(commonControls)
        .getAllByRole("textbox")
        .map((textbox) => textbox.getAttribute("aria-label")),
    ).toEqual([
      "Roll value",
      "Y a",
      "Y b",
      "Y c",
      "Z a*",
      "Z b*",
      "Z c*",
    ]);
    expect(within(commonControls).getByRole("textbox", { name: "Y b" }).isConnected)
      .toBe(true);
    expect(within(commonControls).getByRole("textbox", { name: "Z c*" }).isConnected)
      .toBe(true);
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Y b" })
        .closest('[data-camera-vector-row="y"]')
        ?.getAttribute("data-primary-axis"),
    ).toBe("true");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Z c*" })
        .closest('[data-camera-vector-row="z"]')
        ?.hasAttribute("data-primary-axis"),
    ).toBe(false);
    expect(within(commonControls).queryByRole("textbox", { name: "Z c" })).toBeNull();

    await user.click(within(commonControls).getByRole("button", { name: "Z secondary axis" }));

    expect(
      within(commonControls)
        .getAllByRole("textbox")
        .map((textbox) => textbox.getAttribute("aria-label")),
    ).toEqual([
      "Roll value",
      "Y a",
      "Y b",
      "Y c",
      "X a*",
      "X b*",
      "X c*",
    ]);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 240));
    });

    expect(
      within(commonControls).getByRole("textbox", { name: "Roll value" }),
    ).toHaveProperty("value", "27");
  });

  test("routes gizmo clicks through the selected camera primary direction", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    await user.click(screen.getByRole("button", { name: "gizmo a" }));
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));

    expect(
      within(commonControls).getByRole("textbox", { name: "Z a" }),
    ).toHaveProperty("value", "1.00");
    expect(
      within(commonControls).getByRole("textbox", { name: "Z c" }),
    ).toHaveProperty("value", "0.00");

    await user.click(within(commonControls).getByRole("button", { name: "Y Up" }));
    await user.click(screen.getByRole("button", { name: "gizmo c" }));

    expect(
      within(commonControls).getByRole("textbox", { name: "Y c" }),
    ).toHaveProperty("value", "1.00");
  });

  test("starts with collapsed extended structure details and toggles them from the card", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    const detailsRegion = structureCard.querySelector(
      "[data-slot='structure-summary-details']",
    ) as HTMLElement | null;
    const detailsBody = structureCard.querySelector(
      "[data-slot='structure-summary-details-body']",
    ) as HTMLElement | null;
    const detailsContent = structureCard.querySelector(
      "[data-slot='structure-summary-details-content']",
    ) as HTMLElement | null;
    const detailsSeparator = () =>
      structureCard.querySelector("[data-structure-summary-details-separator]") as HTMLElement | null;
    const expandButton = within(structureCard).getByRole("button", {
      name: "Expand details",
    });

    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(detailsRegion?.className).toContain("transition-[grid-template-rows]");
    expect(detailsRegion?.className).toContain("grid-rows-[0fr]");
    expect(detailsBody?.className).toContain("overflow-hidden");
    expect(detailsBody?.className).not.toContain("pt-0");
    expect(detailsContent?.className).toContain("pt-2.5");
    expect(detailsSeparator()).not.toBeNull();

    await user.click(expandButton);

    const collapseButton = within(structureCard).getByRole("button", {
      name: "Collapse details",
    });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(detailsRegion?.className).toContain("grid-rows-[1fr]");
    expect(detailsBody?.className).toContain("overflow-hidden");
    expect(detailsContent?.className).toContain("pt-2.5");
    expect(detailsSeparator()).not.toBeNull();

    await user.click(collapseButton);

    expect(
      within(structureCard)
        .getByRole("button", { name: "Expand details" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(detailsRegion?.className).toContain("grid-rows-[0fr]");
    expect(detailsBody?.className).toContain("overflow-hidden");
    expect(detailsContent?.className).toContain("pt-2.5");
    expect(detailsSeparator()).not.toBeNull();
  });

  test("keeps manually expanded structure details open when controls overflow the viewport", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = () => ({
      bottom: 4096,
      height: 4096,
      left: 0,
      right: 296,
      top: 0,
      width: 296,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    try {
      const structureCard = screen.getByRole("complementary", { name: "Current structure" });
      const expandButton = within(structureCard).getByRole("button", {
        name: "Expand details",
      });

      await user.click(expandButton);
      fireEvent(window, new Event("resize"));

      await waitFor(() => {
        const collapseButton = within(structureCard).getByRole("button", {
          name: "Collapse details",
        });
        expect(collapseButton.getAttribute("aria-expanded")).toBe("true");
      });
    } finally {
      Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  test("keeps atom radius model local and reuploads when the bond algorithm changes", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const polyhedraCheckbox = within(commonControls).getByRole("checkbox", {
      name: "Polyhedra",
    });
    await user.click(polyhedraCheckbox);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await user.click(within(sidebar).getByRole("tab", { name: "Objects" }));
    const atomRadiusModelSelect = within(sidebar).getByRole("combobox", {
      name: "Radius model",
    });
    await user.click(atomRadiusModelSelect);
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));

    expect(fetchCalls).toHaveLength(1);

    await openBondObjectsTab(user, sidebar);
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));

    await user.click(screen.getByRole("combobox", { name: "Bonding algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[1]?.input).toBe(
      "/api/structure-preview?bondAlgorithm=minimum-distance&includeConnectivity=true",
    );
    expect(fetchCalls[1]?.init?.body).toBeInstanceOf(File);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));
    await user.click(screen.getByRole("combobox", { name: "Bonding algorithm" }));
    await user.click(await screen.findByRole("option", { name: "CrystalNN" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(3));
    expect(fetchCalls[2]?.input).toBe("/api/structure-preview?bondAlgorithm=crystal-nn&includeConnectivity=true");
    expect(fetchCalls[2]?.init?.body).toBeInstanceOf(File);
  });

  test("reuploads on reset all only when the current bond algorithm is not default", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages({ atomCount: 6 })));

    await user.click(screen.getByRole("combobox", { name: "Bonding algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[1]?.input).toBe(
      "/api/structure-preview?bondAlgorithm=minimum-distance&includeConnectivity=true",
    );
    expect(screen.getByRole("combobox", { name: "Bonding algorithm" }).textContent).toContain(
      "Minimum distance",
    );

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("checkbox", { name: "Atoms" }));
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));

    await openPreviewContextMenu();
    await user.click(await screen.findByRole("menuitem", { name: "Reset all" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(3));
    expect(fetchCalls[2]?.input).toBe("/api/structure-preview?includeConnectivity=true");
    expect(fetchCalls[2]?.init?.body).toBeInstanceOf(File);

    expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(screen.getByRole("combobox", { name: "Bonding algorithm" }).textContent).toContain(
      "CrystalNN",
    );
    const resetCommonControls = screen.getByRole("complementary", {
      name: "Common controls",
    });
    expect(
      within(resetCommonControls)
        .getByRole("tab", { name: "Style" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    await user.click(within(resetCommonControls).getByRole("tab", { name: "Display" }));
    expect(
      screen.getByRole("checkbox", { name: "Atoms" }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  test("keeps the loaded scene when recomputing structure data fails", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    await openBondObjectsTab(user, sidebar);
    await user.click(screen.getByRole("combobox", { name: "Bonding algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Python backend is unavailable");
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
    expect(screen.getByRole("combobox", { name: "Bonding algorithm" }).textContent).toContain(
      "CrystalNN",
    );
  });

  test("keeps view controls wired to lock, zoom, and reset state", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    await user.click(screen.getByRole("button", { name: "Lock mouse interaction" }));

    expect(
      screen.getByRole("button", { name: "Unlock mouse interaction" }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    const zoomInput = screen.getByRole("textbox", { name: "Zoom percentage input" });
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Pose" }));
    const rollInput = within(commonControls).getByRole("textbox", {
      name: "Roll value",
    }) as HTMLInputElement;
    const standardViewRoll = rollInput.value;

    await user.clear(zoomInput);
    await user.type(zoomInput, "250{Enter}");

    expect((zoomInput as HTMLInputElement).value).toBe("250");

    await user.click(screen.getByRole("button", { name: "Reset view" }));

    expect((zoomInput as HTMLInputElement).value).toBe("100");
    expect(rollInput.value).toBe(standardViewRoll);
  });

  test("shows API parse errors without leaving a stale scene behind", async () => {
    const user = userEvent.setup();
    queueFetchResponse(errorResponse("Could not parse bad.cif: long backend parser detail."));

    render(<App />);

    await user.upload(getFileInput(), structureFile("bad.cif"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unsupported file");
    expect(alert.textContent).toContain("pymatgen could not parse this file.");
    expect(alert.textContent).not.toContain("bad.cif");
    expect(alert.textContent).not.toContain("long backend parser detail");
    const alertIcon = alert.querySelector("svg");
    expect(alertIcon).not.toBeNull();
    expect(alertIcon?.getAttribute("class")).toContain("lucide-triangle-alert");
    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    expect(alert.parentElement?.tagName).toBe("MAIN");
    expect(within(structureCard).queryByRole("alert")).toBeNull();
    expect(screen.queryByText("File")).toBeNull();
    expect(screen.queryByText("bad.cif")).toBeNull();
    expect(screen.getByText("No structure loaded").isConnected).toBe(true);
    expect(screen.queryByTestId("lattice-canvas")).toBeNull();
    expect(screen.queryByRole("button", { name: "Sidebar" })).toBeNull();
  });

  test("shows a backend unavailable alert when the Python server cannot be reached", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.upload(getFileInput(), structureFile());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Python backend is unavailable");
    expect(alert.textContent).toContain(
      "Start Pretty Lattice locally to upload or recompute structures.",
    );
    expect(alert.textContent).not.toContain("Backend is unavailable.");
    expect(alert.textContent).not.toContain("Unsupported file");
    expect(fetchCalls).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Dismiss alert" }));

    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("shows a backend unavailable alert when a static host returns an HTML API miss", async () => {
    const user = userEvent.setup();
    queueFetchResponse(htmlResponse(405));

    render(<App />);

    await user.upload(getFileInput(), structureFile());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Python backend is unavailable");
    expect(alert.textContent).toContain(
      "Start Pretty Lattice locally to upload or recompute structures.",
    );
    expect(alert.textContent).not.toContain("Backend is unavailable.");
    expect(alert.textContent).not.toContain("pymatgen could not parse this file.");
  });

  test("shows a backend unavailable alert when a static fallback returns HTML as 200", async () => {
    const user = userEvent.setup();
    queueFetchResponse(htmlResponse(200));

    render(<App />);

    await user.upload(getFileInput(), structureFile());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Python backend is unavailable");
    expect(alert.textContent).not.toContain("pymatgen could not parse this file.");
  });

  test("rejects oversized files before uploading", async () => {
    const user = userEvent.setup();

    render(<App />);

    const largeFile = new File(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      "movie.mp4",
      { type: "video/mp4" },
    );
    await user.upload(getFileInput(), largeFile);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Unsupported file");
    expect(alert.textContent).toContain("File is too large to preview.");
    expect(screen.queryByText("File")).toBeNull();
    expect(screen.queryByText("movie.mp4")).toBeNull();
    expect(fetchCalls).toHaveLength(0);
    expect(screen.getByText("No structure loaded").isConnected).toBe(true);
  });

  test("shows non-fatal analysis warnings while keeping the scene visible", async () => {
    const user = userEvent.setup();
    queueFetchResponse(
      jsonResponse({
        ...sceneWithPeriodicImages(),
        warnings: [
          {
            code: "bond-analysis-failed",
            message: "Bond analysis with CrystalNN failed: neighbor graph unavailable",
          },
        ],
      }),
    );

    render(<App />);
    await user.upload(getFileInput(), structureFile());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Bond analysis with CrystalNN failed",
    );
    const alert = screen.getByRole("alert");
    expect(alert.querySelector("svg")?.getAttribute("class")).toContain(
      "lucide-triangle-alert",
    );
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);

    await user.click(screen.getByRole("button", { name: "Dismiss alert" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
  });

  test("loads one shared connectivity bundle from Objects for a deferred large scene", async () => {
    const user = userEvent.setup();
    const readyScene = { ...sceneWithPeriodicImages({ atomCount: 1024 }), bondAlgorithm: "cut-off-dict" as const };
    const deferredScene: SceneSpec = {
      ...readyScene,
      atoms: readyScene.atoms.filter((atom) => !atom.imageReasons.includes("bonded")),
      bonds: [],
      bondFamilies: [],
      polyhedra: [],
      connectivity: "deferred",
    };
    await renderLoadedStructure(user, deferredScene);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    expect(within(commonControls).getByRole("checkbox", { name: "Bonds" }).getAttribute("aria-checked")).toBe("false");

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const sidebar = screen.getByRole("complementary", { name: "Sidebar" });
    queueFetchResponse(jsonResponse(readyScene));
    await openBondObjectsTab(user, sidebar);

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[1]?.input).toBe("/api/structure-preview?bondAlgorithm=cut-off-dict&includeConnectivity=true");
    expect(within(commonControls).getByRole("checkbox", { name: "Bonds" }).getAttribute("aria-checked")).toBe("false");
    expect((await within(sidebar).findByRole("region", { name: "Na–Cl bonds" })).isConnected).toBe(true);
  });
});

function sceneWithPeriodicImages({
  atomCount = 2,
  polyhedra = true,
}: {
  atomCount?: number;
  polyhedra?: boolean;
} = {}): SceneSpec {
  return {
    atoms: [
      atom("Na-0", "Na", [0, 0, 0], [], []),
      atom("Na-0-image-1-0-0", "Na", [1, 0, 0], ["boundary"], [["boundaryAtoms"]]),
      atom("Cl-1", "Cl", [0, 0, 0], [], []),
      atom(
        "Cl-1-image-0--1-0",
        "Cl",
        [0, -1, 0],
        ["bonded"],
        [["oneHopBondedAtoms"]],
      ),
    ],
    bonds: [
      bond(0, 2, [], []),
      bond(0, 3, ["oneHopBondedAtoms"], [["oneHopBondedAtoms"]]),
    ],
    bondFamilies: [
      { key: "Na|Cl", elements: ["Na", "Cl"], minLength: 1, maxLength: 1 },
    ],
    polyhedra: polyhedra
      ? [
          polyhedron([0, 2]),
          polyhedron([0, 3, 2]),
        ]
      : [],
    cell: {
      vectors: [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
    },
    summary: {
      atomCount,
      cell: {
        a: "1.00",
        alpha: "90.00",
        b: "1.00",
        beta: "90.00",
        c: "1.00",
        gamma: "90.00",
      },
      formula: "NaCl",
      symmetry: {
        available: false,
        crystalSystem: null,
        latticeSystem: null,
        pointGroup: null,
        pointGroupSchoenflies: null,
        spaceGroup: null,
        spaceGroupNumber: null,
      },
    },
  };
}

function largeSodiumScene(atomCount: number): SceneSpec {
  const baseScene = sceneWithPeriodicImages({ atomCount, polyhedra: false });

  return {
    ...baseScene,
    atoms: Array.from({ length: atomCount }, (_, atomIndex) =>
      atom(`Na-${atomIndex}`, "Na", [0, 0, 0], [], []),
    ),
    bonds: [],
    polyhedra: [],
    summary: {
      ...baseScene.summary,
      atomCount,
      formula: `Na${atomCount}`,
    },
  };
}

function polyhedron(hullAtomIndices: number[]): SceneSpec["polyhedra"][number] {
  return {
    centerAtomIndex: hullAtomIndices[0]!,
    hullAtomIndices,
    faces: hullAtomIndices.length >= 3 ? [[0, 1, 2]] : [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}

function bond(
  startAtomIndex: number,
  endAtomIndex: number,
  visibilityDependencies: SceneSpec["bonds"][number]["visibilityDependencies"],
  visibilityDependencyGroups: SceneSpec["bonds"][number]["visibilityDependencyGroups"],
): SceneSpec["bonds"][number] {
  return {
    id: `bond:${startAtomIndex}:${endAtomIndex}`,
    relationId: `relation:${startAtomIndex}:${endAtomIndex}`,
    familyKey: "Na|Cl",
    startSiteId: "Na-0",
    startImageOffset: [0, 0, 0],
    endSiteId: "Cl-1",
    endImageOffset: [0, 0, 0],
    relativeImageOffset: [0, 0, 0],
    length: 1,
    startAtomIndex,
    endAtomIndex,
    visibilityDependencies,
    visibilityDependencyGroups,
  };
}

function atom(
  id: string,
  element: string,
  imageOffset: [number, number, number],
  imageReasons: AtomSpec["imageReasons"],
  visibilityDependencyGroups: AtomSpec["visibilityDependencyGroups"],
): AtomSpec {
  const isPeriodicImage = imageOffset.some((value) => value !== 0);
  const visibilityDependencies = Array.from(new Set(visibilityDependencyGroups.flat()));
  const siteId = id.split("-image-", 1)[0]!;
  const siteIndex = Number(siteId.match(/-(\d+)/)?.[1] ?? 0);
  return {
    element,
    fractionalPosition: imageOffset,
    id,
    imageOffset,
    isPeriodicImage,
    imageReasons,
    visibilityDependencies,
    visibilityDependencyGroups,
    position: imageOffset,
    siteId,
    siteIndex,
  };
}
