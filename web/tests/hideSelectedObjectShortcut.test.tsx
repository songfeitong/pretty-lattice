import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";

import type { BondSpec } from "../src/api/scene";
import { useHideSelectedObjectShortcut } from "../src/app/hooks/useHideSelectedObjectShortcut";

describe("hide selected object shortcut", () => {
  test("hides the selected atom with H but ignores editable targets and modifiers", () => {
    const onHideAtom = mock();
    render(
      <ShortcutHarness
        onHideAtom={onHideAtom}
        selectedAtomId="Na-0"
      />,
    );

    fireEvent.keyDown(window, { key: "h" });
    expect(onHideAtom).toHaveBeenCalledTimes(1);
    expect(onHideAtom).toHaveBeenCalledWith("Na-0");

    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "h" });
    fireEvent.keyDown(window, { key: "h", metaKey: true });
    expect(onHideAtom).toHaveBeenCalledTimes(1);
    input.remove();
  });

  test("hides the selected bond relation with H", () => {
    const onHideBond = mock();
    const bond = selectedBond();
    render(
      <ShortcutHarness
        onHideBond={onHideBond}
        selectedBond={bond}
      />,
    );

    fireEvent.keyDown(window, { key: "h" });
    expect(onHideBond).toHaveBeenCalledTimes(1);
    expect(onHideBond).toHaveBeenCalledWith(bond);
  });
});

function ShortcutHarness({
  onHideAtom = () => {},
  onHideBond = () => {},
  selectedAtomId = null,
  selectedBond = null,
}: {
  onHideAtom?: (atomId: string) => void;
  onHideBond?: (bond: BondSpec) => void;
  selectedAtomId?: string | null;
  selectedBond?: BondSpec | null;
}) {
  useHideSelectedObjectShortcut({
    onHideAtom,
    onHideBond,
    selectedAtomId,
    selectedBond,
  });
  return null;
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
