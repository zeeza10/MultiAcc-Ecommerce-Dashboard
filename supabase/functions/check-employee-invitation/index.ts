import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";

const ALLOWED_ORIGINS = new Set([
  "https://app.oriafuture.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return Response.json({ error: "Origin not allowed" }, { status: 403, headers });
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers });
  }

  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (!Number.isFinite(contentLength) || contentLength > 2048) {
    return Response.json({ error: "Request body is too large" }, { status: 413, headers });
  }

  const body = await request.json().catch(() => null) as { invitationId?: string } | null;
  const invitationId = body?.invitationId?.trim() || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(invitationId)) {
    return Response.json({ status: "invalid" }, { status: 200, headers });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return Response.json({ error: "Invitation status service is unavailable" }, { status: 503, headers });
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: invitation, error } = await admin
    .from("user_invitations")
    .select("accepted_at,revoked_at,expires_at")
    .eq("id", invitationId)
    .maybeSingle();

  if (error) {
    console.error("Invitation status lookup failed.");
    return Response.json({ error: "Invitation status could not be checked" }, { status: 503, headers });
  }
  if (!invitation) return Response.json({ status: "invalid" }, { status: 200, headers });
  if (invitation.accepted_at) return Response.json({ status: "accepted" }, { status: 200, headers });
  if (invitation.revoked_at || new Date(invitation.expires_at).getTime() <= Date.now()) {
    return Response.json({ status: "invalid" }, { status: 200, headers });
  }
  return Response.json({ status: "pending" }, { status: 200, headers });
});
