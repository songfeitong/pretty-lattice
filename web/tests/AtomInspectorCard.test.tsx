import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, mock, test } from "bun:test";

import type { AtomSpec } from "../src/api/scene";
import { AtomInspectorCard } from "../src/app/AtomInspectorCard";
import { createDefaultStyle } from "../src/model";

describe("AtomInspectorCard", () => {
  test("places Hide before Copy and Locate and hides the canonical site", async () => {
    const user = userEvent.setup();
    const onHide = mock();
    const canonicalAtom = atom("Al-1", "Al-1", false);
    const imageAtom = {
      ...atom("Al-1-image-1-0-0", "Al-1", true),
      fractionalPosition: [1.25, 0.5, 0.15] as [number, number, number],
      imageOffset: [1, 0, 0] as [number, number, number],
      position: [6, 2, 2] as [number, number, number],
    };

    render(
      <AtomInspectorCard
        colorScheme="jmol"
        info={{ atom: imageAtom, canonicalAtom }}
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
      "Close atom info",
      "Hide atom",
      "Copy atom info",
      "Locate atom in Objects",
    ]);

    const hideButton = screen.getByRole("button", { name: "Hide atom" });
    await user.hover(hideButton);
    expect((await screen.findByRole("tooltip")).textContent).toBe("Hide atom (H)");
    await user.click(hideButton);
    expect(onHide).toHaveBeenCalledWith("Al-1");
  });
});

function atom(id: string, siteId: string, isPeriodicImage: boolean): AtomSpec {
  return {
    element: "Al",
    fractionalPosition: [0.25, 0.5, 0.15],
    id,
    imageOffset: [0, 0, 0],
    imageReasons: isPeriodicImage ? ["boundary"] : [],
    isPeriodicImage,
    position: [1, 2, 2],
    siteId,
    siteIndex: 1,
    visibilityDependencies: isPeriodicImage ? ["boundaryAtoms"] : [],
    visibilityDependencyGroups: isPeriodicImage ? [["boundaryAtoms"]] : [],
  };
}
