import { prisma } from "@/lib/db";
import { invalid, json, notFound, ownerForRequest, readJson, unauthorized } from "@/lib/api";
import { trackerInput, trackerSelect } from "@/lib/tracker-input";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const owner = await ownerForRequest(request, true);
  if (!owner) return unauthorized();
  const { id } = await params;
  const body = await readJson(request);
  if (body instanceof Response) return body;
  const parsed = trackerInput.safeParse(body);
  if (!parsed.success) return invalid();
  const updated = await prisma.tracker.updateMany({ where: { id, ownerId: owner.id }, data: parsed.data });
  if (!updated.count) return notFound();
  return json(await prisma.tracker.findFirst({ where: { id, ownerId: owner.id }, select: trackerSelect }));
}

export async function DELETE(request: Request, { params }: Context) {
  const owner = await ownerForRequest(request, true);
  if (!owner) return unauthorized();
  const { id } = await params;
  const deleted = await prisma.tracker.deleteMany({ where: { id, ownerId: owner.id } });
  return deleted.count ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : notFound();
}
