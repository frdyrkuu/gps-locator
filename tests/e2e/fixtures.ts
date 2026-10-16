import { randomUUID } from "node:crypto";
import { encode } from "next-auth/jwt";
import { test as base, expect, type APIRequestContext } from "@playwright/test";
import type { Tracker } from "../../lib/dashboard";

export const test = base.extend<{ owner: APIRequestContext; asset: Tracker }>({
  owner: async ({ context, baseURL }, run) => {
    if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is required for local E2E sessions");
    const name = "gps-locator.session-token";
    const token = await encode({ token: { sub: "owner" }, secret: process.env.AUTH_SECRET, salt: name });
    await context.addCookies([{ name, value: token, url: baseURL!, httpOnly: true, sameSite: "Lax" }]);
    await run(context.request);
  },
  asset: async ({ owner }, run) => {
    const response = await owner.post("/api/v1/trackers", { data: {
      name: `Release check ${randomUUID()}`, type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 30,
    } });
    expect(response.status()).toBe(201);
    const asset: Tracker = await response.json();
    try { await run(asset); }
    finally {
      const deletion = await owner.delete(`/api/v1/trackers/${asset.id}`);
      expect([204, 404]).toContain(deletion.status());
    }
  },
});

export { expect };

export async function issue(owner: APIRequestContext, id: string): Promise<string> {
  const response = await owner.post(`/api/v1/trackers/${id}/credentials`);
  expect(response.status()).toBe(201);
  expect(response.headers()["cache-control"]).toBe("no-store");
  return (await response.json()).token;
}

export function observation(id: string) {
  return { trackerId: id, latitude: 14.676, longitude: 121.0437, reportedAt: new Date().toISOString(),
    source: "ESP32", messageId: randomUUID(), accuracyMeters: 8, batteryPercent: 0, speedMps: 0 };
}
