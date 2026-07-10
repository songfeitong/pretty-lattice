import {
  DEFAULT_LANGUAGE_PREFERENCE,
  LANGUAGE_STORAGE_KEY,
  type LanguagePreference,
  isLanguagePreference,
} from "./languages";

export function readLanguagePreference(): LanguagePreference {
  if (typeof window === "undefined") {
    return DEFAULT_LANGUAGE_PREFERENCE;
  }

  try {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguagePreference(storedLanguage)
      ? storedLanguage
      : DEFAULT_LANGUAGE_PREFERENCE;
  } catch {
    return DEFAULT_LANGUAGE_PREFERENCE;
  }
}

export function writeLanguagePreference(preference: LanguagePreference) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, preference);
  } catch {
    // The language switch should still work when browser storage is unavailable.
  }
}
