import { randomUUID } from "node:crypto";
import { test, expect, issue, observation } from "./fixtures";
import type { Page } from "@playwright/test";

async function tiles(page: Page, fail = false) {
  const origin = new URL(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png").origin;
  await page.route(`${origin}/**`, route => fail ? route.abort() : route.fulfill({ contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") }));
}

test("anonymous redirect and generic invalid sign-in; valid owner can sign in and out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Email", { exact: true }).fill(`release-${randomUUID()}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  test.skip(!process.env.SEED_OWNER_EMAIL || !process.env.SEED_OWNER_PASSWORD, "seed credentials required for valid UI login");
  await tiles(page);
  await page.getByLabel("Email", { exact: true }).fill(process.env.SEED_OWNER_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.SEED_OWNER_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3100/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const confirmation = page.getByRole("alertdialog", { name: "Sign out?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(page).toHaveURL("http://localhost:3100/");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await confirmation.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("owner can add a tracker through the form", async ({ page, owner }) => {
  await tiles(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Add tracker", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add tracker", exact: true });
  const name = `Release form ${randomUUID()}`;
  await dialog.getByLabel("Name", { exact: true }).fill(name);
  try {
    await dialog.getByRole("button", { name: "Save tracker" }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole("textbox", { name: "Search your things" }).fill(name);
    await expect(page.getByRole("list", { name: "Your trackers" })).toContainText(name);
  } finally {
    const response = await owner.get("/api/v1/trackers");
    for (const item of (await response.json()).items) {
      if (item.name === name) expect((await owner.delete(`/api/v1/trackers/${item.id}`)).status()).toBe(204);
    }
  }
});

test("desktop map is not clipped; keyboard selection, token UI, telemetry, history, edit and delete work", async ({ page, owner, request, asset }) => {
  await tiles(page);
  const workerLoaded = page.waitForResponse(response => response.url().includes("maplibre-gl-worker") && response.ok());
  await page.goto("/");
  await workerLoaded;
  await page.getByRole("textbox", { name: "Search your things" }).fill(asset.name);
  const row = page.getByRole("list", { name: "Your trackers" }).getByRole("button", { name: asset.name });
  await row.focus();
  await page.keyboard.press("Enter");
  const details = page.getByRole("region", { name: "Selected tracker details" });
  await expect(details).toContainText("Never reported");
  await page.getByRole("button", { name: "Issue / rotate token", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Copy your device token now" });
  await expect(dialog).toBeVisible();
  const token = await dialog.getByLabel("New device token").inputValue();
  expect(/^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)).toBe(true);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  expect((await request.post("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` }, data: observation(asset.id) })).status()).toBe(201);
  await page.reload();
  const marker = page.getByRole("button", { name: `Select ${asset.name}`, exact: true });
  await expect(marker).toBeVisible();
  await expect.poll(async () => {
    const map = await page.getByLabel("Interactive map of reported positions", { exact: true }).boundingBox();
    const area = await page.getByRole("region", { name: "Last known location map" }).boundingBox();
    return Boolean(map && area && map.height > 500 && map.height === area.height && map.width === area.width);
  }).toBe(true);
  const zoom = page.locator(".maplibregl-ctrl-zoom-in");
  await marker.click();
  await zoom.click();
  await expect(details).toContainText("Battery: 0%");
  await expect(details).toContainText("Speed: 0 m/s");
  await page.getByRole("button", { name: "View seven-day history", exact: true }).click();
  await expect(page.getByRole("list", { name: "Location history" })).toContainText("14.676000, 121.043700");
  await page.getByRole("button", { name: "Collapse asset panel" }).click();
  await expect(page.getByRole("complementary", { name: "Asset panel" })).toBeHidden();
  await page.getByRole("button", { name: "Expand asset panel" }).click();
  await page.getByRole("textbox", { name: "Search your things" }).fill("no-match-release-fixture");
  await expect(page.getByText("No matching things.")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editing = page.getByRole("dialog", { name: "Edit tracker" });
  await editing.getByLabel("Name", { exact: true }).fill(`${asset.name} edited`);
  await editing.getByRole("button", { name: "Save tracker" }).click();
  await expect(editing).toBeHidden();
  await expect(details.getByRole("heading")).toHaveText(`${asset.name} edited`);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(details).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(details).toBeHidden();
  expect((await owner.get(`/api/v1/trackers/${asset.id}/locations`)).status()).toBe(404);
});

