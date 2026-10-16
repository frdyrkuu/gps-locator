import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { chargeIngest } from "@/lib/login-attempts";
import { error, invalid, json, readJson, requiresHttps, unauthorized } from "@/lib/api";
import { matchesDigest, tokenParts } from "@/lib/device-token";
import { locationInput, sourceForType, validObservation } from "@/lib/location-input";
import { saveLocation } from "@/lib/location-store";

export async function POST(request: Request) {
  if (requiresHttps(request)) return error(403, "HTTPS_REQUIRED", "HTTPS required.");
  const parts = tokenParts(request.headers.get("authorization"));
  if (!parts) return unauthorized();
  const credential = await prisma.deviceCredential.findUnique({ where: { tokenId: parts.tokenId },
    include: { tracker: { select: { id: true, type: true } } } });
  if (!credential || credential.revokedAt || !matchesDigest(parts.digest, credential.tokenDigest)) return unauthorized();

  const key = createHash("sha256").update(`ingest:${parts.tokenId}`).digest("hex");
  if (!await chargeIngest(key)) return Response.json({ error: { code: "RATE_LIMITED", message: "Try again later." } },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } });
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = locationInput.safeParse(body);
  if (!parsed.success || !validObservation(parsed.data.reportedAt, new Date())) return invalid();
  const fix = parsed.data;
  if (credential.trackerId !== fix.trackerId || sourceForType[credential.tracker.type] !== fix.source)
    return error(403, "FORBIDDEN", "Tracker or source mismatch.");

  const result = await saveLocation(fix, parts.tokenId);
  if (!result) return unauthorized();
  if (result === "mismatch") return error(403, "FORBIDDEN", "Tracker or source mismatch.");
  const { duplicate, ...receipt } = result;
  return json(duplicate ? { ...receipt, duplicate: true } : receipt, duplicate ? 200 : 201);
}
