import assert from "node:assert/strict";
import { test } from "node:test";
import { accuracyRing, freshness, sourceLabel, type Tracker } from "../lib/dashboard";

const now = Date.parse("2026-10-17T12:00:00Z");
const tracker: Tracker = { id: "bike", name: "Bike", type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 30,
  latestLocation: { latitude: 14.676, longitude: 121.0437, reportedAt: new Date(now).toISOString(), receivedAt: new Date(now).toISOString(), source: "ESP32", accuracyMeters: 100, batteryPercent: 0, speedMps: 0 } };

test("interval freshness follows exact observation thresholds and clamps future clock skew", () => {
  assert.equal(freshness({ ...tracker, latestLocation: null }, now), "Never reported");
  assert.equal(freshness(tracker, now - 300000), "Recent");
  assert.equal(freshness(tracker, now + 90000), "Recent");
  assert.equal(freshness(tracker, now + 90001), "Stale");
  assert.equal(freshness(tracker, now + 900000), "Stale");
  assert.equal(freshness(tracker, now + 900001), "Offline");
  const slow = { ...tracker, expectedIntervalSeconds: 600 };
  assert.equal(freshness(slow, now + 1800000), "Recent");
  assert.equal(freshness(slow, now + 6000000), "Stale");
  assert.equal(freshness(slow, now + 6000001), "Offline");
  const fast = { ...tracker, expectedIntervalSeconds: 10 };
  assert.equal(freshness(fast, now + 60000), "Recent");
  assert.equal(freshness(fast, now + 60001), "Stale");
});

test("phone and watch reports never acquire an interval recent/live claim", () => {
  assert.equal(freshness({ ...tracker, type: "IPHONE", reportingMode: "ON_DEMAND" }, now), "On demand");
  assert.equal(freshness({ ...tracker, type: "APPLE_WATCH" }, now), "Phone-assisted");
  assert.equal(sourceLabel("WATCH_PHONE_ASSISTED"), "Phone-assisted Shortcut");
  assert.equal(sourceLabel("IPHONE_SHORTCUT"), "iPhone Shortcut");
});

test("accuracy polygon is closed, finite at the poles, and approximately the requested radius", () => {
  const ring = accuracyRing(tracker.latestLocation!);
  assert.equal(ring.length, 65);
  assert.ok(Math.abs(ring[0][0] - ring[64][0]) < 1e-9);
  assert.ok(Math.abs(ring[0][1] - ring[64][1]) < 1e-9);
  const northDistance = (ring[0][1] - tracker.latestLocation!.latitude) * Math.PI / 180 * 6371008.8;
  assert.ok(Math.abs(northDistance - 100) < 0.01);
  assert.ok(accuracyRing({ ...tracker.latestLocation!, latitude: 90 }).flat().every(Number.isFinite));
});