test("mobile Sheet, phone-assisted wording and full-height map remain usable", async ({ page, owner, request, asset }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await owner.patch(`/api/v1/trackers/${asset.id}`, { data: {
    name: asset.name, type: "APPLE_WATCH", reportingMode: "ON_DEMAND", expectedIntervalSeconds: null,
  } })).status()).toBe(200);
  const token = await issue(owner, asset.id);
  expect((await request.post("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` }, data: { ...observation(asset.id), source: "WATCH_PHONE_ASSISTED" } })).status()).toBe(201);
  await tiles(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: `Select ${asset.name}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Search \/ details/ }).click();
  const sheet = page.getByRole("dialog", { name: "Your things", exact: true });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: "Search your things" }).fill(asset.name);
  const row = sheet.getByRole("list", { name: "Your trackers" }).getByRole("button", { name: asset.name });
  await expect(row).toContainText("Phone-assisted");
  await row.click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: `Details: ${asset.name}`, exact: true }).click();
  await expect(sheet.getByRole("region", { name: "Selected tracker details" })).toContainText("this may be the phone’s position");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const map = await page.getByLabel("Interactive map of reported positions", { exact: true }).boundingBox();
  expect(map!.height).toBeGreaterThan(600);
  await expect(page.getByRole("link", { name: "© OpenStreetMap contributors", exact: true })).toBeVisible();
});

test("refresh failure retains positions, retries recover, and hidden tabs stop polling", async ({ page, owner, asset }) => {
  const token = await issue(owner, asset.id);
  expect((await owner.post("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` }, data: observation(asset.id) })).status()).toBe(201);
  await tiles(page);
  let failed = false;
  let reads = 0;
  await page.route("**/api/v1/trackers", async route => {
    if (route.request().method() !== "GET") return route.continue();
    reads++;
    return failed ? route.fulfill({ status: 503, json: { error: { code: "UNAVAILABLE" } } }) : route.continue();
  });
  await page.goto("/");
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.getByText("Up to date with server", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Search your things" }).fill(asset.name);
  failed = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("Refresh failed; showing saved positions.")).toBeVisible();
  await expect(page.getByRole("list", { name: "Your trackers" })).toContainText("14.67600, 121.04370");
  failed = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByText("Up to date with server", { exact: false })).toBeVisible();
  await page.clock.install();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const before = reads;
  await page.clock.fastForward(40000);
  expect(reads).toBe(before);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => reads).toBeGreaterThan(before);
  const resumed = reads;
  await page.clock.fastForward(20000);
  await expect.poll(() => reads).toBeGreaterThan(resumed);
});

test("map tile failures and no-WebGL keep reported coordinates readable", async ({ page, owner, asset }) => {
  const token = await issue(owner, asset.id);
  expect((await owner.post("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` }, data: observation(asset.id) })).status()).toBe(201);
  await tiles(page, true);
  await page.goto("/");
  await expect(page.getByText("Map unavailable or tiles failed.", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Search your things" }).fill(asset.name);
  await expect(page.getByRole("list", { name: "Your trackers" })).toContainText("14.67600, 121.04370");
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl")) return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.reload();
  await expect(page.getByText("Map unavailable or tiles failed.", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Search your things" }).fill(asset.name);
  await expect(page.getByRole("list", { name: "Your trackers" })).toContainText("14.67600, 121.04370");
});
