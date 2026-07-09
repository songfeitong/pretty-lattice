import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  type AppLanguage,
  isAppLanguage,
} from "./languages";

export function readLanguagePreference(): AppLanguage {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(storedLanguage) ? storedLanguage : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function writeLanguagePreference(language: AppLanguage) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // The language switch should still work when browser storage is unavailable.
  }
}
