import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

import { readPrettyLatticeVersion } from "./projectMetadata";

const apiTarget = process.env.PRETTY_LATTICE_API_URL ?? "http://127.0.0.1:8765";
const prettyLatticeVersion = readPrettyLatticeVersion();

export default defineConfig({
  define: {
    "import.meta.env.VITE_PRETTY_LATTICE_VERSION": JSON.stringify(prettyLatticeVersion),
  },
  plugins: [react(), tailwindcss()],
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
    chunkSizeWarningLimit: 1400,
  },
});
