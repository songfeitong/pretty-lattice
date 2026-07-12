export const SELECTION_ACTIVATION_STORAGE_KEY =
  "pretty-lattice-selection-activation";
export const SELECTION_ACTIVATIONS = ["single", "double"] as const;

export type SelectionActivation = (typeof SELECTION_ACTIVATIONS)[number];

export const DEFAULT_SELECTION_ACTIVATION: SelectionActivation = "double";

export function isSelectionActivation(
  value: unknown,
): value is SelectionActivation {
  return SELECTION_ACTIVATIONS.includes(value as SelectionActivation);
}

export function readSelectionActivation(): SelectionActivation {
  if (typeof window === "undefined") {
    return DEFAULT_SELECTION_ACTIVATION;
  }

  try {
    const storedActivation = window.localStorage.getItem(
      SELECTION_ACTIVATION_STORAGE_KEY,
    );
    return isSelectionActivation(storedActivation)
      ? storedActivation
      : DEFAULT_SELECTION_ACTIVATION;
  } catch {
    return DEFAULT_SELECTION_ACTIVATION;
  }
}

export function writeSelectionActivation(activation: SelectionActivation) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(SELECTION_ACTIVATION_STORAGE_KEY, activation);
  } catch {
    // The preference still applies for the current session when storage is unavailable.
  }
}
