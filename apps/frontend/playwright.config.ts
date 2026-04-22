import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTH_STATE_PATH = path.join(__dirname, "tests/e2e/.auth-state.json");

export default defineConfig({
  testDir: "./tests/e2e",
  // 120 s to cover: Keycloak auto-login roundtrip (~5 s) + WASM compilation
  // (~10 s) + graph data fetch + assertion time.
  timeout: 120_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Reuse the Keycloak session created by global-setup so each spec starts
    // already authenticated.
    storageState: AUTH_STATE_PATH,
  },
  reporter: [["list"]],
});
