import { test, expect } from "@playwright/test";

test.describe("graph spotlight", () => {
  test.beforeEach(async ({ page }) => {
    // The graph view is at "/" (index route). "/graph" is not a React Router
    // route — navigating there triggers a React Router 404.
    // The auth state from global-setup holds Keycloak cookies, so the OIDC
    // flow completes automatically (KC sees the session → auto-callback).
    await page.goto("/");
    // Wait for the OIDC auto-login to complete and the graph canvas to mount.
    // This may take up to 45 s on a fresh context (includes Keycloak roundtrip
    // + WASM compilation + graph data fetch).
    await page.locator("canvas.graph-canvas-webgl").waitFor({ state: "visible", timeout: 90_000 });
    // Extra settle time for the WASM layout pass and graph data load.
    await page.waitForTimeout(1_000);
  });

  test("clicking a node activates spotlight + moves camera", async ({ page }) => {
    const container = page.locator(".graph-canvas-container");
    await expect(container).toHaveAttribute("data-spotlight-active", "false");

    const canvas = page.locator("canvas.graph-canvas-webgl");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");

    const zoomBefore = await page.evaluate(() => (window as any).__graph?.state?.().zoom ?? 0);
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });

    await expect(container).toHaveAttribute("data-spotlight-active", "true", { timeout: 1500 });

    await page.waitForTimeout(550); // allow the 400 ms animated tween to finish
    const zoomAfter = await page.evaluate(() => (window as any).__graph?.state?.().zoom ?? 0);
    expect(zoomAfter).not.toBe(zoomBefore);
  });

  test("Escape clears spotlight", async ({ page }) => {
    const container = page.locator(".graph-canvas-container");
    const canvas = page.locator("canvas.graph-canvas-webgl");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(container).toHaveAttribute("data-spotlight-active", "true", { timeout: 1500 });
    await page.keyboard.press("Escape");
    await expect(container).toHaveAttribute("data-spotlight-active", "false");
  });
});
