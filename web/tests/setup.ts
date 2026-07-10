import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { readPrettyLatticeVersion } from "../projectMetadata";
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  LANGUAGE_STORAGE_KEY,
  setLanguagePreference,
} from "../src/i18n";
import { THEME_STORAGE_KEY } from "../src/theme/themePreference";

(import.meta.env as Record<string, string>).VITE_PRETTY_LATTICE_VERSION =
  readPrettyLatticeVersion();

GlobalRegistrator.register({
  url: "http://127.0.0.1:5173",
});

const { cleanup } = await import("@testing-library/react");

afterEach(async () => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  document.documentElement.classList.remove("dark", "light");
  delete document.documentElement.dataset.theme;
  document.documentElement.style.removeProperty("color-scheme");
  await setLanguagePreference(DEFAULT_LANGUAGE_PREFERENCE);
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});
