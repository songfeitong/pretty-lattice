import { render, screen, waitFor, within } from "@testing-library/react";
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
  test("shows only the selected atom workspace and moves a hidden selection to recovery", async () => {
    const user = userEvent.setup();
    render(
      <AtomsPanelHarness
        initialSelectedAtomId="Na-0-image-1-0-0"
        initialStyle={createDefaultStyle()}
      />,
    );

    const sodiumGroup = screen.getByRole("region", { name: "Na atoms" });
    expect(sodiumGroup.className).toContain("rounded-xl");
    expect(sodiumGroup.querySelector('[data-slot="separator"]')).not.toBeNull();
    const selectedAtomLabel = screen.getByText("Selected atom");
    expect(selectedAtomLabel.isConnected).toBe(true);
    expect(selectedAtomLabel.parentElement?.className).not.toContain("rounded");
    expect(screen.getByText("Na:0").isConnected).toBe(true);
    expect(screen.queryByText("Na:1")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Na:0 visibility" }));

    await waitFor(() => {
      expect(screen.queryByText("Selected atom")).toBeNull();
      expect(screen.getByText("Hidden atoms").isConnected).toBe(true);
    });
    expect(screen.getByText("Na:0").isConnected).toBe(true);
    expect(screen.queryByText("Na:1")).toBeNull();
    expect(sodiumGroup.querySelectorAll('[data-slot="atom-color-token"]')).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Set Na:0 color" })).toBeNull();

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
    expect(screen.getByText("Na:1").isConnected).toBe(true);

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
  initialSelectedAtomId,
  initialStyle,
  scene = sceneWithAtoms(2),
}: {
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
