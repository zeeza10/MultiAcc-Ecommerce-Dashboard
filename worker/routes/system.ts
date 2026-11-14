import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleSystemRoute(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  if (path === '/audit-logs' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase.from('audit_logs')
      .select('id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes,created_at')
      .eq('organization_id', auth.organizationId).order('created_at', { ascending: false }).limit(500);
    if (error) throw new Error('Audit history could not be loaded.');
    const actorIds = [...new Set((data || []).map(row => row.actor_id).filter(Boolean))];
    const { data: profiles } = actorIds.length
      ? await auth.repositoryContext.supabase.from('profiles').select('id,full_name').in('id', actorIds)
      : { data: [] };
    const actorNames = new Map((profiles || []).map(row => [row.id, row.full_name || 'System']));
    return json({ logs: (data || []).map(row => ({
      id: row.id, actorId: row.actor_id || '', actorName: actorNames.get(row.actor_id) || 'System',
      action: row.action, entity: row.entity, entityId: row.entity_id,
      beforeSnapshot: row.before_snapshot, afterSnapshot: row.after_snapshot,
      notes: row.notes || '', timestamp: row.created_at,
    })) });
  }

  if (path === '/notifications' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase.from('notifications')
      .select('id,notification_type,title,message,severity,reference_url,is_read,is_dismissed,created_at,user_id')
      .eq('organization_id', auth.organizationId)
      .or(`user_id.is.null,user_id.eq.${auth.user.id}`)
      .eq('is_dismissed', false).order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error('Notifications could not be loaded.');
    return json({ notifications: (data || []).map(row => ({
      id: row.id, type: row.notification_type, title: row.title, message: row.message,
      severity: row.severity, referenceUrl: row.reference_url || '', isRead: row.is_read,
      isDismissed: row.is_dismissed, createdAt: row.created_at,
    })) });
  }

  const dismissNotificationMatch = path.match(/^\/notifications\/([^/]+)\/dismiss$/);
  if (dismissNotificationMatch && request.method === 'POST') {
    const { data, error } = await auth.repositoryContext.supabase.from('notifications')
      .update({ is_dismissed: true, is_read: true })
      .eq('id', dismissNotificationMatch[1]).eq('organization_id', auth.organizationId)
      .or(`user_id.is.null,user_id.eq.${auth.user.id}`).select('id').maybeSingle();
    if (error) throw new Error('Notification could not be dismissed.');
    if (!data) return json({ error: 'Notification was not found in this workspace.' }, 404);
    return json({ success: true });
  }


  return null;
}
