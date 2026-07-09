import { describe, expect, test } from "bun:test";

import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  currentAppLanguage,
  resources,
  setAppLanguage,
} from "../src/i18n";
import {
  readLanguagePreference,
  writeLanguagePreference,
} from "../src/i18n/languagePreference";

describe("i18n resources", () => {
  test("keeps translation key parity across supported languages", () => {
    const englishKeys = flattenResourceKeys(resources.en.translation);

    for (const language of SUPPORTED_LANGUAGES) {
      expect(flattenResourceKeys(resources[language].translation)).toEqual(englishKeys);
    }
  });

  test("defaults to English and persists explicit language changes", async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await setAppLanguage(DEFAULT_LANGUAGE);

    expect(currentAppLanguage()).toBe("en");
    expect(document.documentElement.lang).toBe("en");

    await setAppLanguage("zh-CN");

    expect(currentAppLanguage()).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
  });

  test("keeps language changes usable when browser storage throws", () => {
    const originalStorage = window.localStorage;
    const throwingStorage = {
      clear() {},
      getItem() {
        throw new Error("Storage is unavailable.");
      },
      key() {
        return null;
      },
      get length() {
        return 0;
      },
      removeItem() {},
      setItem() {
        throw new Error("Storage is unavailable.");
      },
    } satisfies Storage;

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: throwingStorage,
    });

    try {
      expect(readLanguagePreference()).toBe(DEFAULT_LANGUAGE);
      expect(() => writeLanguagePreference("zh-CN")).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: originalStorage,
      });
    }
  });
});

function flattenResourceKeys(resource: unknown, prefix = ""): string[] {
  if (!resource || typeof resource !== "object") {
    return [prefix];
  }

  return Object.entries(resource)
    .flatMap(([key, value]) => flattenResourceKeys(value, prefix ? `${prefix}.${key}` : key))
    .sort();
}
