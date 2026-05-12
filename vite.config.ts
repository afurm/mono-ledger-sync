import path from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const localApiHost =
  process.env.MONO_LEDGER_SYNC_HOST === "localhost" ? "localhost" : "127.0.0.1";
const localApiPort =
  process.env.MONO_LEDGER_SYNC_PORT ?? process.env.PORT ?? "3000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": `http://${localApiHost}:${localApiPort}`,
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
});
