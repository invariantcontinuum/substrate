import { test, expect } from "@playwright/test";

test.describe("graph bezier visual regression", () => {
  test.beforeEach(async ({ page }) => {
    // The graph view is at "/" (index route). "/graph" is not a React Router
    // route — navigating there triggers a React Router 404.
    // Auth state from global-setup holds Keycloak cookies; the OIDC flow
    // completes automatically (auto-callback path).
    await page.goto("/");
    await page.locator("canvas.graph-canvas-webgl").waitFor({ state: "visible", timeout: 90_000 });
    await page.locator('button[aria-label="Fit"]').click();
    await page.waitForTimeout(500);
  });

  test("canvas pixel snapshot matches golden within 3%", async ({ page }) => {
    const canvas = page.locator("canvas.graph-canvas-webgl");
    await expect(canvas).toHaveScreenshot("bezier-snapshot.png", { maxDiffPixelRatio: 0.03 });
  });
});
