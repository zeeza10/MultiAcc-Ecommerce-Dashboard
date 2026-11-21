import { createClient } from '@supabase/supabase-js';
import type { AuthContext, WorkerEnv } from '../types';
import { fetchEbaySellerIdentity } from '../ebay-identity';
import { json } from '../http';
import { normalizeEbayOrderStartDate } from '../ebay-order-date';
import { isRetryableEbaySyncFailure } from '../ebay-sync-retry';
import { saveEbayProviderSnapshot } from '../ebay-provider-snapshots';
import { ebayTradingSiteId, parseTradingActiveListings } from '../ebay-trading-listings';
import { createEbayFinanceSignatureHeaders } from '../ebay-finance-signature';
import { buildEbayPostOrderHeaders, subtractUtcMonthsClamped } from '../ebay-post-order';
import { ebayAnalyticsMarketplaceId, ebaySellerStandardsProgram } from '../ebay-analytics';
import { ebayOrderShippingMinor, ebayOrderTaxMinor, normalizeEbayOrderHeader, normalizeEbayOrderLines } from '../ebay-order-normalizer';
import { getAbandonedProductionSyncRunIds } from '../marketplace-sync-recovery';
import { normalizeEbayAnalyticsResource, normalizeEbayFinanceSummary, normalizeEbaySellerAccountResource } from '../ebay-provider-normalizers';
import { sendWebPushNotification } from '../web-push';
import { isPlatformAdminUser } from '../platform-admin';
import {
  createServiceClient, decryptEbayValue, encryptEbayValue, getPlatformCredentials,
  hashEbayState, ebayAuthUrl, ebayBaseUrl, sanitizeEbayError, verifyEbayApplicationCredentials, EbayCredentialVerificationError,
  type EbayEnvironment,
} from '../ebay-security';

const OAUTH_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.return.read',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
];

function isEnvironment(value: unknown): value is EbayEnvironment {
  return value === 'PRODUCTION';
}

function isPlatformAdmin(auth: AuthContext, env: WorkerEnv): boolean {
  return isPlatformAdminUser(auth.user.id, auth.user.role, env.PLATFORM_SUPER_ADMIN_USER_IDS);
}

