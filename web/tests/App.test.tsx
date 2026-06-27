import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { Quaternion, Vector3 } from "three";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import type {
  CreateFigureExportOptions,
  FigureExportFile,
} from "../src/app/exportFigure";

interface FetchCall {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

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
      <div
        data-render-backend={typeof _gl === "function" ? "webgpu" : "webgl"}
        {...props}
      />
    ),
    useFrame: () => {},
    useThree: () => ({
      camera: new MockCamera(),
      gl: {
        domElement: document.createElement("canvas"),
      },
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
  OrientationGizmo: ({ onAxisClick }: { onAxisClick?: (axis: "a" | "b" | "c") => void }) => (
    <div data-testid="mock-orientation-gizmo">
      <button type="button" onClick={() => onAxisClick?.("a")}>
        gizmo a
      </button>
      <button type="button" onClick={() => onAxisClick?.("c")}>
        gizmo c
      </button>
    </div>
  ),
}));

let exportRequests: CreateFigureExportOptions[] = [];
let exportDownloads: { blob: Blob; fileName: string }[] = [];
let exportFailure: Error | null = null;

async function createFigureExportFileMock(
  options: CreateFigureExportOptions,
): Promise<FigureExportFile> {
  exportRequests.push(options);
  if (exportFailure) {
    throw exportFailure;
  }

  return {
    blob: new Blob([options.settings.format], {
      type: options.settings.format === "pdf" ? "application/pdf" : "image/png",
    }),
    fileName: `NaCl.${options.settings.format}`,
    format: options.settings.format,
  };
}

function downloadBlobMock(blob: Blob, fileName: string) {
  exportDownloads.push({ blob, fileName });
}

mock.module("../src/app/exportFigure", () => ({
  createFigureExportFile: createFigureExportFileMock,
  downloadBlob: downloadBlobMock,
}));

const { App } = await import("../src/app/App");
let fetchCalls: FetchCall[] = [];
let fetchResponses: Response[] = [];

