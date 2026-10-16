import { timingSafeEqual } from "node:crypto";
import { unauthorized, json, requiresHttps } from "@/lib/api";
import { pruneHistory } from "@/lib/retention";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (requiresHttps(request) || !secret || supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)) return unauthorized();
  const result = await pruneHistory();
  return json({ deleted: result.count });
}
