import type { AuthContext } from '../types';
import { json } from '../http';
import { startEbayOAuth, isEbayOAuthConfigured, serviceClient, logEvent } from '../ebay/oauth';
import type { WorkerEnv } from '../types';

export async function handleMarketplaceRoute(path: string, request: Request, auth: AuthContext, env: WorkerEnv): Promise<Response | null> {
  const connectMatch = path.match(new RegExp('^/ebay/accounts/([^/]+)/connect$'));
  if (connectMatch && request.method === 'POST') {
    return startEbayOAuth(decodeURIComponent(connectMatch[1]), auth, env);
  }

  if (path === '/ebay/accounts' && request.method === 'POST') {
    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { return json({ error: 'A valid JSON request is required.' }, 400); }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const marketplace = typeof body.marketplace === 'string' ? body.marketplace : '';
    const environment = typeof body.environment === 'string' ? body.environment : 'SANDBOX';
    const sellerUsername = typeof body.sellerUsername === 'string' ? body.sellerUsername.trim() : '';
    if (name.length < 2 || name.length > 120) return json({ error: 'Account name must be between 2 and 120 characters.' }, 400);
    if (!['EBAY_UK','EBAY_US','EBAY_DE'].includes(marketplace)) return json({ error: 'Select a supported eBay marketplace.' }, 400);
    if (!['SANDBOX','PRODUCTION'].includes(environment)) return json({ error: 'Select a valid eBay environment.' }, 400);
    if (sellerUsername.length > 120) return json({ error: 'Seller username is too long.' }, 400);
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_accounts').insert({
      organization_id: auth.organizationId,
      name,
      marketplace,
      seller_username: sellerUsername || null,
      environment,
      auth_status: 'DISCONNECTED',
      is_demo: false,
      auto_sync_interval_minutes: 30,
    }).select('id,name,marketplace,seller_username,auth_status,environment,is_demo,auto_sync_interval_minutes').single();
    if (error || !data) return json({ error: 'The real marketplace account could not be created.' }, 400);
    return json({ account: {
      id: data.id, name: data.name, marketplace: data.marketplace, sellerUsername: data.seller_username || '',
      authStatus: data.auth_status, environment: data.environment, isDemo: data.is_demo,
      autoSyncIntervalMinutes: data.auto_sync_interval_minutes,
    } }, 201);
  }

  const syncMatch = path.match(new RegExp('^/ebay/accounts/([^/]+)/sync
    const [accountsResult, syncResult] = await Promise.all([
      auth.repositoryContext.supabase.from('marketplace_accounts')
        .select('id,name,marketplace,seller_username,auth_status,environment,last_sync_at,last_sync_status,last_sync_message,token_expires_at,auto_sync_interval_minutes,is_demo')
        .eq('organization_id', auth.organizationId).order('created_at', { ascending: false }),
      auth.repositoryContext.supabase.from('marketplace_sync_runs')
        .select('id,marketplace_account_id,status,started_at,completed_at,orders_fetched,orders_imported,orders_skipped_duplicate,exceptions_raised,log_message')
        .eq('organization_id', auth.organizationId).order('started_at', { ascending: false }).limit(10),
    ]);
    if (accountsResult.error || syncResult.error) throw new Error('Marketplace account data could not be loaded.');
    const accountRows = accountsResult.data || [];
    const integrationReady = accountRows.some(row => !row.is_demo && isEbayOAuthConfigured(env, row.environment));
    return json({ integrationReady, integrationMessage: integrationReady ? 'Secure eBay authorization is configured for at least one real account.' : 'Create a real eBay account and configure the server-only Sandbox or Production secrets before authorization. Demo records cannot be connected.', accounts: accountRows.map(row => ({
      id: row.id, name: row.name, marketplace: row.marketplace, sellerUsername: row.seller_username || '',
      authStatus: row.auth_status, environment: row.environment, lastSyncAt: row.last_sync_at || '',
      lastSyncStatus: row.last_sync_status || '', lastSyncMessage: row.last_sync_message || '',
      tokenExpiresAt: row.token_expires_at || '', autoSyncIntervalMinutes: row.auto_sync_interval_minutes,
      isDemo: row.is_demo,
      oauthReady: !row.is_demo && isEbayOAuthConfigured(env, row.environment),
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
));
  if (syncMatch && request.method === 'POST') {
    const accountId = decodeURIComponent(syncMatch[1]);
    const { data: account, error: accountError } = await auth.repositoryContext.supabase
      .from('marketplace_accounts')
      .select('id,organization_id,is_demo,auth_status')
      .eq('id', accountId)
      .eq('organization_id', auth.organizationId)
      .maybeSingle();
    if (accountError || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.is_demo || account.auth_status !== 'CONNECTED') return json({ error: 'Only a real, authorized eBay account can be synchronized.' }, 409);
    const service = serviceClient(env);
    if (!service) return json({ error: 'The secure marketplace job service is not configured.' }, 503);
    const { data: credential } = await service.from('marketplace_credentials')
      .select('marketplace_account_id')
      .eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', account.id)
      .is('revoked_at', null)
      .maybeSingle();
    if (!credential) return json({ error: 'This eBay account has no active authorization. Reconnect it first.' }, 409);
    const suppliedKey = request.headers.get('Idempotency-Key') || crypto.randomUUID();
    if (suppliedKey.length < 8 || suppliedKey.length > 120) return json({ error: 'The idempotency key must be between 8 and 120 characters.' }, 400);
    const idempotencyKey = `manual:${suppliedKey}`;
    const { data: inserted, error: insertError } = await service.from('marketplace_sync_jobs').upsert({
      organization_id: auth.organizationId,
      marketplace_account_id: account.id,
      idempotency_key: idempotencyKey,
      trigger_reason: 'MANUAL',
      status: 'QUEUED',
      scheduled_at: new Date().toISOString(),
    }, { onConflict: 'marketplace_account_id,idempotency_key', ignoreDuplicates: true })
      .select('id').maybeSingle();
    if (insertError) return json({ error: 'The synchronization job could not be queued.' }, 500);
    let job = inserted;
    if (!job) {
      const { data: existing } = await service.from('marketplace_sync_jobs')
        .select('id,status')
        .eq('marketplace_account_id', account.id)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      job = existing;
    }
    await logEvent(service, {
      organizationId: auth.organizationId,
      accountId: account.id,
      eventType: 'ORDER_SYNC_QUEUED',
      severity: 'INFO',
      message: 'A manual eBay order synchronization job was queued.',
      metadata: { userId: auth.user.id, jobId: job?.id || null },
    });
    return json({ queued: true, jobId: job?.id || null, status: job?.status || 'QUEUED' }, 202);
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
