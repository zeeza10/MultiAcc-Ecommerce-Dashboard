import { createClient } from '@supabase/supabase-js';
import type { AuthContext, WorkerEnv } from '../types';
import { json } from '../http';

export async function handleAccessRoute(
  path: string,
  request: Request,
  auth: AuthContext,
  env: WorkerEnv,
): Promise<Response | null> {
  if (!path.startsWith('/access/')) return null;
  if (auth.user.role !== 'SUPER_ADMIN') {
    return json({ error: 'Only your organization Super Admin can manage employee access.' }, 403);
  }

  if (path === '/access/overview' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase.rpc('get_org_employee_access', {
      p_organization_id: auth.organizationId,
    });
    if (error) return json({ error: 'Employee access information could not be loaded.' }, 400);
    return json({ access: data });
  }

  if (path === '/access/invitations' && request.method === 'POST') {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Employee invitation email is not configured yet. Set SUPABASE_SERVICE_ROLE_KEY as a Cloudflare Worker secret.' }, 503);
    }
    const body = await request.json().catch(() => null) as { email?: string; roleId?: string; fullName?: string } | null;
    const email = String(body?.email || '').trim().toLowerCase();
    const roleId = String(body?.roleId || '').trim();
    const fullName = String(body?.fullName || '').trim();
    if (!email || !roleId) return json({ error: 'A work email and role are required.' }, 400);

    const { data: invitationId, error: invitationError } = await auth.repositoryContext.supabase.rpc('create_org_invitation', {
      p_organization_id: auth.organizationId,
      p_email: email,
      p_role_id: roleId,
    });
    if (invitationError || !invitationId) {
      return json({ error: invitationError?.message || 'Invitation could not be created.' }, 400);
    }

    const admin = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: new URL('/', request.url).toString(),
      data: fullName ? { full_name: fullName } : {},
    });

    if (error || !data.user) {
      await auth.repositoryContext.supabase.from('user_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', invitationId)
        .eq('organization_id', auth.organizationId);
      const alreadyRegistered = /already|registered|exists/i.test(error?.message || '');
      return json({
        error: alreadyRegistered
          ? 'This email already has an account. Ask the employee to sign in first; existing-account invitations need a separate acceptance flow.'
          : 'The invitation email could not be sent. No active invitation was left behind.',
      }, alreadyRegistered ? 409 : 502);
    }

    return json({ success: true, invitationId, email, message: 'Invitation email sent.' }, 201);
  }

  return json({ error: 'Access management route not found.' }, 404);
}
