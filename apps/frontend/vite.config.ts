import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
    // Pick up tests co-located with the @invariantcontinuum/graph package
    // sources too — the overlay/theme tests moved there during the graph-ui
    // package consolidation. Path is workspace-relative so it still resolves
    // when vitest is invoked from the frontend dir.
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "../../packages/graph-ui/react/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
});
