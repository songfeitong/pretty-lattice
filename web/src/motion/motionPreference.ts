// Keep this key in sync with the pre-paint bootstrap in index.html.
export const MOTION_STORAGE_KEY = "pretty-lattice-motion";
export const MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
export const MOTION_PREFERENCES = ["system", "reduce", "full"] as const;

export type MotionPreference = (typeof MOTION_PREFERENCES)[number];
export type ResolvedMotion = Exclude<MotionPreference, "system">;

export const DEFAULT_MOTION_PREFERENCE: MotionPreference = "system";

export function isMotionPreference(value: unknown): value is MotionPreference {
  return MOTION_PREFERENCES.includes(value as MotionPreference);
}

export function readMotionPreference(): MotionPreference {
  if (typeof window === "undefined") {
    return DEFAULT_MOTION_PREFERENCE;
  }

  try {
    const storedPreference = window.localStorage.getItem(MOTION_STORAGE_KEY);
    return isMotionPreference(storedPreference)
      ? storedPreference
      : DEFAULT_MOTION_PREFERENCE;
  } catch {
    return DEFAULT_MOTION_PREFERENCE;
  }
}

export function writeMotionPreference(preference: MotionPreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(MOTION_STORAGE_KEY, preference);
  } catch {
    // Motion preference still applies for the current session when storage is unavailable.
  }
}

export function readSystemMotion(): ResolvedMotion {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "full";
  }

  try {
    return window.matchMedia(MOTION_MEDIA_QUERY).matches ? "reduce" : "full";
  } catch {
    return "full";
  }
}

export function resolveMotion(
  preference: MotionPreference,
  systemMotion: ResolvedMotion,
): ResolvedMotion {
  return preference === "system" ? systemMotion : preference;
}

export function applyResolvedMotion(
  motion: ResolvedMotion,
  root: HTMLElement | null = typeof document === "undefined"
    ? null
    : document.documentElement,
) {
  if (root) {
    root.dataset.motion = motion;
  }
}
