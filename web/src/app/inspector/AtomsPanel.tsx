import {
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { TooltipProvider } from "@/components/ui/tooltip";

import type { SceneSpec } from "../../api/scene";
import type { StyleState } from "../../model";
import { createAtomAppearanceEditor } from "./atomAppearanceEditor";
import { createAtomAppearanceModel } from "./atomAppearanceModel";
import {
  AtomElementGroups,
  AtomGlobalControls,
  HiddenAtoms,
} from "./AtomPanelControls";

export interface AtomLocateRequest {
  atomId: string;
  token: number;
}

export function AtomsPanel({
  atomLocateRequest,
  atomOpacity,
  atomsVisible,
  onAtomLocateRequestHandled,
  onElementColorChange,
  onStyleChange,
  scene,
  selectedAtomId,
  style,
}: {
  atomLocateRequest: AtomLocateRequest | null;
  atomOpacity: number;
  atomsVisible: boolean;
  onAtomLocateRequestHandled: (token: number) => void;
  onElementColorChange: (element: string, color: string) => void;
  onStyleChange: Dispatch<SetStateAction<StyleState>>;
  scene: SceneSpec;
  selectedAtomId: string | null;
  style: StyleState;
}) {
  const elementContainerByElementRef = useRef(new Map<string, HTMLElement>());
  const model = useMemo(
    () =>
      createAtomAppearanceModel({
        atomOpacity,
        atomsVisible,
        scene,
        selectedAtomId,
        style,
      }),
    [atomOpacity, atomsVisible, scene, selectedAtomId, style],
  );
  const editor = createAtomAppearanceEditor({
    atoms: model.objectAtoms,
    onElementColorChange,
    onStyleChange,
    style,
  });

  useLayoutEffect(() => {
    if (!atomLocateRequest) return;
    const atom = model.atomById.get(atomLocateRequest.atomId);
    if (atom) {
      scrollElementIntoInspectorBody(
        elementContainerByElementRef.current.get(atom.element) ?? null,
      );
    }
    onAtomLocateRequestHandled(atomLocateRequest.token);
  }, [atomLocateRequest, model.atomById, onAtomLocateRequestHandled]);

  return (
    <TooltipProvider delayDuration={500}>
      <div className="flex min-h-0 flex-col text-[13px]">
        <AtomGlobalControls editor={editor} style={style} />
        <AtomElementGroups
          editor={editor}
          elementContainerByElementRef={elementContainerByElementRef}
          model={model}
        />
        <HiddenAtoms atoms={model.hiddenAtoms} editor={editor} />
      </div>
    </TooltipProvider>
  );
}

function scrollElementIntoInspectorBody(elementContainer: HTMLElement | null) {
  const scrollContainer = elementContainer?.closest<HTMLElement>(
    '[data-slot="inspector-body"]',
  );
  if (!elementContainer || !scrollContainer) return;

  const elementRect = elementContainer.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  if (elementRect.top < containerRect.top + 8) {
    scrollContainer.scrollTop += elementRect.top - containerRect.top - 8;
  } else if (elementRect.bottom > containerRect.bottom - 8) {
    scrollContainer.scrollTop += elementRect.bottom - containerRect.bottom + 8;
  }
}
