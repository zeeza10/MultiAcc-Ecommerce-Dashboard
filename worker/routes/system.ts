import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleSystemRoute(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  if (path === '/system/config' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase.from('system_settings')
      .select('base_currency,business_timezone,default_vat_rate_percent,adjustment_approval_threshold_value_minor,adjustment_approval_threshold_quantity,active_release_phase,allow_negative_stock,auto_sync_enabled')
      .eq('organization_id', auth.organizationId).maybeSingle();
    if (error) throw new Error('Workspace settings could not be loaded.');
    if (!data) return json({ error: 'Workspace settings have not been provisioned.' }, 404);
    return json({ config: {
      baseCurrency: data.base_currency, businessTimezone: data.business_timezone,
      defaultVatRatePercent: Number(data.default_vat_rate_percent),
      adjustmentApprovalThresholdValueMinor: Number(data.adjustment_approval_threshold_value_minor),
      adjustmentApprovalThresholdQuantity: Number(data.adjustment_approval_threshold_quantity),
      activeReleasePhase: data.active_release_phase,
      allowNegativeStock: data.allow_negative_stock, autoSyncEnabled: data.auto_sync_enabled,
    } });
  }

  if (path === '/system/config' && request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (body.baseCurrency !== undefined) {
      const value = String(body.baseCurrency).toUpperCase();
      if (!['GBP','USD','EUR'].includes(value)) throw new Error('Choose GBP, USD or EUR as the base currency.');
      updates.base_currency = value;
    }
    if (body.businessTimezone !== undefined) {
      const value = String(body.businessTimezone).trim();
      if (!value || value.length > 100) throw new Error('Enter a valid business timezone.');
      updates.business_timezone = value;
    }
    if (body.defaultVatRatePercent !== undefined) {
      const value = Number(body.defaultVatRatePercent);
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('VAT rate must be between 0 and 100.');
      updates.default_vat_rate_percent = value;
    }
    if (body.adjustmentApprovalThresholdValueMinor !== undefined) {
      const value = Number(body.adjustmentApprovalThresholdValueMinor);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Adjustment approval value threshold must be a non-negative amount in minor units.');
      updates.adjustment_approval_threshold_value_minor = value;
    }
    if (body.adjustmentApprovalThresholdQuantity !== undefined) {
      const value = Number(body.adjustmentApprovalThresholdQuantity);
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Adjustment approval quantity threshold must be a non-negative whole number.');
      updates.adjustment_approval_threshold_quantity = value;
    }
    if (body.activeReleasePhase !== undefined) {
      const value = String(body.activeReleasePhase);
      if (!['P1','P2','P3','P4','P5','ALL'].includes(value)) throw new Error('Choose a valid release phase.');
      updates.active_release_phase = value;
    }
    if (body.allowNegativeStock !== undefined) {
      if (typeof body.allowNegativeStock !== 'boolean') throw new Error('Allow negative stock must be true or false.');
      updates.allow_negative_stock = body.allowNegativeStock;
    }
    if (body.autoSyncEnabled !== undefined) {
      if (typeof body.autoSyncEnabled !== 'boolean') throw new Error('Automatic synchronization must be true or false.');
      updates.auto_sync_enabled = body.autoSyncEnabled;
    }
    if (Object.keys(updates).length === 0) throw new Error('No valid workspace settings were supplied.');
    updates.updated_at = new Date().toISOString();
    const { data, error } = await auth.repositoryContext.supabase.from('system_settings')
      .update(updates).eq('organization_id', auth.organizationId)
      .select('base_currency,business_timezone,default_vat_rate_percent,adjustment_approval_threshold_value_minor,adjustment_approval_threshold_quantity,active_release_phase,allow_negative_stock,auto_sync_enabled')
      .single();
    if (error) throw new Error('Workspace settings could not be saved.');
    return json({ config: {
      baseCurrency: data.base_currency, businessTimezone: data.business_timezone,
      defaultVatRatePercent: Number(data.default_vat_rate_percent),
      adjustmentApprovalThresholdValueMinor: Number(data.adjustment_approval_threshold_value_minor),
      adjustmentApprovalThresholdQuantity: Number(data.adjustment_approval_threshold_quantity),
      activeReleasePhase: data.active_release_phase,
      allowNegativeStock: data.allow_negative_stock, autoSyncEnabled: data.auto_sync_enabled,
    } });
  }

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
