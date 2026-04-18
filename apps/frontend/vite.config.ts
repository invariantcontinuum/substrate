/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8180",
        changeOrigin: true,
      },
      "/jobs": {
        target: "http://localhost:8180",
        changeOrigin: true,
      },
      "/ingest": {
        target: "http://localhost:8180",
        changeOrigin: true,
      },
      "/auth": {
        target: "http://localhost:8180",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    exclude: ["node_modules", "dist"],
  },
});
