import { useEffect } from "react";

import type { BondSpec } from "../../api/scene";

export function useHideSelectedObjectShortcut({
  onHideAtom,
  onHideBond,
  selectedAtomId,
  selectedBond,
}: {
  onHideAtom: (atomId: string) => void;
  onHideBond: (bond: BondSpec) => void;
  selectedAtomId: string | null;
  selectedBond: BondSpec | null;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key.toLowerCase() !== "h" ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.repeat ||
        event.isComposing ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      if (selectedAtomId) {
        event.preventDefault();
        onHideAtom(selectedAtomId);
      } else if (selectedBond) {
        event.preventDefault();
        onHideBond(selectedBond);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onHideAtom, onHideBond, selectedAtomId, selectedBond]);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])") !== null
  );
}
