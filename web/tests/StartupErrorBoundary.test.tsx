import { render, screen } from "@testing-library/react";
import { expect, spyOn, test } from "bun:test";
import type { ReactElement } from "react";

import { StartupErrorBoundary } from "../src/app/StartupErrorBoundary";

function BrokenApp(): ReactElement {
  throw new Error("startup exploded");
}

test("renders children while startup succeeds", () => {
  render(
    <StartupErrorBoundary>
      <p>App ready</p>
    </StartupErrorBoundary>,
  );

  expect(screen.getByText("App ready")).toBeTruthy();
});

test("shows actionable details when initial rendering fails", () => {
  const consoleError = spyOn(console, "error").mockImplementation(() => {});
  try {
    render(
      <StartupErrorBoundary>
        <BrokenApp />
      </StartupErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "The app could not start" })).toBeTruthy();
    expect(screen.getByText("startup exploded")).toBeTruthy();
    expect(screen.getByText("prl --verbose")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy();
    expect(consoleError).toHaveBeenCalled();
  } finally {
    consoleError.mockRestore();
  }
});
