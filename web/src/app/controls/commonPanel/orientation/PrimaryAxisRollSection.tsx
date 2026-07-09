import { RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { CrystalCameraPrimaryDirection } from "../../../../model";
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
import { RollControl } from "./RollControl";
import { ScreenAxisChooser } from "./ScreenAxisChooser";

export function PrimaryAxisRollSection({
  onCameraPrimaryChange,
  onCameraRollChange,
  onCameraRollPreviewChange,
  onCameraRollPreviewStart,
  primary,
  rollDegrees,
}: {
  onCameraPrimaryChange: (primary: CrystalCameraPrimaryDirection) => void;
  onCameraRollChange: (rollDegrees: number) => void;
  onCameraRollPreviewChange: (rollDegrees: number) => void;
  onCameraRollPreviewStart: () => void;
  primary: CrystalCameraPrimaryDirection;
  rollDegrees: number;
}) {
  const { t } = useTranslation();
  const [rollResetFeedbackPhase, setRollResetFeedbackPhase] =
    useState<ToolButtonFeedbackPhase>(null);
  const rollResetFeedbackTickRef = useRef(0);
  const rollResetFeedbackTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (rollResetFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(rollResetFeedbackTimeoutRef.current);
      }
    };
  }, []);

  function handleResetRollClick() {
    if (rollResetFeedbackTimeoutRef.current !== null) {
      window.clearTimeout(rollResetFeedbackTimeoutRef.current);
    }

    rollResetFeedbackTickRef.current += 1;
    setRollResetFeedbackPhase(rollResetFeedbackTickRef.current % 2 === 0 ? "b" : "a");
    rollResetFeedbackTimeoutRef.current = window.setTimeout(() => {
      setRollResetFeedbackPhase(null);
      rollResetFeedbackTimeoutRef.current = null;
    }, TOOL_ICON_BUTTON_FEEDBACK_ANIMATION_MS);
    onCameraRollChange(0);
  }

  return (
    <section aria-labelledby="camera-axis-roll-label" className="mb-0.5 grid gap-1.5 px-1.5 pb-1">
      <div className="flex h-7 items-center justify-between gap-2">
        <h2
          id="camera-axis-roll-label"
          className={cn(COMMON_PANEL_SECTION_TITLE_TEXT_CLASS, "leading-tight text-muted-foreground")}
        >
          {t("orientation.primaryAxis")}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("actions.resetRoll")}
          className={cn(
            TOOL_ICON_BUTTON_CLASS,
            rollResetFeedbackPhase === "a" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_A_CLASS : null,
            rollResetFeedbackPhase === "b" ? TOOL_ICON_BUTTON_RESET_FEEDBACK_B_CLASS : null,
          )}
          onClick={handleResetRollClick}
        >
          <RotateCcw aria-hidden="true" />
        </Button>
      </div>
      <div className="-mt-2 grid min-h-[124px] grid-cols-2 items-center gap-3">
        <div className="flex min-w-0 translate-x-2 items-center justify-center">
          <ScreenAxisChooser
            ariaLabelledBy="camera-axis-roll-label"
            value={primary}
            onValueChange={onCameraPrimaryChange}
          />
        </div>

        <RollControl
          className="translate-x-1"
          value={rollDegrees}
          onPreviewValueChange={onCameraRollPreviewChange}
          onPreviewStart={onCameraRollPreviewStart}
          onValueChange={onCameraRollChange}
        />
      </div>
    </section>
  );
}
