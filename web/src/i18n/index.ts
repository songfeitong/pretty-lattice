import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LANGUAGE,
  DEFAULT_LANGUAGE_PREFERENCE,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
  type LanguagePreference,
  htmlLangForLanguage,
  isAppLanguage,
  languageForPreference,
} from "./languages";
import { readLanguagePreference, writeLanguagePreference } from "./languagePreference";
import { en } from "./resources/en";
import { zhCN } from "./resources/zh-CN";

export {
  DEFAULT_LANGUAGE,
  DEFAULT_LANGUAGE_PREFERENCE,
  LANGUAGE_PREFERENCES,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
  type LanguagePreference,
  resolveSystemLanguage,
} from "./languages";

export const resources = {
  en: {
    translation: en,
  },
  "zh-CN": {
    translation: zhCN,
  },
} as const;

export const i18n = i18next.createInstance();

function syncDocumentLanguage(language: AppLanguage) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = htmlLangForLanguage(language);
}

let activeLanguagePreference = readLanguagePreference();

export async function setLanguagePreference(preference: LanguagePreference) {
  activeLanguagePreference = preference;
  writeLanguagePreference(preference);
  const language = languageForPreference(preference);

  if (i18n.language !== language) {
    await i18n.changeLanguage(language);
    return;
  }

  syncDocumentLanguage(language);
}

export function currentLanguagePreference(): LanguagePreference {
  return activeLanguagePreference;
}

export function currentAppLanguage(): AppLanguage {
  return isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;
}

const initialLanguage = languageForPreference(activeLanguagePreference);

void i18n
  .use(initReactI18next)
  .init({
    defaultNS: "translation",
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    lng: initialLanguage,
    resources,
    supportedLngs: Object.keys(resources),
    react: {
      useSuspense: false,
    },
  });

i18n.on("languageChanged", (language) => {
  syncDocumentLanguage(isAppLanguage(language) ? language : DEFAULT_LANGUAGE);
});

syncDocumentLanguage(initialLanguage);

function handleSystemLanguageChange() {
  if (activeLanguagePreference === DEFAULT_LANGUAGE_PREFERENCE) {
    void setLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("languagechange", handleSystemLanguageChange);

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      window.removeEventListener("languagechange", handleSystemLanguageChange);
    });
  }
}
