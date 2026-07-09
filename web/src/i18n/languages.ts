export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "pretty-lattice.language";
export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;

export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return SUPPORTED_LANGUAGES.includes(value as AppLanguage);
}

export function htmlLangForLanguage(language: AppLanguage): string {
  return language;
}
