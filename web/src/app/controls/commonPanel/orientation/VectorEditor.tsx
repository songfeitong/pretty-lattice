import { Check, Info, RotateCcw } from "lucide-react";
import {
  type ChangeEvent,
  type FocusEvent,
  Fragment,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type {
  CrystalCameraScreenDirection,
  CrystalCameraState,
  VectorTuple,
} from "../../../../model";
import {
  TOOL_ICON_BUTTON_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS,
  TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS,
} from "../../../surface";
import {
  TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS,
  type ToolButtonFeedbackPhase,
} from "../controlFeedback";
import { COMMON_PANEL_SECTION_TITLE_TEXT_CLASS } from "../styles";
import {
  cameraStateFromVectorEditorDraft,
  resetVectorEditorDraft,
  updateVectorEditorDraft,
  vectorEditorRows,
} from "./vectorEditorModel";

type VectorEditorButtonFeedbackTarget = "apply" | "reset";

const PRIMARY_AXIS_LABEL_CLASS =
  "inline-flex h-6 w-7 items-center justify-center px-0 text-xs font-bold italic leading-none";
const VECTOR_AXIS_TOKEN_CLASS =
  "inline-flex h-6 w-7 items-center justify-center rounded-md px-0 font-bold italic leading-none";

export function VectorEditor({
  cameraState,
  cellVectors,
  onCameraSecondaryChange,
  onCameraStateChange,
}: {
  cameraState: CrystalCameraState;
  cellVectors: VectorTuple[];
  onCameraSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  onCameraStateChange: (cameraState: CrystalCameraState) => void;
}) {
  const { t } = useTranslation();
  const currentDraft = useMemo(() => resetVectorEditorDraft(cameraState), [cameraState]);
  const [draft, setDraft] = useState(currentDraft);
  const [isDirty, setIsDirty] = useState(false);
  const [buttonFeedbackPhase, setButtonFeedbackPhase] = useState<
    Record<VectorEditorButtonFeedbackTarget, ToolButtonFeedbackPhase>
  >({
    apply: null,
    reset: null,
  });
  const buttonFeedbackTickRef = useRef<Record<VectorEditorButtonFeedbackTarget, number>>({
    apply: 0,
    reset: 0,
  });
  const buttonFeedbackTimeoutRef = useRef<
    Record<VectorEditorButtonFeedbackTarget, number | null>
  >({
    apply: null,
    reset: null,
  });

  useEffect(() => {
    if (!isDirty) {
      setDraft(currentDraft);
    }
  }, [currentDraft, isDirty]);

  useEffect(() => {
    return () => {
      for (const timeout of Object.values(buttonFeedbackTimeoutRef.current)) {
        if (timeout !== null) {
          window.clearTimeout(timeout);
        }
      }
    };
  }, []);

  function triggerButtonFeedback(target: VectorEditorButtonFeedbackTarget) {
    const currentTimeout = buttonFeedbackTimeoutRef.current[target];
    if (currentTimeout !== null) {
      window.clearTimeout(currentTimeout);
    }

    buttonFeedbackTickRef.current[target] += 1;
    const nextPhase = buttonFeedbackTickRef.current[target] % 2 === 0 ? "b" : "a";
    setButtonFeedbackPhase((currentPhase) => ({
      ...currentPhase,
      [target]: nextPhase,
    }));
    buttonFeedbackTimeoutRef.current[target] = window.setTimeout(() => {
      setButtonFeedbackPhase((currentPhase) => ({
        ...currentPhase,
        [target]: null,
      }));
      buttonFeedbackTimeoutRef.current[target] = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
  }

  function updateDraft(row: "direct" | "reciprocal", index: number, value: string) {
    setIsDirty(true);
    setDraft((currentDraftState) =>
      updateVectorEditorDraft(currentDraftState, row, index, value),
    );
  }

  function resetDraft() {
    setDraft(currentDraft);
    setIsDirty(false);
  }

  function handleResetDraftClick() {
    triggerButtonFeedback("reset");
    resetDraft();
  }

  function applyDraft() {
    const nextState = cameraStateFromVectorEditorDraft({
      cameraState,
      cellVectors,
      draft,
    });

    if (nextState === null) {
      resetDraft();
      return;
    }

    setIsDirty(false);
    onCameraStateChange(nextState);
  }

  function handleApplyDraftClick() {
    triggerButtonFeedback("apply");
    applyDraft();
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      applyDraft();
      return;
    }

    if (event.key === "Escape") {
      resetDraft();
      event.currentTarget.blur();
    }
  }

  return (
    <section aria-labelledby="camera-numerical-label" className="mt-1 grid gap-1.5 px-1.5 pb-1">
      <div className="flex h-7 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <h2
            id="camera-numerical-label"
            className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
          >
            {t("orientation.numericalInput")}
          </h2>
          <Tooltip delayDuration={650}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("orientation.numericalInputRules")}
                className="inline-flex size-4 items-center justify-center rounded-md text-muted-foreground/75 outline-none transition-colors hover:text-foreground focus-visible:ring-[2px] focus-visible:ring-ring/30"
              >
                <Info aria-hidden="true" className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              {t("orientation.directVectorRule")}
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("actions.resetVectorsDraft")}
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              buttonFeedbackPhase.reset === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              buttonFeedbackPhase.reset === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleResetDraftClick}
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("actions.applyVectors")}
            className={cn(
              TOOL_ICON_BUTTON_CLASS,
              buttonFeedbackPhase.apply === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
              buttonFeedbackPhase.apply === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
            )}
            onClick={handleApplyDraftClick}
          >
            <Check aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="grid gap-1">
        {vectorEditorRows(cameraState, draft).map((row) => (
          <VectorEditorRow
            basisLabels={row.basisLabels}
            isPrimaryAxis={row.isPrimaryAxis}
            key={row.row}
            label={row.label}
            secondaryOptions={row.secondaryOptions}
            secondaryValue={row.secondaryOptions ? cameraState.secondary : undefined}
            values={row.draft}
            onSecondaryChange={onCameraSecondaryChange}
            onValueChange={(index, value) => updateDraft(row.row, index, value)}
            onKeyDown={handleFieldKeyDown}
          />
        ))}
      </div>
    </section>
  );
}

