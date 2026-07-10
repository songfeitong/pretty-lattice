export const DEFAULT_LANGUAGE = "en";
export const DEFAULT_LANGUAGE_PREFERENCE = "system";
export const LANGUAGE_STORAGE_KEY = "pretty-lattice.language";
export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;
export const LANGUAGE_PREFERENCES = [
  DEFAULT_LANGUAGE_PREFERENCE,
  ...SUPPORTED_LANGUAGES,
] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

export function isLanguagePreference(
  value: string | null | undefined,
): value is LanguagePreference {
  return LANGUAGE_PREFERENCES.includes(value as LanguagePreference);
}

export function resolveSystemLanguage(
  languages: readonly string[] = browserLanguageCodes(),
): AppLanguage {
  for (const language of languages) {
    const normalizedLanguage = language.toLowerCase().replaceAll("_", "-");

    if (normalizedLanguage === "zh" || normalizedLanguage.startsWith("zh-")) {
      return "zh-CN";
    }

    if (normalizedLanguage === "en" || normalizedLanguage.startsWith("en-")) {
      return "en";
    }
  }

  return DEFAULT_LANGUAGE;
}

export function languageForPreference(preference: LanguagePreference): AppLanguage {
  return preference === DEFAULT_LANGUAGE_PREFERENCE
    ? resolveSystemLanguage()
    : preference;
}

export function htmlLangForLanguage(language: AppLanguage): string {
  return language;
}

function browserLanguageCodes(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  if (navigator.languages?.length > 0) {
    return navigator.languages;
  }

  return navigator.language ? [navigator.language] : [];
}
