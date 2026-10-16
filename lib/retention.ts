import { prisma } from "@/lib/db";

export function pruneHistory(now = new Date()) {
  return prisma.locationPoint.deleteMany({ where: {
    reportedAt: { lt: new Date(now.getTime() - 30 * 86400_000) },
  } });
}
