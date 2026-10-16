import { getOwner } from "@/lib/owner";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function error(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

export const unauthorized = () => error(401, "UNAUTHORIZED", "Authentication required.");
export const notFound = () => error(404, "NOT_FOUND", "Tracker not found.");
export const invalid = () => error(400, "VALIDATION_ERROR", "Invalid request payload.");

export function requiresHttps(request: Request) {
  const url = new URL(request.url);
  return url.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export async function ownerForRequest(request: Request, write = false) {
  const owner = await getOwner();
  if (!owner || requiresHttps(request)) return null;
  // Browser-initiated cookie mutations must originate from this host.
  if (write && request.headers.get("origin") &&
    request.headers.get("origin") !== new URL(request.url).origin) return null;
  return owner;
}

export async function readJson(request: Request): Promise<unknown | Response> {
  if (!/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? ""))
    return error(415, "UNSUPPORTED_MEDIA_TYPE", "Expected application/json.");
  if (Number(request.headers.get("content-length")) > 4096)
    return error(413, "PAYLOAD_TOO_LARGE", "Request body too large.");
  const reader = request.body?.getReader();
  if (!reader) return invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return error(413, "PAYLOAD_TOO_LARGE", "Request body too large.");
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    return invalid();
  }
}
