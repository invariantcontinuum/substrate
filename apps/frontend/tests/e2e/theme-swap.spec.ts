import { test, expect } from "@playwright/test";

// Helper: open Account modal and navigate to Settings tab, then click the
// theme option that is NOT currently active (i.e. toggle). The theme toggle
// lives inside UserModal → Settings tab, not as a top-level button.
async function toggleTheme(page: import("@playwright/test").Page) {
  // Open the Account modal via the sidebar footer avatar button.
  await page.locator('button.side-nav-avatar').click();
  // Wait for the modal to appear, then click the Settings tab.
  await page.locator('button.user-modal-tab', { hasText: "Settings" }).click();
  // The theme radiogroup has two options: "Light" and "Dark".
  // Click whichever one is NOT currently active (aria-checked="false").
  const inactive = page.locator('[role="radio"][aria-checked="false"]').first();
  await inactive.click();
  // Close the modal by pressing Escape.
  await page.keyboard.press("Escape");
  // Allow DOM + canvas repaint to settle.
  await page.waitForTimeout(150);
}

test.describe("graph theme swap", () => {
  test.beforeEach(async ({ page }) => {
    // The graph view is at "/" (index route). "/graph" is not a React Router
    // route — navigating there triggers a React Router 404.
    // Auth state from global-setup holds Keycloak cookies; the OIDC flow
    // completes automatically (auto-callback path).
    await page.goto("/");
    await page.locator("canvas.graph-canvas-webgl").waitFor({ state: "visible", timeout: 90_000 });
    await page.waitForTimeout(500);
  });

  test("canvas background flips on theme toggle", async ({ page }) => {
    const container = page.locator(".graph-canvas-container");
    const bgBefore = await container.evaluate((el) => getComputedStyle(el).backgroundColor);
    await toggleTheme(page);
    const bgAfter = await container.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bgAfter).not.toBe(bgBefore);
  });

  test("legend border color updates on theme toggle", async ({ page }) => {
    const firstDot = page.locator(".dynamic-legend-dot").first();
    const colorBefore = await firstDot.evaluate((el) => getComputedStyle(el).backgroundColor);
    await toggleTheme(page);
    const colorAfter = await firstDot.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(colorAfter).not.toBe(colorBefore);
  });
});
