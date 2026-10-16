import { json, notFound, ownerForRequest, unauthorized } from "@/lib/api";
import { revokeToken, rotateToken } from "@/lib/credential-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerForRequest(request, true);
  if (!owner) return unauthorized();
  const { id } = await params;
  const token = await rotateToken(id, owner.id);
  return token ? json({ token }, 201) : notFound();
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await ownerForRequest(request, true);
  if (!owner) return unauthorized();
  const { id } = await params;
  const found = await revokeToken(id, owner.id);
  return found ? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } }) : notFound();
}
