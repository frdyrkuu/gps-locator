import assert from "node:assert/strict";
import { test } from "node:test";
import { issueToken, matchesDigest, tokenParts } from "../lib/device-token";
import { locationInput, validObservation, sourceForType } from "../lib/location-input";
import { trackerInput } from "../lib/tracker-input";

test("tracker settings and location input reject malformed or contradictory data", () => {
  const tracker = { name: "  Bike  ", type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 30 };
  assert.equal(trackerInput.parse(tracker).name, "Bike");
  assert.equal(trackerInput.safeParse({ ...tracker, expectedIntervalSeconds: null }).success, false);
  assert.equal(trackerInput.safeParse({ ...tracker, name: "  " }).success, false);
  assert.equal(trackerInput.safeParse({ ...tracker, extra: "unexpected" }).success, false);
  const fix = { trackerId: "a", latitude: 90, longitude: -180, reportedAt: new Date().toISOString(), source: "ESP32" };
  assert.equal(locationInput.safeParse(fix).success, true);
  assert.equal(locationInput.safeParse({ ...fix, latitude: 91 }).success, false);
  assert.equal(locationInput.safeParse({ ...fix, batteryPercent: 101 }).success, false);
  assert.equal(locationInput.safeParse({ ...fix, messageId: "" }).success, false);
  assert.equal(sourceForType.APPLE_WATCH, "WATCH_PHONE_ASSISTED");
  const now = new Date("2026-10-17T12:00:00Z");
  assert.equal(validObservation(new Date(now.getTime() - 7 * 86400_000).toISOString(), now), true);
  assert.equal(validObservation(new Date(now.getTime() - 7 * 86400_000 - 1).toISOString(), now), false);
  assert.equal(validObservation(new Date(now.getTime() + 300_001).toISOString(), now), false);
});

test("one-time token is high entropy, digest-only, and rejects malformed credentials", () => {
  const a = issueToken();
  const b = issueToken();
  assert.notEqual(a.token, b.token);
  assert.equal(a.tokenDigest.includes(a.token.split(".")[1]), false);
  assert.equal(matchesDigest(tokenParts(`Bearer ${a.token}`)!.digest, a.tokenDigest), true);
  assert.equal(matchesDigest(tokenParts(`Bearer ${b.token}`)!.digest, a.tokenDigest), false);
  assert.equal(tokenParts(`Bearer ${a.token}oops`), null);
});
