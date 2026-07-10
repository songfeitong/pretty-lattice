// Keep this key in sync with the pre-paint bootstrap in index.html.
export const THEME_STORAGE_KEY = "pretty-lattice-theme";
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export const DEFAULT_THEME_PREFERENCE: ThemePreference = "system";
export const DARK_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_PREFERENCE;
  }

  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(storedTheme) ? storedTheme : DEFAULT_THEME_PREFERENCE;
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function writeThemePreference(theme: ThemePreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme switching should still work when browser storage is unavailable.
  }
}

export function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  try {
    return window.matchMedia(DARK_THEME_MEDIA_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function resolveTheme(
  theme: ThemePreference,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  return theme === "system" ? systemTheme : theme;
}

export function applyResolvedTheme(
  theme: ResolvedTheme,
  root: HTMLElement | null = typeof document === "undefined"
    ? null
    : document.documentElement,
) {
  if (!root) {
    return;
  }

  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
