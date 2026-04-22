/**
 * Playwright global setup — authenticates against Keycloak via the browser
 * OIDC redirect flow and persists the resulting storage state so every spec
 * can start with a warm, authenticated session.
 *
 * Environment:
 *   E2E_BASE_URL   – app base URL (default: http://localhost:5173)
 *   E2E_USERNAME   – Keycloak username (default: admin)
 *   E2E_PASSWORD   – Keycloak password (default: testpass123)
 */
import { chromium, type FullConfig } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const AUTH_STATE_PATH = path.join(__dirname, ".auth-state.json");

export default async function globalSetup(_config: FullConfig) {
  const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
  const username = process.env.E2E_USERNAME ?? "admin";
  const password = process.env.E2E_PASSWORD ?? "testpass123";

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Navigate to root — RequireAuth fires signinRedirect() which causes a
  // full-page redirect to Keycloak.
  await page.goto(baseURL + "/", { waitUntil: "domcontentloaded" });

  // Wait for the URL to be at Keycloak (the redirect happens after React hydrates).
  await page.waitForURL(
    (url) =>
      url.hostname.includes("auth.invariantcontinuum") ||
      url.pathname.includes("/realms/") ||
      url.pathname.includes("/protocol/openid-connect/"),
    { timeout: 45_000 },
  );

  // Fill in Keycloak login form.
  const usernameInput = page.locator("#username, input[name='username']").first();
  const passwordInput = page.locator("#password, input[name='password']").first();
  await usernameInput.waitFor({ state: "visible", timeout: 15_000 });
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await page.locator("#kc-login, input[type='submit'], button[type='submit']").first().click({ force: true });

  // Wait for the OIDC callback redirect back to the app root.
  await page.waitForURL(
    (url) =>
      url.toString().startsWith(baseURL) &&
      !url.toString().includes("auth.invariantcontinuum") &&
      !url.toString().includes("/callback"),
    { timeout: 30_000 },
  );

  // Wait for the OIDC client to exchange the code and store the user in
  // sessionStorage. We poll until the oidc.user key appears.
  await page.waitForFunction(
    () => {
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && k.startsWith("oidc.user:")) return true;
      }
      return false;
    },
    { timeout: 15_000 },
  );

  // Allow any final React renders to settle before snapshotting storage.
  await page.waitForTimeout(2_000);

  // Persist auth cookies / localStorage / sessionStorage so specs can reuse
  // the session.
  await page.context().storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
