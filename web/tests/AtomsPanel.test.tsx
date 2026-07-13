import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "bun:test";
import { useEffect, useState } from "react";

import type { AtomSpec, SceneSpec } from "../src/api/scene";
import { ColorPickerRegistryProvider } from "../src/app/colorPickerRegistry";
import { AtomsPanel } from "../src/app/inspector/AtomsPanel";
import {
  atomHasExplicitHiddenOverride,
  createDefaultStyle,
  setAtomOverrideProperty,
  setElementOverrideProperty,
  type StyleState,
} from "../src/model";

describe("AtomsPanel", () => {
  test("keeps global radius model and scale above the object controls", async () => {
    const user = userEvent.setup();
    render(
      <AtomsPanelHarness initialSelectedAtomId={null} initialStyle={createDefaultStyle()} />,
    );

    const controls = document.querySelector<HTMLElement>('[data-slot="atom-radius-controls"]');
    const separator = document.querySelector<HTMLElement>(
      '[data-slot="atom-radius-controls-separator"]',
    );
    const columnHeader = document.querySelector<HTMLElement>('[data-slot="atom-column-header"]');
    expect(controls).not.toBeNull();
    expect(controls?.nextElementSibling).toBe(separator);
    expect(separator?.nextElementSibling).toBe(columnHeader);
    expect(separator?.className).toContain("py-4");

    const modelSelect = screen.getByRole("combobox", { name: "Radius model" });
    const scaleSlider = screen.getByRole("slider", { name: "Atom scale" }) as HTMLInputElement;
    const scaleInput = screen.getByRole("textbox", {
      name: "Atom scale value",
    }) as HTMLInputElement;
    expect(modelSelect.textContent).toContain("Uniform");
    expect(scaleSlider.value).toBe("40");
    expect(scaleInput.value).toBe("40");

    await user.click(modelSelect);
    await user.click(await screen.findByRole("option", { name: "Van der Waals" }));
    expect(modelSelect.textContent).toContain("Van der Waals");

    fireEvent.change(scaleSlider, { target: { value: "50" } });
    expect(scaleSlider.value).toBe("50");
    expect(scaleInput.value).toBe("50");

    await user.click(modelSelect);
    await user.click(await screen.findByRole("option", { name: "Custom" }));
    expect(scaleSlider.disabled).toBe(true);
    expect(scaleInput.disabled).toBe(true);
  });

  test("shows only the selected atom workspace and moves a hidden selection to recovery", async () => {
    const user = userEvent.setup();
    render(
      <AtomsPanelHarness
        initialSelectedAtomId="Na-0-image-1-0-0"
        initialStyle={createDefaultStyle()}
      />,
    );

    const sodiumGroup = screen.getByRole("region", { name: "Na atoms" });
    expect(screen.getAllByText("R (Å)")).toHaveLength(1);
    expect(screen.getByText("Opacity").isConnected).toBe(true);
    const columnHeader = document.querySelector<HTMLElement>('[data-slot="atom-column-header"]');
    expect(columnHeader?.className).toContain(
      "grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_1.5rem]",
    );
    expect(columnHeader?.className).toContain("text-[11px]");
    expect(columnHeader?.className).toContain("font-medium");
    expect(within(columnHeader!).getByText("Atom").isConnected).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-slot="atom-element-groups"]')?.className,
    ).toContain("mt-1");
    expect(
      document.querySelector<HTMLElement>('[data-slot="atom-element-groups"]')?.className,
    ).toContain("gap-2");
    expect(sodiumGroup.className).toContain("rounded-xl");
    expect(sodiumGroup.className).toContain("overflow-hidden");
    expect(sodiumGroup.className).toContain("bg-card");
    expect(sodiumGroup.className).not.toContain("bg-background");
    expect(screen.getByRole("button", { name: "Set Na color" }).className).toContain(
      "cursor-pointer",
    );
    expect(screen.getByRole("button", { name: "Set Na:0 color" }).className).toContain(
      "cursor-pointer",
    );
    const elementCount = within(sodiumGroup).getByText("2");
    expect(elementCount.className).toContain("text-left");
    expect(elementCount.previousElementSibling?.className).toContain("w-5");
    expect(elementCount.parentElement?.className).toContain("gap-0.5");
    const selectedWorkspace = sodiumGroup.querySelector<HTMLElement>(
      '[data-slot="selected-atom-workspace"]',
    );
    expect(selectedWorkspace).not.toBeNull();
    expect(
      selectedWorkspace?.querySelector('[data-slot="selected-atom-content"]')?.className,
    ).toContain("bg-muted/45");
    expect(selectedWorkspace?.className).toContain("duration-[320ms]");
    expect(selectedWorkspace?.className).toContain("grid-rows-[1fr]");
    expect(selectedWorkspace?.querySelector('[data-slot="separator"]')).not.toBeNull();
    expect(
      selectedWorkspace?.querySelector('[data-slot="selected-atom-separator"]'),
    ).toBeNull();
    const atomControlRows = sodiumGroup.querySelectorAll<HTMLElement>(
      '[data-slot="atom-control-row"]',
    );
    expect(atomControlRows).toHaveLength(2);
    for (const row of atomControlRows) {
      expect(row.className).toContain(
        "grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_1.5rem]",
      );
      expect(row.className).toContain("px-2.5");
    }
    expect(atomControlRows[0]?.className).toContain("py-2");
    expect(atomControlRows[1]?.className).toContain("py-1.5");
    expect(screen.queryByText("Selected atom")).toBeNull();
    expect(screen.getByText("Na:0").isConnected).toBe(true);
    expect(screen.queryByText("Na:1")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Na:0 visibility" }));

    await waitFor(() => {
      expect(screen.getByText("Hidden atoms").isConnected).toBe(true);
      expect(selectedWorkspace?.getAttribute("aria-hidden")).toBe("true");
      expect(selectedWorkspace?.className).toContain("grid-rows-[0fr]");
    });
    const hiddenAtomsSection = document.querySelector<HTMLElement>('[data-slot="hidden-atoms"]');
    expect(hiddenAtomsSection).not.toBeNull();
    expect(
      hiddenAtomsSection?.querySelector<HTMLElement>('[data-slot="hidden-atoms-separator"]')
        ?.className,
    ).toContain("py-4");
    expect(within(hiddenAtomsSection!).getByText("Na:0").isConnected).toBe(true);
    expect(screen.queryByText("Na:1")).toBeNull();
    expect(sodiumGroup.querySelector('[data-slot="atom-color-token"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Hidden atoms 1" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(document.querySelectorAll('[data-slot="atom-color-token"]')).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Set Na:0 color" })).toBeNull();

    fireEvent.transitionEnd(selectedWorkspace!, { propertyName: "grid-template-rows" });

    await user.click(
      screen.getByRole("button", {
        name: "Restore Na:0 to element visibility",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Hidden atoms")).toBeNull();
      expect(screen.queryByText("Na:0")).toBeNull();
    });
  });

  test("shows inherited opacity and clears atom overrides when the element value changes", async () => {
    const user = userEvent.setup();
    render(
      <AtomsPanelHarness
        atomOpacity={65}
        initialSelectedAtomId="Na-0-image-1-0-0"
        initialStyle={createDefaultStyle()}
      />,
    );

    const elementOpacityInput = screen.getByRole("textbox", {
      name: "Na opacity",
    }) as HTMLInputElement;
    const elementRadiusInput = screen.getByRole("textbox", {
      name: "Na radius",
    }) as HTMLInputElement;
    const atomOpacityInput = screen.getByRole("textbox", {
      name: "Na:0 opacity",
    }) as HTMLInputElement;
    expect(elementOpacityInput.value).toBe("65");
    expect(atomOpacityInput.value).toBe("65");
    expect(elementRadiusInput.value).toMatch(/^\d+\.\d{2}$/);
    expect(elementRadiusInput.className).toContain("w-[42px]");
    expect(elementRadiusInput.className).not.toContain("w-11");
    expect(elementRadiusInput.className).toContain("justify-self-center");
    expect(elementRadiusInput.className).toContain("text-center");
    expect(elementRadiusInput.className).not.toContain("text-right");
    expect(elementOpacityInput.className).toContain("w-9");
    expect(elementOpacityInput.className).not.toContain("w-11");
    expect(elementOpacityInput.className).toContain("justify-self-center");
    expect(elementOpacityInput.className).toContain("text-center");
    expect(elementOpacityInput.className).not.toContain("text-right");
    expect(atomOpacityInput.className).toContain("text-center");
    expect(elementOpacityInput.parentElement?.textContent).not.toContain("%");

    await user.click(atomOpacityInput);
    await user.type(atomOpacityInput, "35{Enter}");
    expect(atomOpacityInput.value).toBe("35");
    expect(elementOpacityInput.value).toBe("65");

    await user.click(elementOpacityInput);
    await user.type(elementOpacityInput, "80{Enter}");
    expect(elementOpacityInput.value).toBe("80");
    expect(atomOpacityInput.value).toBe("80");
  });

  test("removes only the individual hidden override and continues to respect a hidden element", async () => {
    const user = userEvent.setup();
    const defaultStyle = createDefaultStyle();
    const elementHidden = setElementOverrideProperty(
      defaultStyle.objectStyles,
      "Na",
      "visible",
      false,
    );
    const atomHidden = setAtomOverrideProperty(
      elementHidden,
      "Na-1",
      "visible",
      false,
    );
    render(
      <AtomsPanelHarness
        initialSelectedAtomId={null}
        initialStyle={{ ...defaultStyle, objectStyles: atomHidden }}
      />,
    );

    expect(screen.getByRole("button", { name: "Na visibility" }).getAttribute("aria-pressed")).toBe(
      "false",
    );

    const hiddenAtomsToggle = screen.getByRole("button", { name: "Hidden atoms 1" });
    expect(hiddenAtomsToggle.getAttribute("aria-expanded")).toBe("false");
    expect(hiddenAtomsToggle.querySelector('[data-slot="hidden-atoms-chevron"]')).not.toBeNull();
    expect(hiddenAtomsToggle.className).toContain("size-6");
    expect(hiddenAtomsToggle.className).not.toContain("w-full");
    const hiddenAtomsHeader = document.querySelector<HTMLElement>(
      '[data-slot="hidden-atoms-header"]',
    );
    expect(hiddenAtomsHeader?.className).toContain("min-h-6");
    expect(hiddenAtomsHeader?.className).toContain("gap-1");
    expect(hiddenAtomsHeader?.className).not.toContain("justify-between");
    expect(hiddenAtomsHeader?.className).toContain("px-2.5");
    expect(hiddenAtomsHeader?.firstElementChild?.getAttribute("data-slot")).toBe(
      "hidden-atoms-label",
    );
    expect(hiddenAtomsHeader?.lastElementChild).toBe(hiddenAtomsToggle);
    const hiddenAtomsContent = document.querySelector<HTMLElement>(
      '[data-slot="collapsible-content"]',
    );
    expect(hiddenAtomsContent?.getAttribute("aria-hidden")).toBe("true");
    expect(hiddenAtomsContent?.hasAttribute("inert")).toBe(true);
    expect(hiddenAtomsContent?.className).toContain("grid-rows-[0fr]");
    await user.click(hiddenAtomsToggle);
    expect(screen.getByText("Na:1").isConnected).toBe(true);
    expect(
      document.querySelector<HTMLElement>('[data-slot="hidden-atom-row"]')?.className,
    ).toContain("px-2.5");
    expect(hiddenAtomsContent?.getAttribute("aria-hidden")).toBe("false");
    expect(hiddenAtomsContent?.hasAttribute("inert")).toBe(false);
    expect(hiddenAtomsContent?.className).toContain("grid-rows-[1fr]");

    await user.click(
      screen.getByRole("button", {
        name: "Restore Na:1 to element visibility",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Na:1")).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Na visibility" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  test("does not render a full atom list for a large element group", () => {
    render(
      <AtomsPanelHarness
        initialSelectedAtomId={null}
        initialStyle={createDefaultStyle()}
        scene={sceneWithAtoms(2000)}
      />,
    );

    const sodiumGroup = screen.getByRole("region", { name: "Na atoms" });
    expect(within(sodiumGroup).getByText("2000").isConnected).toBe(true);
    expect(screen.queryAllByText(/^Na:\d+$/)).toHaveLength(0);
  });
});

function AtomsPanelHarness({
  atomOpacity = 100,
  initialSelectedAtomId,
  initialStyle,
  scene = sceneWithAtoms(2),
}: {
  atomOpacity?: number;
  initialSelectedAtomId: string | null;
  initialStyle: StyleState;
  scene?: SceneSpec;
}) {
  const [selectedAtomId, setSelectedAtomId] = useState(initialSelectedAtomId);
  const [style, setStyle] = useState(initialStyle);

  useEffect(() => {
    if (!selectedAtomId) {
      return;
    }
    const selectedAtom = scene.atoms.find((atom) => atom.id === selectedAtomId);
    const canonicalAtom = selectedAtom
      ? scene.atoms.find(
          (atom) => atom.siteId === selectedAtom.siteId && !atom.isPeriodicImage,
        ) ?? selectedAtom
      : null;
    if (canonicalAtom && atomHasExplicitHiddenOverride(style.objectStyles, canonicalAtom)) {
      setSelectedAtomId(null);
    }
  }, [scene.atoms, selectedAtomId, style.objectStyles]);

  return (
    <ColorPickerRegistryProvider>
      <AtomsPanel
        atomLocateRequest={null}
        atomOpacity={atomOpacity}
        atomsVisible
        onAtomLocateRequestHandled={() => {}}
        onElementColorChange={() => {}}
        onStyleChange={setStyle}
        scene={scene}
        selectedAtomId={selectedAtomId}
        style={style}
      />
    </ColorPickerRegistryProvider>
  );
}

function sceneWithAtoms(atomCount: number): SceneSpec {
  const atoms = Array.from({ length: atomCount }, (_, index) => atom(`Na-${index}`, index));
  if (atomCount <= 2) {
    atoms.push({
      ...atom("Na-0-image-1-0-0", 0),
      fractionalPosition: [1, 0, 0],
      imageOffset: [1, 0, 0],
      isPeriodicImage: true,
      siteId: "Na-0",
    });
  }

  return {
    atoms,
    bonds: [],
    bondFamilies: [],
    cell: { vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    polyhedra: [],
    summary: {
      atomCount,
      cell: {
        a: "1.00",
        alpha: "90.0",
        b: "1.00",
        beta: "90.0",
        c: "1.00",
        gamma: "90.0",
      },
      formula: "Na",
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

function atom(id: string, siteIndex: number): AtomSpec {
  return {
    element: "Na",
    fractionalPosition: [siteIndex, 0, 0],
    id,
    imageOffset: [0, 0, 0],
    imageReasons: [],
    isPeriodicImage: false,
    position: [siteIndex, 0, 0],
    siteId: id,
    siteIndex,
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
