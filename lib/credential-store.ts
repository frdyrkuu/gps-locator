import { prisma } from "@/lib/db";
import { issueToken } from "@/lib/device-token";

export async function rotateToken(id: string, ownerId: string) {
  const { tokenId, tokenDigest, token } = issueToken();
  const created = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Tracker" WHERE "id" = ${id} AND "ownerId" = ${ownerId} FOR UPDATE`;
    if (!rows.length) return false;
    await tx.deviceCredential.updateMany({ where: { trackerId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.deviceCredential.create({ data: { trackerId: id, tokenId, tokenDigest } });
    return true;
  });
  return created ? token : null;
}

export async function revokeToken(id: string, ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Tracker" WHERE "id" = ${id} AND "ownerId" = ${ownerId} FOR UPDATE`;
    if (!rows.length) return false;
    await tx.deviceCredential.updateMany({ where: { trackerId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    return true;
  });
}
