import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { z } from "zod";
import { locationInput, sourceForType } from "@/lib/location-input";

export async function saveLocation(fix: z.infer<typeof locationInput>, tokenId: string) {
  try {
    const point = await prisma.$transaction(async (tx) => {
      // Lock the parent so rotation/deletion cannot interleave with a verified insert.
      const rows = await tx.$queryRaw<{ id: string; type: keyof typeof sourceForType }[]>`
        SELECT "id", "type" FROM "Tracker" WHERE "id" = ${fix.trackerId} FOR UPDATE`;
      if (!rows.length) return null;
      if (sourceForType[rows[0].type] !== fix.source) return "mismatch" as const;
      const active = await tx.deviceCredential.findUnique({ where: { tokenId } });
      if (!active || active.revokedAt || active.trackerId !== fix.trackerId) return null;
      const point = await tx.locationPoint.create({ data: {
        ...fix, reportedAt: new Date(fix.reportedAt), receivedAt: new Date(),
      } });
      await tx.$executeRaw`
        INSERT INTO "LatestLocation" ("trackerId", "pointId", "latitude", "longitude", "reportedAt", "receivedAt",
          "accuracyMeters", "batteryPercent", "speedMps", "source")
        VALUES (${point.trackerId}, ${point.id}, ${point.latitude}, ${point.longitude}, ${point.reportedAt}, ${point.receivedAt},
          ${point.accuracyMeters}, ${point.batteryPercent}, ${point.speedMps}, ${point.source}::"LocationSource")
        ON CONFLICT ("trackerId") DO UPDATE SET
          "pointId" = EXCLUDED."pointId", "latitude" = EXCLUDED."latitude", "longitude" = EXCLUDED."longitude",
          "reportedAt" = EXCLUDED."reportedAt", "receivedAt" = EXCLUDED."receivedAt",
          "accuracyMeters" = EXCLUDED."accuracyMeters", "batteryPercent" = EXCLUDED."batteryPercent",
          "speedMps" = EXCLUDED."speedMps", "source" = EXCLUDED."source"
        WHERE ("LatestLocation"."reportedAt", "LatestLocation"."pointId") < (EXCLUDED."reportedAt", EXCLUDED."pointId")`;
      return point;
    });
    if (point === "mismatch") return point;
    return point ? { id: point.id, receivedAt: point.receivedAt, duplicate: false } : null;
  } catch (e) {
    if (fix.messageId && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const previous = await prisma.locationPoint.findUnique({
        where: { trackerId_messageId: { trackerId: fix.trackerId, messageId: fix.messageId } },
        select: { id: true, receivedAt: true },
      });
      if (previous) return { ...previous, duplicate: true };
    }
    throw e;
  }
}
