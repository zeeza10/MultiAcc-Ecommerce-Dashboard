import { createClient } from '@supabase/supabase-js';
import type { AuthContext, WorkerEnv } from '../types';
import { json } from '../http';
import { isPlatformAdminUser } from '../platform-admin';
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

function isPlatformAdmin(auth: AuthContext, env: WorkerEnv): boolean {
  return isPlatformAdminUser(auth.user.id, auth.user.role, env.PLATFORM_SUPER_ADMIN_USER_IDS);
}

function cleanCredential(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\\u0000-\\u001f\\u007f]/.test(trimmed)) return null;
  return trimmed;
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function handleIntegrationConfig(path: string, request: Request, auth: AuthContext, env: WorkerEnv): Promise<Response | null> {
  if (path !== '/ebay/integration/config') return null;
  if (!isPlatformAdmin(auth, env)) return json({ error: 'Platform owner authorization is required.' }, 403);
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
  if (auth.assuranceLevel !== 'aal2') {
    return json({ error: 'Complete an authenticator MFA verification before changing platform credentials.' }, 403);
  }
  const origin = request.headers.get('Origin');
  const requestOrigin = new URL(request.url).origin;
  if (!origin || (origin !== requestOrigin && origin !== env.ALLOWED_ORIGIN)) {
    return json({ error: 'A same-origin browser request is required for credential changes.' }, 403);
  }
  const mediaType = (request.headers.get('Content-Type') || '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') return json({ error: 'Content-Type must be application/json.' }, 415);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return json({ error: 'A JSON object is required.' }, 400);
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'A valid JSON request is required.' }, 400);
  }
  if (Object.keys(body).some(key => !['environment', 'clientId', 'clientSecret', 'ruName', 'expectedVersion'].includes(key))) {
    return json({ error: 'Unexpected credential fields were supplied.' }, 400);
  }
  const environment = body.environment;
  if (!isEnvironment(environment)) return json({ error: 'A valid eBay environment is required.' }, 400);
  if (typeof body.expectedVersion !== 'number' || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) {
    return json({ error: 'A valid expected credential version is required. Refresh the page and try again.' }, 409);
  }
  const expectedVersion = body.expectedVersion;
  const clientId = cleanCredential(body.clientId, 512);
  const clientSecret = cleanCredential(body.clientSecret, 2048);
  const ruName = cleanCredential(body.ruName, 256);
  if (!clientId || !clientSecret || !ruName) {
    return json({ error: 'Client ID, Client Secret and RuName are required. Existing credentials remain unchanged.' }, 400);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(clientId) || !/^[A-Za-z0-9_-]+$/.test(ruName)) {
    return json({ error: 'The eBay Client ID or RuName format is invalid.' }, 400);
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


function moneyMinor(value: unknown): number {
  const parsed = typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}
function orderStatus(orderStatusValue: unknown, paymentStatus: unknown): string {
  const fulfillment = String(orderStatusValue || '').toUpperCase();
  const payment = String(paymentStatus || '').toUpperCase();
  if (fulfillment === 'CANCELLED' || fulfillment === 'IN_CANCELLATION') return 'Cancelled';
  if (fulfillment === 'FULFILLED' || fulfillment === 'SHIPPED') return 'Shipped';
  if (fulfillment === 'DELIVERED') return 'Delivered';
  if (payment === 'PAID' || fulfillment === 'IN_PROGRESS' || fulfillment === 'COMPLETED') return 'Confirmed';
  return 'New';
}
async function getSellerAccessToken(env: WorkerEnv, account: any): Promise<string> {
  const admin = createServiceClient(env);
  const { data: credential, error } = await admin.from('marketplace_credentials').select('access_token_ciphertext,refresh_token_ciphertext,expires_at,refresh_token_expires_at,scopes,revoked_at').eq('marketplace_account_id', account.id).eq('organization_id', account.organization_id).maybeSingle();
  if (error || !credential || credential.revoked_at || !credential.access_token_ciphertext) throw new Error('This eBay seller account has no active authorization. Reconnect it with eBay.');
  if (new Date(credential.expires_at || 0).getTime() > Date.now() + 120000) return decryptEbayValue(credential.access_token_ciphertext, env);
  if (!credential.refresh_token_ciphertext || (credential.refresh_token_expires_at && new Date(credential.refresh_token_expires_at).getTime() <= Date.now())) throw new Error('The eBay refresh token has expired. Reconnect this seller account.');
  const platform = await getPlatformCredentials(env, account.environment);
  if (!platform) throw new Error('The eBay application credentials are not configured.');
  const lease = crypto.randomUUID(), now = new Date(), leaseUntil = new Date(now.getTime() + 180000).toISOString();
  const { data: leased, error: leaseError } = await admin.from('marketplace_credentials').update({ refresh_lease_token: lease, refresh_lease_until: leaseUntil, updated_at: now.toISOString() }).eq('marketplace_account_id', account.id).or(`refresh_lease_until.is.null,refresh_lease_until.lt.${now.toISOString()}`).select('refresh_token_ciphertext,scopes').maybeSingle();
  if (leaseError || !leased) throw new Error('An eBay token refresh is already in progress. Please retry shortly.');
  try {
    const refreshToken = await decryptEbayValue(leased.refresh_token_ciphertext, env);
    const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: (leased.scopes || OAUTH_SCOPES).join(' ') });
    const response = await fetch(`${ebayBaseUrl(account.environment)}/identity/v1/oauth2/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${platform.clientId}:${platform.clientSecret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form });
    if (!response.ok) {
      await admin.from('marketplace_credentials').update({ refresh_lease_token: null, refresh_lease_until: null, updated_at: new Date().toISOString() }).eq('marketplace_account_id', account.id).eq('refresh_lease_token', lease);
      if (response.status === 400 || response.status === 401) {
        await admin.from('marketplace_credentials').update({ revoked_at: new Date().toISOString() }).eq('marketplace_account_id', account.id);
        await admin.from('marketplace_accounts').update({ auth_status: 'DISCONNECTED', last_sync_status: 'FAILED', last_sync_message: 'eBay authorization expired. Reconnect this seller account.' }).eq('id', account.id);
        throw new Error('eBay authorization expired or was revoked. Reconnect this seller account.');
      }
      throw new Error('eBay token refresh failed. Retry the synchronization later.');
    }
    const refreshed = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };
    if (!refreshed.access_token || !Number.isFinite(refreshed.expires_in)) throw new Error('eBay returned an invalid refreshed token.');
    const [accessCiphertext, refreshCiphertext] = await Promise.all([encryptEbayValue(refreshed.access_token, env), refreshed.refresh_token ? encryptEbayValue(refreshed.refresh_token, env) : Promise.resolve(leased.refresh_token_ciphertext)]);
    const accessExpiry = new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString();
    const patch: Record<string, unknown> = { access_token_ciphertext: accessCiphertext, refresh_token_ciphertext: refreshCiphertext, expires_at: accessExpiry, last_refreshed_at: new Date().toISOString(), refresh_lease_token: null, refresh_lease_until: null, updated_at: new Date().toISOString() };
    if (refreshed.refresh_token_expires_in) patch.refresh_token_expires_at = new Date(Date.now() + refreshed.refresh_token_expires_in * 1000).toISOString();
    const { error: saveError } = await admin.from('marketplace_credentials').update(patch).eq('marketplace_account_id', account.id).eq('refresh_lease_token', lease);
    if (saveError) throw new Error('The refreshed eBay token could not be stored securely.');
    await admin.from('marketplace_accounts').update({ token_expires_at: accessExpiry, auth_status: 'CONNECTED' }).eq('id', account.id);
    return refreshed.access_token;
  } catch (error) {
    await admin.from('marketplace_credentials').update({ refresh_lease_token: null, refresh_lease_until: null, updated_at: new Date().toISOString() }).eq('marketplace_account_id', account.id).eq('refresh_lease_token', lease);
    throw error;
  }
}
async function syncSellerOrders(account: any, env: WorkerEnv): Promise<{ imported: number; skipped: number; exceptions: number; fetched: number }> {
  const admin = createServiceClient(env), accessToken = await getSellerAccessToken(env, account);
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const dataEnvironment = account.is_demo ? 'DEMO' : account.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
  const [mappingsResult, productsResult] = await Promise.all([
    admin.from('marketplace_sku_mappings').select('external_sku,product_id').eq('organization_id', account.organization_id).eq('marketplace_account_id', account.id),
    admin.from('products').select('id,sku,name').eq('organization_id', account.organization_id).eq('data_environment', dataEnvironment),
  ]);
  if (mappingsResult.error || productsResult.error) throw new Error('The internal SKU catalog could not be loaded for eBay order matching.');
  const mappingBySku = new Map((mappingsResult.data || []).map((row: any) => [row.external_sku, row.product_id]));
  const productById = new Map((productsResult.data || []).map((row: any) => [row.id, row]));
  const productBySku = new Map((productsResult.data || []).map((row: any) => [row.sku, row]));
  let imported = 0, skipped = 0, exceptions = 0, fetched = 0;
  const { data: run, error: runError } = await admin.from('marketplace_sync_runs').insert({ organization_id: account.organization_id, marketplace_account_id: account.id, started_at: new Date().toISOString(), status: 'RUNNING' }).select('id').single();
  if (runError || !run) throw new Error('A marketplace sync run could not be started.');
  try {
    let offset = 0, total = 0;
    do {
      const endpoint = new URL(`${ebayBaseUrl(account.environment)}/sell/fulfillment/v1/order`);
      endpoint.searchParams.set('limit', '100'); endpoint.searchParams.set('offset', String(offset)); endpoint.searchParams.set('filter', `creationdate:[${since}..]`);
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (!response.ok) throw new Error(`eBay order API returned HTTP ${response.status}.`);
      const page = await response.json() as { orders?: any[]; total?: number };
      const orders = Array.isArray(page.orders) ? page.orders : [];
      total = Number(page.total || orders.length); fetched += orders.length;
      for (const order of orders) {
        const externalId = typeof order.orderId === 'string' ? order.orderId : '';
        if (!externalId) continue;
        const shipping = order.fulfillmentStartInstructions?.find((item: any) => item?.shippingStep?.shipTo)?.shippingStep?.shipTo;
        const address = shipping?.contactAddress || {};
        const items = (Array.isArray(order.lineItems) ? order.lineItems : []).map((line: any) => {
          const sku = String(line.sku || line.legacyItemId || line.lineItemId || 'UNKNOWN').slice(0, 128);
          const productId = mappingBySku.get(sku), product = (productId ? productById.get(productId) : null) || productBySku.get(sku) || null;
          const quantity = Math.max(1, Math.trunc(Number(line.quantity || 1))), unit = moneyMinor(line.lineItemCost?.value);
          return { product_id: product?.id || null, sku: product?.sku || sku, product_name: product?.name || String(line.title || 'eBay item').slice(0, 250), quantity, unit_price_minor: unit, tax_amount_minor: 0, total_price_minor: unit * quantity, raw_item: { lineItemId: line.lineItemId || null, sku, title: line.title || null, quantity, unitPrice: line.lineItemCost?.value || null } };
        });
        const totalMinor = moneyMinor(order.pricingSummary?.total?.value) || items.reduce((sum: number, item: any) => sum + item.total_price_minor, 0);
        const payload = {
          external_order_id: externalId, order_number: `EB-${account.id.slice(0, 6)}-${externalId}`,
          customer_name: String(shipping?.fullName || order.buyer?.username || 'eBay buyer').slice(0, 160), customer_email: null,
          shipping_address: { name: shipping?.fullName || null, addressLine1: address.addressLine1 || null, addressLine2: address.addressLine2 || null, city: address.city || null, stateOrProvince: address.stateOrProvince || null, postalCode: address.postalCode || null, countryCode: address.countryCode || null },
          status: orderStatus(order.orderFulfillmentStatus, order.orderPaymentStatus),
          payment_state: String(order.orderPaymentStatus || '').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING',
          total_minor: totalMinor, tax_minor: moneyMinor(order.pricingSummary?.tax?.value), shipping_charge_minor: moneyMinor(order.pricingSummary?.deliveryCost?.value),
          currency: order.pricingSummary?.total?.currency || 'GBP', created_at: order.creationDate || new Date().toISOString(),
          safe_payload: { orderId: externalId, creationDate: order.creationDate || null, orderPaymentStatus: order.orderPaymentStatus || null, orderFulfillmentStatus: order.orderFulfillmentStatus || null, lineItems: items.map((item: any) => item.raw_item) }, items,
        };
        const { data: result, error: importError } = await admin.rpc('import_marketplace_order', { p_organization_id: account.organization_id, p_marketplace_account_id: account.id, p_order: payload });
        if (importError) throw new Error('An eBay order could not be imported into the workspace.');
        const inserted = Array.isArray(result) ? result[0] : result;
        if (inserted?.duplicate) skipped++;
        else if (inserted?.inserted) { imported++; exceptions += Number(inserted.exception_count || 0); }
      }
      offset += orders.length;
      if (!orders.length || offset >= total || offset >= 1000) break;
    } while (true);
    const finished = new Date().toISOString(), status = exceptions ? 'PARTIAL' : 'COMPLETED';
    await admin.from('marketplace_sync_runs').update({ completed_at: finished, status, orders_fetched: fetched, orders_imported: imported, orders_skipped_duplicate: skipped, exceptions_raised: exceptions, log_message: `Fetched ${fetched}; imported ${imported}; duplicates ${skipped}; SKU exceptions ${exceptions}.`, attempt_count: 1, retryable: false }).eq('id', run.id);
    await admin.from('marketplace_accounts').update({ last_sync_at: finished, last_sync_status: exceptions ? 'PARTIAL' : 'SUCCESS', last_sync_message: `Fetched ${fetched}; imported ${imported}; duplicates ${skipped}; SKU exceptions ${exceptions}.` }).eq('id', account.id);
    return { imported, skipped, exceptions, fetched };
  } catch (error) {
    await admin.from('marketplace_sync_runs').update({ completed_at: new Date().toISOString(), status: 'FAILED', last_error_code: 'EBAY_ORDER_SYNC_FAILED', last_error_message: 'eBay order synchronization failed.', retryable: true, attempt_count: 1 }).eq('id', run.id);
    await admin.from('marketplace_accounts').update({ last_sync_status: 'FAILED', last_sync_message: 'eBay order synchronization failed. Check the integration events and try again.' }).eq('id', account.id);
    throw error;
  }
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
      (() => {
        let query = auth.repositoryContext.supabase.from('marketplace_sync_runs')
          .select('id,marketplace_account_id,status,started_at,completed_at,orders_fetched,orders_imported,orders_skipped_duplicate,exceptions_raised,log_message')
          .eq('organization_id', auth.organizationId);
        const accountId = new URL(request.url).searchParams.get('accountId');
        if (accountId) query = query.eq('marketplace_account_id', accountId);
        return query.order('started_at', { ascending: false }).limit(10);
      })(),
    ]);
    if (accountsResult.error || syncResult.error) throw new Error('Marketplace account data could not be loaded.');
    const configured = new Set<string>();
    if (env.SUPABASE_SECRET_KEY && env.EBAY_TOKEN_ENCRYPTION_KEY) {
      const admin = createServiceClient(env);
      const { data: credentials } = await admin.from('platform_integration_credentials')
        .select('environment,client_id_masked,credential_version').eq('provider', 'EBAY');
      for (const row of credentials || []) configured.add(row.environment);
    }
    const integrationReady = Boolean(env.SUPABASE_SECRET_KEY && env.EBAY_TOKEN_ENCRYPTION_KEY && configured.size > 0);
    return json({
      integrationReady,
      integrationMessage: integrationReady ? 'eBay application credentials are securely configured for at least one environment. Connect a seller account using its matching environment.' : 'Configure credentials for the required eBay environment and the Worker encryption key before connecting seller accounts.',
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


  const syncMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/sync$/);
  if (syncMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts').select('id,organization_id,environment,is_demo,auth_status,marketplace').eq('id', syncMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.is_demo || account.auth_status !== 'CONNECTED') return json({ error: 'Only a real, connected eBay seller account can be synchronized.' }, 409);
    if (!isEnvironment(account.environment)) return json({ error: 'The account environment is invalid.' }, 400);
    try { return json(await syncSellerOrders(account, env)); }
    catch (error) { return json({ error: error instanceof Error ? error.message : 'eBay order synchronization failed.' }, 502); }
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
    const accountId = new URL(request.url).searchParams.get('accountId');
    let query = auth.repositoryContext.supabase.from('marketplace_exceptions')
      .select('id,marketplace_account_id,exception_type,source,reference_id,details,status,created_at,resolved_at,resolution_note')
      .eq('organization_id', auth.organizationId);
    if (accountId) {
      const { data: account, error: accountError } = await auth.repositoryContext.supabase
        .from('marketplace_accounts').select('id')
        .eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: 'The selected marketplace account was not found in this workspace.' }, 404);
      query = query.eq('marketplace_account_id', accountId);
    }
    const { data, error } = await query.order('created_at', { ascending: false }).limit(250);
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
