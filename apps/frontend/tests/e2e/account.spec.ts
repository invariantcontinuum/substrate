import { expect, test } from "@playwright/test";

test("Account tabs render and switch", async ({ page }) => {
  await page.goto("/account");
  await expect(
    page.getByRole("tab", { name: "Devices" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Devices" }).click();
  await expect(page).toHaveURL(/\/account\/devices/);
  await page.getByRole("tab", { name: "Defaults" }).click();
  await expect(page).toHaveURL(/\/account\/defaults/);
  await expect(page.locator(".leiden-knob").first()).toBeVisible();
});

test("Theme change toggles <html> class", async ({ page }) => {
  await page.goto("/account/defaults");
  const themeSelect = page
    .locator("select")
    .filter({ hasText: /System|Light|Dark/i })
    .first();
  await themeSelect.selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
});
