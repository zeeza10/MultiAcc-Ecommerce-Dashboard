import type { AuthContext } from '../types';
import { json } from '../http';
import { startEbayOAuth } from '../ebay/oauth';
import type { WorkerEnv } from '../types';

export async function handleMarketplaceRoute(path: string, request: Request, auth: AuthContext, env: WorkerEnv): Promise<Response | null> {
  const connectMatch = path.match(new RegExp('^/ebay/accounts/([^/]+)/connect$'));
  if (connectMatch && request.method === 'POST') {
    return startEbayOAuth(decodeURIComponent(connectMatch[1]), auth, env);
  }

  if (path === '/ebay/accounts' && request.method === 'GET') {
    const [accountsResult, syncResult] = await Promise.all([
      auth.repositoryContext.supabase.from('marketplace_accounts')
        .select('id,name,marketplace,seller_username,auth_status,environment,last_sync_at,last_sync_status,last_sync_message,token_expires_at,auto_sync_interval_minutes,is_demo')
        .eq('organization_id', auth.organizationId).order('created_at', { ascending: false }),
      auth.repositoryContext.supabase.from('marketplace_sync_runs')
        .select('id,marketplace_account_id,status,started_at,completed_at,orders_fetched,orders_imported,orders_skipped_duplicate,exceptions_raised,log_message')
        .eq('organization_id', auth.organizationId).order('started_at', { ascending: false }).limit(10),
    ]);
    if (accountsResult.error || syncResult.error) throw new Error('Marketplace account data could not be loaded.');
    return json({ integrationReady: false, integrationMessage: 'Live eBay OAuth and order synchronization remain disabled until the complete server-side credentials and encryption configuration is installed and verified.', accounts: (accountsResult.data || []).map(row => ({
      id: row.id, name: row.name, marketplace: row.marketplace, sellerUsername: row.seller_username || '',
      authStatus: row.auth_status, environment: row.environment, lastSyncAt: row.last_sync_at || '',
      lastSyncStatus: row.last_sync_status || '', lastSyncMessage: row.last_sync_message || '',
      tokenExpiresAt: row.token_expires_at || '', autoSyncIntervalMinutes: row.auto_sync_interval_minutes,
      isDemo: row.is_demo,
    })), recentSyncs: (syncResult.data || []).map(row => ({ id: row.id, accountId: row.marketplace_account_id, startedAt: row.started_at, completedAt: row.completed_at || '', status: row.status, ordersFetched: row.orders_fetched, ordersImported: row.orders_imported, ordersSkippedDuplicate: row.orders_skipped_duplicate, exceptionsRaised: row.exceptions_raised, logMessage: row.log_message || '' })) });
  }

  if (path === '/ebay/exceptions' && request.method === 'GET') {
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_exceptions')
      .select('id,marketplace_account_id,exception_type,source,reference_id,details,status,created_at,resolved_at,resolution_note')
      .eq('organization_id', auth.organizationId).order('created_at', { ascending: false }).limit(250);
    if (error) throw new Error('Marketplace exceptions could not be loaded.');
    return json({ exceptions: (data || []).map(row => ({
      id: row.id, marketplaceAccountId: row.marketplace_account_id, type: row.exception_type,
      source: row.source, referenceId: row.reference_id, details: row.details, status: row.status,
      createdAt: row.created_at, resolvedAt: row.resolved_at || '', resolutionNote: row.resolution_note || '',
    })) });
  }

  const resolveExceptionMatch = path.match(/^\/ebay\/exceptions\/([^/]+)\/resolve$/);
  if (resolveExceptionMatch && request.method === 'POST') {
    const body = await request.json() as Record<string, unknown>;
    const targetProductId = typeof body.targetProductId === 'string' ? body.targetProductId.trim() : '';
    const resolutionNote = typeof body.resolutionNote === 'string' ? body.resolutionNote.trim() : '';
    if (!targetProductId) return json({ error: 'Select a valid internal product before resolving this exception.' }, 400);
    if (resolutionNote.length > 500) return json({ error: 'Resolution notes must be 500 characters or fewer.' }, 400);

    const { data: exception, error: exceptionError } = await auth.repositoryContext.supabase
      .from('marketplace_exceptions')
      .select('id,marketplace_account_id,exception_type,source,reference_id,details,raw_payload_snippet,status,created_at')
      .eq('id', resolveExceptionMatch[1])
      .eq('organization_id', auth.organizationId)
      .maybeSingle();
    if (exceptionError) throw new Error('Marketplace exception could not be loaded.');
    if (!exception) return json({ error: 'Marketplace exception was not found in this workspace.' }, 404);
    if (exception.exception_type !== 'UNMAPPED_SKU' || !exception.marketplace_account_id) {
      return json({ error: 'Only unmapped SKU exceptions linked to a marketplace account can be resolved here.' }, 400);
    }

    let externalSku = '';
    try {
      const rawLine = JSON.parse(exception.raw_payload_snippet || '{}') as Record<string, unknown>;
      externalSku = typeof rawLine.sku === 'string' ? rawLine.sku.trim() : '';
    } catch {
      return json({ error: 'The exception does not contain a valid marketplace SKU payload.' }, 422);
    }
    if (!externalSku || externalSku.length > 128) {
      return json({ error: 'The exception does not contain a valid marketplace SKU.' }, 422);
    }

    const { data: resolution, error: resolutionError } = await auth.repositoryContext.supabase.rpc(
      'resolve_marketplace_exception',
      {
        p_organization_id: auth.organizationId,
        p_exception_id: exception.id,
        p_product_id: targetProductId,
        p_external_sku: externalSku,
        p_resolution_note: resolutionNote || null,
      },
    );
    if (resolutionError) throw resolutionError;
    return json({ success: true, exception: resolution });
  }


  return null;
}
