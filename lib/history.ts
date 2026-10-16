import { z } from "zod";
import { prisma } from "@/lib/db";

const cursorSchema = z.tuple([z.iso.datetime(), z.string().min(1).max(100)]);

export function parseCursor(value: string | null) {
  if (!value || value.length > 400) return null;
  try {
    return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export function nextCursor(point: { reportedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify([point.reportedAt.toISOString(), point.id])).toString("base64url");
}

export async function getHistory(id: string, ownerId: string, limit: number, after: [string, string] | null, now = new Date()) {
  if (!await prisma.tracker.findFirst({ where: { id, ownerId }, select: { id: true } })) return null;
  const items = await prisma.locationPoint.findMany({
    where: { trackerId: id, reportedAt: { gte: new Date(now.getTime() - 7 * 86400_000) },
      ...(after && { OR: [{ reportedAt: { lt: new Date(after[0]) } },
        { reportedAt: new Date(after[0]), id: { lt: after[1] } }] }) },
    orderBy: [{ reportedAt: "desc" }, { id: "desc" }], take: limit + 1,
    select: { id: true, trackerId: true, latitude: true, longitude: true, reportedAt: true,
      receivedAt: true, accuracyMeters: true, batteryPercent: true, speedMps: true, messageId: true, source: true },
  });
  const more = items.length > limit;
  const page = items.slice(0, limit);
  return { items: page, nextCursor: more ? nextCursor(page[page.length - 1]) : null };
}