beforeEach(() => {
  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: undefined,
  });
  fetchCalls = [];
  fetchResponses = [];
  exportDownloads = [];
  exportFailure = null;
  exportRequests = [];
  globalThis.fetch = (async (input, init) => {
    fetchCalls.push({ input, init });
    const response = fetchResponses.shift();
    if (!response) {
      throw new Error("Unexpected fetch request.");
    }

    return response;
  }) as typeof fetch;
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
    expect(within(structureCard).getByText("Symmetry unavailable").isConnected).toBe(true);

    const legend = screen.getByRole("navigation", { name: "Element legend" });
    expect(within(legend).getByText("Na").isConnected).toBe(true);
    expect(within(legend).getByText("Cl").isConnected).toBe(true);
    expect(screen.getByRole("complementary", { name: "View controls" }).isConnected).toBe(true);
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    const displayTab = within(commonControls).getByRole("tab", { name: "Display" });
    expect(displayTab.isConnected).toBe(true);
    expect(displayTab.className).toContain("rounded-lg");
    expect(within(commonControls).queryByRole("heading", { name: "Display" })).toBeNull();
    expect(within(commonControls).getByText("Periodic images").isConnected).toBe(true);
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

  test("shows VESTA as the automatic default for uploaded structures", async () => {
    const user = userEvent.setup();
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages({ atomCount: 5 })));

    render(<App />);

    await user.upload(getFileInput(), structureFile("large.cif"));

    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    expect(fetchCalls[0]?.input).toBe("/api/structure-preview");

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    expect(screen.getByRole("combobox", { name: "Bond algorithm" }).textContent).toContain(
      "VESTA",
    );
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
    expect(spinner.className).toContain("size-3");
    expect(spinner.className).toContain("motion-safe:animate-spin");

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
    expect(inspectorButton.className).toContain("border-foreground/10");
    expect(inspectorButton.className).not.toContain("tool-icon-button-active");

    await user.click(inspectorButton);

    const inspector = screen.getByRole("complementary", { name: "Sidebar" });
    expect(inspector.isConnected).toBe(true);
    expect(within(inspector).queryByRole("heading", { name: "Inspector" })).toBeNull();
    const advancedTab = within(inspector).getByRole("tab", { name: "Advanced" });
    expect(advancedTab.isConnected).toBe(true);
    expect(advancedTab.className).toContain("h-8");
    expect(advancedTab.className).toContain("text-[0.875rem]");
    expect(advancedTab.className).toContain("font-semibold");
    expect(inspector.querySelector("[data-slot='separator']")).toBeNull();
    expect(within(inspector).getByText("Renderer").className).toContain("text-xs");
    expect(within(inspector).getByText("Interaction").className).toContain("text-xs");
    expect(within(inspector).getByText("Bonds").className).toContain("text-xs");
    expect(legend.getAttribute("style")).toContain("calc(50% + 10px)");
    expect(inspectorButton.getAttribute("aria-expanded")).toBe("true");
    expect(inspectorButton.className).toContain("tool-icon-button-active");

    const rendererSelect = within(inspector).getByRole("combobox", { name: "Renderer" });
    expect(rendererSelect.textContent).toContain("WebGL");
    expect(screen.getByTestId("lattice-canvas").getAttribute("data-render-backend")).toBe(
      "webgl",
    );
    await user.click(rendererSelect);
    expect((await screen.findByRole("option", { name: "WebGPU" })).getAttribute("aria-disabled"))
      .toBe("true");
    await user.keyboard("{Escape}");

    const interactionSelect = within(inspector).getByRole("combobox", { name: "Interaction" });
    expect(interactionSelect.textContent).toContain("Trackball");

    await user.click(interactionSelect);
    await user.click(await screen.findByRole("option", { name: "Orbit" }));

    expect(within(inspector).getByRole("combobox", { name: "Interaction" }).textContent).toContain(
      "Orbit",
    );

    await user.click(inspectorButton);

    expect(screen.getByRole("button", { name: "Sidebar" }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  test("switches to WebGPU for preview without reuploading while export stays renderer-agnostic", async () => {
    const user = userEvent.setup();
    const requestAdapter = mock(async () => ({}));
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: { requestAdapter },
    });

    await renderLoadedStructure(user);
    expect(fetchCalls).toHaveLength(1);
    expect(screen.getByTestId("lattice-canvas").getAttribute("data-render-backend")).toBe(
      "webgl",
    );

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    const inspector = screen.getByRole("complementary", { name: "Sidebar" });
    await waitFor(() => expect(requestAdapter).toHaveBeenCalled());

    const rendererSelect = within(inspector).getByRole("combobox", { name: "Renderer" });
    await user.click(rendererSelect);
    const webGpuOption = await screen.findByRole("option", { name: "WebGPU" });
    expect(webGpuOption.getAttribute("aria-disabled")).not.toBe("true");
    await user.click(webGpuOption);

    expect(fetchCalls).toHaveLength(1);
    expect(within(inspector).getByRole("combobox", { name: "Renderer" }).textContent).toContain(
      "WebGPU",
    );
    expect(screen.getByTestId("lattice-canvas").getAttribute("data-render-backend")).toBe(
      "webgpu",
    );

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Export" }));
    await user.click(within(commonControls).getByRole("button", { name: "Export PNG" }));
    await waitFor(() => expect(exportRequests).toHaveLength(1));

    expect("renderBackend" in exportRequests[0]!).toBe(false);
    expect(exportDownloads[0]?.fileName).toBe("NaCl.png");
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
    expect(polyhedraOpacityInput.value).toBe("50");
    expect(polyhedraOpacitySlider.max).toBe("100");

    await user.clear(atomsOpacityInput);
    await user.type(atomsOpacityInput, "98{Enter}");

    expect(atomsOpacityInput.value).toBe("98");
    expect(atomsOpacitySlider.value).toBe("98");

    fireEvent.change(atomsOpacitySlider, { target: { value: "99" } });

    expect(atomsOpacityInput.value).toBe("100");
    expect(atomsOpacitySlider.value).toBe("100");

    await user.click(resetOpacityButton);

    expect(resetOpacityButton.className).toContain("tool-icon-button-reset-feedback");
    expect(polyhedraOpacityInput.value).toBe("50");

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
    expect(polyhedraOpacityInput.value).toBe("50");
    expect(resetOpacityButton.className).toContain("tool-icon-button-reset-feedback");
    await waitFor(() =>
      expect(resetOpacityButton.className).not.toContain("tool-icon-button-reset-feedback"),
    );
    expect(resetOpacityButton.disabled).toBe(false);
  });

  test("lets style controls scale sizes and choose bond color mode", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));

    expect(within(commonControls).getByText("Radius").isConnected).toBe(true);
    const atomRadiusModelSelect = within(commonControls).getByRole("combobox", {
      name: "Atom radius model",
    });
    const atomRadiusSlider = within(commonControls).getByRole("slider", {
      name: "Atom scale",
    }) as HTMLInputElement;
    const atomRadiusInput = within(commonControls).getByRole("textbox", {
      name: "Atom scale value",
    }) as HTMLInputElement;
    const bondThicknessSlider = within(commonControls).getByRole("slider", {
      name: "Bond scale",
    }) as HTMLInputElement;
    const bondThicknessInput = within(commonControls).getByRole("textbox", {
      name: "Bond scale value",
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
      name: "Fog",
    });
    const fogStartSlider = within(commonControls).getByRole("slider", {
      name: "Fog start",
    }) as HTMLInputElement;
    const fogStartInput = within(commonControls).getByRole("textbox", {
      name: "Fog start value",
    }) as HTMLInputElement;
    const fogStrengthSlider = within(commonControls).getByRole("slider", {
      name: "Fog strength",
    }) as HTMLInputElement;
    const fogStrengthInput = within(commonControls).getByRole("textbox", {
      name: "Fog strength value",
    }) as HTMLInputElement;
    const resetFogButton = within(commonControls).getByRole("button", {
      name: "Reset fog",
    }) as HTMLButtonElement;

    expect(atomRadiusSlider.min).toBe("0");
    expect(atomRadiusSlider.max).toBe("200");
    expect(atomRadiusSlider.value).toBe("100");
    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusInput.parentElement?.textContent).toContain("%");
    expect(bondThicknessSlider.value).toBe("100");
    expect(bondThicknessInput.value).toBe("100");
    expect(commonControls.querySelectorAll(".opacity-slider-snap-marker")).toHaveLength(2);
    expect(atomRadiusModelSelect.textContent).toContain("Uniform");
    expect(materialSelect.textContent).toContain("Classic Matte");
    expect(bondStyleSelect.textContent).toContain("By atom");
    expect(colorSchemeSelect.textContent).toContain("VESTA Soft");
    expect(fogSwitch.getAttribute("aria-checked")).toBe("false");
    expect(fogStartSlider.value).toBe("50");
    expect(fogStartInput.value).toBe("50");
    expect(fogStrengthSlider.value).toBe("50");
    expect(fogStrengthInput.value).toBe("50");
    expect(fogStartSlider.disabled).toBe(true);
    expect(fogStartInput.disabled).toBe(true);
    expect(fogStrengthSlider.disabled).toBe(true);
    expect(fogStrengthInput.disabled).toBe(true);

    await user.click(atomRadiusModelSelect);
    expect(await screen.findByText("Atom radius model")).toBeTruthy();
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));

    expect(fetchCalls).toHaveLength(1);
    expect(atomRadiusModelSelect.textContent).toContain("vdW");

    await user.click(bondStyleSelect);
    await user.click(await screen.findByRole("option", { name: "Uniform" }));

    expect(bondStyleSelect.textContent).toContain("Uniform");

    await user.click(bondStyleSelect);
    await user.click(await screen.findByRole("option", { name: "Uniform (2D)" }));

    expect(bondStyleSelect.textContent).toContain("Uniform (2D)");
    expect(fetchCalls).toHaveLength(1);

    await user.click(colorSchemeSelect);
    await user.click(await screen.findByRole("option", { name: "Jmol" }));

    expect(colorSchemeSelect.textContent).toContain("Jmol");
    expect(fetchCalls).toHaveLength(1);

    await user.click(fogSwitch);
    expect(fogSwitch.getAttribute("aria-checked")).toBe("true");
    expect(fogStartSlider.disabled).toBe(false);
    expect(fogStartInput.disabled).toBe(false);
    expect(fogStrengthSlider.disabled).toBe(false);
    expect(fogStrengthInput.disabled).toBe(false);

    fireEvent.change(fogStartSlider, { target: { value: "18" } });
    fireEvent.change(fogStrengthSlider, { target: { value: "72" } });

    expect(fogStartInput.value).toBe("18");
    expect(fogStartSlider.value).toBe("18");
    expect(fogStrengthInput.value).toBe("72");
    expect(fogStrengthSlider.value).toBe("72");

    fireEvent.change(atomRadiusSlider, { target: { value: "200" } });

    expect(atomRadiusInput.value).toBe("200");
    expect(atomRadiusSlider.value).toBe("200");

    fireEvent.change(atomRadiusSlider, { target: { value: "104" } });

    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusSlider.value).toBe("100");

    await user.clear(bondThicknessInput);
    await user.type(bondThicknessInput, "240{Enter}");

    expect(bondThicknessInput.value).toBe("200");
    expect(bondThicknessSlider.value).toBe("200");

    await user.clear(bondThicknessInput);
    await user.type(bondThicknessInput, "240{Enter}");

    expect(bondThicknessInput.value).toBe("200");
    expect(bondThicknessSlider.value).toBe("200");

    await user.clear(atomRadiusInput);
    await user.type(atomRadiusInput, "50{Enter}");

    expect(atomRadiusInput.value).toBe("50");
    expect(atomRadiusSlider.value).toBe("50");

    await user.clear(atomRadiusInput);
    await user.type(atomRadiusInput, "-10{Enter}");

    expect(atomRadiusInput.value).toBe("50");
    expect(atomRadiusSlider.value).toBe("50");

    const resetScaleButton = within(commonControls).getByRole("button", {
      name: "Reset scale",
    }) as HTMLButtonElement;
    await user.click(resetScaleButton);

    expect(resetScaleButton.className).toContain("tool-icon-button-reset-feedback");
    expect(atomRadiusInput.value).toBe("100");
    expect(atomRadiusSlider.value).toBe("100");
    expect(bondThicknessInput.value).toBe("100");
    expect(bondThicknessSlider.value).toBe("100");
    expect(atomRadiusModelSelect.textContent).toContain("vdW");
    expect(bondStyleSelect.textContent).toContain("Uniform (2D)");
    expect(colorSchemeSelect.textContent).toContain("Jmol");
    expect(fogSwitch.getAttribute("aria-checked")).toBe("true");
    expect(fogStartInput.value).toBe("18");
    expect(fogStrengthInput.value).toBe("72");

    await user.click(resetFogButton);

    expect(resetFogButton.className).toContain("tool-icon-button-reset-feedback");
    expect(fogSwitch.getAttribute("aria-checked")).toBe("true");
    expect(fogStartInput.value).toBe("50");
    expect(fogStartSlider.value).toBe("50");
    expect(fogStrengthInput.value).toBe("50");
    expect(fogStrengthSlider.value).toBe("50");
  });

  test("selects material presets without re-uploading or changing independent controls", async () => {
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
    await user.click(await screen.findByRole("option", { name: "Uniform" }));
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
    expect(nextBondStyleSelect.textContent).toContain("Uniform");
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
      name: "High mesh quality",
    });
    const xHighMeshQuality = within(commonControls).getByRole("tab", {
      name: "XHigh mesh quality",
    });
    const resetQualityButton = within(commonControls).getByRole("button", {
      name: "Reset quality",
    }) as HTMLButtonElement;
    const formatSelect = within(commonControls).getByRole("combobox", {
      name: "Format",
    });
    const exportPngButton = within(commonControls).getByRole("button", {
      name: "Export PNG",
    });

    expect(widthInput.value).toBe("2000");
    expect(heightInput.value).toBe("2000");
    expect(twoXSupersampling.getAttribute("aria-selected")).toBe("true");
    expect(highMeshQuality.getAttribute("aria-selected")).toBe("true");
    expect(formatSelect.textContent).toContain("PNG");
    expect(exportPngButton.isConnected).toBe(true);

    await user.click(exportPngButton);
    await waitFor(() => expect(exportRequests).toHaveLength(1));

    expect("renderBackend" in exportRequests[0]!).toBe(false);
    expect(exportRequests[0]?.settings.format).toBe("png");
    expect(exportRequests[0]?.settings.supersampling).toBe(2);
    expect(exportDownloads[0]?.fileName).toBe("NaCl.png");

    await user.clear(widthInput);
    await user.type(widthInput, "3000{Enter}");

    expect(widthInput.value).toBe("3000");
    expect(heightInput.value).toBe("2000");

    await user.click(
      within(commonControls).getByRole("button", { name: "Lock aspect ratio" }),
    );
    await user.clear(heightInput);
    await user.type(heightInput, "1000{Enter}");

    expect(widthInput.value).toBe("1333");
    expect(heightInput.value).toBe("1000");

    await user.click(oneXSupersampling);
    await user.click(xHighMeshQuality);
    await user.click(formatSelect);
    await user.click(await screen.findByRole("option", { name: "PDF" }));
    expect(formatSelect.textContent).toContain("PDF");
    expect(oneXSupersampling.getAttribute("aria-selected")).toBe("true");
    expect(xHighMeshQuality.getAttribute("aria-selected")).toBe("true");

    await user.click(resetQualityButton);

    expect(resetQualityButton.className).toContain("tool-icon-button-reset-feedback");
    expect(widthInput.value).toBe("2000");
    expect(heightInput.value).toBe("2000");
    expect(twoXSupersampling.getAttribute("aria-selected")).toBe("true");
    expect(highMeshQuality.getAttribute("aria-selected")).toBe("true");
    expect(formatSelect.textContent).toContain("PDF");
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
      format: "pdf",
      height: 2000,
      meshQuality: "high",
      supersampling: 2,
      width: 2000,
    });
    expect(exportDownloads[1]?.fileName).toBe("NaCl.pdf");
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
    expect(exportDownloads).toHaveLength(0);
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
    expect(tabsList?.className).toContain("!h-8");
    expect(tabsList?.className).toContain("transition-[grid-template-columns]");
    expect(tabsList?.style.gridTemplateColumns).toContain("1.65fr");
    expect(activeIndicator?.className).toContain("transition-[transform,width]");
    expect(
      within(commonControls)
        .getAllByRole("tab")
        .map((tab) => tab.getAttribute("aria-label")),
    ).toEqual(["Display", "Camera", "Style", "Export"]);
    const displayTab = within(commonControls).getByRole("tab", { name: "Display" });
    const cameraTab = within(commonControls).getByRole("tab", { name: "Camera" });
    expect(displayTab.className).toContain("!bg-transparent");
    expect(displayTab.className).toContain("!h-6");
    expect(displayTab.style.flexGrow).toBe("");
    expect(cameraTab.style.flexGrow).toBe("");
    expect(cameraTab.className).not.toContain("transition-[flex-grow");
    expect(
      cameraTab.querySelector("[data-slot='common-controls-tab-label']")?.className,
    ).toContain("max-w-0");

    await user.click(cameraTab);

    expect(content?.className).not.toContain("h-[");
    expect(within(commonControls).getByRole("tab", { name: "Camera" }).className).toContain(
      "!bg-transparent",
    );
    expect(within(commonControls).getByRole("tab", { name: "Camera" }).textContent).toContain(
      "Camera",
    );
    expect(tabsList?.style.gridTemplateColumns).toContain("1.65fr");
    expect(
      within(commonControls)
        .getByRole("tab", { name: "Camera" })
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
  });

  test("shows crystal camera controls with fixed manual vector editing", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Camera" }));

    expect(within(commonControls).queryByText("No controls")).toBeNull();
    expect(within(commonControls).getByText("Fixed-axis rotation").isConnected).toBe(true);
    expect(within(commonControls).getByText("Primary direction").isConnected).toBe(true);
    expect(
      within(commonControls)
        .getByRole("tablist", { name: "Primary direction" })
        .getAttribute("aria-orientation"),
    ).toBe("vertical");
    expect(
      within(commonControls).getByRole("tab", { name: "Outward" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuenow"))
      .toBe("0");
    expect(within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuemin"))
      .toBe("0");
    expect(within(commonControls).getByRole("slider", { name: "Roll" }).getAttribute("aria-valuemax"))
      .toBe("360");
    const initialRollInput = within(commonControls).getByRole("textbox", {
      name: "Roll value",
    }) as HTMLInputElement;
    expect(initialRollInput).toHaveProperty("value", "0");
    expect(initialRollInput.style.width).toBe("1ch");
    expect(initialRollInput.nextElementSibling?.textContent).toBe("°");
    const rollSlider = within(commonControls).getByRole("slider", { name: "Roll" });
    expect(rollSlider.className).not.toContain("focus-visible:ring-[3px]");
    expect(
      rollSlider.querySelector("[data-slot='angle-slider-thumb']")?.className,
    ).toContain("group-focus-visible:ring-[2px]");

    expect(within(commonControls).getByText("Manual input").isConnected).toBe(true);
    expect(
      within(commonControls).getByRole("button", { name: "Manual input rules" }).isConnected,
    ).toBe(true);
    expect(
      within(commonControls)
        .getAllByRole("textbox")
        .map((textbox) => textbox.getAttribute("aria-label")),
    ).toEqual([
      "Roll value",
      "Outward a",
      "Outward b",
      "Outward c",
      "Upward a*",
      "Upward b*",
      "Upward c*",
    ]);
    expect(
      within(commonControls).getByRole("textbox", { name: "Outward a" }),
    ).toHaveProperty("value", "0.00");
    expect(
      within(commonControls).getByRole("textbox", { name: "Outward c" }),
    ).toHaveProperty("value", "1.00");
    expect(
      within(commonControls).getByRole("textbox", { name: "Upward b*" }),
    ).toHaveProperty("value", "1.00");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Outward a" })
        .closest('[data-camera-vector-row="outward"]')
        ?.getAttribute("data-primary-axis"),
    ).toBe("true");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Upward a*" })
        .closest('[data-camera-vector-row="upward"]')
        ?.hasAttribute("data-primary-axis"),
    ).toBe(false);
  });

  test("formats roll controls as zero to 360 degrees", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Camera" }));

    const rollInput = within(commonControls).getByRole("textbox", {
      name: "Roll value",
    }) as HTMLInputElement;
    await user.click(rollInput);

    expect(rollInput.value).toBe("");
    expect(rollInput.style.width).toBe("1ch");

    await user.tab();

    expect(rollInput.value).toBe("0");

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
    await user.click(within(commonControls).getByRole("tab", { name: "Camera" }));

    const outwardA = within(commonControls).getByRole("textbox", {
      name: "Outward a",
    }) as HTMLInputElement;
    const outwardC = within(commonControls).getByRole("textbox", {
      name: "Outward c",
    }) as HTMLInputElement;

    await user.click(outwardA);
    expect(outwardA.value).toBe("");

    await user.tab();
    expect(outwardA.value).toBe("0.00");

    await user.clear(outwardA);
    await user.type(outwardA, "1");

    expect(outwardA.value).toBe("1");
    expect(outwardC.value).toBe("1.00");

    const resetDraftButton = within(commonControls).getByRole("button", {
      name: "Reset vectors draft",
    });
    await user.click(resetDraftButton);

    expect(outwardA.value).toBe("0.00");
    expect(outwardC.value).toBe("1.00");
    expect(resetDraftButton.className).toContain("tool-icon-button-reset-feedback");

    await user.clear(outwardA);
    await user.type(outwardA, "1");
    const applyVectorsButton = within(commonControls).getByRole("button", {
      name: "Apply vectors",
    });
    await user.click(applyVectorsButton);

    expect(outwardA.value).toBe("1.00");
    expect(outwardC.value).toBe("1.00");
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
    await user.click(within(commonControls).getByRole("tab", { name: "Camera" }));
    await user.click(within(commonControls).getByRole("tab", { name: "Upward" }));

    expect(
      within(commonControls).getByRole("tab", { name: "Upward" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      within(commonControls)
        .getAllByRole("textbox")
        .map((textbox) => textbox.getAttribute("aria-label")),
    ).toEqual([
      "Roll value",
      "Outward a*",
      "Outward b*",
      "Outward c*",
      "Upward a",
      "Upward b",
      "Upward c",
    ]);
    expect(within(commonControls).getByRole("textbox", { name: "Upward c" }).isConnected)
      .toBe(true);
    expect(within(commonControls).getByRole("textbox", { name: "Outward b*" }).isConnected)
      .toBe(true);
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Upward c" })
        .closest('[data-camera-vector-row="upward"]')
        ?.getAttribute("data-primary-axis"),
    ).toBe("true");
    expect(
      within(commonControls)
        .getByRole("textbox", { name: "Outward b*" })
        .closest('[data-camera-vector-row="outward"]')
        ?.hasAttribute("data-primary-axis"),
    ).toBe(false);
    expect(within(commonControls).queryByRole("textbox", { name: "Outward c" })).toBeNull();
  });

  test("routes gizmo clicks through the selected camera primary direction", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    await user.click(screen.getByRole("button", { name: "gizmo a" }));
    const commonControls = screen.getByRole("complementary", { name: "Common controls" });
    await user.click(within(commonControls).getByRole("tab", { name: "Camera" }));

    expect(
      within(commonControls).getByRole("textbox", { name: "Outward a" }),
    ).toHaveProperty("value", "1.00");
    expect(
      within(commonControls).getByRole("textbox", { name: "Outward c" }),
    ).toHaveProperty("value", "0.00");

    await user.click(within(commonControls).getByRole("tab", { name: "Upward" }));
    await user.click(screen.getByRole("button", { name: "gizmo c" }));

    expect(
      within(commonControls).getByRole("textbox", { name: "Upward c" }),
    ).toHaveProperty("value", "1.00");
  });

  test("starts with collapsed extended structure details and toggles them from the card", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);

    const structureCard = screen.getByRole("complementary", { name: "Current structure" });
    const detailsRegion = structureCard.querySelector(
      "[data-slot='structure-summary-details']",
    ) as HTMLElement | null;
    const expandButton = within(structureCard).getByRole("button", {
      name: "Expand details",
    });

    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(detailsRegion?.className).toContain("transition-[height]");
    expect(detailsRegion?.style.height).toBe("0px");

    await user.click(expandButton);

    const collapseButton = within(structureCard).getByRole("button", {
      name: "Collapse details",
    });
    expect(collapseButton.getAttribute("aria-expanded")).toBe("true");
    expect(detailsRegion?.style.height).not.toBe("0px");

    await user.click(collapseButton);

    expect(
      within(structureCard)
        .getByRole("button", { name: "Expand details" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(detailsRegion?.style.height).toBe("0px");
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
    await user.click(within(commonControls).getByRole("tab", { name: "Style" }));
    const atomRadiusModelSelect = within(commonControls).getByRole("combobox", {
      name: "Atom radius model",
    });
    await user.click(atomRadiusModelSelect);
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));

    expect(fetchCalls).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));

    await user.click(screen.getByRole("combobox", { name: "Bond algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[1]?.input).toBe(
      "/api/structure-preview?bondAlgorithm=minimum-distance",
    );
    expect(fetchCalls[1]?.init?.body).toBeInstanceOf(File);
    expect(polyhedraCheckbox.getAttribute("aria-checked")).toBe("true");

    queueFetchResponse(jsonResponse(sceneWithPeriodicImages()));
    await user.click(screen.getByRole("combobox", { name: "Bond algorithm" }));
    await user.click(await screen.findByRole("option", { name: "VESTA" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(3));
    expect(fetchCalls[2]?.input).toBe("/api/structure-preview");
    expect(fetchCalls[2]?.init?.body).toBeInstanceOf(File);
  });

  test("keeps the loaded scene and places backend alerts beside the view rail", async () => {
    const user = userEvent.setup();

    await renderLoadedStructure(user);
    await user.click(screen.getByRole("button", { name: "Sidebar" }));
    await user.click(screen.getByRole("combobox", { name: "Bond algorithm" }));
    await user.click(await screen.findByRole("option", { name: "Minimum distance" }));

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Python backend is unavailable");
    expect(alert.className).toContain("top-4");
    expect(alert.className).toContain("left-[386px]");
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
    expect(screen.getByRole("combobox", { name: "Bond algorithm" }).textContent).toContain(
      "VESTA",
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
    await user.clear(zoomInput);
    await user.type(zoomInput, "250{Enter}");

    expect((zoomInput as HTMLInputElement).value).toBe("250");

    await user.click(screen.getByRole("button", { name: "Reset view" }));

    expect((zoomInput as HTMLInputElement).value).toBe("100");
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
    expect(alert.className).toContain("border-amber-200");
    expect(alert.className).toContain("bg-amber-50");
    expect(alert.className).toContain("text-amber-900");
    expect(alert.className).toContain("rounded-xl");
    expect(alert.className).toContain("shadow-sm");
    expect(alert.className).toContain("shadow-foreground/5");
    expect(alert.className).toContain("top-4");
    expect(alert.className).toContain("left-[328px]");
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
    expect(alert.className).toContain("top-4");
    expect(alert.className).toContain("left-[328px]");
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
      [new Uint8Array(10 * 1024 * 1024 + 1)],
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
            message: "Bond analysis with VESTA failed: neighbor graph unavailable",
          },
        ],
      }),
    );

    render(<App />);
    await user.upload(getFileInput(), structureFile());

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Bond analysis with VESTA failed",
    );
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("border-amber-200");
    expect(alert.className).toContain("bg-amber-50");
    expect(alert.querySelector("svg")?.getAttribute("class")).toContain(
      "lucide-triangle-alert",
    );
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);

    await user.click(screen.getByRole("button", { name: "Dismiss alert" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("lattice-canvas").isConnected).toBe(true);
  });
});

