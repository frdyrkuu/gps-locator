import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function issueToken() {
  const tokenId = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  return { tokenId, tokenDigest: createHash("sha256").update(secret).digest("hex"), token: `${tokenId}.${secret}` };
}

export function tokenParts(header: string | null) {
  const match = /^Bearer ([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(header ?? "");
  if (!match) return null;
  return { tokenId: match[1], digest: createHash("sha256").update(match[2]).digest() };
}

export function matchesDigest(a: Buffer, hex: string) {
  return /^[a-f0-9]{64}$/.test(hex) && timingSafeEqual(a, Buffer.from(hex, "hex"));
}
