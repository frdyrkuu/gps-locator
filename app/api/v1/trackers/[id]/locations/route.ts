import { z } from "zod";
import { invalid, json, notFound, ownerForRequest, unauthorized } from "@/lib/api";
import { getHistory, parseCursor } from "@/lib/history";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerForRequest(request);
  if (!owner) return unauthorized();
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const limit = query.get("limit") === null ? 50 : z.coerce.number().int().min(1).max(100).safeParse(query.get("limit")).data;
  const cursor = query.get("cursor");
  const after = parseCursor(cursor);
  if (!limit || (cursor !== null && !after)) return invalid();
  const history = await getHistory(id, owner.id, limit, after);
  return history ? json(history) : notFound();
}
