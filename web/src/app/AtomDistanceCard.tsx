import { Ruler, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  formatAtomAngleForDisplay,
  formatAtomCoordinateForDisplay,
  formatAtomDistanceForDisplay,
  formatCellOffset,
  type AtomMeasurementInfo,
} from "./atomInspector";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";
import { atomLabelForAtom, atomNumberForAtom } from "../model";

export function AtomDistanceCard({
  info,
  isInspectorOpen,
  onClose,
}: {
  info: AtomMeasurementInfo;
  isInspectorOpen: boolean;
  onClose: () => void;
}) {
  const hasDistance = info.secondAtom && info.delta && info.distance !== null;
  const hasAngle = info.thirdAtom && info.angleDegrees !== null;

  return (
    <aside
      aria-label="Selected atoms"
      className={cn(
        "absolute right-16 top-4 z-30 flex max-h-[calc(100dvh-2rem)] w-[300px] flex-col rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl shadow-foreground/10",
        "transition-[right] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
        "max-[760px]:right-4 max-[760px]:top-14 max-[760px]:max-h-[calc(100dvh-4.5rem)] max-[760px]:w-[calc(100vw-2rem)]",
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
                aria-label="Close atom distance"
                className={cn(TOOL_ICON_BUTTON_CLASS, "size-6 rounded-[9px] [&_svg]:size-3.25")}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close atom distance</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Ruler aria-hidden="true" className="size-3.5 text-muted-foreground" />
        <span className="min-w-0 whitespace-nowrap text-[0.78rem] font-semibold text-foreground">
          {measurementTitle(info)}
        </span>
      </div>

      <div className="mt-2 min-h-0 overflow-y-auto pr-1">
        <dl className="grid grid-cols-[5.8rem_minmax(0,1fr)] gap-x-2 gap-y-1 tabular-nums">
          {info.atoms.map((atom, index) => (
            <MeasurementAtomBlock
              key={atom.id}
              atom={atom}
              atoms={info.sceneAtoms}
              index={index + 1}
            />
          ))}
        </dl>

        {hasDistance ? (
          <dl className="mt-2 grid grid-cols-[5.8rem_minmax(0,1fr)] gap-x-2 gap-y-1 border-t pt-2 tabular-nums">
            {hasAngle ? (
              <>
                <dt className="text-muted-foreground">Angle</dt>
                <dd className="truncate text-right text-foreground">
                  {formatAtomAngleForDisplay(info.angleDegrees!)} deg
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Distance</dt>
            <dd className="truncate text-right text-foreground">
              {formatAtomDistanceForDisplay(info.distance!)} A
            </dd>
            <dt className="text-muted-foreground">Delta x</dt>
            <dd className="truncate text-right text-foreground">
              {formatAtomDistanceForDisplay(info.delta![0])} A
            </dd>
            <dt className="text-muted-foreground">Delta y</dt>
            <dd className="truncate text-right text-foreground">
              {formatAtomDistanceForDisplay(info.delta![1])} A
            </dd>
            <dt className="text-muted-foreground">Delta z</dt>
            <dd className="truncate text-right text-foreground">
              {formatAtomDistanceForDisplay(info.delta![2])} A
            </dd>
          </dl>
        ) : null}
      </div>
    </aside>
  );
}

function measurementTitle(info: AtomMeasurementInfo): string {
  if (info.atoms.length <= 3) {
    return info.atoms.map((atom) => atomLabelForAtom(atom, info.sceneAtoms)).join(" -> ");
  }

  return `${info.atoms.length} atoms selected`;
}

function MeasurementAtomBlock({
  atom,
  atoms,
  index,
}: {
  atom: AtomMeasurementInfo["firstAtom"];
  atoms: AtomMeasurementInfo["sceneAtoms"];
  index: number;
}) {
  return (
    <>
      <dt className={cn(
        "text-muted-foreground",
        index > 1 ? "border-t pt-1.5" : null,
      )}>
        Atom {atomNumberForAtom(atom, atoms)}
      </dt>
      <dd className={cn(
        "truncate text-right text-foreground",
        index > 1 ? "border-t pt-1.5" : null,
      )}>
        {atomLabelForAtom(atom, atoms)}
      </dd>
      <dt className="text-muted-foreground">Fractional</dt>
      <dd className="truncate text-right text-foreground">
        {formatAtomCoordinateForDisplay(atom.fractionalPosition)}
      </dd>
      <dt className="text-muted-foreground">Cartesian</dt>
      <dd className="truncate text-right text-foreground">
        {formatAtomCoordinateForDisplay(atom.position)}
      </dd>
      <dt className="text-muted-foreground">Cell offset</dt>
      <dd className="truncate text-right text-foreground">
        {formatCellOffset(atom.imageOffset)}
      </dd>
    </>
  );
}
