export const INVITATION_APP_ORIGIN = "https://multiacc-ecommerce-dashboard.zeeshan-m-personal.workers.dev";

export function isAllowedInvitationOrigin(origin: string | null): boolean {
  return origin === null || origin === INVITATION_APP_ORIGIN;
}

export function corsHeadersForInvitation(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin === INVITATION_APP_ORIGIN) headers["Access-Control-Allow-Origin"] = INVITATION_APP_ORIGIN;
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
