import { describe, expect, test } from "bun:test";

import {
  DEFAULT_LANGUAGE_PREFERENCE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  currentAppLanguage,
  currentLanguagePreference,
  resolveSystemLanguage,
  resources,
  setLanguagePreference,
} from "../src/i18n";
import { zhCN } from "../src/i18n/resources/zh-CN";
import { zhTW } from "../src/i18n/resources/zh-TW";
import {
  readLanguagePreference,
  writeLanguagePreference,
} from "../src/i18n/languagePreference";

describe("i18n resources", () => {
  test("uses localized cutoff range headers in Chinese", () => {
    expect(zhCN.objectsPanel.minimumAngstrom).toBe("下界 (Å)");
    expect(zhCN.objectsPanel.maximumAngstrom).toBe("上界 (Å)");
    expect(zhTW.objectsPanel.minimumAngstrom).toBe("下界 (Å)");
    expect(zhTW.objectsPanel.maximumAngstrom).toBe("上界 (Å)");
  });
  test("keeps translation key parity across supported languages", () => {
    const englishKeys = flattenResourceKeys(resources.en.translation);

    for (const language of SUPPORTED_LANGUAGES) {
      expect(flattenResourceKeys(resources[language].translation)).toEqual(englishKeys);
    }
  });

  test("defaults to the system preference and persists explicit language changes", async () => {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await setLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE);

    expect(currentLanguagePreference()).toBe("system");
    expect(currentAppLanguage()).toBe(resolveSystemLanguage());
    expect(document.documentElement.lang).toBe(resolveSystemLanguage());
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("system");

    await setLanguagePreference("zh-CN");

    expect(currentLanguagePreference()).toBe("zh-CN");
    expect(currentAppLanguage()).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");

    await setLanguagePreference("zh-TW");

    expect(currentLanguagePreference()).toBe("zh-TW");
    expect(currentAppLanguage()).toBe("zh-TW");
    expect(document.documentElement.lang).toBe("zh-TW");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW");
  });

  test("matches supported system language variants in preference order", () => {
    expect(resolveSystemLanguage(["zh-TW", "en-US"])).toBe("zh-TW");
    expect(resolveSystemLanguage(["zh-Hant-HK", "en-US"])).toBe("zh-TW");
    expect(resolveSystemLanguage(["zh-HK", "en-US"])).toBe("zh-TW");
    expect(resolveSystemLanguage(["zh-Hans-CN", "en-US"])).toBe("zh-CN");
    expect(resolveSystemLanguage(["fr-FR", "en-GB"])).toBe("en");
    expect(resolveSystemLanguage(["fr-FR"])).toBe("en");
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
      expect(readLanguagePreference()).toBe(DEFAULT_LANGUAGE_PREFERENCE);
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
