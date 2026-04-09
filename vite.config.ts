import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss(), wasm()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@invariantcontinuum/graph"],
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8180",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8180",
        ws: true,
      },
    },
  },
});
