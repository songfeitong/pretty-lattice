import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "bun:test";

import { MotionProvider, useMotion } from "../src/motion/MotionProvider";
import {
  applyResolvedMotion,
  DEFAULT_MOTION_PREFERENCE,
  MOTION_MEDIA_QUERY,
  MOTION_STORAGE_KEY,
  readMotionPreference,
  resolveMotion,
  writeMotionPreference,
} from "../src/motion/motionPreference";

describe("motion preferences", () => {
  test("reads, validates, and writes the persisted preference", () => {
    expect(readMotionPreference()).toBe(DEFAULT_MOTION_PREFERENCE);

    writeMotionPreference("reduce");
    expect(readMotionPreference()).toBe("reduce");
    expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("reduce");

    window.localStorage.setItem(MOTION_STORAGE_KEY, "slow");
    expect(readMotionPreference()).toBe(DEFAULT_MOTION_PREFERENCE);
  });

  test("resolves system mode and applies the root motion state", () => {
    expect(resolveMotion("system", "reduce")).toBe("reduce");
    expect(resolveMotion("full", "reduce")).toBe("full");

    applyResolvedMotion("reduce");
    expect(document.documentElement.dataset.motion).toBe("reduce");
  });

  test("follows system changes until the user selects an override", async () => {
    const user = userEvent.setup();
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
    let systemReduced = false;
    let systemListener: ((event: MediaQueryListEvent) => void) | undefined;

    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) =>
        ({
          matches: query === MOTION_MEDIA_QUERY ? systemReduced : false,
          media: query,
          onchange: null,
          addEventListener: (
            event: string,
            listener: (event: MediaQueryListEvent) => void,
          ) => {
            if (query === MOTION_MEDIA_QUERY && event === "change") {
              systemListener = listener;
            }
          },
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => true,
        }) as unknown as MediaQueryList,
    });

    try {
      render(
        <MotionProvider>
          <MotionProbe />
        </MotionProvider>,
      );

      expect(screen.getByTestId("motion-state").textContent).toBe("system:full");
      systemReduced = true;
      act(() => systemListener?.({ matches: true } as MediaQueryListEvent));
      expect(screen.getByTestId("motion-state").textContent).toBe("system:reduce");
      expect(document.documentElement.dataset.motion).toBe("reduce");

      await user.click(screen.getByRole("button", { name: "Use full motion" }));
      expect(screen.getByTestId("motion-state").textContent).toBe("full:full");
      expect(document.documentElement.dataset.motion).toBe("full");
      expect(window.localStorage.getItem(MOTION_STORAGE_KEY)).toBe("full");
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, "matchMedia", originalDescriptor);
      }
    }
  });
});

function MotionProbe() {
  const { motion, resolvedMotion, setMotion } = useMotion();

  return (
    <div>
      <span data-testid="motion-state">{`${motion}:${resolvedMotion}`}</span>
      <button type="button" onClick={() => setMotion("full")}>
        Use full motion
      </button>
    </div>
  );
}
