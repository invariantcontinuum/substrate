import { test, expect } from "@playwright/test";

test.describe("ask page", () => {
  test("create thread and see thread in rail", async ({ page }) => {
    await page.goto("/");

    // Switch to the Ask view via the sidebar.
    const askNav = page.getByRole("button", { name: "Ask", exact: true });
    await askNav.click();

    // Create a thread.
    await page.getByRole("button", { name: /new thread/i }).click();

    // Thread list item appears (default title "New thread").
    const threadItem = page.getByText("New thread").first();
    await expect(threadItem).toBeVisible({ timeout: 10_000 });

    // Composer becomes interactable.
    const composer = page.getByPlaceholder("Ask about the graph…");
    await expect(composer).toBeEnabled();
  });
});
