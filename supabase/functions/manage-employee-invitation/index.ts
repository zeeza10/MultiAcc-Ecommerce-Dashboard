import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.102.0";
import { corsHeadersForInvitation, isAllowedInvitationOrigin, exceedsInvitationBodyLimit } from "./request-guards.ts";

const MAX_INVITATION_BODY_BYTES = 32 * 1024;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
const SENDER = "Oria Future HR <hr@oriafuture.com>";
const APP_NAME = "Oria Future";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function invitationEmailHtml(name: string, actionLink: string): string {
  const safeName = escapeHtml(name || "there");
  const safeLink = escapeHtml(actionLink);
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;padding:32px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px">
      <tr><td style="padding:32px 32px 12px">
        <div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#4f46e5">ORIA FUTURE</div>
        <h1 style="margin:20px 0 12px;font-size:25px;line-height:1.3">You’re invited to join Oria Future</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:#475569">Hello ${safeName},</p>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569">Your organization administrator has invited you to access the Oria Future workspace. Accept the invitation and create your password to get started.</p>
        <p style="margin:28px 0">
          <a href="${safeLink}" style="display:inline-block;padding:14px 22px;border-radius:9px;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700">Accept invitation</a>
        </p>
        <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#64748b">If the button does not work, copy and paste this link into your browser:</p>
        <p style="margin:0 0 24px;word-break:break-all;font-size:12px;line-height:1.6"><a href="${safeLink}" style="color:#4f46e5">${safeLink}</a></p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8">If you were not expecting this invitation, you can ignore this email.</p>
      </td></tr>
      <tr><td style="padding:18px 32px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8">© Oria Future · Secure workspace access</td></tr>
    </table>
  </body>
</html>`;
}

function invitationEmailText(name: string, actionLink: string): string {
  return `Hello ${name || "there"},

Your organization administrator has invited you to access the Oria Future workspace.

Accept your invitation and create your password:
${actionLink}

If you were not expecting this invitation, you can ignore this email.

Oria Future HR
hr@oriafuture.com`;
}

async function revokeClaimedInvitation(
  admin: ReturnType<typeof createClient>,
  invitationId: string,
  createdUserId?: string,
): Promise<void> {
  if (createdUserId) {
    const { error } = await admin.auth.admin.deleteUser(createdUserId);
    if (error) console.error("Invitation rollback could not remove the newly created auth user.");
  }
  const { error } = await admin.from("user_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (error) console.error("Invitation rollback could not revoke the invitation record.");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const cors = corsHeadersForInvitation(origin);
  if (!isAllowedInvitationOrigin(origin)) return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
  if (await exceedsInvitationBodyLimit(request, MAX_INVITATION_BODY_BYTES)) {
    return Response.json({ error: "Invitation request body is too large." }, { status: 413, headers: cors });
  }

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return Response.json({ error: "Authentication required" }, { status: 401, headers: cors });
  if (!url || !anonKey || !serviceKey) return Response.json({ error: "Invitation service is not configured." }, { status: 503, headers: cors });

  const caller = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: callerData, error: callerError } = await caller.auth.getUser(token);
  if (callerError || !callerData.user) return Response.json({ error: "Invalid session" }, { status: 401, headers: cors });

  const body = await request.json().catch(() => null) as { organizationId?: string; invitationId?: string; email?: string; fullName?: string; redirectTo?: string } | null;
  if (!body?.organizationId || !body.invitationId || !body.email) return Response.json({ error: "Missing invitation details" }, { status: 400, headers: cors });
  const email = body.email.trim().toLowerCase();
  const fullName = (body.fullName || "").trim().slice(0, 120);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
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
    .select("id,email,role_id,expires_at,accepted_at,revoked_at,sent_at,created_at")
    .eq("id", body.invitationId)
    .eq("organization_id", body.organizationId)
    .maybeSingle();
  if (inviteError || !invite || invite.email.toLowerCase() !== email || invite.accepted_at || invite.revoked_at || invite.sent_at || new Date(invite.expires_at).getTime() <= Date.now() || new Date(invite.created_at).getTime() < Date.now() - 5 * 60 * 1000) {
    return Response.json({ error: "Invitation is invalid or expired" }, { status: 400, headers: cors });
  }

  let invitationRedirect: URL;
  try {
    invitationRedirect = new URL(body.redirectTo || "https://app.oriafuture.com/accept-invitation");
  } catch {
    return Response.json({ error: "Invitation redirect URL is invalid" }, { status: 400, headers: cors });
  }
  if (
    invitationRedirect.origin !== "https://app.oriafuture.com" ||
    invitationRedirect.pathname !== "/accept-invitation" ||
    invitationRedirect.search ||
    invitationRedirect.hash
  ) {
    return Response.json({ error: "Invitation redirect URL is not allowed" }, { status: 400, headers: cors });
  }

  const { data: role, error: roleError } = await admin.from("roles").select("code").eq("id", invite.role_id).maybeSingle();
  if (roleError || !role) return Response.json({ error: "Assigned role could not be verified" }, { status: 400, headers: cors });
  if (role.code === "SUPER_ADMIN") {
    const { data: assurance, error: assuranceError } = await caller.auth.mfa.getAuthenticatorAssuranceLevel(token);
    if (assuranceError || assurance?.currentLevel !== "aal2") {
      return Response.json({ error: "Complete multi-factor authentication before inviting a Super Admin." }, { status: 403, headers: cors });
    }
  }

  let existing = null;
  for (let page = 1; page <= 20; page += 1) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (usersError) return Response.json({ error: "Could not verify the employee account" }, { status: 502, headers: cors });
    existing = usersData.users.find(item => item.email?.toLowerCase() === email) || existing;
    if (existing || usersData.users.length < 1000) break;
  }

  if (existing) {
    const { data: currentMembership, error: currentMembershipError } = await admin
      .from("organization_members")
      .select("id,is_active")
      .eq("organization_id", body.organizationId)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (currentMembershipError) return Response.json({ error: "Existing organization membership could not be checked" }, { status: 502, headers: cors });
    if (currentMembership) return Response.json({ error: currentMembership.is_active ? "This employee is already a member of this organization." : "This employee is suspended. Reactivate the existing membership instead of sending another invitation." }, { status: 409, headers: cors });
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
      after_snapshot: { email, role_id: invite.role_id }, notes: "Existing verified account added to organization",
    });
    return Response.json({ success: true, existingAccount: true, message: "Existing verified account added to the organization." }, { headers: cors });
  }

  if (!resendApiKey) {
    await admin.from("user_invitations").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
    return Response.json({ error: "Resend email service is not configured. The invitation was safely cancelled." }, { status: 503, headers: cors });
  }

  const { data: claimedInvite, error: claimError } = await admin
    .from("user_invitations")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", invite.id)
    .eq("organization_id", body.organizationId)
    .is("sent_at", null)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (claimError || !claimedInvite) {
    return Response.json({ error: "Invitation has already been processed or is no longer valid." }, { status: 409, headers: cors });
  }

  const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: {
      redirectTo: invitationRedirect.toString(),
      data: { company_name: APP_NAME, product_name: APP_NAME, ...(fullName ? { full_name: fullName } : {}) },
    },
  });

  const createdUserId = generated?.user?.id;
  const actionLink = generated?.properties?.action_link;
  if (generateError || !createdUserId || !actionLink) {
    await revokeClaimedInvitation(admin, invite.id, createdUserId);
    console.error("Supabase could not generate the employee invitation link.");
    return Response.json({ error: "Invitation link could not be created. The invitation was safely cancelled." }, { status: 502, headers: cors });
  }

  let resendResponse: Response;
  try {
    resendResponse = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: SENDER,
        to: [email],
        reply_to: "hr@oriafuture.com",
        subject: "You’re invited to join Oria Future",
        html: invitationEmailHtml(fullName, actionLink),
        text: invitationEmailText(fullName, actionLink),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    await revokeClaimedInvitation(admin, invite.id, createdUserId);
    console.error("Resend invitation request failed before a confirmed delivery response.");
    return Response.json({ error: "Resend could not confirm delivery. The invitation was safely cancelled; please retry." }, { status: 502, headers: cors });
  }

  if (!resendResponse.ok) {
    await revokeClaimedInvitation(admin, invite.id, createdUserId);
    console.error("Resend rejected the employee invitation email.", { status: resendResponse.status });
    return Response.json({ error: "Resend rejected the invitation email. The invitation was safely cancelled; check the Resend domain and sending permissions." }, { status: 502, headers: cors });
  }

  const resendResult = await resendResponse.json().catch(() => ({})) as { id?: string };
  await admin.from("audit_logs").insert({
    organization_id: body.organizationId,
    actor_id: callerData.user.id,
    action: "EMPLOYEE_INVITATION_EMAIL_SENT",
    entity: "user_invitations",
    entity_id: invite.id,
    after_snapshot: { email, role_id: invite.role_id, provider: "resend", resend_message_id: resendResult.id || null },
    notes: "Employee invitation email accepted by Resend",
  });

  return Response.json({ success: true, existingAccount: false, message: "Invitation email sent." }, { status: 201, headers: cors });
});
