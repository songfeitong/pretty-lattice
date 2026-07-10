import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { flushSync } from "react-dom";

import {
  applyResolvedTheme,
  DARK_THEME_MEDIA_QUERY,
  readSystemTheme,
  readThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
  writeThemePreference,
} from "./themePreference";

const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";

interface ThemeContextValue {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  theme: ThemePreference;
}

const ThemeContext = createContext<ThemeContextValue>({
  resolvedTheme: "light",
  setTheme: () => {},
  theme: "system",
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(readThemePreference);
  const [systemTheme, setSystemTheme] = useState(readSystemTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(theme, systemTheme),
  );

  useLayoutEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(DARK_THEME_MEDIA_QUERY);
    const handleSystemThemeChange = (event: MediaQueryListEvent) => {
      const nextSystemTheme: ResolvedTheme = event.matches ? "dark" : "light";
      if (nextSystemTheme === systemTheme) {
        return;
      }

      if (theme === "system") {
        updateThemeWithTransition(() => {
          applyResolvedTheme(nextSystemTheme);
          setSystemTheme(nextSystemTheme);
          setResolvedTheme(nextSystemTheme);
        });
        return;
      }

      setSystemTheme(nextSystemTheme);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [systemTheme, theme]);

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      if (nextTheme === theme) {
        return;
      }

      writeThemePreference(nextTheme);
      const nextSystemTheme = readSystemTheme();
      const nextResolvedTheme = resolveTheme(nextTheme, nextSystemTheme);

      flushSync(() => setThemeState(nextTheme));
      updateThemeWithTransition(() => {
        applyResolvedTheme(nextResolvedTheme);
        setSystemTheme(nextSystemTheme);
        setResolvedTheme(nextResolvedTheme);
      });
    },
    [theme],
  );

  const value = useMemo(
    () => ({ resolvedTheme, setTheme, theme }),
    [resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

function updateThemeWithTransition(update: () => void) {
  if (typeof document === "undefined") {
    update();
    return;
  }

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;

  if (typeof document.startViewTransition !== "function" || prefersReducedMotion) {
    update();
    return;
  }

  try {
    document.startViewTransition(() => {
      flushSync(update);
    });
  } catch {
    update();
  }
}