function cleanCredential(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
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
      .select('environment,client_id_masked,credential_version,updated_at,credentials_verified_at')
      .eq('provider', 'EBAY').order('environment');
    if (error) throw new Error('eBay integration configuration could not be loaded.');
    const byEnvironment = new Map((data || []).map((row: any) => [row.environment, row]));
    return json({
      environments: ['PRODUCTION'].map((environment) => {
        const row: any = byEnvironment.get(environment);
        return { environment, configured: Boolean(row), credentialsVerified: Boolean(row?.credentials_verified_at), credentialsVerifiedAt: row?.credentials_verified_at || null, clientIdMasked: row?.client_id_masked || '', credentialVersion: row?.credential_version || 0, updatedAt: row?.updated_at || null };
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
  try {
    await verifyEbayApplicationCredentials(environment, clientId, clientSecret);
  } catch (error) {
    if (error instanceof EbayCredentialVerificationError) {
      return json({ error: error.message, code: error.code }, error.httpStatus);
    }
    return json({ error: 'eBay credential verification is temporarily unavailable. No credentials were saved; please retry.' }, 503);
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
    p_credentials_verified_at: new Date().toISOString(),
  });
  if (error) {
    const conflict = /version conflict/i.test(error.message || '');
    return json({ error: conflict ? 'Credentials were updated by another administrator. Reload and try again.' : 'eBay credentials could not be saved securely.' }, conflict ? 409 : 400);
  }
  return json({ success: true, credentialsVerified: true, sellerAuthorization: 'PENDING', result: Array.isArray(data) ? data[0] : data });
}



type EbaySyncProgress = {
  stage: string; fetched: number; imported: number; skipped: number;
  exceptions: number; offersFetched: number; runCreated: boolean;
};
function createEbaySyncProgress(): EbaySyncProgress {
  return { stage: 'TOKEN', fetched: 0, imported: 0, skipped: 0, exceptions: 0, offersFetched: 0, runCreated: false };
}
function getEbaySyncFailure(error: unknown, fallbackCode: string) {
  const providerError = error instanceof EbayOrdersApiError ? error : null;
  const rawMessage = error instanceof Error ? error.message
    : error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : '';
  const message = (rawMessage || 'An unexpected synchronization error occurred.')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/(access_token|refresh_token|client_secret|authorization)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[URL]')
    .replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ').slice(0, 320);
  const statusMatch = rawMessage.match(/HTTP\s+(\d{3})/i);
  return {
    code: providerError?.providerCode ? ('EBAY_API_' + providerError.providerCode).slice(0, 64) : fallbackCode,
    message, httpStatus: providerError?.httpStatus ?? (statusMatch ? Number(statusMatch[1]) : null),
    providerCode: providerError?.providerCode || null,
  };
}

class EbayOrdersApiError extends Error {
  constructor(
    readonly httpStatus: number,
    readonly providerCode: string | null,
    readonly providerMessage: string,
  ) {
    super('eBay order API returned HTTP ' + httpStatus
      + (providerCode ? ' (code ' + providerCode + ')' : '')
      + (providerMessage ? ': ' + providerMessage : '.'));
    this.name = 'EbayOrdersApiError';
  }
}

async function readEbayOrdersApiError(response: Response): Promise<EbayOrdersApiError> {
  let payload: any = null;
  try { payload = await response.json(); } catch { /* Provider may return a non-JSON error body. */ }
  const first = Array.isArray(payload?.errors) ? payload.errors[0] : null;
  const rawCode = first?.errorId ?? first?.code ?? payload?.errorId ?? payload?.code;
  const providerCode = rawCode === undefined || rawCode === null ? null : String(rawCode).slice(0, 32);
  const rawMessage = typeof first?.message === 'string' ? first.message
    : typeof first?.longMessage === 'string' ? first.longMessage
    : typeof payload?.message === 'string' ? payload.message : '';
  // Provider text is diagnostic only. Strip control characters and credential-like values.
  const providerMessage = rawMessage
    .replace(/[\r\n\t\u0000-\u001f\u007f]/g, ' ')
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/(access_token|refresh_token|client_secret|authorization)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\/\/[^\s]+/gi, '[URL]')
    .slice(0, 240);
  return new EbayOrdersApiError(response.status, providerCode, providerMessage);
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
async function recordEbayOrderException(
  admin: any,
  account: any,
  exceptionType: string,
  referenceId: string,
  details: string,
  rawPayload: Record<string, unknown>,
): Promise<boolean> {
  const { data: existing, error: lookupError } = await admin.from('marketplace_exceptions')
    .select('id').eq('organization_id', account.organization_id).eq('marketplace_account_id', account.id).eq('source', 'EBAY')
    .eq('exception_type', exceptionType).eq('reference_id', referenceId)
    .eq('status', 'PENDING').limit(1).maybeSingle();
  if (lookupError) throw new Error('An existing eBay order exception could not be checked safely.');
  if (existing) return false;
  const { error: insertError } = await admin.from('marketplace_exceptions').insert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    exception_type: exceptionType,
    source: 'EBAY',
    reference_id: referenceId,
    details,
    raw_payload_snippet: JSON.stringify(rawPayload).slice(0, 4000),
    status: 'PENDING',
  });
  if (insertError) throw new Error('An incomplete eBay order record could not be placed in the exception queue.');
  return true;
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
async function notifyNewEbayOrder(admin: any, account: any, externalOrderId: string, env: WorkerEnv): Promise<void> {
  // Never surface Sandbox or demo orders as live business notifications.
  if (account.is_demo || account.environment !== 'PRODUCTION') return;
  const sourceEventKey = `EBAY_ORDER:${account.id}:${externalOrderId}`;
  // The in-app alert is inserted atomically by import_marketplace_order with the new order.
  const { data: notification, error } = await admin.from('notifications')
    .select('id,title,message')
    .eq('organization_id', account.organization_id)
    .eq('source_event_key', sourceEventKey)
    .maybeSingle();
  if (error || !notification?.id) {
    console.warn('The imported eBay order has no matching transactional notification.', error?.code || 'notification_not_found');
    return;
  }

  const { data: members, error: memberError } = await admin.from('organization_members')
    .select('user_id,roles(code)')
    .eq('organization_id', account.organization_id)
    .eq('is_active', true);
  if (memberError || !members?.length) return;
  // Client portal users do not receive organization-wide order alerts.
  const recipientIds = members
    .filter((member: any) => member.roles?.code !== 'CLIENT_USER')
    .map((member: any) => member.user_id);
  if (!recipientIds.length) return;

  const { data: subscriptions, error: subscriptionError } = await admin.from('web_push_subscriptions')
    .select('id,endpoint,p256dh,auth_secret')
    .eq('organization_id', account.organization_id)
    .in('user_id', recipientIds);
  if (subscriptionError) {
    console.warn('Live eBay order notification was stored, but push subscriptions could not be loaded.');
    return;
  }
  if (!subscriptions?.length) return;

  await Promise.all(subscriptions.map(async (subscription: any) => {
    const result = await sendWebPushNotification(subscription, {
      title: notification.title,
      body: notification.message,
      url: '/',
      notificationId: notification.id,
    }, env);
    if (!result.ok) console.warn('Web Push delivery failed for a live eBay order notification.', result.status || 'vapid_or_crypto_error');
    if (result.status === 404 || result.status === 410) {
      await admin.from('web_push_subscriptions').delete().eq('id', subscription.id);
    }
  }));
}

async function syncSellerOrders(account: any, env: WorkerEnv, progress: EbaySyncProgress = createEbaySyncProgress()): Promise<{ imported: number; skipped: number; exceptions: number; fetched: number; status: 'SUCCESS' | 'PARTIAL'; pagesPending: boolean }> {
  const admin = createServiceClient(env), accessToken = await getSellerAccessToken(env, account);
  const dataEnvironment = account.is_demo ? 'DEMO' : account.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
  progress.stage = 'ORDERS_CHECKPOINT_READ';
  const { data: checkpoint, error: checkpointError } = await admin.from('marketplace_sync_checkpoints')
    .select('cursor_state,watermark_at,last_successful_at').eq('marketplace_account_id', account.id).eq('resource_type', 'ORDERS').maybeSingle();
  if (checkpointError) throw new Error(checkpointError.message || 'The eBay order sync checkpoint could not be loaded.');
  const savedCursor = checkpoint?.cursor_state && typeof checkpoint.cursor_state === 'object' ? checkpoint.cursor_state as Record<string, unknown> : {};
  // Prefer the in-progress cursor; otherwise resume from the successful watermark
  // with a small overlap. Normalize every path before calling eBay because the
  // Fulfillment API rejects start dates outside its rolling two-year window.
  let requestedSince: unknown = savedCursor.since;
  if (typeof requestedSince !== 'string' && typeof checkpoint?.watermark_at === 'string') {
    const watermarkTime = Date.parse(checkpoint.watermark_at);
    if (Number.isFinite(watermarkTime)) requestedSince = new Date(watermarkTime - 3 * 86400000).toISOString();
  }
  if (typeof requestedSince !== 'string') requestedSince = new Date(Date.now() - 365 * 86400000).toISOString();
  const normalizedStart = normalizeEbayOrderStartDate(requestedSince);
  const since = normalizedStart.since;
  const filterField = savedCursor.filterField === 'lastmodifieddate' || savedCursor.filterField === 'creationdate'
    ? savedCursor.filterField : checkpoint?.watermark_at ? 'lastmodifieddate' : 'creationdate';
  // A clamped cursor no longer describes the same result page; restart at page 0.
  let resumeOffset = !normalizedStart.clamped && Number.isSafeInteger(Number(savedCursor.offset)) && Number(savedCursor.offset) >= 0
    ? Number(savedCursor.offset) : 0;
  progress.stage = 'SKU_CATALOG_READ';
  const [mappingsResult, productsResult] = await Promise.all([
    admin.from('marketplace_sku_mappings').select('external_sku,product_id').eq('organization_id', account.organization_id).eq('marketplace_account_id', account.id),
    admin.from('products').select('id,sku,name').eq('organization_id', account.organization_id).eq('data_environment', dataEnvironment),
  ]);
  if (mappingsResult.error || productsResult.error) throw new Error(mappingsResult.error?.message || productsResult.error?.message || 'The internal SKU catalog could not be loaded for eBay order matching.');
  const mappingBySku = new Map((mappingsResult.data || []).map((row: any) => [row.external_sku, row.product_id]));
  const productById = new Map((productsResult.data || []).map((row: any) => [row.id, row]));
  const productBySku = new Map((productsResult.data || []).map((row: any) => [row.sku, row]));
  const pageLimit = 5; // Bound DB RPCs and notification writes within the Cloudflare Worker subrequest budget.
  let imported = 0, skipped = 0, exceptions = 0, fetched = 0;
  progress.stage = 'SYNC_RUN_CREATE';
  const { data: run, error: runError } = await admin.from('marketplace_sync_runs').insert({ organization_id: account.organization_id, marketplace_account_id: account.id, started_at: new Date().toISOString(), status: 'RUNNING', data_environment: dataEnvironment }).select('id').single();
  if (runError || !run) throw new Error(runError?.message || 'A marketplace sync run could not be started.');
  progress.runCreated = true;
  try {
    let offset = resumeOffset, total = 0, pages = 0, hasMore = false;
    do {
      progress.stage = 'EBAY_ORDERS_API';
      const endpoint = new URL(`${ebayBaseUrl(account.environment)}/sell/fulfillment/v1/order`);
      endpoint.searchParams.set('limit', String(pageLimit)); endpoint.searchParams.set('offset', String(offset)); endpoint.searchParams.set('filter', `${filterField}:[${since}..]`);
      endpoint.searchParams.set('fieldGroups', 'TAX_BREAKDOWN');
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
      if (!response.ok) throw await readEbayOrdersApiError(response);
      const page = await response.json() as { orders?: any[]; total?: number };
      const orders = Array.isArray(page.orders) ? page.orders : [];
      total = Number(page.total ?? (offset + orders.length));
      if (orders.length === 0 && offset < total) {
        throw new EbayOrdersApiError(503, 'EBAY_ORDER_EMPTY_PAGE', 'eBay returned an empty order page before the reported total was reached.');
      }
      fetched += orders.length; progress.fetched = fetched; pages++;
      for (const order of orders) {
        const externalId = typeof order.orderId === 'string' ? order.orderId : '';
        if (!externalId) continue;
        const orderHeader = normalizeEbayOrderHeader(order);
        if (orderHeader.missingFields.length) {
          const created = await recordEbayOrderException(
            admin, account, 'INCOMPLETE_ORDER', externalId,
            `The eBay order is missing required provider fields: ${orderHeader.missingFields.join(', ')}. The order was not imported with substitute values.`,
            {
              orderId: externalId,
              creationDate: order.creationDate ?? null,
              pricingSummary: order.pricingSummary ?? null,
              orderPaymentStatus: order.orderPaymentStatus ?? null,
              orderFulfillmentStatus: order.orderFulfillmentStatus ?? null,
            },
          );
          if (created) exceptions++;
          progress.exceptions = exceptions;
          continue;
        }
        const shipping = order.fulfillmentStartInstructions?.find((item: any) => item?.shippingStep?.shipTo)?.shippingStep?.shipTo;
        const address = shipping?.contactAddress || {};
        const lineResult = normalizeEbayOrderLines(
          externalId,
          order.lineItems,
          orderHeader.currency as string,
          (sku) => {
            const mappedProductId = mappingBySku.get(sku);
            const product = (mappedProductId ? productById.get(mappedProductId) : null) || productBySku.get(sku) || null;
            return product?.id || null;
          },
        );
        // Defer incomplete-line exceptions until the import RPC confirms a new
        // order. Re-seeing an existing order must not create fresh exceptions.
        const items = lineResult.items;
        const payload = {
          external_order_id: externalId, order_number: `EB-${account.id.slice(0, 6)}-${externalId}`,
          customer_name: String(shipping?.fullName || order.buyer?.username || 'eBay buyer').slice(0, 160), customer_email: null,
          shipping_address: { name: shipping?.fullName || null, addressLine1: address.addressLine1 || null, addressLine2: address.addressLine2 || null, city: address.city || null, stateOrProvince: address.stateOrProvince || null, postalCode: address.postalCode || null, countryCode: address.countryCode || null },
          status: orderStatus(order.orderFulfillmentStatus, order.orderPaymentStatus),
          payment_state: String(order.orderPaymentStatus || '').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING',
          total_minor: orderHeader.totalMinor,
          tax_minor: ebayOrderTaxMinor(order),
          shipping_charge_minor: ebayOrderShippingMinor(order),
          currency: orderHeader.currency,
          created_at: orderHeader.createdAt,
          marketplace_status: typeof order.orderFulfillmentStatus === 'string' ? order.orderFulfillmentStatus : null,
          marketplace_status_updated_at: typeof order.lastModifiedDate === 'string' && Number.isFinite(Date.parse(order.lastModifiedDate)) ? new Date(order.lastModifiedDate).toISOString() : null,
          safe_payload: {
            orderId: externalId,
            creationDate: orderHeader.createdAt,
            lastModifiedDate: order.lastModifiedDate || null,
            orderPaymentStatus: order.orderPaymentStatus || null,
            orderFulfillmentStatus: order.orderFulfillmentStatus || null,
            lineItems: items.map((item: any) => item.raw_item),
            incompleteLineItems: lineResult.exceptions.map((exception) => ({
              referenceId: exception.referenceId, details: exception.details, rawItem: exception.rawPayload,
            })),
          },
          items,
        };
        progress.stage = 'ORDER_IMPORT';
        const { data: result, error: importError } = await admin.rpc('import_marketplace_order', { p_organization_id: account.organization_id, p_marketplace_account_id: account.id, p_order: payload });
        if (importError) throw new Error(importError.message || 'An eBay order could not be imported into the workspace.');
        const inserted = Array.isArray(result) ? result[0] : result;
        if (inserted?.duplicate) skipped++;
        else if (inserted?.inserted) {
          imported++;
          exceptions += Number(inserted.exception_count || 0);
          for (const lineException of lineResult.exceptions) {
            const created = await recordEbayOrderException(
              admin, account, 'INCOMPLETE_ORDER_LINE', lineException.referenceId,
              lineException.details, lineException.rawPayload,
            );
            if (created) exceptions++;
          }
          await notifyNewEbayOrder(admin, account, externalId, env);
        }
        progress.imported = imported; progress.skipped = skipped; progress.exceptions = exceptions;
      }
      offset += orders.length;
      hasMore = orders.length === pageLimit || offset < total;
      progress.stage = 'ORDERS_CHECKPOINT_WRITE';
    const { error: checkpointSaveError } = await admin.from('marketplace_sync_checkpoints').upsert({
        organization_id: account.organization_id, marketplace_account_id: account.id,
        resource_type: 'ORDERS', data_environment: dataEnvironment,
        cursor_state: hasMore ? { since, offset, filterField } : {},
        watermark_at: hasMore ? (checkpoint?.watermark_at || null) : new Date().toISOString(),
        last_attempt_at: new Date().toISOString(), last_successful_at: hasMore ? (checkpoint?.last_successful_at || null) : new Date().toISOString(),
        consecutive_failures: 0, last_error_code: null, updated_at: new Date().toISOString(),
      }, { onConflict: 'marketplace_account_id,resource_type' });
      if (checkpointSaveError) throw new Error(checkpointSaveError.message || 'The eBay order sync checkpoint could not be saved.');
      if (!orders.length || !hasMore || pages >= 1) break;
    } while (true);
    progress.stage = 'ORDERS_FINALIZE';
    const finished = new Date().toISOString();
    const status = exceptions || hasMore ? 'PARTIAL' : 'SUCCESS';
    const runStatus = status === 'SUCCESS' ? 'COMPLETED' : 'PARTIAL';
    await admin.from('marketplace_sync_runs').update({ completed_at: finished, status: runStatus, orders_fetched: fetched, orders_imported: imported, orders_skipped_duplicate: skipped, exceptions_raised: exceptions, log_message: `Fetched ${fetched}; imported ${imported}; duplicates ${skipped}; SKU exceptions ${exceptions}; more pages pending: ${hasMore}.`, attempt_count: 1, retryable: false, data_environment: dataEnvironment }).eq('id', run.id);
    const accountSyncUpdate: Record<string, unknown> = {
      last_sync_status: status,
      last_sync_message: `Fetched ${fetched}; imported ${imported}; duplicates ${skipped}; order-data exceptions ${exceptions}.`,
    };
    if (!hasMore) accountSyncUpdate.last_sync_at = finished;
    await admin.from('marketplace_accounts').update(accountSyncUpdate).eq('id', account.id);
    return { imported, skipped, exceptions, fetched, status, pagesPending: hasMore };
  } catch (error) {
    const failure = getEbaySyncFailure(error, 'EBAY_ORDER_SYNC_FAILED');
    const partial = fetched > 0 || imported > 0 || skipped > 0;
    await admin.from('marketplace_sync_runs').update({
      completed_at: new Date().toISOString(), status: partial ? 'PARTIAL' : 'FAILED',
      orders_fetched: fetched, orders_imported: imported, orders_skipped_duplicate: skipped, exceptions_raised: exceptions,
      last_error_code: failure.code, last_error_message: `${progress.stage}: ${failure.message}`,
      retryable: isRetryableEbaySyncFailure(failure), attempt_count: 1,
      log_message: `Orders sync stopped at ${progress.stage}. Fetched ${fetched}; imported ${imported}; duplicates ${skipped}; order exceptions ${exceptions}.`,
    }).eq('id', run.id);
    await admin.from('marketplace_accounts').update({
      last_sync_status: partial ? 'PARTIAL' : 'FAILED', last_sync_message: `Orders ${partial ? 'partially completed' : 'failed'} at ${progress.stage}: ${failure.message}`,
    }).eq('id', account.id);
    await admin.from('marketplace_integration_events').insert({
      organization_id: account.organization_id, marketplace_account_id: account.id,
      event_type: 'ORDER_SYNC_FAILED', severity: 'ERROR', error_code: failure.code, message: failure.message,
      metadata: { stage: progress.stage, httpStatus: failure.httpStatus, providerCode: failure.providerCode,
        environment: account.environment, endpoint: progress.stage === 'EBAY_ORDERS_API' ? 'sell/fulfillment/v1/order' : null,
        fetched, imported, skipped, exceptions },
    });
    throw error;
  }
}


async function syncSellerInventory(account: any, env: WorkerEnv, progress: EbaySyncProgress = createEbaySyncProgress()): Promise<{ fetched: number; offersFetched: number; pagesPending: boolean; failedSkus: string[] }> {
  const admin = createServiceClient(env);
  progress.stage = 'INVENTORY_TOKEN';
  const accessToken = await getSellerAccessToken(env, account);
  const dataEnvironment = account.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
  const marketplaceId = account.marketplace === 'EBAY_UK' ? 'EBAY_GB'
    : account.marketplace === 'EBAY_DE' ? 'EBAY_DE' : 'EBAY_US';
  progress.stage = 'INVENTORY_CHECKPOINT_READ';
  const { data: checkpoint, error: checkpointError } = await admin.from('marketplace_sync_checkpoints')
    .select('cursor_state,last_successful_at').eq('marketplace_account_id', account.id).eq('resource_type', 'INVENTORY').maybeSingle();
  if (checkpointError) throw new Error(checkpointError.message || 'The eBay inventory checkpoint could not be loaded.');
  const savedCursor = checkpoint?.cursor_state && typeof checkpoint.cursor_state === 'object'
    ? checkpoint.cursor_state as Record<string, unknown> : {};
  let offset = Number.isSafeInteger(Number(savedCursor.offset)) && Number(savedCursor.offset) >= 0 ? Number(savedCursor.offset) : 0;
  let pages = 0, fetched = 0, offersFetched = 0, hasMore = false;
  const failedSkus = new Set<string>();
  do {
    progress.stage = 'EBAY_INVENTORY_API';
    const endpoint = new URL(`${ebayBaseUrl(account.environment)}/sell/inventory/v1/inventory_item`);
    endpoint.searchParams.set('limit', '10');
    endpoint.searchParams.set('offset', String(offset));
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    if (!response.ok) throw await readEbayOrdersApiError(response);
    const page = await response.json() as { inventoryItems?: any[]; total?: number };
    const items = Array.isArray(page.inventoryItems) ? page.inventoryItems : [];
    const total = Number(page.total ?? (offset + items.length));
    if (items.length === 0 && offset < total) {
      throw new EbayOrdersApiError(503, 'EBAY_INVENTORY_EMPTY_PAGE', 'eBay returned an empty inventory page before the reported total was reached.');
    }
    fetched += items.length; progress.fetched = fetched;
    pages++;

    // Inventory items contain product details and base stock. Offers contain the
    // actual marketplace listing state, listing ID, price and offer-level quantity.
    // Fetch offers in small concurrent batches to respect eBay API limits.
    const offerResults: Array<{ sku: string; offers: any[]; error?: string; httpStatus?: number | null; providerCode?: string | null }> = [];
    const skus = items.map((item: any) => String(item.sku || '').trim()).filter((sku: string) => sku && sku.length <= 50);
    progress.stage = 'EBAY_OFFERS_API';
    for (let index = 0; index < skus.length; index += 5) {
      const batch = skus.slice(index, index + 5);
      const batchResults = await Promise.all(batch.map(async (sku) => {
        try {
          const offersUrl = new URL(`${ebayBaseUrl(account.environment)}/sell/inventory/v1/offer`);
          offersUrl.searchParams.set('sku', sku);
          offersUrl.searchParams.set('marketplace_id', marketplaceId);
          offersUrl.searchParams.set('limit', '100');
          offersUrl.searchParams.set('offset', '0');
          const offersResponse = await fetch(offersUrl, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
          if (offersResponse.status === 404) return { sku, offers: [] as any[] };
          if (!offersResponse.ok) throw await readEbayOrdersApiError(offersResponse);
          const offersPayload = await offersResponse.json() as { offers?: any[] };
          return { sku, offers: Array.isArray(offersPayload.offers) ? offersPayload.offers : [] };
        } catch (error) {
          const failure = getEbaySyncFailure(error, 'EBAY_OFFERS_API_FAILED');
          return { sku, offers: [] as any[], error: failure.message, httpStatus: failure.httpStatus, providerCode: failure.providerCode };
        }
      }));
      offerResults.push(...batchResults);
    }
    const offersBySku = new Map(offerResults.map((entry) => [entry.sku, entry.offers]));
    const failedOffers = offerResults.filter((entry) => Boolean(entry.error));
    for (const entry of failedOffers) failedSkus.add(entry.sku);
    offersFetched += offerResults.reduce((sum, entry) => sum + entry.offers.length, 0); progress.offersFetched = offersFetched;
    const syncedAt = new Date().toISOString();
    const rows = items.filter((item: any) => String(item.sku || '').trim()).map((item: any) => {
      const sku = String(item.sku || '').trim().slice(0, 128);
      const quantityValue = item.availability?.shipToLocationAvailability?.quantity;
      const offers = offersBySku.get(sku) || [];
      const listingStatuses = offers.map((offer: any) => String(offer.listingStatus || '').trim()).filter(Boolean);
      return {
        organization_id: account.organization_id,
        marketplace_account_id: account.id,
        data_environment: dataEnvironment,
        external_sku: sku,
        inventory_item: item,
        offers,
        total_ship_to_location_quantity: typeof quantityValue === 'number' && Number.isFinite(quantityValue) && quantityValue >= 0 ? Math.trunc(quantityValue) : null,
        listing_status: failedOffers.some((entry) => entry.sku === sku) ? 'UNKNOWN' : (listingStatuses.includes('PUBLISHED') ? 'PUBLISHED' : (listingStatuses[0] || 'NOT_LISTED')),
        source_updated_at: item.product?.aspects?.updatedAt || null,
        synced_at: syncedAt,
        updated_at: syncedAt,
      };
    });
    if (failedOffers.length) {
      const { error: eventError } = await admin.from('marketplace_integration_events').insert(failedOffers.map((entry) => ({
        organization_id: account.organization_id,
        marketplace_account_id: account.id,
        event_type: 'INVENTORY_SKU_SYNC_FAILED',
        severity: 'WARNING',
        error_code: 'EBAY_OFFERS_API_FAILED',
        message: entry.error || `Offer details could not be synchronized for SKU ${entry.sku}.`,
        metadata: { sku: entry.sku, stage: 'EBAY_OFFERS_API', endpoint: 'sell/inventory/v1/offer', environment: account.environment, httpStatus: entry.httpStatus ?? null, providerCode: entry.providerCode ?? null },
      })));
      if (eventError) throw new Error('Some listing offer failures could not be recorded for review.');
    }
    progress.stage = 'INVENTORY_SNAPSHOT_WRITE';
    if (rows.length) {
      const { error: saveError } = await admin.from('marketplace_listing_snapshots').upsert(rows, { onConflict: 'marketplace_account_id,external_sku' });
      if (saveError) throw new Error(saveError.message || 'eBay inventory and listing snapshots could not be saved.');
    }
    offset += items.length;
    hasMore = items.length === 10 || offset < total;
    progress.stage = 'INVENTORY_CHECKPOINT_WRITE';
    const { error: checkpointSaveError } = await admin.from('marketplace_sync_checkpoints').upsert({
      organization_id: account.organization_id,
      marketplace_account_id: account.id,
      resource_type: 'INVENTORY',
      data_environment: dataEnvironment,
      cursor_state: hasMore ? { offset } : {},
      last_attempt_at: new Date().toISOString(),
      last_successful_at: hasMore ? (checkpoint?.last_successful_at || null) : new Date().toISOString(),
      watermark_at: hasMore ? null : new Date().toISOString(),
      consecutive_failures: 0,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'marketplace_account_id,resource_type' });
    if (checkpointSaveError) throw new Error(checkpointSaveError.message || 'The eBay inventory checkpoint could not be saved.');
    if (!items.length || !hasMore || pages >= 1) break;
  } while (true);
  progress.stage = 'INVENTORY_COMPLETED';
  return { fetched, offersFetched, pagesPending: hasMore, failedSkus: [...failedSkus] };
}

async function fetchEbayAccountJson(accessToken: string, path: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`https://api.ebay.com${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw await readEbayOrdersApiError(response);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('eBay returned an invalid seller account response.');
    }
    return payload as Record<string, unknown>;
  } finally {
    clearTimeout(timeout);
  }
}

async function syncSellerAccountSettings(account: any, env: WorkerEnv): Promise<{ batchId: string; synced: string[]; failed: Array<{ resource: string; message: string }> }> {
  if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
    throw new EbayOrdersApiError(403, null, 'Only connected Production eBay seller accounts can be synchronized.');
  }
  const accessToken = await getSellerAccessToken(env, account);
  const marketplaceId = account.marketplace === 'EBAY_UK' ? 'EBAY_GB'
    : account.marketplace === 'EBAY_DE' ? 'EBAY_DE' : 'EBAY_US';
  const batchId = crypto.randomUUID();
  const admin = createServiceClient(env);
  const resources = [
    { type: 'SELLER_PRIVILEGE', path: '/sell/account/v1/privilege' },
    { type: 'SELLER_SUBSCRIPTION', path: '/sell/account/v1/subscription' },
    { type: 'SELLER_PAYMENT_POLICY', path: `/sell/account/v1/payment_policy?marketplace_id=${marketplaceId}` },
    { type: 'SELLER_FULFILLMENT_POLICY', path: `/sell/account/v1/fulfillment_policy?marketplace_id=${marketplaceId}` },
    { type: 'SELLER_RETURN_POLICY', path: `/sell/account/v1/return_policy?marketplace_id=${marketplaceId}` },
  ];
  const synced: string[] = [];
  const failed: Array<{ resource: string; message: string }> = [];
  for (const resource of resources) {
    try {
      const payload = await fetchEbayAccountJson(accessToken, resource.path);
      await saveEbayProviderSnapshot(
        admin, account, resource.type, 'CURRENT', batchId,
        normalizeEbaySellerAccountResource(resource.type, payload, marketplaceId),
        payload,
      );
      synced.push(resource.type);
    } catch (error) {
      const failure = getEbaySyncFailure(error, 'EBAY_ACCOUNT_API_FAILED');
      failed.push({ resource: resource.type, message: failure.message });
      await admin.from('marketplace_integration_events').insert({
        organization_id: account.organization_id,
        marketplace_account_id: account.id,
        event_type: 'SELLER_ACCOUNT_SYNC_FAILED',
        severity: 'ERROR',
        error_code: failure.code,
        message: failure.message,
        metadata: { resource: resource.type, endpoint: resource.path.split('?')[0], httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: 'PRODUCTION' },
      });
    }
  }
  await admin.from('marketplace_integration_events').insert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    event_type: 'SELLER_ACCOUNT_SYNC_COMPLETED',
    severity: failed.length ? 'WARNING' : 'INFO',
    message: `Seller account sync stored ${synced.length} of ${resources.length} read-only resources.`,
    metadata: { syncBatchId: batchId, syncedResources: synced, failedResources: failed.map(item => item.resource), environment: 'PRODUCTION' },
  });
  return { batchId, synced, failed };
}

async function syncTradingActiveListings(account: any, env: WorkerEnv): Promise<{ batchId: string; fetched: number; totalEntries: number; pagesFetched: number; pagesPending: boolean }> {
  if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
    throw new EbayOrdersApiError(403, null, 'Only connected Production eBay seller accounts can be synchronized.');
  }
  const accessToken = await getSellerAccessToken(env, account);
  const siteId = ebayTradingSiteId(account.marketplace);
  const admin = createServiceClient(env);
  const { data: checkpoint, error: checkpointError } = await admin.from('marketplace_sync_checkpoints')
    .select('cursor_state,last_successful_at,consecutive_failures')
    .eq('marketplace_account_id', account.id)
    .eq('organization_id', account.organization_id)
    .eq('resource_type', 'ACTIVE_LISTINGS_TRADING')
    .maybeSingle();
  if (checkpointError) throw new Error('The active listing sync checkpoint could not be loaded.');

  const saved = checkpoint?.cursor_state && typeof checkpoint.cursor_state === 'object'
    ? checkpoint.cursor_state as Record<string, unknown> : {};
  const savedActiveBatch = typeof saved.activeBatchId === 'string' ? saved.activeBatchId : '';
  const savedNextPage = Number(saved.nextPageNumber);
  const lastCompletedBatchId = typeof saved.lastCompletedBatchId === 'string' ? saved.lastCompletedBatchId : '';
  const resuming = Boolean(savedActiveBatch && Number.isSafeInteger(savedNextPage) && savedNextPage >= 1);
  const batchId = resuming ? savedActiveBatch : crypto.randomUUID();
  let pageNumber = resuming ? savedNextPage : 1;
  let totalPages = pageNumber;
  let totalEntries = 0;
  let fetched = 0;
  let pagesFetched = 0;
  let partial = false;
  const maxPagesPerRun = 10;
  let consecutiveFailures = Number(checkpoint?.consecutive_failures || 0);

  const saveCheckpoint = async (cursorState: Record<string, unknown>, completed: boolean, consecutiveFailures: number) => {
    const { error } = await admin.from('marketplace_sync_checkpoints').upsert({
      organization_id: account.organization_id,
      marketplace_account_id: account.id,
      resource_type: 'ACTIVE_LISTINGS_TRADING',
      data_environment: 'PRODUCTION',
      cursor_state: cursorState,
      last_attempt_at: new Date().toISOString(),
      last_successful_at: completed ? new Date().toISOString() : (checkpoint?.last_successful_at || null),
      consecutive_failures: consecutiveFailures,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'marketplace_account_id,resource_type' });
    if (error) throw new Error('The active listing sync checkpoint could not be saved.');
  };

  await saveCheckpoint({
    activeBatchId: batchId,
    nextPageNumber: pageNumber,
    ...(lastCompletedBatchId ? { lastCompletedBatchId } : {}),
  }, false, Number(checkpoint?.consecutive_failures || 0));

  while (pagesFetched < maxPagesPerRun && pageNumber <= totalPages) {
    const body = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
    const response = await fetch('https://api.ebay.com/ws/api.dll', {
      method: 'POST',
      headers: {
        'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
        'X-EBAY-API-SITEID': siteId,
        'X-EBAY-API-COMPATIBILITY-LEVEL': '1477',
        'X-EBAY-API-IAF-TOKEN': accessToken,
        'Content-Type': 'text/xml',
        Accept: 'text/xml',
      },
      body,
    });
    if (!response.ok) throw new EbayOrdersApiError(response.status, null, 'eBay Trading API active listings request failed.');
    const xml = await response.text();
    const parsed = parseTradingActiveListings(xml);
    if (parsed.ack === 'Failure' || parsed.ack === 'Error') {
      throw new Error('eBay Trading API rejected the active listings request.');
    }
    if (parsed.ack === 'PartialFailure') partial = true;
    totalEntries = parsed.totalEntries || totalEntries;
    totalPages = parsed.totalPages || Math.max(1, Math.ceil(totalEntries / 200));
    pagesFetched++;

    for (const listing of parsed.listings) {
      const itemId = typeof listing.itemId === 'string' ? listing.itemId : '';
      if (!itemId) continue;
      const { rawXml, ...listingFields } = listing;
      await saveEbayProviderSnapshot(
        admin, account, 'ACTIVE_LISTING_TRADING', itemId, batchId,
        { ...listingFields, source: 'EBAY_TRADING_API', siteId },
        { xml: typeof rawXml === 'string' ? rawXml : null },
        null,
      );
      fetched++;
    }

    // Re-read a partial-failure page on the next run; item upserts are idempotent.
    const nextPageNumber = partial ? pageNumber : pageNumber + 1;
    const pagesPending = partial || nextPageNumber <= totalPages;
    const cursorState = pagesPending
      ? { activeBatchId: batchId, nextPageNumber, ...(lastCompletedBatchId ? { lastCompletedBatchId } : {}) }
      : { lastCompletedBatchId: batchId };
    consecutiveFailures = partial ? consecutiveFailures + 1 : 0;
    await saveCheckpoint(cursorState, !pagesPending, consecutiveFailures);
    if (partial) break;
    pageNumber = nextPageNumber;
  }

  const pagesPending = partial || pageNumber <= totalPages;
  await admin.from('marketplace_integration_events').insert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    event_type: 'ACTIVE_LISTINGS_SYNC_COMPLETED',
    severity: pagesPending ? 'WARNING' : 'INFO',
    message: `Trading API active listings sync stored ${fetched} listings from ${pagesFetched} page(s).`,
    metadata: { syncBatchId: batchId, fetched, totalEntries, pagesFetched, totalPages, pagesPending, nextPageNumber: pagesPending ? pageNumber : null, endpoint: 'Trading:GetMyeBaySelling', environment: 'PRODUCTION' },
  });
  return { batchId, fetched, totalEntries, pagesFetched, pagesPending };
}

async function assertEbaySellerScope(account: any, scope: string, env: WorkerEnv): Promise<void> {
  const admin = createServiceClient(env);
  const { data, error } = await admin.from('marketplace_credentials')
    .select('scopes').eq('marketplace_account_id', account.id).eq('organization_id', account.organization_id).maybeSingle();
  if (error) throw new Error('The seller authorization scopes could not be verified.');
  const scopes = Array.isArray(data?.scopes) ? data.scopes : [];
  if (!scopes.includes(scope)) {
    throw new EbayOrdersApiError(403, null, 'Reconnect this Production seller account to grant the additional read-only eBay permission required for this module.');
  }
}

async function syncSellerReturns(account: any, env: WorkerEnv): Promise<{ batchId: string; fetched: number; totalEntries: number; pagesFetched: number; pagesPending: boolean }> {
  if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
    throw new EbayOrdersApiError(403, null, 'Only connected Production eBay seller accounts can be synchronized.');
  }
  const accessToken = await getSellerAccessToken(env, account);
  const admin = createServiceClient(env);
  const { data: checkpoint, error: checkpointError } = await admin.from('marketplace_sync_checkpoints')
    .select('cursor_state,last_successful_at,consecutive_failures')
    .eq('marketplace_account_id', account.id).eq('organization_id', account.organization_id)
    .eq('resource_type', 'RETURNS').maybeSingle();
  if (checkpointError) throw new Error('The eBay returns sync checkpoint could not be loaded.');

  const saved = checkpoint?.cursor_state && typeof checkpoint.cursor_state === 'object'
    ? checkpoint.cursor_state as Record<string, unknown> : {};
  const savedBatchId = typeof saved.activeBatchId === 'string' ? saved.activeBatchId : '';
  const savedOffset = Number(saved.nextOffset);
  const resuming = Boolean(savedBatchId && Number.isSafeInteger(savedOffset) && savedOffset >= 0);
  const batchId = resuming ? savedBatchId : crypto.randomUUID();
  const endDate = resuming && typeof saved.endDate === 'string' && Number.isFinite(Date.parse(saved.endDate))
    ? new Date(saved.endDate) : new Date();
  const startDate = resuming && typeof saved.startDate === 'string' && Number.isFinite(Date.parse(saved.startDate))
    ? new Date(saved.startDate) : subtractUtcMonthsClamped(endDate, 18);
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const limit = 200;
  const maxPages = 20;
  let offset = resuming ? savedOffset : 0;
  let totalEntries = 0;
  let totalPages = 1;
  let pagesFetched = 0;
  let fetched = 0;
  let noContent = false;
  let noMoreData = false;
  let hasMorePages = true;
  const lastCompletedBatchId = typeof saved.lastCompletedBatchId === 'string' ? saved.lastCompletedBatchId : '';

  const saveCheckpoint = async (pagesPending: boolean) => {
    const cursorState = pagesPending
      ? { activeBatchId: batchId, nextOffset: offset, startDate: startIso, endDate: endIso,
          ...(lastCompletedBatchId ? { lastCompletedBatchId } : {}) }
      : { lastCompletedBatchId: batchId };
    const { error } = await admin.from('marketplace_sync_checkpoints').upsert({
      organization_id: account.organization_id,
      marketplace_account_id: account.id,
      resource_type: 'RETURNS',
      data_environment: 'PRODUCTION',
      cursor_state: cursorState,
      last_attempt_at: new Date().toISOString(),
      last_successful_at: pagesPending ? (checkpoint?.last_successful_at || null) : new Date().toISOString(),
      consecutive_failures: pagesPending ? Number(checkpoint?.consecutive_failures || 0) : 0,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'marketplace_account_id,resource_type' });
    if (error) throw new Error('The eBay returns sync checkpoint could not be saved.');
  };

  await saveCheckpoint(true);
  while (pagesFetched < maxPages && pagesFetched < totalPages) {
    const endpoint = new URL('https://api.ebay.com/post-order/v2/return/search');
    endpoint.searchParams.set('creation_date_range_from', startIso);
    endpoint.searchParams.set('creation_date_range_to', endIso);
    endpoint.searchParams.set('role', 'BUYER');
    endpoint.searchParams.set('limit', String(limit));
    endpoint.searchParams.set('offset', String(offset));
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { ...buildEbayPostOrderHeaders(accessToken, account.marketplace) },
    });
    if (response.status === 204) {
      noContent = true;
      break;
    }
    if (!response.ok) throw await readEbayOrdersApiError(response);
    const payload = await response.json() as Record<string, any>;
    const members = Array.isArray(payload.members) ? payload.members : [];
    const pagination = payload.paginationOutput && typeof payload.paginationOutput === 'object' ? payload.paginationOutput : {};
    totalEntries = Number.isFinite(Number(pagination.totalEntries)) ? Number(pagination.totalEntries) : totalEntries;
    totalPages = Number.isFinite(Number(pagination.totalPages)) && Number(pagination.totalPages) > 0
      ? Number(pagination.totalPages) : Math.max(1, Math.ceil(totalEntries / limit));
    pagesFetched++;

    for (const member of members) {
      const returnId = typeof member.returnId === 'string' ? member.returnId.trim() : '';
      if (!returnId) continue;
      const creation = member.creationInfo && typeof member.creationInfo === 'object' ? member.creationInfo : {};
      const item = creation.item && typeof creation.item === 'object' ? creation.item : {};
      const sellerRefund = member.sellerTotalRefund && typeof member.sellerTotalRefund === 'object' ? member.sellerTotalRefund : {};
      const actionTypes = Array.isArray(member.sellerAvailableOptions)
        ? member.sellerAvailableOptions.map((option: any) => option?.actionType).filter((value: unknown) => typeof value === 'string')
        : [];
      const normalized = {
        returnId,
        orderId: typeof member.orderId === 'string' ? member.orderId : null,
        status: typeof member.status === 'string' ? member.status : null,
        state: typeof member.state === 'string' ? member.state : null,
        currentType: typeof member.currentType === 'string' ? member.currentType : null,
        creationDate: typeof creation.creationDate?.value === 'string' ? creation.creationDate.value : null,
        itemId: typeof item.itemId === 'string' ? item.itemId : null,
        transactionId: typeof item.transactionId === 'string' ? item.transactionId : null,
        quantity: (typeof item.returnQuantity === 'number' && Number.isSafeInteger(item.returnQuantity))
          ? item.returnQuantity
          : (typeof item.returnQuantity === 'string' && item.returnQuantity.trim() !== '' && Number.isSafeInteger(Number(item.returnQuantity)) ? Number(item.returnQuantity) : null),
        reason: typeof creation.reason === 'string' ? creation.reason : null,
        reasonType: typeof creation.reasonType === 'string' ? creation.reasonType : null,
        sellerResponseDue: typeof member.sellerResponseDue?.respondByDate?.value === 'string' ? member.sellerResponseDue.respondByDate.value : null,
        sellerActionTypes: actionTypes,
        estimatedRefund: sellerRefund.estimatedRefundAmount && typeof sellerRefund.estimatedRefundAmount === 'object' ? sellerRefund.estimatedRefundAmount : null,
        actualRefund: sellerRefund.actualRefundAmount && typeof sellerRefund.actualRefundAmount === 'object' ? sellerRefund.actualRefundAmount : null,
        timeoutDate: typeof member.timeoutDate?.value === 'string' ? member.timeoutDate.value : null,
        caseId: typeof member.escalationInfo?.caseId === 'string' ? member.escalationInfo.caseId : null,
        source: 'EBAY_POST_ORDER_API',
      };
      await saveEbayProviderSnapshot(admin, account, 'EBAY_RETURN', returnId, batchId, normalized, member);
      fetched++;
    }

    offset += members.length;
    hasMorePages = totalEntries > 0 ? offset < totalEntries : (pagesFetched < totalPages || members.length === limit);
    if (!members.length || !hasMorePages) {
      noMoreData = true;
      break;
    }
    await saveCheckpoint(true);
  }

  const pagesPending = !noContent && !noMoreData && hasMorePages;
  await saveCheckpoint(pagesPending);
  await admin.from('marketplace_integration_events').insert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    event_type: 'EBAY_RETURNS_SYNC_COMPLETED',
    severity: pagesPending ? 'WARNING' : 'INFO',
    message: `eBay return sync stored ${fetched} return records from ${pagesFetched} page(s).`,
    metadata: { syncBatchId: batchId, fetched, totalEntries, pagesFetched, totalPages, pagesPending, endpoint: 'post-order/v2/return/search', environment: 'PRODUCTION' },
  });
  return { batchId, fetched, totalEntries, pagesFetched, pagesPending };
}

async function syncSellerAnalytics(account: any, env: WorkerEnv): Promise<{ batchId: string; synced: string[]; failed: Array<{ resource: string; message: string }> }> {
  if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
    throw new EbayOrdersApiError(403, null, 'Only connected Production eBay seller accounts can be synchronized.');
  }
  await assertEbaySellerScope(account, 'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly', env);
  const accessToken = await getSellerAccessToken(env, account);
  const admin = createServiceClient(env);
  const batchId = crypto.randomUUID();
  const marketplaceId = ebayAnalyticsMarketplaceId(account.marketplace);
  const standardsProgram = ebaySellerStandardsProgram(account.marketplace);
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const analyticsDateRange = `[${start.toISOString().replace('Z', '+00:00')}..${end.toISOString().replace('Z', '+00:00')}]`;
  const resources = [
    {
      type: 'ANALYTICS_TRAFFIC',
      externalId: 'LAST_30_DAYS',
      path: `/sell/analytics/v1/traffic_report?dimension=DAY&filter=${encodeURIComponent(`marketplace_ids:{${marketplaceId}},date_range:${analyticsDateRange}`)}&metric=LISTING_IMPRESSION_SEARCH_RESULTS_PAGE,LISTING_IMPRESSION_STORE,TOTAL_IMPRESSION_TOTAL,LISTING_VIEWS_TOTAL,CLICK_THROUGH_RATE,SALES_CONVERSION_RATE,TRANSACTION`,
    },
    { type: 'ANALYTICS_SELLER_STANDARDS', externalId: 'PROGRAM_CURRENT', path: `/sell/analytics/v1/seller_standards_profile/${standardsProgram}/CURRENT` },
    { type: 'ANALYTICS_CUSTOMER_SERVICE', externalId: 'ITEM_NOT_AS_DESCRIBED_CURRENT', path: `/sell/analytics/v1/customer_service_metric/ITEM_NOT_AS_DESCRIBED/CURRENT?evaluation_marketplace_id=${marketplaceId}` },
    { type: 'ANALYTICS_CUSTOMER_SERVICE', externalId: 'ITEM_NOT_RECEIVED_CURRENT', path: `/sell/analytics/v1/customer_service_metric/ITEM_NOT_RECEIVED/CURRENT?evaluation_marketplace_id=${marketplaceId}` },
  ];
  const synced: string[] = [];
  const failed: Array<{ resource: string; message: string }> = [];
  for (const resource of resources) {
    try {
      const payload = await fetchEbayAccountJson(accessToken, resource.path);
      await saveEbayProviderSnapshot(
        admin, account, resource.type, resource.externalId, batchId,
        normalizeEbayAnalyticsResource(resource.type, payload, marketplaceId), payload,
      );
      synced.push(resource.externalId);
    } catch (error) {
      const failure = getEbaySyncFailure(error, 'EBAY_ANALYTICS_API_FAILED');
      failed.push({ resource: resource.externalId, message: failure.message });
      await admin.from('marketplace_integration_events').insert({
        organization_id: account.organization_id,
        marketplace_account_id: account.id,
        event_type: 'EBAY_ANALYTICS_SYNC_FAILED',
        severity: 'ERROR',
        error_code: failure.code,
        message: failure.message,
        metadata: { resource: resource.externalId, endpoint: resource.path.split('?')[0], httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: 'PRODUCTION' },
      });
    }
  }
  await admin.from('marketplace_integration_events').insert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    event_type: 'EBAY_ANALYTICS_SYNC_COMPLETED',
    severity: failed.length ? 'WARNING' : 'INFO',
    message: `eBay Analytics sync stored ${synced.length} of ${resources.length} resources.`,
    metadata: { syncBatchId: batchId, syncedResources: synced, failedResources: failed.map(item => item.resource), environment: 'PRODUCTION' },
  });
  return { batchId, synced, failed };
}

async function fetchEbayFinanceJson(accessToken: string, path: string, marketplaceId: string, env: WorkerEnv): Promise<Record<string, any>> {
  const url = new URL(path, 'https://apiz.ebay.com').toString();
  const signatureHeaders = await createEbayFinanceSignatureHeaders('GET', url, env);
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-EBAY-C-MARKETPLACE-ID': marketplaceId,
      Accept: 'application/json',
      ...signatureHeaders,
    },
  });
  if (response.status === 204) return {};
  if (!response.ok) throw await readEbayOrdersApiError(response);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('eBay returned an invalid Finances API response.');
  }
  return payload as Record<string, any>;
}

async function syncSellerFinances(account: any, env: WorkerEnv): Promise<{
  batchId: string;
  payouts: number;
  transactions: number;
  synced: string[];
  failed: Array<{ resource: string; message: string }>;
  pagesPending: boolean;
}> {
  if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
    throw new EbayOrdersApiError(403, null, 'Only connected Production eBay seller accounts can be synchronized.');
  }
  await assertEbaySellerScope(account, 'https://api.ebay.com/oauth/api_scope/sell.finances', env);
  const accessToken = await getSellerAccessToken(env, account);
  const admin = createServiceClient(env);
  const batchId = crypto.randomUUID();
  const marketplaceId = account.marketplace === 'EBAY_UK' ? 'EBAY_GB'
    : account.marketplace === 'EBAY_DE' ? 'EBAY_DE' : 'EBAY_US';
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 90);
  const dateRange = `[${start.toISOString()}..${end.toISOString()}]`;
  const resources: Array<{ type: string; key: string; path: string }> = [
    { type: 'FINANCE_SUMMARY', key: 'SELLER_FUNDS_CURRENT', path: '/sell/finances/v1/seller_funds_summary' },
    { type: 'FINANCE_SUMMARY', key: 'PAYOUT_SUMMARY_CURRENT', path: '/sell/finances/v1/payout_summary' },
    ...['PAYOUT', 'FUNDS_PROCESSING', 'FUNDS_AVAILABLE_FOR_PAYOUT', 'FUNDS_ON_HOLD', 'COMPLETED', 'FAILED'].map(status => {
      const transactionType = status === 'COMPLETED' || status === 'FAILED' ? 'TRANSFER' : 'SALE';
      return {
        type: 'FINANCE_SUMMARY',
        key: `TRANSACTION_SUMMARY_${status}_90_DAYS`,
        path: `/sell/finances/v1/transaction_summary?filter=${encodeURIComponent(`transactionStatus:{${status}}`)}&filter=${encodeURIComponent(`transactionType:{${transactionType}}`)}&filter=${encodeURIComponent(`transactionDate:${dateRange}`)}`,
      };
    }),
  ];
  const synced: string[] = [];
  const failed: Array<{ resource: string; message: string }> = [];
  let payoutCount = 0;
  let transactionCount = 0;

  for (const resource of resources) {
    try {
      const payload = await fetchEbayFinanceJson(accessToken, resource.path, marketplaceId, env);
      await saveEbayProviderSnapshot(admin, account, resource.type, resource.key, batchId,
        normalizeEbayFinanceSummary(resource.key, payload, marketplaceId), payload);
      synced.push(resource.key);
    } catch (error) {
      const failure = getEbaySyncFailure(error, 'EBAY_FINANCES_API_FAILED');
      failed.push({ resource: resource.key, message: failure.message });
      await admin.from('marketplace_integration_events').insert({
        organization_id: account.organization_id,
        marketplace_account_id: account.id,
        event_type: 'EBAY_FINANCES_SYNC_FAILED',
        severity: 'ERROR',
        error_code: failure.code,
        message: failure.message,
        metadata: { resource: resource.key, endpoint: resource.path.split('?')[0], httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: 'PRODUCTION' },
      });
    }
  }

  const limit = 100;
  const maxPages = 20;
  let payoutPagesPending = false;
  let transactionPagesPending = false;

  const importPagedRecords = async (
    basePath: string,
    collectionKey: 'payouts' | 'transactions',
    resourceType: 'FINANCE_PAYOUT' | 'FINANCE_TRANSACTION',
  ): Promise<{ count: number; pagesPending: boolean }> => {
    let offset = 0;
    let totalEntries = 0;
    let pages = 0;
    let count = 0;
    let more = true;
    while (more && pages < maxPages) {
      const separator = basePath.includes('?') ? '&' : '?';
      const path = `${basePath}${separator}limit=${limit}&offset=${offset}`;
      const payload = await fetchEbayFinanceJson(accessToken, path, marketplaceId, env);
      const rows = Array.isArray(payload[collectionKey]) ? payload[collectionKey] : [];
      const paginationTotal = payload.total ?? payload.totalEntries ?? payload.paginationOutput?.totalEntries;
      if (Number.isFinite(Number(paginationTotal)) && Number(paginationTotal) >= 0) totalEntries = Number(paginationTotal);
      pages++;
      for (const record of rows) {
        const externalId = resourceType === 'FINANCE_PAYOUT'
          ? (typeof record.payoutId === 'string' ? record.payoutId : '')
          : (typeof record.transactionId === 'string' ? record.transactionId : '');
        if (!externalId) continue;
        const normalized = resourceType === 'FINANCE_PAYOUT'
          ? {
              payoutId: externalId,
              payoutStatus: record.payoutStatus ?? null,
              payoutDate: record.payoutDate ?? null,
              amount: record.amount ?? null,
              transactionCount: record.transactionCount ?? null,
              source: 'EBAY_FINANCES_API',
            }
          : {
              transactionId: externalId,
              transactionType: record.transactionType ?? null,
              transactionDate: record.transactionDate ?? null,
              amount: record.amount ?? null,
              totalFeeAmount: record.totalFeeAmount ?? null,
              orderId: record.orderId ?? null,
              payoutId: record.payoutId ?? null,
              references: Array.isArray(record.references)
                ? record.references.map((reference: any) => ({ referenceType: reference?.referenceType ?? null, referenceId: reference?.referenceId ?? null }))
                : [],
              source: 'EBAY_FINANCES_API',
            };
        await saveEbayProviderSnapshot(admin, account, resourceType, externalId, batchId, normalized, record);
        count++;
      }
      offset += rows.length;
      more = rows.length === limit && (totalEntries === 0 || offset < totalEntries);
      if (!rows.length) more = false;
    }
    return { count, pagesPending: more || (totalEntries > offset) };
  };

  try {
    const result = await importPagedRecords('/sell/finances/v1/payout', 'payouts', 'FINANCE_PAYOUT');
    payoutCount = result.count;
    payoutPagesPending = result.pagesPending;
    synced.push('PAYOUTS');
  } catch (error) {
    const failure = getEbaySyncFailure(error, 'EBAY_PAYOUTS_SYNC_FAILED');
    failed.push({ resource: 'PAYOUTS', message: failure.message });
    await admin.from('marketplace_integration_events').insert({
      organization_id: account.organization_id, marketplace_account_id: account.id,
      event_type: 'EBAY_FINANCES_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
      message: failure.message, metadata: { resource: 'PAYOUTS', endpoint: '/sell/finances/v1/payout', httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: 'PRODUCTION' },
    });
  }

  try {
    const result = await importPagedRecords(
      `/sell/finances/v1/transaction?filter=${encodeURIComponent(`transactionDate:${dateRange}`)}`,
      'transactions',
      'FINANCE_TRANSACTION',
    );
    transactionCount = result.count;
    transactionPagesPending = result.pagesPending;
    synced.push('TRANSACTIONS_90_DAYS');
  } catch (error) {
    const failure = getEbaySyncFailure(error, 'EBAY_TRANSACTIONS_SYNC_FAILED');
    failed.push({ resource: 'TRANSACTIONS_90_DAYS', message: failure.message });
    await admin.from('marketplace_integration_events').insert({
      organization_id: account.organization_id, marketplace_account_id: account.id,
      event_type: 'EBAY_FINANCES_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
      message: failure.message, metadata: { resource: 'TRANSACTIONS_90_DAYS', endpoint: '/sell/finances/v1/transaction', httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: 'PRODUCTION' },
    });
  }

  await admin.from('marketplace_integration_events').insert({
    organization_id: account.organization_id,
    marketplace_account_id: account.id,
    event_type: 'EBAY_FINANCES_SYNC_COMPLETED',
    severity: failed.length ? 'WARNING' : 'INFO',
    message: `eBay Finances sync stored ${payoutCount} payouts and ${transactionCount} transactions.`,
    metadata: { syncBatchId: batchId, payoutCount, transactionCount, payoutPagesPending, transactionPagesPending, syncedResources: synced, failedResources: failed.map(item => item.resource), dateRange, environment: 'PRODUCTION' },
  });
  return { batchId, payouts: payoutCount, transactions: transactionCount, synced, failed, pagesPending: payoutPagesPending || transactionPagesPending };
}

export async function handleMarketplaceRoute(path: string, request: Request, auth: AuthContext, env: WorkerEnv): Promise<Response | null> {
  const configResponse = await handleIntegrationConfig(path, request, auth, env);
  if (configResponse) return configResponse;

  if (path === '/ebay/integration/events' && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view') && !auth.permissions.has('marketplace.manage')) {
      return json({ error: 'Marketplace view permission is required.' }, 403);
    }
    const accountId = new URL(request.url).searchParams.get('accountId');
    let accountsQuery = auth.repositoryContext.supabase
      .from('marketplace_accounts')
      .select('id,name,seller_username,last_sync_at,auto_sync_interval_minutes')
      .eq('organization_id', auth.organizationId);
    if (accountId) accountsQuery = accountsQuery.eq('id', accountId);
    const { data: accounts, error: accountsError } = await accountsQuery;
    if (accountsError) throw new Error('Marketplace seller accounts could not be loaded.');
    if (accountId && !accounts?.length) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    const accountById = new Map((accounts || []).map((account: any) => [account.id, account]));
    const admin = createServiceClient(env);
    let eventsQuery = admin.from('marketplace_integration_events')
      .select('id,marketplace_account_id,event_type,severity,error_code,message,metadata,created_at')
      .eq('organization_id', auth.organizationId);
    if (accountId) eventsQuery = eventsQuery.eq('marketplace_account_id', accountId);
    const { data: events, error: eventsError } = await eventsQuery
      .order('created_at', { ascending: false }).limit(200);
    if (eventsError) throw new Error('Marketplace integration events could not be loaded.');
    return json({
      events: (events || []).map((event: any) => {
        const account: any = event.marketplace_account_id ? accountById.get(event.marketplace_account_id) : null;
        const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
        const lastSyncAt = account?.last_sync_at ? new Date(account.last_sync_at).getTime() : 0;
        const intervalMs = Math.max(5, Math.min(1440, Number(account?.auto_sync_interval_minutes || 15))) * 60000;
        const nextSyncAt = account ? new Date(lastSyncAt ? lastSyncAt + intervalMs : Date.now() + intervalMs).toISOString() : null;
        return {
          id: event.id,
          accountId: event.marketplace_account_id,
          accountName: account?.name || 'Marketplace account',
          sellerUsername: account?.seller_username || '',
          eventType: event.event_type,
          severity: event.severity,
          errorCode: event.error_code,
          message: event.message,
          apiName: typeof metadata.endpoint === 'string' ? metadata.endpoint : event.event_type,
          stage: typeof metadata.stage === 'string' ? metadata.stage : null,
          httpStatus: metadata.httpStatus !== null && metadata.httpStatus !== undefined && Number.isFinite(Number(metadata.httpStatus)) ? Number(metadata.httpStatus) : null,
          providerCode: typeof metadata.providerCode === 'string' ? metadata.providerCode : null,
          createdAt: event.created_at,
          nextSyncAt,
          retryable: ['ORDER_SYNC_FAILED', 'INVENTORY_SYNC_FAILED'].includes(event.event_type) && event.severity === 'ERROR' && Boolean(account),
        };
      }),
    });
  }

  if (path === '/ebay/accounts' && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const marketplace = body?.marketplace;
    const environment = body?.environment;
    if (!name || name.length > 120 || !['EBAY_UK', 'EBAY_US', 'EBAY_DE'].includes(String(marketplace)) || environment !== 'PRODUCTION') {
      return json({ error: 'Provide an account name, supported eBay marketplace and environment.' }, 400);
    }
    if (env.EBAY_PRODUCTION_OAUTH_ENABLED !== 'true') {
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

  const deleteAccountMatch = path.match(/^\/ebay\/accounts\/([^/]+)$/);
  if (deleteAccountMatch && request.method === 'DELETE') {
    // Account deletion is intentionally outside employee permission overrides:
    // only a verified workspace Super Admin may perform this destructive action.
    if (auth.user.role !== 'SUPER_ADMIN') return json({ error: 'Only a Super Admin can delete a marketplace account.' }, 403);
    const origin = request.headers.get('Origin');
    const requestOrigin = new URL(request.url).origin;
    if (!origin || (origin !== requestOrigin && origin !== env.ALLOWED_ORIGIN)) return json({ error: 'A same-origin browser request is required for account deletion.' }, 403);
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const confirmationName = typeof body?.confirmationName === 'string' ? body.confirmationName.trim() : '';
    if (!confirmationName) return json({ error: 'Type the exact marketplace account name to confirm deletion.' }, 400);

    const { data: account, error: accountError } = await auth.repositoryContext.supabase
      .from('marketplace_accounts')
      .select('id,name,auth_status,organization_id')
      .eq('id', deleteAccountMatch[1])
      .eq('organization_id', auth.organizationId)
      .maybeSingle();
    if (accountError) throw new Error('Marketplace account could not be verified.');
    if (!account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.name !== confirmationName) return json({ error: 'The confirmation name does not match this marketplace account.' }, 400);
    if (account.auth_status === 'CONNECTED') return json({ error: 'This seller is connected to eBay. Disconnect/revoke its authorization before deleting it.' }, 409);

    // Fail closed: only delete an accidental, unused account. Never cascade-delete
    // orders, sync history, credentials, listings, mappings or audit evidence.
    const admin = createServiceClient(env);
    const linkedTables = [
      'marketplace_credentials',
      'marketplace_oauth_states',
      'marketplace_sync_runs',
      'marketplace_sync_checkpoints',
      'marketplace_listing_snapshots',
      'marketplace_integration_events',
      'marketplace_exceptions',
      'marketplace_sync_jobs',
      'marketplace_sku_mappings',
      'orders',
    ];
    const linked = [];
    for (const table of linkedTables) {
      const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true })
        .eq('marketplace_account_id', account.id).eq('organization_id', auth.organizationId);
      if (error) return json({ error: 'Deletion safety check could not verify all linked records. No data was deleted.' }, 503);
      if ((count || 0) > 0) linked.push({ table, count });
    }
    if (linked.length) return json({
      error: 'This account has linked authorization or business history and cannot be hard-deleted. No data was changed.',
      linkedRecords: linked,
    }, 409);

    const { error: deleteError } = await admin.from('marketplace_accounts')
      .delete().eq('id', account.id).eq('organization_id', auth.organizationId);
    if (deleteError) return json({ error: 'Marketplace account could not be deleted safely. No related business data was removed.' }, 409);
    return json({ success: true, deletedAccountId: account.id });
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


  const sellerAccountMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/seller-account$/);
  if (sellerAccountMatch && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view') && !auth.permissions.has('marketplace.manage')) {
      return json({ error: 'Marketplace view permission is required.' }, 403);
    }
    const { data: account, error: accountError } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,environment,is_demo,auth_status').eq('id', sellerAccountMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo) return json({ error: 'Only Production seller account data is available in this workspace.' }, 409);
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_provider_snapshots')
      .select('id,resource_type,external_id,sync_batch_id,snapshot,provider_updated_at,synced_at')
      .eq('marketplace_account_id', account.id).eq('organization_id', auth.organizationId)
      .in('resource_type', ['SELLER_PRIVILEGE','SELLER_SUBSCRIPTION','SELLER_PAYMENT_POLICY','SELLER_FULFILLMENT_POLICY','SELLER_RETURN_POLICY'])
      .order('synced_at', { ascending: false });
    if (error) throw new Error('eBay seller account snapshots could not be loaded.');
    const latest = new Map<string, any>();
    for (const row of data || []) if (!latest.has(row.resource_type)) latest.set(row.resource_type, row);
    return json({
      accountId: account.id,
      environment: 'PRODUCTION',
      lastSyncedAt: [...latest.values()].map((row: any) => row.synced_at).sort().at(-1) || null,
      resources: [...latest.values()].map((row: any) => ({
        type: row.resource_type, snapshot: row.snapshot, providerUpdatedAt: row.provider_updated_at, syncedAt: row.synced_at,
      })),
    });
  }

  if (sellerAccountMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,organization_id,marketplace,environment,is_demo,auth_status')
      .eq('id', sellerAccountMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'Only connected Production eBay seller accounts can be synchronized.' }, 409);
    }
    const result = await syncSellerAccountSettings(account, env);
    return json({ success: result.failed.length === 0, ...result });
  }

  const returnsSyncMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/sync-returns$/);
  if (returnsSyncMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,organization_id,environment,marketplace,is_demo,auth_status')
      .eq('id', returnsSyncMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'Only connected Production eBay seller accounts can be synchronized.' }, 409);
    }
    const result = await syncSellerReturns(account, env);
    return json({ success: !result.pagesPending, ...result });
  }

  const returnsReadMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/returns$/);
  if (returnsReadMatch && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view') && !auth.permissions.has('marketplace.manage')) {
      return json({ error: 'Marketplace view permission is required.' }, 403);
    }
    const accountId = returnsReadMatch[1];
    const { data: account, error: accountError } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,environment,is_demo').eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo) return json({ error: 'Only Production return data is available.' }, 409);
    const admin = createServiceClient(env);
    const { data: checkpoint, error: checkpointError } = await admin.from('marketplace_sync_checkpoints')
      .select('cursor_state,last_successful_at').eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', accountId).eq('resource_type', 'RETURNS').maybeSingle();
    if (checkpointError) throw new Error('The eBay returns checkpoint could not be loaded.');
    const cursor = checkpoint?.cursor_state && typeof checkpoint.cursor_state === 'object'
      ? checkpoint.cursor_state as Record<string, unknown> : {};
    const completedBatchId = typeof cursor.lastCompletedBatchId === 'string' ? cursor.lastCompletedBatchId : '';
    const { data: latest, error: latestError } = completedBatchId ? { data: null, error: null } : await admin.from('marketplace_provider_snapshots')
      .select('sync_batch_id,synced_at').eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', accountId).eq('resource_type', 'EBAY_RETURN')
      .order('synced_at', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw new Error('eBay return snapshots could not be loaded.');
    const activeBatchId = typeof cursor.activeBatchId === 'string' ? cursor.activeBatchId : '';
    const batchId = completedBatchId || (!activeBatchId ? latest?.sync_batch_id || '' : '');
    if (!batchId) return json({ returns: [], total: 0, lastSyncedAt: null, pagesPending: Boolean(activeBatchId) });
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_provider_snapshots')
      .select('id,external_id,snapshot,synced_at').eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', accountId).eq('resource_type', 'EBAY_RETURN')
      .eq('sync_batch_id', batchId).order('synced_at', { ascending: false }).limit(500);
    if (error) throw new Error('eBay return snapshots could not be loaded.');
    return json({
      returns: (data || []).map((row: any) => ({ id: row.external_id, ...row.snapshot, syncedAt: row.synced_at })),
      total: data?.length || 0,
      lastSyncedAt: checkpoint?.last_successful_at || latest?.synced_at || null,
      pagesPending: Boolean(cursor.activeBatchId),
    });
  }

  const financeSyncMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/sync-finances$/);
  if (financeSyncMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,organization_id,marketplace,environment,is_demo,auth_status')
      .eq('id', financeSyncMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'Only connected Production eBay seller accounts can be synchronized.' }, 409);
    }
    const result = await syncSellerFinances(account, env);
    return json({ success: result.failed.length === 0, ...result });
  }

  const financeReadMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/finances$/);
  if (financeReadMatch && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view') && !auth.permissions.has('marketplace.manage')) {
      return json({ error: 'Marketplace view permission is required.' }, 403);
    }
    const accountId = financeReadMatch[1];
    const { data: account, error: accountError } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,environment,is_demo').eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo) return json({ error: 'Only Production finance data is available.' }, 409);
    const admin = createServiceClient(env);
    const { data: latest, error: latestError } = await admin.from('marketplace_provider_snapshots')
      .select('sync_batch_id,synced_at').eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', accountId)
      .in('resource_type', ['FINANCE_PAYOUT','FINANCE_TRANSACTION','FINANCE_SUMMARY'])
      .order('synced_at', { ascending: false }).limit(1).maybeSingle();
    if (latestError) throw new Error('eBay Finance snapshots could not be loaded.');
    if (!latest?.sync_batch_id) return json({ payouts: [], transactions: [], summaries: [], lastSyncedAt: null });
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_provider_snapshots')
      .select('id,resource_type,external_id,snapshot,synced_at')
      .eq('organization_id', auth.organizationId).eq('marketplace_account_id', accountId)
      .eq('sync_batch_id', latest.sync_batch_id)
      .in('resource_type', ['FINANCE_PAYOUT','FINANCE_TRANSACTION','FINANCE_SUMMARY'])
      .order('synced_at', { ascending: false }).limit(1000);
    if (error) throw new Error('eBay Finance snapshots could not be loaded.');
    const rows = data || [];
    return json({
      payouts: rows.filter((row: any) => row.resource_type === 'FINANCE_PAYOUT').map((row: any) => ({ id: row.external_id, ...row.snapshot, syncedAt: row.synced_at })),
      transactions: rows.filter((row: any) => row.resource_type === 'FINANCE_TRANSACTION').map((row: any) => ({ id: row.external_id, ...row.snapshot, syncedAt: row.synced_at })),
      summaries: rows.filter((row: any) => row.resource_type === 'FINANCE_SUMMARY').map((row: any) => ({ key: row.external_id, ...row.snapshot, syncedAt: row.synced_at })),
      lastSyncedAt: latest.synced_at,
    });
  }

  const analyticsSyncMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/sync-analytics$/);
  if (analyticsSyncMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,organization_id,marketplace,environment,is_demo,auth_status')
      .eq('id', analyticsSyncMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'Only connected Production eBay seller accounts can be synchronized.' }, 409);
    }
    const result = await syncSellerAnalytics(account, env);
    return json({ success: result.failed.length === 0, ...result });
  }

  const analyticsReadMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/analytics$/);
  if (analyticsReadMatch && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view') && !auth.permissions.has('marketplace.manage')) {
      return json({ error: 'Marketplace view permission is required.' }, 403);
    }
    const accountId = analyticsReadMatch[1];
    const { data: account, error: accountError } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,environment,is_demo').eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo) return json({ error: 'Only Production analytics data is available.' }, 409);
    const { data, error } = await auth.repositoryContext.supabase.from('marketplace_provider_snapshots')
      .select('id,resource_type,external_id,snapshot,provider_updated_at,synced_at')
      .eq('organization_id', auth.organizationId).eq('marketplace_account_id', accountId)
      .in('resource_type', ['ANALYTICS_TRAFFIC','ANALYTICS_SELLER_STANDARDS','ANALYTICS_CUSTOMER_SERVICE'])
      .order('synced_at', { ascending: false }).limit(50);
    if (error) throw new Error('eBay Analytics snapshots could not be loaded.');
    const latest = new Map<string, any>();
    for (const row of data || []) {
      const key = `${row.resource_type}:${row.external_id}`;
      if (!latest.has(key)) latest.set(key, row);
    }
    return json({ resources: [...latest.values()].map((row: any) => ({
      type: row.resource_type, key: row.external_id, snapshot: row.snapshot,
      providerUpdatedAt: row.provider_updated_at, syncedAt: row.synced_at,
    })) });
  }

  const activeListingsSyncMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/sync-active-listings$/);
  if (activeListingsSyncMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,organization_id,marketplace,environment,is_demo,auth_status')
      .eq('id', activeListingsSyncMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'Only connected Production eBay seller accounts can be synchronized.' }, 409);
    }
    const result = await syncTradingActiveListings(account, env);
    return json({ success: !result.pagesPending, ...result });
  }

  const listingsMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/listings$/);
  if (listingsMatch && request.method === 'GET') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view') && !auth.permissions.has('marketplace.manage')) {
      return json({ error: 'Marketplace view permission is required.' }, 403);
    }
    const { data: account, error: accountError } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id').eq('id', listingsMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get('limit') || 50);
    const requestedOffset = Number(url.searchParams.get('offset') || 0);
    const limit = Number.isSafeInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
    const offset = Number.isSafeInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
    const admin = createServiceClient(env);
    const { data, error, count } = await admin.from('marketplace_listing_snapshots')
      .select('external_sku,inventory_item,offers,total_ship_to_location_quantity,listing_status,source_updated_at,synced_at', { count: 'exact' })
      .eq('marketplace_account_id', account.id).eq('organization_id', auth.organizationId)
      .order('synced_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw new Error('eBay listing snapshots could not be loaded.');
    const { data: tradingCheckpoint, error: tradingCheckpointError } = await admin.from('marketplace_sync_checkpoints')
      .select('cursor_state').eq('marketplace_account_id', account.id)
      .eq('organization_id', auth.organizationId).eq('resource_type', 'ACTIVE_LISTINGS_TRADING').maybeSingle();
    if (tradingCheckpointError) throw new Error('The active listing checkpoint could not be loaded.');
    const tradingCursor = tradingCheckpoint?.cursor_state && typeof tradingCheckpoint.cursor_state === 'object'
      ? tradingCheckpoint.cursor_state as Record<string, unknown> : {};
    const preferredTradingBatchId = typeof tradingCursor.lastCompletedBatchId === 'string'
      ? tradingCursor.lastCompletedBatchId
      : typeof tradingCursor.activeBatchId === 'string' ? tradingCursor.activeBatchId : null;
    const { data: latestTradingBatch, error: latestTradingBatchError } = await admin.from('marketplace_provider_snapshots')
      .select('sync_batch_id').eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', account.id).eq('resource_type', 'ACTIVE_LISTING_TRADING')
      .order('synced_at', { ascending: false }).limit(1).maybeSingle();
    if (latestTradingBatchError) throw new Error('Trading API active listing snapshots could not be loaded.');
    const tradingBatchId = preferredTradingBatchId || latestTradingBatch?.sync_batch_id || null;
    const { data: tradingRows, error: tradingError } = tradingBatchId
      ? await admin.from('marketplace_provider_snapshots')
          .select('external_id,snapshot,synced_at').eq('organization_id', auth.organizationId)
          .eq('marketplace_account_id', account.id).eq('resource_type', 'ACTIVE_LISTING_TRADING')
          .eq('sync_batch_id', tradingBatchId).order('synced_at', { ascending: false })
      : { data: [], error: null };
    if (tradingError) throw new Error('Trading API active listing snapshots could not be loaded.');
    const inventoryListingIds = new Set((data || []).flatMap((row: any) =>
      (Array.isArray(row.offers) ? row.offers : []).map((offer: any) => String(offer.listingId || '')).filter(Boolean)
    ));
    const tradingListings = (tradingRows || []).filter((row: any) => !inventoryListingIds.has(row.external_id)).map((row: any) => {
      const item = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot as Record<string, any> : {};
      const quantity = typeof item.quantity === 'number' && Number.isFinite(item.quantity) ? item.quantity : null;
      const sold = typeof item.quantitySold === 'number' && Number.isFinite(item.quantitySold) ? item.quantitySold : null;
      const availableQuantity = quantity !== null && sold !== null ? quantity - sold : null;
      const hasPrice = item.currentPrice !== null && item.currentPrice !== undefined && item.currency;
      return {
        offerId: row.external_id,
        itemId: row.external_id,
        sku: typeof item.sku === 'string' ? item.sku : '',
        title: typeof item.title === 'string' ? item.title : '',
        description: '',
        imageUrls: typeof item.galleryUrl === 'string' ? [item.galleryUrl] : [],
        condition: '',
        inventoryQuantity: quantity,
        listingStatus: typeof item.listingStatus === 'string' ? item.listingStatus : '',
        offers: hasPrice ? [{
          listingId: row.external_id,
          ...(availableQuantity !== null ? { availableQuantity } : {}),
          pricingSummary: { price: { value: String(item.currentPrice), currency: String(item.currency) } },
        }] : [],
        source: 'TRADING_API',
        listingStartTime: item.startTime || null,
        syncedAt: row.synced_at,
        syncStatus: 'SYNCED',
        syncError: null,
        syncErrorDetails: null,
      };
    });
    const { data: skuFailureEvents, error: skuEventsError } = await admin.from('marketplace_integration_events')
      .select('message,metadata,created_at,error_code')
      .eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', account.id)
      .eq('event_type', 'INVENTORY_SKU_SYNC_FAILED')
      .order('created_at', { ascending: false })
      .limit(500);
    if (skuEventsError) throw new Error('Per-SKU listing sync results could not be loaded.');
    const latestSkuFailure = new Map<string, any>();
    for (const event of skuFailureEvents || []) {
      const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata as Record<string, unknown> : {};
      const sku = typeof metadata.sku === 'string' ? metadata.sku : '';
      if (sku && !latestSkuFailure.has(sku)) latestSkuFailure.set(sku, event);
    }
    return json({
      listings: (data || []).map((row: any) => {
        const failure = latestSkuFailure.get(row.external_sku);
        const isFailed = Boolean(failure && new Date(failure.created_at).getTime() > new Date(row.synced_at).getTime());
        return ({
        sku: row.external_sku,
        title: row.inventory_item?.product?.title || '',
        description: row.inventory_item?.product?.description || '',
        imageUrls: row.inventory_item?.product?.imageUrls || [],
        condition: row.inventory_item?.condition || '',
        inventoryQuantity: row.total_ship_to_location_quantity,
        listingStatus: row.listing_status || 'NOT_LISTED',
        offers: Array.isArray(row.offers) ? row.offers : [],
        sourceUpdatedAt: row.source_updated_at,
        syncedAt: row.synced_at,
        syncStatus: isFailed ? 'PARTIAL' : 'SYNCED',
        syncError: isFailed ? failure.message : null,
        syncErrorDetails: isFailed ? {
          errorCode: failure.error_code || null,
          httpStatus: Number.isFinite(Number(failure.metadata?.httpStatus)) ? Number(failure.metadata.httpStatus) : null,
          providerCode: typeof failure.metadata?.providerCode === 'string' ? failure.metadata.providerCode : null,
          stage: typeof failure.metadata?.stage === 'string' ? failure.metadata.stage : null,
          occurredAt: failure.created_at,
        } : null,
      }); }),
      tradingListings,
      tradingTotal: tradingListings.length,
      total: (count || 0) + tradingListings.length,
      limit,
      offset,
    });
  }

  const syncMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/sync$/);
  if (syncMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts').select('id,organization_id,environment,is_demo,auth_status,marketplace').eq('id', syncMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.is_demo || account.environment !== 'PRODUCTION' || account.auth_status !== 'CONNECTED') return json({ error: 'Only a real, connected Production eBay seller account can be synchronized.' }, 409);
    const ordersProgress = createEbaySyncProgress();
    let ordersResult: Record<string, unknown>;
    try {
      const orders = await syncSellerOrders(account, env, ordersProgress);
      ordersResult = { ...orders };
    } catch (error) {
      const failure = getEbaySyncFailure(error, 'EBAY_ORDER_SYNC_FAILED');
      if (!ordersProgress.runCreated) {
        const eventAdmin = createServiceClient(env);
        await eventAdmin.from('marketplace_integration_events').insert({
          organization_id: account.organization_id, marketplace_account_id: account.id,
          event_type: 'ORDER_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
          message: failure.message,
          metadata: { stage: ordersProgress.stage, httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: account.environment },
        });
      }
      ordersResult = {
        status: ordersProgress.fetched || ordersProgress.imported || ordersProgress.skipped ? 'PARTIAL' : 'FAILED',
        fetched: ordersProgress.fetched, imported: ordersProgress.imported, skipped: ordersProgress.skipped,
        exceptions: ordersProgress.exceptions,
        error: { code: failure.code, message: failure.message, stage: ordersProgress.stage, httpStatus: failure.httpStatus },
      };
    }

    const inventoryProgress = createEbaySyncProgress();
    let inventoryResult: Record<string, unknown>;
    try {
      const inventory = await syncSellerInventory(account, env, inventoryProgress);
      inventoryResult = { status: inventory.pagesPending || inventory.failedSkus.length ? 'PARTIAL' : 'SUCCESS', ...inventory };
      const eventAdmin = createServiceClient(env);
      await eventAdmin.from('marketplace_integration_events').insert({
        organization_id: account.organization_id, marketplace_account_id: account.id,
        event_type: 'INVENTORY_SYNC_COMPLETED', severity: inventory.pagesPending || inventory.failedSkus.length ? 'WARNING' : 'INFO',
        message: `Inventory sync fetched ${inventory.fetched} items and ${inventory.offersFetched} listing offers; ${inventory.failedSkus.length} SKU offer lookups failed.`,
        metadata: { stage: 'INVENTORY_COMPLETED', environment: account.environment, endpoint: 'sell/inventory/v1/inventory_item', fetched: inventory.fetched, offersFetched: inventory.offersFetched, failedSkus: inventory.failedSkus, pagesPending: inventory.pagesPending },
      });
    } catch (error) {
      const failure = getEbaySyncFailure(error, 'EBAY_INVENTORY_SYNC_FAILED');
      const eventAdmin = createServiceClient(env);
      await eventAdmin.from('marketplace_integration_events').insert({
        organization_id: account.organization_id, marketplace_account_id: account.id,
        event_type: 'INVENTORY_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
        message: failure.message,
        metadata: {
          stage: inventoryProgress.stage, httpStatus: failure.httpStatus, providerCode: failure.providerCode,
          environment: account.environment,
          endpoint: inventoryProgress.stage === 'EBAY_OFFERS_API' ? 'sell/inventory/v1/offer' : 'sell/inventory/v1/inventory_item',
          fetched: inventoryProgress.fetched, offersFetched: inventoryProgress.offersFetched,
        },
      });
      inventoryResult = {
        status: inventoryProgress.fetched || inventoryProgress.offersFetched ? 'PARTIAL' : 'FAILED',
        fetched: inventoryProgress.fetched, offersFetched: inventoryProgress.offersFetched, pagesPending: false,
        error: { code: failure.code, message: failure.message, stage: inventoryProgress.stage, httpStatus: failure.httpStatus },
      };
    }

    const ordersOk = ordersResult.status === 'SUCCESS';
    const inventoryOk = inventoryResult.status === 'SUCCESS';
    const anyPartial = ordersResult.status === 'PARTIAL' || inventoryResult.status === 'PARTIAL';
    const overallStatus = ordersOk && inventoryOk ? 'SUCCESS' : (ordersOk || inventoryOk || anyPartial ? 'PARTIAL' : 'FAILED');
    const orderCount = Number(ordersResult.imported || 0);
    const inventoryCount = Number(inventoryResult.fetched || 0);
    const summary = `Orders: ${String(ordersResult.status)} (${orderCount} imported); Inventory: ${String(inventoryResult.status)} (${inventoryCount} items).`;
    const finalAdmin = createServiceClient(env);
    await finalAdmin.from('marketplace_accounts').update({
      last_sync_status: overallStatus, last_sync_message: summary,
      ...(ordersOk || inventoryOk ? { last_sync_at: new Date().toISOString() } : {}),
    }).eq('id', account.id).eq('organization_id', auth.organizationId);

    return json({
      status: overallStatus, orders: ordersResult, inventory: inventoryResult,
      imported: orderCount, skipped: Number(ordersResult.skipped || 0),
      exceptions: Number(ordersResult.exceptions || 0), fetched: Number(ordersResult.fetched || 0),
    });
  }

  const connectMatch = path.match(/^\/ebay\/accounts\/([^/]+)\/connect$/);
  if (connectMatch && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const { data: account, error } = await auth.repositoryContext.supabase.from('marketplace_accounts')
      .select('id,name,environment,is_demo,marketplace').eq('id', connectMatch[1]).eq('organization_id', auth.organizationId).maybeSingle();
    if (error || !account) return json({ error: 'Marketplace account was not found in this workspace.' }, 404);
    if (account.is_demo) return json({ error: 'Demo accounts cannot be connected. Create a real seller account entry first.' }, 400);
    if (account.environment !== 'PRODUCTION') return json({ error: 'Only Production eBay seller accounts can be connected.' }, 409);
    if (env.EBAY_PRODUCTION_OAUTH_ENABLED !== 'true') return json({ error: 'Production eBay authorization is disabled until eBay activates the production keyset and compliance is complete.' }, 403);
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
    // Safe start diagnostics: confirm the CSRF state was created and included without exposing its value.
    console.info('[eBay OAuth] authorization request prepared', {
      environment: account.environment,
      stateIncluded: authorize.searchParams.has('state'),
      stateLength: state.length,
      redirectUriPresent: authorize.searchParams.has('redirect_uri'),
      scopeCount: OAUTH_SCOPES.length,
    });
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

  if (path === '/ebay/sku-mappings' && request.method === 'GET') {
    const accountId = new URL(request.url).searchParams.get('accountId');
    if (!accountId || accountId === 'ALL') return json({ error: 'Select one seller account to read its SKU mappings.' }, 400);
    const { data: account, error: accountError } = await auth.repositoryContext.supabase
      .from('marketplace_accounts').select('id,environment,is_demo,auth_status')
      .eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json({ error: 'The selected marketplace account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'Only connected Production seller account mappings can be read here.' }, 409);
    }
    const query = auth.repositoryContext.supabase
      .from('marketplace_sku_mappings')
      .select('id,marketplace_account_id,product_id,external_sku,external_listing_id,listing_title,created_at')
      .eq('organization_id', auth.organizationId)
      .eq('marketplace_account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(1000);
    const { data: mappings, error } = await query;
    if (error) throw new Error('Marketplace SKU mappings could not be loaded.');
    const productIds = [...new Set((mappings || []).map(row => row.product_id))];
    const { data: products, error: productsError } = productIds.length
      ? await auth.repositoryContext.supabase.from('products').select('id,sku,name').eq('organization_id', auth.organizationId).in('id', productIds)
      : { data: [], error: null };
    if (productsError) throw new Error('Mapped product details could not be loaded.');
    const productById = new Map((products || []).map(product => [product.id, product]));
    return json({ mappings: (mappings || []).map(row => {
      const product = productById.get(row.product_id);
      return {
        id: row.id, marketplaceAccountId: row.marketplace_account_id, productId: row.product_id,
        externalSku: row.external_sku, externalListingId: row.external_listing_id || '',
        listingTitle: row.listing_title || '', internalSku: product?.sku || '',
        internalName: product?.name || '', createdAt: row.created_at,
      };
    }) });
  }

  if (path === '/ebay/sku-mappings' && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.manage')) return json({ error: 'Marketplace management permission is required.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const accountId = typeof body.marketplaceAccountId === 'string' ? body.marketplaceAccountId.trim() : '';
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
    const externalSku = typeof body.externalSku === 'string' ? body.externalSku.trim() : '';
    const externalListingId = typeof body.externalListingId === 'string' ? body.externalListingId.trim() : '';
    const listingTitle = typeof body.listingTitle === 'string' ? body.listingTitle.trim() : '';
    if (!accountId || !productId || !externalSku) return json({ error: 'Seller account, external SKU and internal product are required.' }, 400);
    if (externalSku.length > 128 || externalListingId.length > 128 || listingTitle.length > 500) return json({ error: 'Marketplace SKU or listing details exceed the allowed length.' }, 400);

    const { data: account, error: accountError } = await auth.repositoryContext.supabase
      .from('marketplace_accounts').select('id,environment,is_demo,auth_status')
      .eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError) throw accountError;
    if (!account) return json({ error: 'Marketplace seller account was not found in this workspace.' }, 404);
    if (account.environment !== 'PRODUCTION' || account.is_demo || account.auth_status !== 'CONNECTED') {
      return json({ error: 'SKU mappings can only be created for connected Production seller accounts.' }, 409);
    }

    const { data: product, error: productError } = await auth.repositoryContext.supabase
      .from('products').select('id,sku,name,data_environment')
      .eq('id', productId).eq('organization_id', auth.organizationId).maybeSingle();
    if (productError) throw productError;
    if (!product) return json({ error: 'The selected internal product was not found in this workspace.' }, 404);
    if (product.data_environment !== 'PRODUCTION') return json({ error: 'Production eBay listings can only be mapped to Production products.' }, 409);

    const { data: mapping, error: mappingError } = await auth.repositoryContext.supabase
      .from('marketplace_sku_mappings')
      .insert({
        organization_id: auth.organizationId, marketplace_account_id: accountId,
        product_id: productId, external_sku: externalSku,
        external_listing_id: externalListingId || null, listing_title: listingTitle || null,
      })
      .select('id,marketplace_account_id,product_id,external_sku,external_listing_id,listing_title,created_at')
      .single();
    if (mappingError) {
      if (mappingError.code === '23505') return json({ error: 'This external SKU is already mapped for the selected seller account.' }, 409);
      if (mappingError.code === '23514') return json({ error: 'The selected product and seller account belong to different data environments.' }, 409);
      throw mappingError;
    }
    return json({ mapping: {
      id: mapping.id, marketplaceAccountId: mapping.marketplace_account_id, productId: mapping.product_id,
      externalSku: mapping.external_sku, externalListingId: mapping.external_listing_id || '',
      listingTitle: mapping.listing_title || '', internalSku: product.sku,
      internalName: product.name, createdAt: mapping.created_at,
    } }, 201);
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


/**
 * Cloudflare Cron entry point. Enqueues due non-demo seller accounts and
 * drains a bounded batch through the existing service-role job lease.
 * Demo accounts are intentionally excluded.
 */
export async function runScheduledMarketplaceSync(env: WorkerEnv): Promise<void> {
  const admin = createServiceClient(env);
  const now = Date.now();
  const { data: accounts, error } = await admin.from('marketplace_accounts')
    .select('id,organization_id,environment,is_demo,auth_status,last_sync_at,last_sync_attempt_at,auto_sync_interval_minutes')
    .eq('is_demo', false).eq('auth_status', 'CONNECTED')
    .in('marketplace', ['EBAY_UK', 'EBAY_US', 'EBAY_DE'])
    .eq('environment', 'PRODUCTION');
  if (error) throw new Error('Scheduled marketplace accounts could not be loaded.');

  // Recover operational sync-run rows left RUNNING by an execution that ended
  // before it could finalize. Never touch business orders or a run protected by
  // a currently valid Production job lease.
  const productionAccountIds = (accounts || []).map((account: any) => account.id);
  const continuationOffsets = new Map<string, { orders: number; inventory: number }>();
  if (productionAccountIds.length) {
    const { data: checkpoints, error: checkpointError } = await admin.from('marketplace_sync_checkpoints')
      .select('marketplace_account_id,resource_type,cursor_state')
      .in('marketplace_account_id', productionAccountIds)
      .in('resource_type', ['ORDERS', 'INVENTORY']);
    if (checkpointError) throw new Error('Production sync continuation checkpoints could not be loaded.');
    for (const checkpoint of checkpoints || []) {
      const cursor = checkpoint.cursor_state && typeof checkpoint.cursor_state === 'object'
        ? checkpoint.cursor_state as Record<string, unknown> : {};
      const parsedOffset = Number(cursor.offset);
      const offset = Number.isSafeInteger(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
      const current = continuationOffsets.get(checkpoint.marketplace_account_id) || { orders: 0, inventory: 0 };
      if (checkpoint.resource_type === 'ORDERS') current.orders = offset;
      if (checkpoint.resource_type === 'INVENTORY') current.inventory = offset;
      continuationOffsets.set(checkpoint.marketplace_account_id, current);
    }
    const recoveryNow = new Date();
    const recoveryNowIso = recoveryNow.toISOString();
    const recoveryCutoffIso = new Date(recoveryNow.getTime() - 15 * 60_000).toISOString();
    const [{ data: activeLeases, error: leaseError }, { data: staleRuns, error: runError }] = await Promise.all([
      admin.from('marketplace_sync_jobs')
        .select('marketplace_account_id,updated_at')
        .in('marketplace_account_id', productionAccountIds)
        .eq('status', 'RUNNING')
        .gt('locked_until', recoveryNowIso),
      admin.from('marketplace_sync_runs')
        .select('id,marketplace_account_id,started_at')
        .in('marketplace_account_id', productionAccountIds)
        .eq('status', 'RUNNING')
        .lt('started_at', recoveryCutoffIso),
    ]);
    if (leaseError || runError) throw new Error('Abandoned Production sync runs could not be inspected safely.');
    const abandonedRunIds = getAbandonedProductionSyncRunIds(staleRuns || [], activeLeases || [], recoveryCutoffIso);
    if (abandonedRunIds.length) {
      const { error: recoverError } = await admin.from('marketplace_sync_runs')
        .update({
          status: 'FAILED',
          completed_at: recoveryNowIso,
          last_error_code: 'SYNC_RUN_ABANDONED',
          last_error_message: 'The Worker execution ended before this sync run could be finalized. The attempt is preserved as failed; provider and business records were not deleted.',
        })
        .in('id', abandonedRunIds)
        .eq('status', 'RUNNING');
      if (recoverError) throw new Error('Abandoned Production sync runs could not be finalized.');
      console.info('[eBay sync recovery] finalized abandoned Production sync runs', { recoveredRunCount: abandonedRunIds.length });
    }
  }

  for (const account of accounts || []) {
    const intervalMs = Math.max(5, Math.min(1440, Number(account.auto_sync_interval_minutes || 15))) * 60_000;
    const lastAttempt = account.last_sync_attempt_at || account.last_sync_at;
    const lastSyncAttempt = lastAttempt ? new Date(lastAttempt).getTime() : 0;
    const continuation = continuationOffsets.get(account.id) || { orders: 0, inventory: 0 };
    const hasContinuation = continuation.orders > 0 || continuation.inventory > 0;
    if (!hasContinuation && lastSyncAttempt && now - lastSyncAttempt < intervalMs) continue;
    const bucket = Math.floor(now / intervalMs);
    const idempotencyKey = hasContinuation
      ? `scheduled-orders:${account.id}:continuation:${continuation.orders}:${continuation.inventory}`
      : `scheduled-orders:${account.id}:${bucket}`;
    const { error: enqueueError } = await admin.rpc('enqueue_marketplace_sync_job', {
      p_organization_id: account.organization_id,
      p_marketplace_account_id: account.id,
      p_idempotency_key: idempotencyKey,
    });
    if (enqueueError) throw new Error('A scheduled marketplace sync could not be queued.');
  }

  const { data: jobs, error: claimError } = await admin.rpc('claim_marketplace_sync_jobs', { p_limit: 1 });
  if (claimError) throw new Error('Scheduled marketplace sync jobs could not be claimed.');
  for (const job of jobs || []) {
    try {
      const { data: account, error: accountError } = await admin.from('marketplace_accounts')
        .select('id,organization_id,environment,is_demo,auth_status,marketplace')
        .eq('id', job.marketplace_account_id).eq('organization_id', job.organization_id)
        .eq('environment', 'PRODUCTION').eq('is_demo', false)
        .in('marketplace', ['EBAY_UK', 'EBAY_US', 'EBAY_DE']).maybeSingle();
      if (accountError || !account || account.is_demo || account.auth_status !== 'CONNECTED'
        || account.environment !== 'PRODUCTION') {
        throw new Error('The scheduled seller account is not eligible for live synchronization.');
      }
      const attemptAt = new Date().toISOString();
      const { error: attemptMarkError } = await admin.from('marketplace_accounts')
        .update({ last_sync_attempt_at: attemptAt })
        .eq('id', account.id).eq('organization_id', account.organization_id);
      if (attemptMarkError) throw new Error('The seller sync attempt timestamp could not be recorded.');

      const ordersProgress = createEbaySyncProgress();
      let ordersComplete = false;
      let ordersHasExceptions = false;
      let ordersPagesPending = false;
      let ordersSyncFailed = false;
      let inventoryPagesPending = false;
      let inventorySyncFailed = false;
      let lastErrorCode = 'SCHEDULED_SYNC_FAILED';
      let lastErrorMessage = 'Scheduled eBay synchronization failed. Retry is queued when eligible.';
      let jobRetryable = true;
      try {
        const orders = await syncSellerOrders(account, env, ordersProgress);
        ordersPagesPending = orders.pagesPending;
        ordersComplete = !orders.pagesPending;
        ordersHasExceptions = orders.exceptions > 0;
        if (!ordersComplete) {
          lastErrorCode = 'EBAY_ORDER_SYNC_PARTIAL';
          lastErrorMessage = `Orders sync is partial: fetched ${orders.fetched}, imported ${orders.imported}, pages pending: ${orders.pagesPending}.`;
        } else if (ordersHasExceptions) {
          lastErrorCode = 'EBAY_ORDER_SKU_EXCEPTIONS';
          lastErrorMessage = `Orders were imported, but ${orders.exceptions} line item(s) need review.`;
        }
      } catch (syncError) {
        ordersSyncFailed = true;
        const failure = getEbaySyncFailure(syncError, 'EBAY_ORDER_SYNC_FAILED');
        lastErrorCode = failure.code;
        lastErrorMessage = `Orders failed at ${ordersProgress.stage}: ${failure.message}`;
        jobRetryable = isRetryableEbaySyncFailure(failure);
        if (!ordersProgress.runCreated) {
          await admin.from('marketplace_integration_events').insert({
            organization_id: account.organization_id, marketplace_account_id: account.id,
            event_type: 'ORDER_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
            message: failure.message,
            metadata: { stage: ordersProgress.stage, httpStatus: failure.httpStatus, providerCode: failure.providerCode, environment: account.environment },
          });
        }
      }

      const inventoryProgress = createEbaySyncProgress();
      let inventoryOk = false;
      try {
        const inventory = await syncSellerInventory(account, env, inventoryProgress);
        inventoryPagesPending = inventory.pagesPending;
        inventoryOk = !inventory.pagesPending;
        await admin.from('marketplace_integration_events').insert({
          organization_id: account.organization_id, marketplace_account_id: account.id,
          event_type: 'INVENTORY_SYNC_COMPLETED', severity: inventory.pagesPending ? 'WARNING' : 'INFO',
          message: `Inventory sync fetched ${inventory.fetched} items and ${inventory.offersFetched} listing offers.`,
          metadata: { stage: 'INVENTORY_COMPLETED', environment: account.environment, endpoint: 'sell/inventory/v1/inventory_item', fetched: inventory.fetched, offersFetched: inventory.offersFetched, pagesPending: inventory.pagesPending },
        });
        if (inventory.pagesPending) {
          lastErrorCode = 'EBAY_INVENTORY_SYNC_PARTIAL';
          lastErrorMessage = 'Inventory sync has additional pages pending.';
        }
      } catch (syncError) {
        inventorySyncFailed = true;
        const failure = getEbaySyncFailure(syncError, 'EBAY_INVENTORY_SYNC_FAILED');
        lastErrorCode = failure.code;
        lastErrorMessage = `Inventory failed at ${inventoryProgress.stage}: ${failure.message}`;
        jobRetryable = jobRetryable && isRetryableEbaySyncFailure(failure);
        await admin.from('marketplace_integration_events').insert({
          organization_id: account.organization_id, marketplace_account_id: account.id,
          event_type: 'INVENTORY_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
          message: failure.message,
          metadata: { stage: inventoryProgress.stage, httpStatus: failure.httpStatus, providerCode: failure.providerCode,
            environment: account.environment,
            endpoint: inventoryProgress.stage === 'EBAY_OFFERS_API' ? 'sell/inventory/v1/offer' : 'sell/inventory/v1/inventory_item',
            fetched: inventoryProgress.fetched, offersFetched: inventoryProgress.offersFetched },
        });
      }

      const ordersPartial = ordersProgress.fetched > 0 || ordersProgress.imported > 0 || ordersProgress.skipped > 0;
      const inventoryPartial = inventoryProgress.fetched > 0 || inventoryProgress.offersFetched > 0;
      const resourcesComplete = ordersComplete && inventoryOk;
      const pageContinuation = !ordersSyncFailed && !inventorySyncFailed && (ordersPagesPending || inventoryPagesPending);
      const overallStatus = resourcesComplete && !ordersHasExceptions ? 'SUCCESS' : (ordersComplete || inventoryOk || ordersPartial || inventoryPartial ? 'PARTIAL' : 'FAILED');
      await admin.from('marketplace_accounts').update({
        last_sync_status: overallStatus,
        last_sync_message: `Orders: ${ordersComplete ? 'COMPLETE' : 'INCOMPLETE'}${ordersHasExceptions ? ` (${ordersProgress.exceptions} order exception(s))` : ''}; Inventory: ${inventoryOk ? 'COMPLETE' : inventoryProgress.fetched || inventoryProgress.offersFetched ? 'PARTIAL' : 'FAILED'}.`,
        last_sync_attempt_at: attemptAt,
      }).eq('id', account.id).eq('organization_id', account.organization_id);

      if (resourcesComplete || pageContinuation) {
        // A completed page is a successful bounded job. The next Cron invocation
        // sees the persisted cursor and queues a new continuation job; page count
        // therefore does not consume transient-failure retry attempts.
        const { data: finalizedJob, error: finalizeError } = await admin.from('marketplace_sync_jobs').update({
          status: 'SUCCEEDED', completed_at: new Date().toISOString(),
          locked_until: null, last_error_code: null, last_error_message: null,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id).select('id,status').maybeSingle();
        if (finalizeError || !finalizedJob) {
          console.error('[Marketplace Sync] Job success finalization failed', {
            jobId: job.id ?? null, accountId: account.id,
            pageContinuation, ordersPagesPending, inventoryPagesPending,
            error: finalizeError?.message || 'No matching job row was updated',
          });
          throw new Error('The Production sync job could not be finalized after its page completed.');
        }
        console.info('[Marketplace Sync] Production page job completed', {
          jobId: finalizedJob.id, accountId: account.id,
          pageContinuation, ordersPagesPending, inventoryPagesPending,
        });
      } else {
        const nextStatus = !jobRetryable || Number(job.attempt_count || 0) >= Number(job.max_attempts || 5) ? 'DEAD_LETTER' : 'FAILED';
        const { data: failedJob, error: finalizeError } = await admin.from('marketplace_sync_jobs').update({
          status: nextStatus,
          completed_at: nextStatus === 'DEAD_LETTER' ? new Date().toISOString() : null,
          scheduled_at: new Date(Date.now() + Math.min(60, 2 ** Number(job.attempt_count || 1)) * 60_000).toISOString(),
          locked_until: null, last_error_code: lastErrorCode, last_error_message: lastErrorMessage,
          updated_at: new Date().toISOString(),
        }).eq('id', job.id).select('id,status').maybeSingle();
        if (finalizeError || !failedJob) {
          console.error('[Marketplace Sync] Job failure finalization failed', {
            jobId: job.id ?? null, accountId: account.id, nextStatus,
            error: finalizeError?.message || 'No matching job row was updated',
          });
          throw new Error('The Production sync job could not be finalized after its failure.');
        }
        console.warn('[Marketplace Sync] Production page job scheduled for retry', {
          jobId: failedJob.id, accountId: account.id, status: failedJob.status, code: lastErrorCode,
        });
      }
      continue;
    } catch (jobError) {
      const failure = getEbaySyncFailure(jobError, 'SCHEDULED_SYNC_FAILED');
      const failedAt = new Date().toISOString();
      await admin.from('marketplace_integration_events').insert({
        organization_id: job.organization_id, marketplace_account_id: job.marketplace_account_id,
        event_type: 'SCHEDULED_SYNC_FAILED', severity: 'ERROR', error_code: failure.code,
        message: failure.message,
        metadata: { stage: 'SCHEDULED_JOB_FINALIZE', httpStatus: failure.httpStatus, providerCode: failure.providerCode, attempt: job.attempt_count, environment: job.data_environment || null },
      });
      await admin.from('marketplace_sync_jobs').update({
        status: !isRetryableEbaySyncFailure(failure) || Number(job.attempt_count || 0) >= Number(job.max_attempts || 5) ? 'DEAD_LETTER' : 'FAILED',
        completed_at: !isRetryableEbaySyncFailure(failure) || Number(job.attempt_count || 0) >= Number(job.max_attempts || 5) ? failedAt : null,
        scheduled_at: new Date(Date.now() + Math.min(60, 2 ** Number(job.attempt_count || 1)) * 60_000).toISOString(),
        locked_until: null, last_error_code: failure.code,
        last_error_message: `${failure.httpStatus ? `HTTP ${failure.httpStatus}: ` : ''}${failure.message}`,
        updated_at: failedAt,
      }).eq('id', job.id);
    }
  }
}

export async function handleEbayOAuthCallback(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const eBayError = url.searchParams.get('error');
  // Safe OAuth diagnostics: log parameter presence only; never log state, code, tokens, or full URLs.
  console.info('[eBay OAuth] callback parameters', {
    hasState: Boolean(state),
    stateLength: state.length,
    hasCode: Boolean(code),
    hasError: Boolean(eBayError),
    queryKeys: [...url.searchParams.keys()].sort(),
  });
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
    // Capture eBay's immutable public user ID while the delegated token is available.
    // This is required to map future account-deletion notifications without relying on mutable usernames.
    const sellerIdentity = await fetchEbaySellerIdentity(oauthState.environment, token.access_token);
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
      ebay_user_id: sellerIdentity.userId,
      seller_username: sellerIdentity.username,
      auth_status: 'CONNECTED', token_expires_at: accessExpiresAt,
      last_sync_status: 'NOT_SYNCED', last_sync_message: 'eBay seller authorization completed. Initial order sync is pending.',
      updated_at: new Date(now).toISOString(),
    }).eq('id', oauthState.marketplace_account_id).eq('organization_id', oauthState.organization_id).eq('is_demo', false);
    if (accountError) throw new Error('The eBay seller account status could not be updated.');
    // The five-minute scheduled sweep automatically discovers connected accounts
    // whose last_sync_at is empty and queues their first complete sync.
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