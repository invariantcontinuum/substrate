import { test, expect } from "@playwright/test";

test.describe("graph canvas", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/graph");
    await page.waitForEvent("console", (msg) => msg.text().includes("graph:ready"));
  });

  test("graph renders and is not empty inside viewport", async ({ page }) => {
    const canvas = page.locator("canvas.graph-canvas-webgl");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(400);
    expect(box?.height ?? 0).toBeGreaterThan(300);
  });

  test("fit button recentres the camera", async ({ page }) => {
    await page.locator('button[aria-label="Fit"]').click();
    const zoom = await page.evaluate(() => (window as any).__graph?.state?.().zoom ?? 1);
    expect(zoom).toBeGreaterThan(0.05);
    expect(zoom).toBeLessThanOrEqual(8);
  });

  test("zoom in + zoom out change zoom level", async ({ page }) => {
    const initial = await page.evaluate(() => (window as any).__graph?.state?.().zoom ?? 1);
    for (let i = 0; i < 3; i++) await page.locator('button[aria-label="Zoom in"]').click();
    const zIn = await page.evaluate(() => (window as any).__graph?.state?.().zoom);
    expect(zIn).toBeGreaterThan(initial * 1.2);
    for (let i = 0; i < 4; i++) await page.locator('button[aria-label="Zoom out"]').click();
    const zOut = await page.evaluate(() => (window as any).__graph?.state?.().zoom);
    expect(zOut).toBeLessThan(initial * 0.9);
  });

  test("click center node opens detail panel", async ({ page }) => {
    const canvas = page.locator("canvas.graph-canvas-webgl");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.locator('[data-testid="node-detail-panel"]')).toBeVisible();
  });

  test("theme toggle changes canvas background", async ({ page }) => {
    const pixelAt = async () =>
      page.evaluate(() => {
        const c = document.querySelector("canvas.graph-canvas-webgl") as HTMLCanvasElement;
        const gl = c.getContext("webgl2");
        const buf = new Uint8Array(4);
        gl?.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        return Array.from(buf);
      });
    const before = await pixelAt();
    await page.locator('[data-testid="theme-toggle"]').click();
    await page.waitForTimeout(300);
    const after = await pixelAt();
    expect(after.join()).not.toEqual(before.join());
  });

  test("initial /api/graph is under 5 MB", async ({ request }) => {
    const r = await request.get("/api/graph?sync_ids=fixture-seed");
    expect(r.status()).toBe(200);
    const len = (await r.body()).byteLength;
    expect(len).toBeLessThan(5 * 1024 * 1024);
  });

  test("node detail fetch fires on click; hits cache on re-open", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/graph/nodes/")) requests.push(req.url());
    });
    const canvas = page.locator("canvas.graph-canvas-webgl");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("no canvas box");
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.locator('[data-testid="node-detail-panel"]')).toBeVisible();
    const first = requests.length;
    expect(first).toBeGreaterThanOrEqual(1);
    await page.keyboard.press("Escape");
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
    await expect(page.locator('[data-testid="node-detail-panel"]')).toBeVisible();
    expect(requests.length).toBe(first);
  });

  test("search box filters and focuses node", async ({ page }) => {
    await page.keyboard.press("Control+k");
    await page.locator(".graph-search input").fill("orders");
    await expect(page.locator(".graph-search-results li").first()).toBeVisible();
    await page.locator(".graph-search-results li").first().click();
    await expect(page.locator('[data-testid="node-detail-panel"]')).toBeVisible();
  });
});
