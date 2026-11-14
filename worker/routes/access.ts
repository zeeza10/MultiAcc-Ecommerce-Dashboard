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

    const response = await fetch(`${env.SUPABASE_URL}/functions/v1/manage-employee-invitation`, {
      method: 'POST',
      headers: {
        Authorization: request.headers.get('Authorization') || '',
        apikey: env.SUPABASE_PUBLISHABLE_KEY || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organizationId: auth.organizationId,
        invitationId,
        email,
        fullName,
      }),
    });

    const result = await response.json().catch(() => ({})) as { error?: string; message?: string; success?: boolean; existingAccount?: boolean };
    if (!response.ok || !result.success) {
      await auth.repositoryContext.supabase.from('user_invitations')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', invitationId)
        .eq('organization_id', auth.organizationId);
      return json({ error: result.error || 'Invitation could not be completed.' }, response.status || 502);
    }
    return json({ success: true, invitationId, email, existingAccount: result.existingAccount, message: result.message || 'Invitation completed.' }, 201);
  }

  return json({ error: 'Access management route not found.' }, 404);
}