async function renderLoadedStructure(user: UserEvent, scene = sceneWithPeriodicImages()) {
  queueFetchResponse(jsonResponse(scene));

  render(<App />);
  await user.upload(getFileInput(), structureFile());
  await screen.findByTestId("lattice-canvas");
}

function queueFetchResponse(response: Response) {
  fetchResponses.push(response);
}

function getFileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Could not find structure file input.");
  }

  return input;
}

function jsonResponse(body: unknown): Response {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    ok: true,
  } as Response;
}

function errorResponse(message: string): Response {
  return {
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => ({ detail: { message } }),
    ok: false,
    status: 422,
  } as Response;
}

function htmlResponse(status: number): Response {
  return {
    headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
    ok: status >= 200 && status < 300,
    status,
  } as unknown as Response;
}

function structureFile(name = "NaCl.cif"): File {
  return new File(["data_NaCl"], name, { type: "chemical/x-cif" });
}

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
      {
        id: "bond-canonical",
        startAtomId: "Na-0",
        endAtomId: "Cl-1",
        visibilityDependencies: [],
        visibilityDependencyGroups: [],
      },
      {
        id: "bond-one-hop",
        startAtomId: "Na-0",
        endAtomId: "Cl-1-image-0--1-0",
        visibilityDependencies: ["oneHopBondedAtoms"],
        visibilityDependencyGroups: [["oneHopBondedAtoms"]],
      },
    ],
    polyhedra: polyhedra
      ? [
          polyhedron("polyhedron-canonical", ["Na-0", "Cl-1"]),
          polyhedron("polyhedron-one-hop", ["Na-0", "Cl-1-image-0--1-0", "Cl-1"]),
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

function polyhedron(id: string, hullAtomIds: string[]): SceneSpec["polyhedra"][number] {
  return {
    id,
    centerAtomId: hullAtomIds[0]!,
    hullAtomIds,
    faces: hullAtomIds.length >= 3 ? [[0, 1, 2]] : [],
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
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
