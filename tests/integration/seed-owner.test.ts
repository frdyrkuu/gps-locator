import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { useTestDatabase } from "./database";
import { verify } from "@node-rs/argon2";
import { readSeedSettings, seedOwner } from "../../lib/seed-owner";

test("a migrated disposable database keeps exactly one owner and its original hash", async (t) => {
  if (!useTestDatabase(t)) return;
  const settings = readSeedSettings({
    SEED_OWNER_EMAIL: process.env.SEED_OWNER_EMAIL,
    SEED_OWNER_PASSWORD: process.env.SEED_OWNER_PASSWORD,
  });
  const { prisma } = await import("../../lib/db");

  try {
    await seedOwner(prisma.user, settings);
    const before = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });
    assert.equal(before.length, 1);
    assert.equal(before[0].id, "owner");
    assert.equal(before[0].email, settings.email);
    assert.match(before[0].passwordHash, /^\$argon2id\$/);
    assert.equal(await verify(before[0].passwordHash, settings.password), true);

    assert.equal(await seedOwner(prisma.user, settings), "unchanged");
    await assert.rejects(
      seedOwner(prisma.user, { ...settings, email: "different@example.com" }),
      /different owner/,
    );
    const after = await prisma.user.findMany({ select: { id: true, email: true, passwordHash: true } });
    assert.deepEqual(after, before);

    const { loginAttempts } = await import("../../lib/login-attempts");
    const key = randomUUID().replaceAll("-", "").padEnd(64, "0");
    try {
      const allowed = await Promise.all(Array.from({ length: 8 }, () => loginAttempts.charge(key)));
      assert.equal(allowed.filter(Boolean).length, 5);
      assert.equal((await prisma.loginAttempt.findUniqueOrThrow({ where: { key } })).attempts, 8);
      await prisma.loginAttempt.update({
        where: { key }, data: { windowStart: new Date(Date.now() - 16 * 60 * 1000) },
      });
      assert.equal(await loginAttempts.charge(key), true);
      assert.equal((await prisma.loginAttempt.findUniqueOrThrow({ where: { key } })).attempts, 1);
      await loginAttempts.clear(key);
      assert.equal(await prisma.loginAttempt.count({ where: { key } }), 0);
    } finally {
      await prisma.loginAttempt.deleteMany({ where: { key } });
    }

    const tracker = await prisma.tracker.create({
      data: {
        ownerId: "owner",
        name: "Temporary schema check",
        type: "ESP32",
        reportingMode: "INTERVAL",
        expectedIntervalSeconds: 30,
      },
    });
    try {
      await prisma.deviceCredential.create({
        data: { trackerId: tracker.id, tokenId: randomUUID(), tokenDigest: "0".repeat(64) },
      });
      const reportedAt = new Date();
      const point = await prisma.locationPoint.create({
        data: {
          trackerId: tracker.id,
          latitude: 14.676,
          longitude: 121.0437,
          reportedAt,
          messageId: "test-fix",
          source: "ESP32",
        },
      });
      await assert.rejects(
        prisma.locationPoint.create({
          data: {
            trackerId: tracker.id,
            latitude: 15,
            longitude: 121.0437,
            reportedAt,
            messageId: "test-fix",
            source: "ESP32",
          },
        }),
        (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "P2002",
      );
      await prisma.latestLocation.create({
        data: {
          trackerId: tracker.id,
          pointId: point.id,
          latitude: point.latitude,
          longitude: point.longitude,
          reportedAt: point.reportedAt,
          receivedAt: point.receivedAt,
          source: point.source,
        },
      });
      await prisma.locationPoint.delete({ where: { id: point.id } });
      assert.equal((await prisma.latestLocation.findUnique({ where: { trackerId: tracker.id } }))?.pointId, point.id);

      await prisma.tracker.delete({ where: { id: tracker.id } });
      assert.equal(await prisma.deviceCredential.count({ where: { trackerId: tracker.id } }), 0);
      assert.equal(await prisma.latestLocation.count({ where: { trackerId: tracker.id } }), 0);
    } finally {
      await prisma.tracker.deleteMany({ where: { id: tracker.id, ownerId: "owner" } });
    }
  } finally {
    await prisma.$disconnect();
  }
});
