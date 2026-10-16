import { prisma } from "@/lib/db";
import { invalid, json, ownerForRequest, readJson, unauthorized } from "@/lib/api";
import { trackerInput, trackerSelect } from "@/lib/tracker-input";

export async function GET(request: Request) {
  const owner = await ownerForRequest(request);
  if (!owner) return unauthorized();
  return json({ items: await prisma.tracker.findMany({ where: { ownerId: owner.id }, select: trackerSelect, orderBy: { createdAt: "desc" } }) });
}

export async function POST(request: Request) {
  const owner = await ownerForRequest(request, true);
  if (!owner) return unauthorized();
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = trackerInput.safeParse(body);
  if (!parsed.success) return invalid();
  return json(await prisma.tracker.create({ data: { ...parsed.data, ownerId: owner.id }, select: trackerSelect }), 201);
}
