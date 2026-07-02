import { Copy, X } from "lucide-react";
import { useCallback } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  atomInspectorCopyText,
  formatAtomCoordinateForDisplay,
  formatCellOffset,
  type InspectedAtomInfo,
} from "./atomInspector";
import { atomColorForScheme, type ElementColorOverrides } from "./colorSchemes";
import { atomLabelForAtom, type StyleState } from "../model";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";

export function AtomInspectorCard({
  colorScheme,
  colorOverrides,
  info,
  isInspectorOpen,
  onClose,
}: {
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  info: InspectedAtomInfo;
  isInspectorOpen: boolean;
  onClose: () => void;
}) {
  const { atom, canonicalAtom } = info;
  const atomColor = atomColorForScheme(canonicalAtom, colorScheme, colorOverrides);
  const atomLabel = atomLabelForAtom(canonicalAtom, info.sceneAtoms);
  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(atomInspectorCopyText(info));
  }, [info]);

  return (
    <aside
      aria-label="Selected atom"
      className={cn(
        "absolute right-16 top-4 z-30 w-[300px] rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl shadow-foreground/10",
        "transition-[right] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "max-[760px]:right-4 max-[760px]:top-14 max-[760px]:w-[calc(100vw-2rem)]",
        isInspectorOpen ? "min-[761px]:right-[376px]" : null,
        GLASS_SURFACE_CLASS,
      )}
    >
      <div className="grid h-7 grid-cols-[1.5rem_0.875rem_minmax(8rem,1fr)_1.5rem] items-center gap-2">
        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close atom info"
                className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close atom info</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <span
          aria-hidden="true"
          className="size-3.5 shrink-0 rounded-full border border-foreground/10 shadow-sm"
          style={{ backgroundColor: atomColor }}
        />
        <span className="min-w-0 whitespace-nowrap text-[0.78rem] font-semibold text-foreground">
          {atomLabel}
        </span>

        <TooltipProvider delayDuration={500}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Copy atom info"
                className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                onClick={handleCopy}
              >
                <Copy aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Copy atom info</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <dl className="mt-2 grid grid-cols-[5.8rem_minmax(0,1fr)] gap-x-2 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">Fractional</dt>
        <dd className="truncate text-right text-foreground">
          {formatAtomCoordinateForDisplay(canonicalAtom.fractionalPosition)}
        </dd>
        <dt className="text-muted-foreground">Cartesian</dt>
        <dd className="truncate text-right text-foreground">
          {formatAtomCoordinateForDisplay(canonicalAtom.position)}
        </dd>
        <dt className="text-muted-foreground">Cell offset</dt>
        <dd className="truncate text-right text-foreground">
          {formatCellOffset(atom.imageOffset)}
        </dd>
      </dl>
    </aside>
  );
}
