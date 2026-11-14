import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ error: "Authentication required" }, { status: 401, headers: cors });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await caller.auth.getUser(token);
  if (callerError || !callerData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: cors });

  const body = await request.json().catch(() => null) as { organizationId?: string; invitationId?: string; email?: string; fullName?: string } | null;
  if (!body?.organizationId || !body.invitationId || !body.email) return Response.json({ error: "Missing invitation details" }, { status: 400, headers: cors });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("user_id,roles!inner(code)")
    .eq("organization_id", body.organizationId)
    .eq("user_id", callerData.user.id)
    .eq("is_active", true)
    .eq("roles.code", "SUPER_ADMIN")
    .maybeSingle();
  if (membershipError || !membership) return Response.json({ error: "Only this organization Super Admin can invite employees" }, { status: 403, headers: cors });

  const { data: invite, error: inviteError } = await admin
    .from("user_invitations")
    .select("id,email,role_id,expires_at,accepted_at,revoked_at")
    .eq("id", body.invitationId)
    .eq("organization_id", body.organizationId)
    .maybeSingle();
  if (inviteError || !invite || invite.email.toLowerCase() !== body.email.toLowerCase() || invite.accepted_at || invite.revoked_at || new Date(invite.expires_at).getTime() <= Date.now()) {
    return Response.json({ error: "Invitation is invalid or expired" }, { status: 400, headers: cors });
  }

  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) return Response.json({ error: "Could not verify the employee account" }, { status: 502, headers: cors });
  const existing = usersData.users.find(item => item.email?.toLowerCase() === body.email!.toLowerCase());

  if (existing) {
    if (!existing.email_confirmed_at) return Response.json({ error: "An account with this email exists but is not verified. Ask the user to verify it before retrying." }, { status: 409, headers: cors });
    const { error: memberError } = await admin.from("organization_members").upsert({
      organization_id: body.organizationId,
      user_id: existing.id,
      role_id: invite.role_id,
      is_active: true,
      invited_by: callerData.user.id,
    }, { onConflict: "organization_id,user_id" });
    if (memberError) return Response.json({ error: "Existing account could not be linked to this organization" }, { status: 502, headers: cors });
    const { error: acceptedError } = await admin.from("user_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
    if (acceptedError) return Response.json({ error: "Membership was linked, but invitation status could not be updated" }, { status: 502, headers: cors });
    await admin.from("audit_logs").insert({
      organization_id: body.organizationId, actor_id: callerData.user.id,
      action: "EMPLOYEE_ADDED_EXISTING_ACCOUNT", entity: "organization_members", entity_id: existing.id,
      after_snapshot: { email: body.email, role_id: invite.role_id }, notes: "Existing verified account added to organization",
    });
    return Response.json({ success: true, existingAccount: true, message: "Existing verified account added to the organization." }, { headers: cors });
  }

  const { data: invited, error: inviteUserError } = await admin.auth.admin.inviteUserByEmail(body.email, {
    redirectTo: new URL("/", request.url).toString(),
    data: body.fullName ? { full_name: body.fullName } : {},
  });
  if (inviteUserError || !invited.user) {
    await admin.from("user_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
    return Response.json({ error: "Invitation email could not be sent. No active invitation was left behind." }, { status: 502, headers: cors });
  }
  return Response.json({ success: true, existingAccount: false, message: "Invitation email sent." }, { status: 201, headers: cors });
});
