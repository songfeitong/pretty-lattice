import { afterEach } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

import { readPrettyLatticeVersion } from "../projectMetadata";
import { DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, i18n } from "../src/i18n";

(import.meta.env as Record<string, string>).VITE_PRETTY_LATTICE_VERSION =
  readPrettyLatticeVersion();

GlobalRegistrator.register({
  url: "http://127.0.0.1:5173",
});

const { cleanup } = await import("@testing-library/react");

afterEach(async () => {
  cleanup();
  window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
  await i18n.changeLanguage(DEFAULT_LANGUAGE);
});
