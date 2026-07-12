import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";

import type { AtomSpec, BondSpec } from "../src/api/scene";
import { BondInspectorCard } from "../src/app/BondInspectorCard";
import { createDefaultStyle } from "../src/model";

describe("BondInspectorCard", () => {
  test("places Hide before Copy and Locate and hides the selected bond", async () => {
    const user = userEvent.setup();
    const onHide = mock();
    const startAtom = atom("Na-0", "Na", 0);
    const endAtom = atom("Cl-1", "Cl", 1);
    const bond = selectedBond();

    render(
      <BondInspectorCard
        colorScheme="jmol"
        info={{
          bond,
          endAtom,
          family: { elements: ["Na", "Cl"], key: "Na|Cl", minLength: 1, maxLength: 1 },
          startAtom,
        }}
        isInspectorOpen={false}
        onClose={() => {}}
        onHide={onHide}
        onLocateInObjects={() => {}}
        style={createDefaultStyle()}
      />,
    );

    expect(
      screen.getAllByRole("button").map((button) => button.getAttribute("aria-label")),
    ).toEqual([
      "Close bond info",
      "Hide bond",
      "Copy bond info",
      "Locate bond in Objects",
    ]);

    await user.click(screen.getByRole("button", { name: "Hide bond" }));
    expect(onHide).toHaveBeenCalledWith(bond);
  });
});

function atom(id: string, element: string, siteIndex: number): AtomSpec {
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

function selectedBond(): BondSpec {
  return {
    endAtomIndex: 1,
    endImageOffset: [0, 0, 0],
    endSiteId: "Cl-1",
    familyKey: "Na|Cl",
    id: "bond:one",
    length: 1,
    relationId: "relation:one",
    relativeImageOffset: [0, 0, 0],
    startAtomIndex: 0,
    startImageOffset: [0, 0, 0],
    startSiteId: "Na-0",
    visibilityDependencies: [],
    visibilityDependencyGroups: [],
  };
}
