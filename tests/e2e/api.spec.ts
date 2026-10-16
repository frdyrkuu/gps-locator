import { createHash, randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { test, expect, issue, observation } from "./fixtures";

test("anonymous and device credentials cannot access any owner endpoint", async ({ request }) => {
  for (const [method, path] of [
    ["GET", "/trackers"], ["POST", "/trackers"], ["PATCH", "/trackers/missing"], ["DELETE", "/trackers/missing"],
    ["GET", "/trackers/missing/locations"], ["POST", "/trackers/missing/credentials"], ["DELETE", "/trackers/missing/credentials"],
  ]) {
    const response = await request.fetch(`/api/v1${path}`, { method });
    expect(response.status()).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect((await request.post("/api/v1/locations", { data: observation("missing") })).status()).toBe(401);
  expect((await request.get("/api/cron/retention")).status()).toBe(401);
});

test("missing session owners and non-owned IDs cannot read or mutate data", async ({ playwright, baseURL, owner }) => {
  const name = "gps-locator.session-token";
  const value = await encode({ token: { sub: "deleted-owner" }, secret: process.env.AUTH_SECRET!, salt: name });
  const deleted = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Cookie: `${name}=${value}` } });
  try { expect((await deleted.get("/api/v1/trackers")).status()).toBe(401); }
  finally { await deleted.dispose(); }
  for (const [method, path] of [["GET", "/locations"], ["PATCH", ""], ["DELETE", ""], ["POST", "/credentials"], ["DELETE", "/credentials"]]) {
    const response = await owner.fetch(`/api/v1/trackers/not-owned${path}`, { method,
      ...(method === "PATCH" && { data: { name: "No", type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 30 } }) });
    expect(response.status()).toBe(404);
  }
});

test("tracker CRUD, origin validation, device binding, deduplication, ordering, history and token lifecycle", async ({ owner, request, asset }) => {
  const path = `/api/v1/trackers/${asset.id}`;
  const first = await issue(owner, asset.id);
  const fix = observation(asset.id);
  const submit = (token: string, data = fix) => request.post("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` }, data });
  expect((await request.get("/api/v1/trackers", { headers: { Authorization: `Bearer ${first}` } })).status()).toBe(401);
  expect((await owner.patch(path, { headers: { Origin: "https://other.example" }, data: asset })).status()).toBe(401);
  expect((await submit(first, { ...fix, trackerId: "another-tracker" })).status()).toBe(403);
  expect((await submit(first, { ...fix, source: "IPHONE_SHORTCUT" })).status()).toBe(403);

  const accepted = await submit(first);
  expect(accepted.status()).toBe(201);
  const receipt = await accepted.json();
  const retry = await submit(first, { ...fix, latitude: 15 });
  expect(retry.status()).toBe(200);
  const duplicate = await retry.json();
  expect(duplicate.id).toBe(receipt.id);
  expect(duplicate.duplicate).toBe(true);

  const delayed = { ...fix, messageId: randomUUID(), latitude: 16, reportedAt: new Date(Date.now() - 3600000).toISOString() };
  expect((await submit(first, delayed)).status()).toBe(201);
  const list = await owner.get("/api/v1/trackers");
  const text = await list.text();
  expect(text.includes(first)).toBe(false);
  expect(/tokenDigest|tokenId|passwordHash/.test(text)).toBe(false);
  const latest = JSON.parse(text).items.find((item: { id: string }) => item.id === asset.id).latestLocation;
  expect(latest.latitude).toBe(fix.latitude);
  expect(latest.batteryPercent).toBe(0);
  const history = await owner.get(`${path}/locations?limit=1`);
  const page = await history.json();
  expect(page.items).toHaveLength(1);
  expect(page.items[0].id).toBe(receipt.id);
  expect(typeof page.nextCursor).toBe("string");
  const older = await owner.get(`${path}/locations?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`);
  const next = await older.json();
  expect(next.items).toHaveLength(1);
  expect(next.items[0].latitude).toBe(16);
  expect(next.nextCursor).toBeNull();
  for (const query of ["limit=101", "limit=0", "cursor=broken"]) expect((await owner.get(`${path}/locations?${query}`)).status()).toBe(400);

  const second = await issue(owner, asset.id);
  expect((await submit(first)).status()).toBe(401);
  expect((await submit(second)).status()).toBe(200);
  expect((await owner.delete(`${path}/credentials`)).status()).toBe(204);
  expect((await submit(second)).status()).toBe(401);
  const third = await issue(owner, asset.id);
  expect((await owner.patch(path, { data: { name: "Renamed release fixture", type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 60 } })).status()).toBe(200);
  expect((await owner.delete(path)).status()).toBe(204);
  expect((await submit(third)).status()).toBe(401);
  expect((await owner.get(`${path}/locations`)).status()).toBe(404);
});

test("ingest rejects malformed bodies, ranges, time, and oversized input", async ({ owner, request, asset }) => {
  const token = await issue(owner, asset.id);
  const headers = { Authorization: `Bearer ${token}` };
  const fix = observation(asset.id);
  for (const change of [{ latitude: -91 }, { longitude: 181 }, { accuracyMeters: -1 }, { speedMps: -1 }, { batteryPercent: 101 },
    { reportedAt: "not-a-date" }, { reportedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
    { reportedAt: new Date(Date.now() + 3600000).toISOString() }, { unexpected: true }]) {
    expect((await request.post("/api/v1/locations", { headers, data: { ...fix, ...change } })).status()).toBe(400);
  }
  expect((await request.post("/api/v1/locations", { headers, data: "not JSON" })).status()).toBe(415);
  expect((await request.post("/api/v1/locations", { headers: { ...headers, "Content-Type": "application/json" }, data: "{" })).status()).toBe(400);
  expect((await request.post("/api/v1/locations", { headers, data: { ...fix, messageId: "x".repeat(5000) } })).status()).toBe(413);
  expect((await owner.post("/api/v1/trackers", { data: { name: " ", type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 9 } })).status()).toBe(400);
});

test("cron rejects a malformed non-ASCII credential without crashing", async ({ request }) => {
  test.skip(!process.env.CRON_SECRET, "CRON_SECRET is required to exercise equal-character-length invalid credentials");
  const response = await request.get("/api/cron/retention", { headers: { Authorization: `Bearer ${"é".repeat(process.env.CRON_SECRET!.length)}` } });
  expect(response.status()).toBe(401);
});

test("ingest counter rejects the next request at its boundary", async ({ owner, request, asset }) => {
  // A scoped counter avoids sending 61 uploads or pruning any existing history.
  const token = await issue(owner, asset.id);
  const { Pool } = await import("@neondatabase/serverless");
  const db = new Pool({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL! });
  const key = createHash("sha256").update(`ingest:${token.split(".")[0]}`).digest("hex");
  try {
    await db.query('INSERT INTO "LoginAttempt" ("key", "attempts", "windowStart") VALUES ($1, 60, NOW())', [key]);
    const response = await request.post("/api/v1/locations", { headers: { Authorization: `Bearer ${token}` }, data: observation(asset.id) });
    expect(response.status()).toBe(429);
    expect(response.headers()["retry-after"]).toBe("60");
  } finally { await db.query('DELETE FROM "LoginAttempt" WHERE "key" = $1', [key]); await db.end(); }
});
