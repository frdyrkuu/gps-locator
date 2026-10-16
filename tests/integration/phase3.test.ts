import assert from "node:assert/strict";
import { test } from "node:test";
import { useTestDatabase } from "./database";

test("phase 3 database lifecycle (requires disposable TEST_DATABASE_URL)", async (t) => {
  if (!useTestDatabase(t)) return;
  const { prisma } = await import("../../lib/db");
  const { rotateToken, revokeToken } = await import("../../lib/credential-store");
  const { tokenParts, matchesDigest } = await import("../../lib/device-token");
  const { saveLocation } = await import("../../lib/location-store");
  const { getHistory, parseCursor } = await import("../../lib/history");
  const { pruneHistory } = await import("../../lib/retention");
  const ownerId = "owner";
  const tracker = await prisma.tracker.create({ data: {
    ownerId, name: "Phase 3 temporary", type: "ESP32", reportingMode: "INTERVAL", expectedIntervalSeconds: 30,
  } });
  try {
    assert.equal(await rotateToken(tracker.id, "somebody-else"), null);
    const first = (await rotateToken(tracker.id, ownerId))!;
    const oldParts = tokenParts(`Bearer ${first}`)!;
    assert.equal((await prisma.deviceCredential.findUniqueOrThrow({ where: { tokenId: oldParts.tokenId } })).tokenDigest.includes(first), false);
    const second = (await rotateToken(tracker.id, ownerId))!;
    const parts = tokenParts(`Bearer ${second}`)!;
    const credential = await prisma.deviceCredential.findUniqueOrThrow({ where: { tokenId: parts.tokenId } });
    assert.equal(matchesDigest(parts.digest, credential.tokenDigest), true);
    assert.notEqual((await prisma.deviceCredential.findUniqueOrThrow({ where: { tokenId: oldParts.tokenId } })).revokedAt, null);

    const recent = new Date(Date.now() - 60_000).toISOString();
    const fix = { trackerId: tracker.id, latitude: 14, longitude: 121, reportedAt: recent, source: "ESP32" as const, messageId: "one" };
    assert.equal(await saveLocation(fix, oldParts.tokenId), null);
    assert.equal(await saveLocation({ ...fix, source: "IPHONE_SHORTCUT" }, parts.tokenId), "mismatch");
    const saved = await saveLocation(fix, parts.tokenId);
    assert.ok(saved && typeof saved !== "string");
    assert.equal(saved.duplicate, false);
    const duplicate = await saveLocation({ ...fix, latitude: 15 }, parts.tokenId);
    assert.ok(duplicate && typeof duplicate !== "string");
    assert.equal(duplicate.id, saved.id);
    assert.equal(duplicate.duplicate, true);
    const later = await saveLocation({ ...fix, messageId: "two", reportedAt: new Date().toISOString(), latitude: 16 }, parts.tokenId);
    assert.ok(later && typeof later !== "string");
    assert.equal(later.duplicate, false);
    await saveLocation({ ...fix, messageId: "three", latitude: 17 }, parts.tokenId);
    assert.equal((await prisma.latestLocation.findUniqueOrThrow({ where: { trackerId: tracker.id } })).pointId, later.id);
    assert.equal(await prisma.locationPoint.count({ where: { trackerId: tracker.id } }), 3);
    const firstPage = (await getHistory(tracker.id, ownerId, 2, null))!;
    assert.equal(firstPage.items.length, 2);
    assert.equal(firstPage.items[0].id, later.id);
    assert.equal((await getHistory(tracker.id, ownerId, 2, parseCursor(firstPage.nextCursor)))!.items.length, 1);
    assert.equal(await getHistory(tracker.id, "somebody-else", 2, null), null);
    const expired = await prisma.locationPoint.create({ data: { trackerId: tracker.id, latitude: 1, longitude: 1,
      reportedAt: new Date(Date.now() - 31 * 86400_000), source: "ESP32" } });
    await prisma.latestLocation.update({ where: { trackerId: tracker.id }, data: {
      pointId: expired.id, latitude: expired.latitude, longitude: expired.longitude,
      reportedAt: expired.reportedAt, receivedAt: expired.receivedAt, source: expired.source,
    } });
    assert.equal((await pruneHistory()).count >= 1, true);
    assert.equal((await prisma.latestLocation.findUniqueOrThrow({ where: { trackerId: tracker.id } })).pointId, expired.id);
    assert.equal(await prisma.locationPoint.count({ where: { id: expired.id } }), 0);
    assert.equal(await revokeToken(tracker.id, "somebody-else"), false);
    assert.equal(await revokeToken(tracker.id, ownerId), true);
    assert.equal(await saveLocation({ ...fix, messageId: "four" }, parts.tokenId), null);
  } finally {
    await prisma.tracker.deleteMany({ where: { id: tracker.id, ownerId } });
    assert.equal(await prisma.locationPoint.count({ where: { trackerId: tracker.id } }), 0);
    assert.equal(await prisma.latestLocation.count({ where: { trackerId: tracker.id } }), 0);
    await prisma.$disconnect();
  }
});
