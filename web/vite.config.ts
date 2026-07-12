import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, type Plugin } from "vite";

import { readPrettyLatticeVersion } from "./projectMetadata";

const apiTarget = process.env.PRETTY_LATTICE_API_URL ?? "http://127.0.0.1:8765";
const prettyLatticeVersion = readPrettyLatticeVersion();

function devFaviconPlugin(): Plugin {
  return {
    name: "pretty-lattice-dev-favicon",
    apply: "serve",
    transformIndexHtml(html) {
      return html.replace('href="/favicon.svg"', 'href="/favicon.dev.svg"');
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_PRETTY_LATTICE_VERSION": JSON.stringify(prettyLatticeVersion),
  },
  plugins: [devFaviconPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
