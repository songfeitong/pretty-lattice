import { Copy, EyeOff, SquareMousePointer, X } from "lucide-react";
import { useCallback, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import {
  atomSiteLabel,
  bondInspectorCopyText,
  formatBondLengthForDisplay,
  formatBondVector,
  formatCellOffset,
  resolveAtomAppearance,
  type InspectedBondInfo,
  type StyleState,
} from "../model";
import type { ElementColorOverrides } from "./colorSchemes";
import { GLASS_SURFACE_CLASS, TOOL_ICON_BUTTON_CLASS } from "./surface";

export function BondInspectorCard({
  colorScheme,
  colorOverrides,
  info,
  isInspectorOpen,
  onClose,
  onHide,
  onLocateInObjects,
  style,
}: {
  colorScheme: StyleState["colorScheme"];
  colorOverrides?: ElementColorOverrides;
  info: InspectedBondInfo;
  isInspectorOpen: boolean;
  onClose: () => void;
  onHide: (bond: InspectedBondInfo["bond"]) => void;
  onLocateInObjects?: (bondId: string) => void;
  style: StyleState;
}) {
  const { t } = useTranslation();
  const startColor = resolveAtomAppearance({
    atom: info.startAtom,
    colorOverrides,
    colorScheme,
    style,
  }).color;
  const endColor = resolveAtomAppearance({
    atom: info.endAtom,
    colorOverrides,
    colorScheme,
    style,
  }).color;
  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(bondInspectorCopyText(info));
  }, [info]);

  return (
    <aside
      aria-label={t("bondInspector.selectedBond")}
      className={cn(
        "absolute right-16 top-4 z-30 w-[316px] rounded-xl border px-3 py-2.5 font-mono text-xs shadow-xl shadow-foreground/10",
        "transition-[right] duration-[260ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduced:transition-none",
        "max-[760px]:right-4 max-[760px]:top-14 max-[760px]:w-[calc(100vw-2rem)]",
        isInspectorOpen ? "min-[761px]:right-[388px]" : null,
        GLASS_SURFACE_CLASS,
      )}
    >
      <div className="grid h-7 grid-cols-[1.5rem_minmax(0,1fr)_1.5rem_1.5rem_1.5rem] items-center gap-2">
        <CardAction
          label={t("actions.closeBondInfo")}
          onClick={onClose}
          icon={<X aria-hidden="true" />}
        />
        <div className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[0.78rem] font-semibold text-foreground">
          <AtomToken color={startColor} />
          <span>{atomSiteLabel(info.startAtom)}</span>
          <span aria-hidden="true" className="text-muted-foreground">—</span>
          <AtomToken color={endColor} />
          <span>{atomSiteLabel(info.endAtom)}</span>
        </div>
        <CardAction
          label={t("actions.hideBond")}
          onClick={() => onHide(info.bond)}
          icon={<EyeOff aria-hidden="true" />}
          tooltip={t("actions.hideBondShortcut")}
        />
        <CardAction
          label={t("actions.copyBondInfo")}
          onClick={handleCopy}
          icon={<Copy aria-hidden="true" />}
        />
        <CardAction
          label={t("actions.locateBondInObjects")}
          onClick={() => onLocateInObjects?.(info.bond.id)}
          icon={<SquareMousePointer aria-hidden="true" />}
        />
      </div>

      <dl className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-1 tabular-nums">
        <dt className="text-muted-foreground">{t("bondInspector.bondLength")}</dt>
        <dd className="truncate text-right text-foreground">
          {formatBondLengthForDisplay(info.bond.length)}
        </dd>
        <dt className="text-muted-foreground">{t("bondInspector.bondVector")}</dt>
        <dd className="truncate text-right text-foreground">
          {formatBondVector(info, 3)}
        </dd>
        <dt className="text-muted-foreground">{t("bondInspector.cellShift")}</dt>
        <dd className="truncate text-right text-foreground">
          {formatCellOffset(info.bond.relativeImageOffset)}
        </dd>
      </dl>
    </aside>
  );
}

function AtomToken({ color }: { color: string }) {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 rounded-full border border-foreground/15 shadow-sm"
      style={{ backgroundColor: color }}
    />
  );
}

function CardAction({
  icon,
  label,
  onClick,
  tooltip,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tooltip?: string;
}) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              "size-6 rounded-[9px] [&_svg]:size-3.25",
            )}
            onClick={onClick}
          >
            {icon}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltip ?? label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
