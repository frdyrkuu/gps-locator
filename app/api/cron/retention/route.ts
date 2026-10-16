import { timingSafeEqual } from "node:crypto";
import { unauthorized, json, requiresHttps } from "@/lib/api";
import { pruneHistory } from "@/lib/retention";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (requiresHttps(request) || !secret || supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return unauthorized();
  const result = await pruneHistory();
  return json({ deleted: result.count });
}
