import { prisma } from "@/lib/db";

const WINDOW_MS = 15 * 60 * 1000;

async function charge(key: string, windowMs: number, maximum: number) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowMs);
    await prisma.loginAttempt.deleteMany({
      where: { windowStart: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
    });
    const [{ attempts }] = await prisma.$queryRaw<{ attempts: number }[]>`
      INSERT INTO "LoginAttempt" ("key", "attempts", "windowStart")
      VALUES (${key}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "LoginAttempt"."windowStart" <= ${cutoff}
          THEN 1 ELSE "LoginAttempt"."attempts" + 1 END,
        "windowStart" = CASE WHEN "LoginAttempt"."windowStart" <= ${cutoff}
          THEN ${now} ELSE "LoginAttempt"."windowStart" END
      RETURNING "attempts"
    `;
    return attempts <= maximum;
}

export const loginAttempts = {
  charge(key: string) {
    return charge(key, WINDOW_MS, 5);
  },
  async clear(key: string) {
    await prisma.loginAttempt.deleteMany({ where: { key } });
  },
};

// shortcut: share the atomic login throttle table, split counters if ingest volume grows.
export function chargeIngest(key: string) {
  return charge(key, 60_000, 60);
}
