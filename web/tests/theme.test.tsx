import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "bun:test";

import { ThemeProvider, useTheme } from "../src/theme/ThemeProvider";
import { PREVIEW_THEME_COLORS } from "../src/theme/previewTheme";
import {
  applyResolvedTheme,
  DEFAULT_THEME_PREFERENCE,
  readThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  writeThemePreference,
} from "../src/theme/themePreference";

describe("theme preferences", () => {
  test("reads, validates, and writes the persisted preference", () => {
    expect(readThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);

    writeThemePreference("dark");
    expect(readThemePreference()).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemePreference()).toBe(DEFAULT_THEME_PREFERENCE);
  });

  test("resolves system mode and applies the root theme atomically", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");

    applyResolvedTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  test("updates the provider state, root class, and storage together", async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-state").textContent).toBe("system:light");
    await user.click(screen.getByRole("button", { name: "Use dark theme" }));

    expect(screen.getByTestId("theme-state").textContent).toBe("dark:dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  test("wraps manual theme changes in a view transition", async () => {
    const user = userEvent.setup();
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "startViewTransition",
    );
    let transitionCount = 0;
    let stateAtTransitionStart = "";
    let rootThemeAtTransitionStart = "";

    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        transitionCount += 1;
        stateAtTransitionStart = screen.getByTestId("theme-state").textContent;
        rootThemeAtTransitionStart = document.documentElement.dataset.theme ?? "";
        update();
        return {};
      },
    });

    try {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );
      await user.click(screen.getByRole("button", { name: "Use dark theme" }));

      expect(transitionCount).toBe(1);
      expect(stateAtTransitionStart).toBe("dark:light");
      expect(rootThemeAtTransitionStart).toBe("light");
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(screen.getByTestId("theme-state").textContent).toBe("dark:dark");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(document, "startViewTransition", originalDescriptor);
      } else {
        delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
      }
    }
  });

  test("wraps system theme changes in a view transition", () => {
    const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    const originalTransitionDescriptor = Object.getOwnPropertyDescriptor(
      document,
      "startViewTransition",
    );
    let systemThemeListener: ((event: MediaQueryListEvent) => void) | undefined;
    let systemIsDark = false;
    let transitionCount = 0;

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query === "(prefers-color-scheme: dark)" ? systemIsDark : false,
          media: query,
          onchange: null,
          addEventListener: (event: string, listener: (event: MediaQueryListEvent) => void) => {
            if (query === "(prefers-color-scheme: dark)" && event === "change") {
              systemThemeListener = listener;
            }
          },
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList,
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        transitionCount += 1;
        update();
        return {};
      },
    });

    try {
      render(
        <ThemeProvider>
          <ThemeProbe />
        </ThemeProvider>,
      );

      systemIsDark = true;
      act(() => {
        systemThemeListener?.({ matches: true } as MediaQueryListEvent);
      });

      expect(transitionCount).toBe(1);
      expect(document.documentElement.dataset.theme).toBe("dark");
      expect(screen.getByTestId("theme-state").textContent).toBe("system:dark");
    } finally {
      if (originalMatchMediaDescriptor) {
        Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
      }
      if (originalTransitionDescriptor) {
        Object.defineProperty(document, "startViewTransition", originalTransitionDescriptor);
      } else {
        delete (document as unknown as { startViewTransition?: unknown }).startViewTransition;
      }
    }
  });
});

describe("preview theme colors", () => {
  test("matches the accepted dark preview contrast", () => {
    expect(PREVIEW_THEME_COLORS.dark.background).toBe("#181818");
    expect(PREVIEW_THEME_COLORS.dark.fog).toBe("#181818");
    expect(PREVIEW_THEME_COLORS.dark.unitCell).toBe("#bbbbbb");
    expect(PREVIEW_THEME_COLORS.dark.gizmoLabel).toBe("#eeeeee");
    expect(PREVIEW_THEME_COLORS.dark.showGizmoLabelHalo).toBe(false);
  });
});

function ThemeProbe() {
  const { resolvedTheme, setTheme, theme } = useTheme();

  return (
    <div>
      <span data-testid="theme-state">{`${theme}:${resolvedTheme}`}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        Use dark theme
      </button>
    </div>
  );
}
