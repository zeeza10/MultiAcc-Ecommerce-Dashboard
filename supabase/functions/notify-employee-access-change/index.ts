import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";
const ALLOWED_ORIGINS = new Set(["https://app.oriafuture.com", "http://localhost:5173", "http://127.0.0.1:5173"]);
function isAllowedInvitationOrigin(origin: string | null): boolean { return origin === null || ALLOWED_ORIGINS.has(origin); }
function corsHeadersForInvitation(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400", "Cache-Control": "no-store", "Vary": "Origin" };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}
async function exceedsInvitationBodyLimit(request: Request, maximumBytes: number): Promise<boolean> {
  const declaredLength = request.headers.get("Content-Length");
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximumBytes)) return true;
  if (!request.body) return false;
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let total = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) return false; total += value.byteLength; if (total > maximumBytes) { await reader.cancel(); return true; } } }
  finally { reader.releaseLock(); }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SENDER = "Oria Future HR <hr@oriafuture.com>";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function renderEmail(name: string, state: "suspended" | "restored", organization: string) {
  const safeName = escapeHtml(name || "there");
  const safeOrganization = escapeHtml(organization);
  const suspended = state === "suspended";
  const subject = suspended ? "Your Oria Future account access has been suspended" : "Your Oria Future account access has been restored";
  const heading = suspended ? "Account Access Suspended" : "Account Access Restored";
  const explanation = suspended
    ? "Your access to the Oria Future workspace has been suspended by your organization administrator. You will not be able to access workspace data while this status remains in effect."
    : "Your access to the Oria Future workspace has been restored. You can now sign in using your existing account and password.";
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:32px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px">
  <tr><td style="padding:32px"><div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#4f46e5">ORIA FUTURE</div>
  <h1 style="margin:20px 0 12px;font-size:25px">${heading}</h1><p style="font-size:15px;line-height:1.7;color:#475569">Hello ${safeName},</p>
  <p style="font-size:15px;line-height:1.7;color:#475569">${explanation}</p>
  <div style="padding:14px 16px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;font-size:14px;color:#312e81">Workspace: <strong>${safeOrganization}</strong></div>
  <p style="font-size:13px;line-height:1.7;color:#64748b">${suspended ? "If you believe this change was made in error, please contact your organization administrator." : "No new invitation is required. Your existing account remains unchanged."}</p>
  <p style="font-size:12px;color:#94a3b8;margin-top:28px">© Oria Future · Secure workspace access</p></td></tr></table></body></html>`;
  const text = `Hello ${name || "there"},\n\n${heading}\n\n${explanation}\n\nWorkspace: ${organization}\n\nOria Future HR\nhr@oriafuture.com`;
  return { subject, html, text };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeadersForInvitation(origin);
  if (!isAllowedInvitationOrigin(origin)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  if (await exceedsInvitationBodyLimit(request, 16 * 1024)) return Response.json({ error: "Request body too large" }, { status: 413, headers: cors });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ error: "Authentication required" }, { status: 401, headers: cors });
  if (!url || !anonKey || !serviceKey || !resendApiKey) return Response.json({ error: "Access notification service is not configured." }, { status: 503, headers: cors });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await caller.auth.getUser(token);
  if (callerError || !callerData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: cors });

  const body = await request.json().catch(() => null) as { organizationId?: string; userId?: string; state?: "suspended" | "restored" } | null;
  const state = body?.state;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!body?.organizationId || !body.userId || !uuidPattern.test(body.organizationId) || !uuidPattern.test(body.userId)
    || (state !== "suspended" && state !== "restored")) {
    return Response.json({ error: "Missing or invalid employee access notification details" }, { status: 400, headers: cors });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { data: adminMembership, error: adminMembershipError } = await admin
    .from("organization_members").select("user_id,roles!inner(code)")
    .eq("organization_id", body.organizationId).eq("user_id", callerData.user.id)
    .eq("is_active", true).eq("roles.code", "SUPER_ADMIN").maybeSingle();
  if (adminMembershipError || !adminMembership) return Response.json({ error: "Only this organization Super Admin can send employee access notifications" }, { status: 403, headers: cors });

  const { data: member, error: memberError } = await admin
    .from("organization_members").select("user_id,is_active,archived_at")
    .eq("organization_id", body.organizationId).eq("user_id", body.userId).maybeSingle();
  if (memberError || !member || member.archived_at) return Response.json({ error: "Employee record could not be verified" }, { status: 404, headers: cors });
  const expectedActive = state === "restored";
  if (member.is_active !== expectedActive) return Response.json({ error: "Employee access state changed; notification was not sent." }, { status: 409, headers: cors });
  const { data: profile, error: profileError } = await admin.from("profiles").select("email,full_name").eq("id", body.userId).maybeSingle();
  if (profileError || !profile?.email) return Response.json({ error: "Employee email address is unavailable" }, { status: 422, headers: cors });
  const email = profile.email;
  const { data: organization, error: organizationError } = await admin.from("organizations").select("name").eq("id", body.organizationId).maybeSingle();
  if (organizationError || !organization?.name) return Response.json({ error: "Organization details could not be verified" }, { status: 502, headers: cors });

  const { subject, html, text } = renderEmail(profile.full_name || "", state, organization.name);
  let response: Response;
  try {
    response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: SENDER, to: [email], reply_to: "hr@oriafuture.com", subject, html, text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    await admin.from("audit_logs").insert({
      organization_id: body.organizationId, actor_id: callerData.user.id,
      action: "EMPLOYEE_ACCESS_EMAIL_FAILED", entity: "organization_members", entity_id: body.userId,
      after_snapshot: { state, recipient: email, provider: "resend" },
      notes: "Resend did not confirm the access notification request",
    });
    return Response.json({ error: "Employee access was updated, but Resend could not confirm the notification email. Please retry the notification." }, { status: 502, headers: cors });
  }

  if (!response.ok) {
    await admin.from("audit_logs").insert({
      organization_id: body.organizationId, actor_id: callerData.user.id,
      action: "EMPLOYEE_ACCESS_EMAIL_FAILED", entity: "organization_members", entity_id: body.userId,
      after_snapshot: { state: body.state, recipient: email, provider: "resend", http_status: response.status },
      notes: "Resend rejected the access notification request",
    });
    return Response.json({ error: "Employee access was updated, but Resend rejected the notification email. Please retry." }, { status: 502, headers: cors });
  }

  const result = await response.json().catch(() => ({})) as { id?: string };
  const { error: auditError } = await admin.from("audit_logs").insert({
    organization_id: body.organizationId, actor_id: callerData.user.id,
    action: "EMPLOYEE_ACCESS_EMAIL_SENT", entity: "organization_members", entity_id: body.userId,
    after_snapshot: { state: body.state, recipient: email, provider: "resend", resend_message_id: result.id || null },
    notes: "Resend accepted the employee access notification email",
  });
  if (auditError) return Response.json({ error: "Resend accepted the email, but notification audit logging failed. Check Resend before retrying to avoid a duplicate." }, { status: 502, headers: cors });
  return Response.json({ success: true, message: "Employee notification email accepted by Resend." }, { headers: cors });
});
