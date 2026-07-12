import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import {
  DEFAULT_SELECTION_ACTIVATION,
  readSelectionActivation,
  SELECTION_ACTIVATION_STORAGE_KEY,
  writeSelectionActivation,
} from "../src/selection/selectionActivationPreference";

describe("selection activation preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  test("defaults to double click", () => {
    expect(readSelectionActivation()).toBe(DEFAULT_SELECTION_ACTIVATION);
  });

  test("persists a supported activation", () => {
    writeSelectionActivation("single");

    expect(window.localStorage.getItem(SELECTION_ACTIVATION_STORAGE_KEY)).toBe(
      "single",
    );
    expect(readSelectionActivation()).toBe("single");
  });

  test("ignores unsupported stored values", () => {
    window.localStorage.setItem(SELECTION_ACTIVATION_STORAGE_KEY, "press");

    expect(readSelectionActivation()).toBe(DEFAULT_SELECTION_ACTIVATION);
  });

  test("falls back when storage is unavailable", () => {
    const getItemSpy = spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(readSelectionActivation()).toBe(DEFAULT_SELECTION_ACTIVATION);
    getItemSpy.mockRestore();
  });
});
