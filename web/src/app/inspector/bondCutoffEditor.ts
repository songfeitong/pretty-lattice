import type { BondCutoffRange, BondFamilySpec, SceneSpec } from "../../api/scene";

export interface BondCutoffDraft {
  minText: string;
  maxText: string;
  pendingRemoval: boolean;
  initialOverride: boolean;
}

export type BondCutoffDrafts = Record<string, BondCutoffDraft>;
export type BondCutoffField = "min" | "max";

export interface BondCutoffSubmission {
  invalidFields: ReadonlySet<string>;
  nextOverrides: Record<string, BondCutoffRange>;
  changed: boolean;
}

export function createBondCutoffDrafts(
  scene: SceneSpec,
  cutoffOverrides: Record<string, BondCutoffRange>,
): BondCutoffDrafts {
  return Object.fromEntries(
    scene.bondFamilies.map((family) => {
      const cutoffRange = cutoffOverrides[family.key];
      return [
        family.key,
        cutoffRange
          ? {
              initialOverride: true,
              maxText: formatCutoffBound(cutoffRange.max),
              minText: formatCutoffBound(cutoffRange.min),
              pendingRemoval: false,
            }
          : suggestedBondCutoffDraft(family),
      ];
    }),
  );
}

export function suggestedBondCutoffDraft(family: BondFamilySpec): BondCutoffDraft {
  return {
    initialOverride: false,
    minText: "0.000",
    maxText: family.maxLength === null ? "" : formatSuggestedMaximum(family.maxLength),
    pendingRemoval: false,
  };
}

export function bondCutoffDraftCanRestore(
  draft: BondCutoffDraft,
  family: BondFamilySpec,
): boolean {
  return draft.pendingRemoval || draft.initialOverride || !isSuggestedCutoffDraft(draft, family);
}

export function formatBondCutoffDraftField(value: string): string {
  const parsed = Number(value.trim());
  return value.trim() !== "" && Number.isFinite(parsed) ? parsed.toFixed(3) : value;
}

export function formatBondCutoffDrafts(drafts: BondCutoffDrafts): BondCutoffDrafts {
  return Object.fromEntries(
    Object.entries(drafts).map(([familyKey, draft]) => [
      familyKey,
      draft.pendingRemoval
        ? draft
        : {
            ...draft,
            minText: formatBondCutoffDraftField(draft.minText),
            maxText: formatBondCutoffDraftField(draft.maxText),
          },
    ]),
  );
}

export function buildBondCutoffSubmission(
  families: readonly BondFamilySpec[],
  cutoffOverrides: Record<string, BondCutoffRange>,
  drafts: BondCutoffDrafts,
): BondCutoffSubmission {
  const nextOverrides: Record<string, BondCutoffRange> = { ...cutoffOverrides };
  const invalidFields = new Set<string>();

  for (const family of families) {
    const draft = drafts[family.key];
    if (!draft) continue;
    if (draft.pendingRemoval) {
      delete nextOverrides[family.key];
      continue;
    }

    const minimum = Number(draft.minText.trim());
    const maximum = Number(draft.maxText.trim());
    const changed = draft.initialOverride
      ? !cutoffRangesEqual(cutoffOverrides[family.key], { min: minimum, max: maximum })
      : !isSuggestedCutoffDraft(draft, family);
    if (!changed) continue;

    const minimumValid =
      draft.minText.trim() !== "" && Number.isFinite(minimum) && minimum >= 0;
    const maximumValid = draft.maxText.trim() !== "" && Number.isFinite(maximum);
    if (!minimumValid) invalidFields.add(`${family.key}:min`);
    if (!maximumValid) invalidFields.add(`${family.key}:max`);
    if (minimumValid && maximumValid && maximum <= minimum) {
      invalidFields.add(`${family.key}:min`);
      invalidFields.add(`${family.key}:max`);
    }
    if (minimumValid && maximumValid && maximum > minimum) {
      nextOverrides[family.key] = { min: minimum, max: maximum };
    }
  }

  return {
    invalidFields,
    nextOverrides,
    changed: !cutoffOverrideMapsEqual(cutoffOverrides, nextOverrides),
  };
}

function isSuggestedCutoffDraft(
  draft: BondCutoffDraft,
  family: BondFamilySpec,
): boolean {
  const suggested = suggestedBondCutoffDraft(family);
  const minimum = Number(draft.minText.trim());
  const maximum = Number(draft.maxText.trim());
  return (
    draft.minText.trim() !== "" &&
    draft.maxText.trim() !== "" &&
    minimum === Number(suggested.minText) &&
    maximum === Number(suggested.maxText)
  );
}

function formatSuggestedMaximum(maximum: number): string {
  return formatCutoffBound(Math.ceil((maximum - Number.EPSILON) * 1_000) / 1_000);
}

function formatCutoffBound(value: number): string {
  return value.toFixed(3);
}

function cutoffRangesEqual(
  left: BondCutoffRange | undefined,
  right: BondCutoffRange | undefined,
): boolean {
  return left?.min === right?.min && left?.max === right?.max;
}

function cutoffOverrideMapsEqual(
  left: Record<string, BondCutoffRange>,
  right: Record<string, BondCutoffRange>,
): boolean {
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => cutoffRangesEqual(left[key], right[key]))
  );
}
