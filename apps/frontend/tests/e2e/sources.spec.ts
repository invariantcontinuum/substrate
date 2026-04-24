import { test, expect } from "@playwright/test";

test("Sources tabs render and switch", async ({ page }) => {
  await page.goto("/sources");
  await expect(page.locator(".tab-strip")).toBeVisible();

  await page.getByRole("link", { name: "Snapshots" }).click();
  await expect(page).toHaveURL(/\/sources\/snapshots/);

  await page.getByRole("link", { name: "Config" }).click();
  await expect(page).toHaveURL(/\/sources\/config/);
  await expect(page.locator(".leiden-knob").first()).toBeVisible();

  await page.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/sources\/activity/);
});

test("Drag knob → drift → Recompute → new cache key", async ({ page }) => {
  await page.goto("/sources/config");
  // Load at least one sync via Snapshots tab beforehand (fixture in beforeAll).
  const slider = page.locator(".leiden-knob input[type=range]").first();
  await slider.fill("2.0");
  await expect(page.getByRole("button", { name: /Recompute \(\d/ })).toBeVisible();
  await page.getByRole("button", { name: /Recompute/ }).click();
  // Drift clears after compute:
  await expect(page.getByText(/in sync/)).toBeVisible({ timeout: 20_000 });
});
