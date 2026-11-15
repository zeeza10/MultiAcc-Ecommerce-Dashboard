export const INVITATION_APP_ORIGIN = "https://app.oriafuture.com";
const ALLOWED_INVITATION_ORIGINS = new Set([
  INVITATION_APP_ORIGIN,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

export function isAllowedInvitationOrigin(origin: string | null): boolean {
  return origin === null || ALLOWED_INVITATION_ORIGINS.has(origin);
}

export function corsHeadersForInvitation(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_INVITATION_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export async function exceedsInvitationBodyLimit(request: Request, maximumBytes: number): Promise<boolean> {
  if (!request.body) return false;
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) return true;
    if (Number(declaredLength) > maximumBytes) return true;
  }
  const body = request.clone().body;
  if (!body) return false;
  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("Invitation body exceeds configured limit").catch(() => undefined);
        return true;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