function VectorEditorRow({
  basisLabels,
  isPrimaryAxis,
  label,
  onKeyDown,
  onSecondaryChange,
  secondaryOptions,
  secondaryValue,
  onValueChange,
  values,
}: {
  basisLabels: readonly string[];
  isPrimaryAxis: boolean;
  label: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSecondaryChange: (secondary: CrystalCameraScreenDirection) => void;
  secondaryOptions?: readonly {
    direction: CrystalCameraScreenDirection;
    letter: "X" | "Y" | "Z";
    label: "Right" | "Up" | "Out";
  }[];
  secondaryValue?: CrystalCameraScreenDirection;
  onValueChange: (index: number, value: string) => void;
  values: readonly string[];
}) {
  const { t } = useTranslation();
  const secondaryToggleOption = secondaryOptions?.find(
    (option) => option.direction === secondaryValue,
  );
  const nextSecondaryDirection = secondaryOptions?.find(
    (option) => option.direction !== secondaryValue,
  )?.direction;
  const labelContent = isPrimaryAxis || !secondaryToggleOption || !nextSecondaryDirection ? (
    <span
      className={cn(
        isPrimaryAxis ? PRIMARY_AXIS_LABEL_CLASS : VECTOR_AXIS_TOKEN_CLASS,
        isPrimaryAxis
          ? "text-muted-foreground"
          : "bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  ) : (
    <button
      type="button"
      aria-label={t("orientation.secondaryAxis", {
        axis: secondaryToggleOption.letter,
      })}
      className={cn(
        VECTOR_AXIS_TOKEN_CLASS,
        "border border-foreground/10 bg-background text-xs text-muted-foreground shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[background-color,border-color,color,box-shadow] hover:border-foreground/15 hover:bg-accent/80 hover:text-foreground hover:shadow-[0_1px_3px_rgb(0_0_0/0.06)] focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-ring/25 dark:bg-background/50",
      )}
      onClick={() => onSecondaryChange(nextSecondaryDirection)}
    >
      {secondaryToggleOption.letter}
    </button>
  );

  return (
    <div
      className="relative -mx-1 grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-1 rounded-md px-1 py-1"
      data-camera-vector-row={label.toLowerCase().replace(/\s+/g, "-")}
      data-primary-axis={isPrimaryAxis ? "true" : undefined}
    >
      {labelContent}
      <div className="grid min-w-0 -translate-x-2 grid-cols-[3rem_0.8rem_0.45rem_3rem_0.8rem_0.45rem_3rem_0.8rem] items-center gap-x-0.5">
        {basisLabels.map((basisLabel, index) => (
          <Fragment key={basisLabel}>
            <label className="contents">
              <VectorCoefficientInput
                accessibleLabel={`${label} ${basisLabel}`}
                value={values[index] ?? "0.00"}
                onValueChange={(value) => onValueChange(index, value)}
                onKeyDown={onKeyDown}
              />
              <span className="shrink-0 text-[0.68rem] font-semibold italic leading-none text-muted-foreground">
                {basisLabel}
              </span>
            </label>
            {index < basisLabels.length - 1 ? (
              <span
                aria-hidden="true"
                className="text-[0.68rem] font-semibold leading-none text-muted-foreground"
              >
                +
              </span>
            ) : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function VectorCoefficientInput({
  accessibleLabel,
  onKeyDown,
  onValueChange,
  value,
}: {
  accessibleLabel: string;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [hasEdited, setHasEdited] = useState(false);
  const valueAtFocusRef = useRef(value);
  const displayedValue = isFocused && !hasEdited ? "" : value;

  function handleFocus() {
    valueAtFocusRef.current = value;
    setIsFocused(true);
    setHasEdited(false);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>) {
    setIsFocused(false);
    setHasEdited(false);

    if (hasEdited && event.currentTarget.value.trim() === "") {
      onValueChange(valueAtFocusRef.current);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setHasEdited(true);
    onValueChange(event.target.value);
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={displayedValue}
      aria-label={accessibleLabel}
      className="h-[22px] w-[3rem] min-w-0 px-1 text-right font-mono text-[0.68rem] tabular-nums focus-visible:border-ring/20 focus-visible:bg-background/80 focus-visible:ring-[1px] focus-visible:ring-ring/20 md:text-[0.68rem]"
      onBlur={handleBlur}
      onChange={handleChange}
      onFocus={handleFocus}
      onKeyDown={onKeyDown}
    />
  );
}
