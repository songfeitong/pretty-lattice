import { describe, expect, test } from "bun:test";

import { selectionPointerAction } from "../src/scene/selectionActivation";

describe("selection activation", () => {
  test("keeps pulse and double-click selection in the default mode", () => {
    expect(
      selectionPointerAction({
        activation: "double",
        event: "click",
        interactionLocked: false,
        selected: false,
      }),
    ).toBe("pulse");
    expect(
      selectionPointerAction({
        activation: "double",
        event: "double-click",
        interactionLocked: false,
        selected: false,
      }),
    ).toBe("select");
  });

  test("selects once without a pulse in single-click mode", () => {
    expect(
      selectionPointerAction({
        activation: "single",
        event: "click",
        interactionLocked: false,
        selected: false,
      }),
    ).toBe("select");
    expect(
      selectionPointerAction({
        activation: "single",
        event: "click",
        interactionLocked: false,
        selected: true,
      }),
    ).toBe("none");
    expect(
      selectionPointerAction({
        activation: "single",
        event: "double-click",
        interactionLocked: false,
        selected: true,
      }),
    ).toBe("none");
  });

  test("reports locked interaction on the active gesture", () => {
    expect(
      selectionPointerAction({
        activation: "single",
        event: "click",
        interactionLocked: true,
        selected: false,
      }),
    ).toBe("locked-feedback");
    expect(
      selectionPointerAction({
        activation: "double",
        event: "click",
        interactionLocked: true,
        selected: false,
      }),
    ).toBe("none");
    expect(
      selectionPointerAction({
        activation: "double",
        event: "double-click",
        interactionLocked: true,
        selected: false,
      }),
    ).toBe("locked-feedback");
  });
});
