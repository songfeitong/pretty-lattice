import type { SelectionActivation } from "../selection/selectionActivationPreference";

export type SelectionPointerEvent = "click" | "double-click";
export type SelectionPointerAction =
  | "locked-feedback"
  | "none"
  | "pulse"
  | "select";

export function selectionPointerAction({
  activation,
  event,
  interactionLocked,
  selected,
}: {
  activation: SelectionActivation;
  event: SelectionPointerEvent;
  interactionLocked: boolean;
  selected: boolean;
}): SelectionPointerAction {
  if (activation === "single") {
    if (event === "double-click") {
      return "none";
    }
    if (interactionLocked) {
      return "locked-feedback";
    }
    return selected ? "none" : "select";
  }

  if (event === "click") {
    return interactionLocked || selected ? "none" : "pulse";
  }
  return interactionLocked ? "locked-feedback" : "select";
}
