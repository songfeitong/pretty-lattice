import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  type AppLanguage,
  htmlLangForLanguage,
  isAppLanguage,
} from "./languages";
import { readLanguagePreference, writeLanguagePreference } from "./languagePreference";
import { en } from "./resources/en";
import { zhCN } from "./resources/zh-CN";

export { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES, type AppLanguage } from "./languages";

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

export async function setAppLanguage(language: AppLanguage) {
  writeLanguagePreference(language);

  if (i18n.language !== language) {
    await i18n.changeLanguage(language);
    return;
  }

  syncDocumentLanguage(language);
}

export function currentAppLanguage(): AppLanguage {
  return isAppLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LANGUAGE;
}

const initialLanguage = readLanguagePreference();

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
