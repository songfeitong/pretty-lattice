import { FolderOpen } from "lucide-react";
import { type ChangeEvent, type ReactNode, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { uploadStructurePreview, type SceneSpec } from "../api/scene";
import { LatticeScene } from "../scene/LatticeScene";
import { summarizeScene, type PreviewStatus } from "./previewState";

export function App() {
  const [scene, setScene] = useState<SceneSpec | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setSelectedFileName(file.name);
    setPreviewStatus("loading");
    setErrorMessage(null);
    setScene(null);

    try {
      const nextScene = await uploadStructurePreview(file);
      setScene(nextScene);
      setPreviewStatus("ready");
    } catch (error) {
      setScene(null);
      setPreviewStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Could not parse structure.");
    }
  }

  const summary = useMemo(() => summarizeScene(scene), [scene]);

  return (
    <main className="relative h-dvh min-w-80 overflow-hidden bg-background text-foreground">
      <section className="scene-stage absolute inset-0" aria-label="Crystal structure preview">
        {scene ? (
          <LatticeScene scene={scene} />
        ) : (
          <div
            className="grid h-full w-full place-items-center bg-background text-sm text-muted-foreground"
            data-state={previewStatus}
          >
            {previewStatus === "loading" ? "Loading structure" : "No structure loaded"}
          </div>
        )}
      </section>

      <aside
        className="absolute left-4 top-4 w-[332px] max-w-[calc(100vw-2rem)] rounded-lg border bg-card/92 p-4 shadow-xl shadow-foreground/10 backdrop-blur-md"
        aria-label="Current structure"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <img
              src="/favicon.svg"
              alt=""
              className="size-7 shrink-0"
            />
            <div className="min-w-0">
              <h1 className="truncate text-[0.95rem] font-semibold leading-tight">Pretty Lattice</h1>
            </div>
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  aria-label="Open structure"
                  className="h-7 gap-1.5 rounded-full px-2.5 text-xs [&_svg]:size-3.5"
                  disabled={previewStatus === "loading"}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FolderOpen data-icon="inline-start" aria-hidden="true" />
                  <span>Open</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Open structure</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Separator className="my-3" />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          tabIndex={-1}
          onChange={(event) => void handleFileChange(event)}
        />

        <SummaryRow
          label="File"
          value={selectedFileName ?? "No file selected"}
          valueClassName="font-normal"
          title={selectedFileName ?? undefined}
        />

        {errorMessage ? (
          <div
            className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-3 font-mono text-sm leading-snug text-destructive"
            role="alert"
          >
            {errorMessage}
          </div>
        ) : null}

        {scene ? (
          <div className="mt-2.5 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <SummaryRow
                label="Formula"
                value={renderFormula(summary.formula)}
                mono={false}
              />
              <SummaryRow label="Atoms" value={summary.atomCount} />
            </div>

            <Separator />
            <div>
              <span className="block text-xs font-bold text-muted-foreground">Symmetry</span>
              {summary.symmetry?.available ? (
                <dl className="mt-1.5 flex flex-col gap-1.5 text-sm">
                  <SymmetryMetric
                    label="Space group"
                    value={renderSpaceGroup(
                      summary.symmetry.spaceGroup,
                      summary.symmetry.spaceGroupNumber,
                    )}
                    title={formatSpaceGroupTitle(
                      summary.symmetry.spaceGroup,
                      summary.symmetry.spaceGroupNumber,
                    )}
                  />
                  <SymmetryMetric
                    label="Point group"
                    value={renderPointGroup(
                      summary.symmetry.pointGroup,
                      summary.symmetry.pointGroupSchoenflies,
                    )}
                    title={formatPointGroupTitle(
                      summary.symmetry.pointGroup,
                      summary.symmetry.pointGroupSchoenflies,
                    )}
                  />
                  <SymmetryMetric
                    label="Crystal system"
                    value={summary.symmetry.crystalSystem ?? "-"}
                  />
                  <SymmetryMetric
                    label="Lattice system"
                    value={summary.symmetry.latticeSystem ?? "-"}
                  />
                </dl>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">Symmetry unavailable</p>
              )}
            </div>

            {summary.cell ? (
              <>
                <Separator />
                <div>
                  <span className="block text-xs font-bold text-muted-foreground">
                    Lattice Parameters
                  </span>
                  <dl className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-sm">
                    <CellMetric label="a" value={summary.cell.a} unit="Å" />
                    <CellMetric label="b" value={summary.cell.b} unit="Å" />
                    <CellMetric label="c" value={summary.cell.c} unit="Å" />
                    <CellMetric label="α" value={summary.cell.alpha} unit="°" />
                    <CellMetric label="β" value={summary.cell.beta} unit="°" />
                    <CellMetric label="γ" value={summary.cell.gamma} unit="°" />
                  </dl>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </aside>
    </main>
  );
}

function SummaryRow({
  label,
  mono = true,
  title,
  value,
  valueClassName,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-baseline gap-2.5 text-sm">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span title={title}>
        <span
          className={cn(
            "block truncate font-normal leading-snug tabular-nums",
            mono ? "font-mono" : "font-sans",
            valueClassName,
          )}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function SymmetryMetric({
  label,
  mono = false,
  title,
  value,
}: {
  label: string;
  mono?: boolean;
  title?: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.75rem_minmax(0,1fr)] items-baseline gap-2.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "min-w-0 truncate font-normal leading-snug tabular-nums",
          mono ? "font-mono" : "font-sans",
        )}
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}

function renderHermannMauguin(symbol: string) {
  const nodes: ReactNode[] = [];
  let plainStart = 0;
  let index = 0;

  while (index < symbol.length) {
    const current = symbol[index] ?? "";
    const next = symbol[index + 1] ?? "";
    if (current === "-" && /\d/.test(next)) {
      if (plainStart < index) {
        nodes.push(symbol.slice(plainStart, index));
      }
      nodes.push(
        <span
          key={`overline-${index}`}
          className="hm-overline-digit"
          aria-label={`overline ${next}`}
        >
          {next}
        </span>,
      );
      index += 2;
      plainStart = index;
      continue;
    }

    if (current === "_" && /\d/.test(next)) {
      let subscriptEnd = index + 1;
      while (subscriptEnd < symbol.length && /\d/.test(symbol[subscriptEnd] ?? "")) {
        subscriptEnd += 1;
      }

      if (plainStart < index) {
        nodes.push(symbol.slice(plainStart, index));
      }
      nodes.push(
        <sub key={`subscript-${index}`} className="text-[0.68em] leading-none">
          {symbol.slice(index + 1, subscriptEnd)}
        </sub>,
      );
      index = subscriptEnd;
      plainStart = index;
      continue;
    }

    index += 1;
  }

  if (nodes.length === 0) {
    return symbol;
  }
  if (plainStart < symbol.length) {
    nodes.push(symbol.slice(plainStart));
  }

  return nodes;
}

function renderSpaceGroup(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  if (spaceGroupNumber === null) {
    return renderHermannMauguin(symbol);
  }

  return (
    <>
      {renderHermannMauguin(symbol)}
      <span className="ml-1">(No. {spaceGroupNumber})</span>
    </>
  );
}

function formatSpaceGroupTitle(spaceGroup: string | null, spaceGroupNumber: number | null) {
  const symbol = spaceGroup ?? "-";
  return spaceGroupNumber === null ? symbol : `${symbol}  (No. ${spaceGroupNumber})`;
}

function renderPointGroup(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  if (!schoenflies) {
    return renderHermannMauguin(symbol);
  }

  return (
    <>
      {renderHermannMauguin(symbol)}
      <span className="ml-1">(</span>
      {renderSchoenflies(schoenflies)}
      <span>)</span>
    </>
  );
}

function formatPointGroupTitle(pointGroup: string | null, schoenflies: string | null) {
  const symbol = pointGroup ?? "-";
  return schoenflies ? `${symbol}  (${schoenflies})` : symbol;
}

function renderSchoenflies(symbol: string) {
  if (symbol.length <= 1) {
    return symbol;
  }

  return (
    <>
      {symbol.slice(0, 1)}
      <sub className="text-[0.68em] leading-none">{symbol.slice(1)}</sub>
    </>
  );
}

function renderFormula(formula: string) {
  return formula.split(/(\d+)/).map((part, index) =>
    /^\d+$/.test(part) ? (
      <sub key={`${part}-${index}`} className="text-[0.68em] leading-none">
        {part}
      </sub>
    ) : (
      part
    ),
  );
}

function CellMetric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="shrink-0 text-[0.78rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate tabular-nums">
        {value}
        {unit === "Å" ? "\u2009" : ""}
        {unit}
      </dd>
    </div>
  );
}
