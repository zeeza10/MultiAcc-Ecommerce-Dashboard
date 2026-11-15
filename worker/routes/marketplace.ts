import { createClient } from '@supabase/supabase-js';
import type { AuthContext, WorkerEnv } from '../types';
import { json } from '../http';
import {
  createServiceClient, decryptEbayValue, encryptEbayValue, getPlatformCredentials,
  hashEbayState, ebayAuthUrl, ebayBaseUrl, sanitizeEbayError,
  type EbayEnvironment,
} from '../ebay-security';

const OAUTH_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
];

function isEnvironment(value: unknown): value is EbayEnvironment {
  return value === 'SANDBOX' || value === 'PRODUCTION';
}

function isPlatformAdmin(auth: AuthContext): boolean {
  return auth.user.role === 'SUPER_ADMIN' || auth.permissions.has('*');
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function handleIntegrationConfig(path: string, request: Request, auth: AuthContext, env: WorkerEnv): Promise<Response | null> {
  if (path !== '/ebay/integration/config') return null;
  if (!isPlatformAdmin(auth)) return json({ error: 'Only a Super Admin can manage platform eBay application credentials.' }, 403);
  const admin = createServiceClient(env);

  if (request.method === 'GET') {
    const { data, error } = await admin.from('platform_integration_credentials')
      .select('environment,client_id_masked,credential_version,updated_at')
      .eq('provider', 'EBAY').order('environment');
    if (error) throw new Error('eBay integration configuration could not be loaded.');
    const byEnvironment = new Map((data || []).map((row: any) => [row.environment, row]));
    return json({
      environments: ['SANDBOX', 'PRODUCTION'].map((environment) => {
        const row: any = byEnvironment.get(environment);
        return { environment, configured: Boolean(row), clientIdMasked: row?.client_id_masked || '', credentialVersion: row?.credential_version || 0, updatedAt: row?.updated_at || null };
      }),
      productionOAuthEnabled: env.EBAY_PRODUCTION_OAUTH_ENABLED === 'true',
      encryptionReady: Boolean(env.EBAY_TOKEN_ENCRYPTION_KEY),
    });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const environment = body?.environment;
  const clientId = typeof body?.clientId === 'string' ? body.clientId.trim() : '';
  const clientSecret = typeof body?.clientSecret === 'string' ? body.clientSecret.trim() : '';
  const ruName = typeof body?.ruName === 'string' ? body.ruName.trim() : '';
  const expectedVersion = Number(body?.expectedVersion);
  if (!isEnvironment(environment) || !clientId || !clientSecret || !ruName || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    return json({ error: 'Environment, Client ID, Client Secret, RuName and current credential version are required.' }, 400);
  }
  if (clientId.length > 512 || clientSecret.length > 2048 || ruName.length > 256) {
    return json({ error: 'One or more eBay credential fields exceed the allowed length.' }, 400);
  }
  const [clientIdCiphertext, clientSecretCiphertext, ruNameCiphertext] = await Promise.all([
    encryptEbayValue(clientId, env), encryptEbayValue(clientSecret, env), encryptEbayValue(ruName, env),
  ]);
  const { data, error } = await admin.rpc('save_platform_integration_credentials', {
    p_environment: environment,
    p_expected_version: expectedVersion,
    p_client_id_ciphertext: clientIdCiphertext,
    p_client_secret_ciphertext: clientSecretCiphertext,
    p_ru_name_ciphertext: ruNameCiphertext,
    p_client_id_masked: clientId.length > 8 ? `${clientId.slice(0, 4)}••••${clientId.slice(-4)}` : '••••',
    p_actor_user_id: auth.user.id,
  });
  if (error) {
    const conflict = /version conflict/i.test(error.message || '');
    return json({ error: conflict ? 'Credentials were updated by another administrator. Reload and try again.' : 'eBay credentials could not be saved securely.' }, conflict ? 409 : 400);
  }
  return json({ success: true, result: Array.isArray(data) ? data[0] : data });
}

export async function handleMarketplaceRoute(path: string, request: Request, auth: AuthContext, env: WorkerEnv): Promise<Response | null> {
  const configResponse = await handleIntegrationConfig(path, request, auth, env);
  if (configResponse) return configResponse;

  if (path === '/ebay/accounts' && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const marketplace = body?.marketplace;
    const environment = body?.environment;
    if (!name || name.length > 120 || !['EBAY_UK', 'EBAY_US', 'EBAY_DE'].includes(String(marketplace)) || !isEnvironment(environment)) {
      return json({ error: 'Provide an account name, supported eBay marketplace and environment.' }, 400);
    }
    if (environment === 'PRODUCTION' && env.EBAY_PRODUCTION_OAUTH_ENABLED !== 'true') {
      return json({ error: 'Production eBay authorization is locked until the eBay production keyset is activated and deletion-notification compliance is verified.' }, 403);
    }
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_accounts').insert({
      organization_id: auth.organizationId,
      name,
      marketplace,
      environment,
      auth_status: 'DISCONNECTED',
      is_demo: false,
      auto_sync_interval_minutes: 15,
    }).select('id,name,marketplace,environment,auth_status,is_demo').single();
    if (error) throw new Error('The eBay seller account could not be created.');
    return json({ account: { id: data.id, name: data.name, marketplace: data.marketplace, environment: data.environment, authStatus: data.auth_status, isDemo: data.is_demo } }, 201);
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
    const configured = new Set<string>();
    if (env.SUPABASE_SERVICE_ROLE_KEY && env.EBAY_TOKEN_ENCRYPTION_KEY) {
      const admin = createServiceClient(env);
      const { data: credentials } = await admin.from('platform_integration_credentials')
        .select('environment,client_id_masked,credential_version').eq('provider', 'EBAY');
      for (const row of credentials || []) configured.add(row.environment);
    }
    const integrationReady = Boolean(env.SUPABASE_SERVICE_ROLE_KEY && env.EBAY_TOKEN_ENCRYPTION_KEY && configured.has('SANDBOX'));
    return json({
      integrationReady,
      integrationMessage: integrationReady ? 'eBay Sandbox credentials are securely configured. Add a non-demo seller account and connect it with eBay OAuth.' : 'Configure eBay Sandbox credentials and the Worker encryption key before connecting seller accounts.',
      configuredEnvironments: ['SANDBOX','PRODUCTION'].map(environment => ({ environment, configured: configured.has(environment) })),
      productionOAuthEnabled: env.EBAY_PRODUCTION_OAUTH_ENABLED === 'true',
      accounts: (accountsResult.data || []).map(row => ({
        id: row.id, name: row.name, marketplace: row.marketplace, sellerUsername: row.seller_username || '',
        authStatus: row.auth_status, environment: row.environment, lastSyncAt: row.last_sync_at || '',
        lastSyncStatus: row.last_sync_status || '', lastSyncMessage: row.last_sync_message || '',
        tokenExpiresAt: row.token_expires_at || '', autoSyncIntervalMinutes: row.auto_sync_interval_minutes,
        isDemo: row.is_demo,
      })),
      recentSyncs: (syncResult.data || []).map(row => ({ id: row.id, accountId: row.marketplace_account_id, startedAt: row.started_at, completedAt: row.completed_at || '', status: row.status, ordersFetched: row.orders_fetched, ordersImported: row.orders_imported, ordersSkippedDuplicate: row.orders_skipped_duplicate, exceptionsRaised: row.exceptions_raised, logMessage: row.log_message || '' })),
    });
  }

  const connectMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/connect$/);
  if (connectMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,name,environment,is_demo,marketplace').eq('id', connectMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.is_demo) return json({ error: 'Demo accounts cannot be connected. Create a real seller account entry first.' }, 400);
    if (!isEnvironment(account.environment)) return json({ error: 'The account environment is invalid.' }, 400);
    if (account.environment === 'PRODUCTION' && env.EBAY_PRODUCTION_OAUTH_ENABLED !== 'true') return json({ error: 'Production eBay authorization is disabled until eBay activates the production keyset and compliance is complete.' }, 403);
    const credentials = await getPlatformCredentials(env, account.environment);
    if (!credentials) return json({ error: `eBay ${account.environment} application credentials have not been configured.` }, 409);
    const state = randomState();
    const stateHash = await hashEbayState(state);
    const admin = createServiceClient(env);
    const { error: stateError } = await admin.from('marketplace_oauth_states').insert({
      state_hash: stateHash,
      organization_id: auth.organizationId,
      marketplace_account_id: account.id,
      user_id: auth.user.id,
      environment: account.environment,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (stateError) throw new Error('A secure eBay authorization session could not be created.');
    const authorize = new URL(ebayAuthUrl(account.environment));
    authorize.searchParams.set('client_id', credentials.clientId);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('redirect_uri', credentials.ruName);
    authorize.searchParams.set('scope', OAUTH_SCOPES.join(' '));
    authorize.searchParams.set('state', state);
    authorize.searchParams.set('prompt', 'login');
    return json({ authorizationUrl: authorize.toString() });
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
      .eq('id', resolveExceptionMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (exceptionError) throw new Error('Marketplace exception could not be loaded.');
    if (!exception) return json({ error: 'Marketplace exception was not found in this workspace.' }, 404);
    if (exception.exception_type !== 'UNMAPPED_SKU' || !exception.marketplace_account_id) return json({ error: 'Only unmapped SKU exceptions linked to a marketplace account can be resolved here.' }, 400);
    let externalSku = '';
    try { const rawLine = JSON.parse(exception.raw_payload_snippet || '{}') as Record<string, unknown>; externalSku = typeof rawLine.sku === 'string' ? rawLine.sku.trim() : ''; }
    catch { return json({ error: 'The exception does not contain a valid marketplace SKU payload.' }, 422); }
    if (!externalSku || externalSku.length > 128) return json({ error: 'The exception does not contain a valid marketplace SKU.' }, 422);
    const { data: resolution, error: resolutionError } = await auth.repositoryContext.supabase.rpc('resolve_marketplace_exception', {
      p_organization_id: auth.organizationId, p_exception_id: exception.id, p_product_id: targetProductId,
      p_external_sku: externalSku, p_resolution_note: resolutionNote || null,
    });
    if (resolutionError) throw resolutionError;
    return json({ success: true, exception: resolution });
  }

  return null;
}

export async function handleEbayOAuthCallback(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const eBayError = url.searchParams.get('error');
  const stateError = url.searchParams.get('error_description');
  const returnUrl = (status: string) => Response.redirect(`https://app.oriafuture.com/?ebay_oauth=${encodeURIComponent(status)}`, 302);
  if (!state || state.length > 512) return returnUrl('invalid_state');
  const admin = createServiceClient(env);
  const stateHash = await hashEbayState(state);
  const { data: oauthState, error: consumeError } = await admin.from('marketplace_oauth_states')
    .delete().eq('state_hash', stateHash).gt('expires_at', new Date().toISOString())
    .select('organization_id,marketplace_account_id,user_id,environment').maybeSingle();
  if (consumeError || !oauthState) return returnUrl('expired_or_reused_state');
  if (eBayError || !code || code.length > 1024) return returnUrl('consent_denied');

  try {
    if (!isEnvironment(oauthState.environment)) return returnUrl('invalid_environment');
    if (oauthState.environment === 'PRODUCTION' && env.EBAY_PRODUCTION_OAUTH_ENABLED !== 'true') return returnUrl('production_disabled');
    const credentials = await getPlatformCredentials(env, oauthState.environment);
    if (!credentials) return returnUrl('credentials_missing');
    const form = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: credentials.ruName });
    const tokenResponse = await fetch(`${ebayBaseUrl(oauthState.environment)}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${credentials.clientId}:${credentials.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form,
    });
    if (!tokenResponse.ok) return returnUrl('token_exchange_failed');
    const token = await tokenResponse.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number; refresh_token_expires_in?: number; token_type?: string;
    };
    if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in) || !Number.isFinite(token.refresh_token_expires_in)) {
      return returnUrl('invalid_token_response');
    }
    const [accessCiphertext, refreshCiphertext] = await Promise.all([
      encryptEbayValue(token.access_token, env), encryptEbayValue(token.refresh_token, env),
    ]);
    const now = Date.now();
    const accessExpiresAt = new Date(now + Number(token.expires_in) * 1000).toISOString();
    const refreshExpiresAt = new Date(now + Number(token.refresh_token_expires_in) * 1000).toISOString();
    const { error: credentialError } = await admin.from('marketplace_credentials').upsert({
      organization_id: oauthState.organization_id,
      marketplace_account_id: oauthState.marketplace_account_id,
      access_token_ciphertext: accessCiphertext,
      refresh_token_ciphertext: refreshCiphertext,
      encryption_key_version: 'v1',
      scopes: OAUTH_SCOPES,
      expires_at: accessExpiresAt,
      token_type: token.token_type || 'User Access Token',
      refresh_token_expires_at: refreshExpiresAt,
      last_refreshed_at: new Date(now).toISOString(),
      revoked_at: null,
      refresh_lease_until: null,
      refresh_lease_token: null,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: 'marketplace_account_id' });
    if (credentialError) throw new Error('Encrypted eBay seller credentials could not be stored.');
    const { error: accountError } = await admin.from('marketplace_accounts').update({
      auth_status: 'CONNECTED', token_expires_at: accessExpiresAt,
      last_sync_status: 'NOT_SYNCED', last_sync_message: 'eBay seller authorization completed. Initial order sync is pending.',
      updated_at: new Date(now).toISOString(),
    }).eq('id', oauthState.marketplace_account_id).eq('organization_id', oauthState.organization_id).eq('is_demo', false);
    if (accountError) throw new Error('The eBay seller account status could not be updated.');
    await admin.from('marketplace_integration_events').insert({
      organization_id: oauthState.organization_id,
      marketplace_account_id: oauthState.marketplace_account_id,
      event_type: 'OAUTH_CONNECTED', severity: 'INFO',
      message: 'eBay seller authorization completed and encrypted tokens were stored.',
      metadata: { environment: oauthState.environment, scopes: OAUTH_SCOPES },
    });
    return returnUrl('success');
  } catch (error) {
    // Deliberately do not log callback query values, authorization codes, tokens, or provider response bodies.
    const message = sanitizeEbayError(error);
    await admin.from('marketplace_integration_events').insert({
      organization_id: oauthState.organization_id,
      marketplace_account_id: oauthState.marketplace_account_id,
      event_type: 'OAUTH_CALLBACK_FAILED', severity: 'ERROR',
      error_code: 'OAUTH_CALLBACK_FAILED', message: 'eBay authorization could not be completed.',
      metadata: { reason: message },
    });
    return returnUrl('callback_failed');
  }
}
