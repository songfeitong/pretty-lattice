import { describe, expect, test } from "bun:test";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import type { SceneSpec } from "../src/api/scene";
import { BondsPanel } from "../src/app/inspector/BondsPanel";
import {
  createDefaultBondVisibilityOverrides,
  createDefaultStyle,
  setBondFamilyVisible,
  setBondRelationVisible,
  type BondVisibilityOverrides,
  type StyleState,
} from "../src/model";

describe("BondsPanel", () => {
  test("uses atom-style family controls and keeps hidden relations in recovery", async () => {
    const user = userEvent.setup();
    render(<BondsPanelHarness />);

    const family = screen.getByRole("region", { name: "Na–Cl bonds" });
    expect(family.className).toContain("rounded-xl");
    const familyLabel = within(family).getByText("Na").parentElement;
    expect(familyLabel?.className).toContain("font-semibold");
    expect(familyLabel?.className).not.toContain("font-mono");
    expect(within(family).queryByText("2")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Na–Cl radius" }).getAttribute("value")).toBe(
      "0.10",
    );
    expect(screen.getByRole("textbox", { name: "Na–Cl opacity" }).getAttribute("value")).toBe(
      "100",
    );
    for (const input of [
      screen.getByRole("textbox", { name: "Na–Cl radius" }),
      screen.getByRole("textbox", { name: "Na–Cl opacity" }),
    ]) {
      expect(input.className).toContain("justify-self-center");
      expect(input.className).toContain("h-[22px]");
      expect(input.className).toContain("px-1.5");
    }

    await user.click(screen.getByRole("button", { name: "Na:0–Cl:1 visibility" }));
    await waitFor(() => expect(screen.getByText("Hidden bonds").isConnected).toBe(true));
    expect(screen.getByRole("button", { name: "Hidden bonds 1" }).getAttribute("aria-expanded"))
      .toBe("true");
    expect(screen.queryByRole("button", { name: "Reset Na–Cl" })).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Restore Na:0–Cl:1 to family visibility" }),
    );
    await waitFor(() => expect(screen.queryByText("Hidden bonds")).toBeNull());

    await user.click(screen.getByRole("button", { name: "Na–Cl visibility" }));
    expect(screen.queryByText("Hidden bonds")).toBeNull();
  });

  test("commits family appearance values without persistent length details", async () => {
    const user = userEvent.setup();
    render(<BondsPanelHarness selected={false} />);
    const family = screen.getByRole("region", { name: "Na–Cl bonds" });

    const radius = screen.getByRole("textbox", { name: "Na–Cl radius" });
    await user.clear(radius);
    await user.type(radius, "0.24{Enter}");
    expect(radius.getAttribute("value")).toBe("0.24");

    expect(family.querySelector('[data-slot="bond-family-details"]')).toBeNull();
    expect(screen.queryByText("Bond length")).toBeNull();
  });

  test("switches every family row to compact cutoff range controls", async () => {
    render(<BondsPanelHarness cutoffEditing selected />);

    expect(screen.getByText("Min (Å)").isConnected).toBe(true);
    expect(screen.getByText("Max (Å)").isConnected).toBe(true);
    expect(screen.getByRole("textbox", { name: "Minimum cutoff for Na–Cl" }).getAttribute("value"))
      .toBe("0.000");
    expect(screen.getByRole("textbox", { name: "Maximum cutoff for Na–Cl" }).getAttribute("value"))
      .toBe("1.200");
    expect(
      screen.getByRole("textbox", { name: "Maximum cutoff for Na–Cl" }).parentElement?.className,
    ).toContain("bond-family-controls-enter-cutoff");
    expect(
      screen.getByRole("textbox", { name: "Maximum cutoff for Na–Cl" }).className,
    ).toContain("focus-visible:ring-[1px]");
    expect(screen.queryByRole("textbox", { name: "Na–Cl radius" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Na:0–Cl:1 radius" })).toBeNull();
  });
});

function BondsPanelHarness({ cutoffEditing = false, selected = true }: {
  cutoffEditing?: boolean;
  selected?: boolean;
}) {
  const scene = bondScene();
  const [style, setStyle] = useState<StyleState>(createDefaultStyle());
  const [selectedBondId, setSelectedBondId] = useState<string | null>(
    selected ? "bond:one" : null,
  );
  const [visibility, setVisibility] = useState<BondVisibilityOverrides>(
    createDefaultBondVisibilityOverrides,
  );
  return (
    <BondsPanel
      bondLocateRequest={null}
      bondOpacity={100}
      bondsVisible
      cutoffDrafts={cutoffEditing ? {
        "Na|Cl": {
          initialOverride: false,
          maxText: "1.200",
          minText: "0.000",
          pendingRemoval: false,
        },
      } : {}}
      cutoffEditing={cutoffEditing}
      invalidCutoffFeedbackPhase={null}
      invalidCutoffFields={new Set()}
      isSceneLoading={false}
      onBondLocateRequestHandled={() => {}}
      onBondVisibilityChange={(bond, visible) => {
        setVisibility((current) => setBondRelationVisible(current, bond, visible));
        if (!visible) setSelectedBondId(null);
      }}
      onCutoffDraftChange={() => {}}
      onCutoffEditorKeyDown={() => {}}
      onCutoffRestoreToggle={() => {}}
      onFamilyVisibilityChange={(familyKey, visible) =>
        setVisibility((current) => setBondFamilyVisible(current, familyKey, visible))
      }
      onStyleChange={setStyle}
      resetToken={0}
      scene={scene}
      selectedBondId={selectedBondId}
      style={style}
      visibilityOverrides={visibility}
    />
  );
}

function bondScene(): SceneSpec {
  return {
    atoms: [atom("Na-0", "Na", 0), atom("Cl-1", "Cl", 1)],
    bondFamilies: [{ elements: ["Na", "Cl"], key: "Na|Cl", minLength: 1, maxLength: 1.2 }],
    bonds: [bond("bond:one", 1), bond("bond:two", 1.2)],
    cell: { vectors: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
    polyhedra: [],
    summary: {
      atomCount: 2,
      cell: { a: "1", alpha: "90", b: "1", beta: "90", c: "1", gamma: "90" },
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

function atom(id: string, element: string, siteIndex: number): SceneSpec["atoms"][number] {
  return {
    element,
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

function bond(id: string, length: number): SceneSpec["bonds"][number] {
  return {
    endAtomIndex: 1,
    endImageOffset: [0, 0, 0],
    endSiteId: "Cl-1",
    familyKey: "Na|Cl",
    id,
    length,
    relationId: "relation:shared",
    relativeImageOffset: [0, 0, 0],
    startAtomIndex: 0,
    startImageOffset: [0, 0, 0],
    startSiteId: "Na-0",
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
