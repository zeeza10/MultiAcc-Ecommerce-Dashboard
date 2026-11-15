import {
  decryptToken,
  encryptToken,
  logEvent,
  refreshExpiringEbayTokens,
  serviceClient,
} from './oauth';
import type { WorkerEnv } from '../types';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_JOB = 100;

function moneyMinor(value: unknown): number {
  const amount = typeof value === 'string' || typeof value === 'number' ? Number(value) : 0;
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function amountValue(value: any): unknown {
  return value && typeof value === 'object' ? value.value : value;
}

function orderStatus(order: any): string {
  const fulfilment = String(order.orderFulfillmentStatus || '').toUpperCase();
  const payment = String(order.orderPaymentStatus || '').toUpperCase();
  if (fulfilment === 'CANCELLED' || fulfilment === 'IN_CANCELLATION') return 'Cancelled';
  if (fulfilment === 'FULFILLED' || fulfilment === 'SHIPPED') return 'Shipped';
  if (fulfilment === 'DELIVERED') return 'Delivered';
  if (payment === 'PAID' || fulfilment === 'IN_PROGRESS') return 'Confirmed';
  return 'New';
}

function shippingStep(order: any): any {
  return order.fulfillmentStartInstructions?.[0]?.shippingStep
    || order.shippingStep
    || {};
}

function shippingAddress(order: any): Record<string, unknown> {
  const shipTo = shippingStep(order).shipTo || {};
  const address = shipTo.contactAddress || {};
  return {
    name: shipTo.fullName || '',
    street: [address.addressLine1, address.addressLine2].filter(Boolean).join(', '),
    city: address.city || '',
    county: address.stateOrProvince || '',
    postalCode: address.postalCode || '',
    country: address.countryCode || '',
  };
}

function safePayload(order: any): Record<string, unknown> {
  return {
    orderId: order.orderId,
    creationDate: order.creationDate,
    orderPaymentStatus: order.orderPaymentStatus,
    orderFulfillmentStatus: order.orderFulfillmentStatus,
    lineItems: (order.lineItems || []).map((line: any) => ({
      lineItemId: line.lineItemId,
      sku: line.sku || null,
      title: line.title || null,
      quantity: line.quantity,
    })),
    total: order.pricingSummary?.total || null,
  };
}

function currencyCode(order: any): string {
  const code = order.pricingSummary?.total?.currency
    || order.pricingSummary?.priceSubtotal?.currency
    || order.lineItems?.[0]?.lineItemCost?.currency
    || 'GBP';
  return /^[A-Z]{3}$/.test(code) ? code : 'GBP';
}

async function loadAccessToken(env: WorkerEnv, account: any, service: any): Promise<string> {
  await refreshExpiringEbayTokens(env);
  const { data: credential, error } = await service.from('marketplace_credentials')
    .select('access_token_ciphertext,refresh_token_ciphertext,expires_at,refresh_token_expires_at,revoked_at')
    .eq('organization_id', account.organization_id)
    .eq('marketplace_account_id', account.id)
    .maybeSingle();
  if (error || !credential || credential.revoked_at || !credential.access_token_ciphertext || !credential.refresh_token_ciphertext) {
    throw new Error('EBAY_AUTH_REQUIRED');
  }
  if (!credential.expires_at || new Date(credential.expires_at).getTime() <= Date.now() + 30_000) {
    if (credential.refresh_token_expires_at && new Date(credential.refresh_token_expires_at).getTime() <= Date.now()) {
      throw new Error('EBAY_AUTH_REQUIRED');
    }
    throw new Error('EBAY_REFRESH_TEMPORARY_FAILURE');
  }
  if (!env.EBAY_TOKEN_ENCRYPTION_KEY) throw new Error('TOKEN_ENCRYPTION_NOT_CONFIGURED');
  return decryptToken(credential.access_token_ciphertext, env.EBAY_TOKEN_ENCRYPTION_KEY);
}

async function fetchEbayOrders(account: any, accessToken: string, since: string): Promise<any[]> {
  const base = account.environment === 'SANDBOX'
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
  const all: any[] = [];
  let offset = 0;
  let pages = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total && pages < MAX_PAGES_PER_JOB) {
    const url = new URL('/sell/fulfillment/v1/order', base);
    url.searchParams.set('limit', String(PAGE_SIZE));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('filter', `creationdate:[${since}..]`);
    let response: Response;
    try {
      response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-EBAY-C-MARKETPLACE-ID': account.marketplace === 'EBAY_UK' ? 'EBAY_GB' : account.marketplace,
      },
      });
    } catch {
      throw new Error('EBAY_UNREACHABLE');
    }
    if (!response.ok) {
      if (response.status === 401) throw new Error('EBAY_ACCESS_TOKEN_REJECTED');
      if (response.status === 429 || response.status >= 500) throw new Error(`EBAY_RETRYABLE_HTTP_${response.status}`);
      throw new Error(`EBAY_API_HTTP_${response.status}`);
    }
    const payload = await response.json() as { orders?: any[]; total?: number };
    const batch = Array.isArray(payload.orders) ? payload.orders : [];
    all.push(...batch);
    total = Number.isFinite(payload.total) ? Number(payload.total) : Number.POSITIVE_INFINITY;
    pages++;
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }

  if (pages >= MAX_PAGES_PER_JOB && offset < total) {
    throw new Error('EBAY_PAGE_LIMIT_REACHED');
  }
  return all;
}

async function importOneOrder(
  service: any,
  account: any,
  order: any,
  mappings: Map<string, string>,
  products: Map<string, { id: string; name: string }>,
): Promise<{ inserted: boolean; duplicate: boolean; exceptions: number }> {
  const externalOrderId = String(order.orderId || '').trim();
  if (!externalOrderId) throw new Error('EBAY_ORDER_ID_MISSING');
  const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];
  if (!lineItems.length) throw new Error('EBAY_ORDER_HAS_NO_LINE_ITEMS');

  const items = lineItems.map((line: any) => {
    const sku = String(line.sku || `NO-SKU-${line.lineItemId || 'UNKNOWN'}`).slice(0, 128);
    const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
    const lineTotalMinor = moneyMinor(amountValue(line.lineItemCost));
    const unitPriceMinor = Math.round(lineTotalMinor / quantity);
    const itemTaxMinor = Array.isArray(line.taxes)
      ? line.taxes.reduce((sum: number, tax: any) => sum + moneyMinor(amountValue(tax.amount)), 0)
      : 0;
    const mappedId = mappings.get(sku);
    const mappedProduct = mappedId ? [...products.values()].find(product => product.id === mappedId) : products.get(sku);
    const mappedProductId = mappedProduct?.id || null;
    return {
      product_id: mappedProductId,
      sku,
      product_name: mappedProduct?.name || String(line.title || sku).slice(0, 300),
      quantity,
      unit_price_minor: unitPriceMinor,
      tax_amount_minor: itemTaxMinor,
      total_price_minor: lineTotalMinor,
      raw_item: {
        lineItemId: line.lineItemId || null,
        sku,
        title: String(line.title || '').slice(0, 300),
      },
    };
  });

  const summary = order.pricingSummary || {};
  const currency = currencyCode(order);
  const subtotalMinor = moneyMinor(amountValue(summary.priceSubtotal));
  const shippingMinor = moneyMinor(amountValue(summary.deliveryCost));
  const taxMinor = moneyMinor(amountValue(summary.tax));
  const calculatedTotal = subtotalMinor + shippingMinor + taxMinor;
  const totalMinor = moneyMinor(amountValue(summary.total)) || calculatedTotal;
  const createdAt = order.creationDate && !Number.isNaN(Date.parse(order.creationDate))
    ? new Date(order.creationDate).toISOString()
    : new Date().toISOString();
  const shortOrderId = externalOrderId.replace(/[^a-zA-Z0-9]/g, '').slice(-32);
  const orderNumber = `EB-${account.id.slice(0, 8)}-${shortOrderId}`;
  const buyerName = shippingStep(order).shipTo?.fullName || order.buyer?.username || 'eBay buyer';
  const { data, error } = await service.rpc('import_marketplace_order', {
    p_organization_id: account.organization_id,
    p_marketplace_account_id: account.id,
    p_order: {
      external_order_id: externalOrderId,
      order_number: orderNumber,
      customer_name: String(buyerName).slice(0, 250),
      customer_email: null,
      shipping_address: shippingAddress(order),
      status: orderStatus(order),
      payment_state: String(order.orderPaymentStatus || '').toUpperCase() === 'PAID' ? 'PAID' : 'PENDING',
      total_minor: totalMinor,
      tax_minor: taxMinor,
      shipping_charge_minor: shippingMinor,
      currency,
      created_at: createdAt,
      safe_payload: safePayload(order),
      items,
    },
  });
  if (error) throw new Error('ORDER_IMPORT_TRANSACTION_FAILED');
  return {
    inserted: Boolean(data?.inserted),
    duplicate: Boolean(data?.duplicate),
    exceptions: Number(data?.exception_count || 0),
  };
}

async function processOneJob(env: WorkerEnv, service: any, job: any): Promise<void> {
  const startedAt = new Date().toISOString();
  let runId: string | null = null;
  try {
    const { data: account, error: accountError } = await service.from('marketplace_accounts')
      .select('id,organization_id,name,marketplace,environment,is_demo,auth_status,last_sync_at')
      .eq('id', job.marketplace_account_id)
      .eq('organization_id', job.organization_id)
      .maybeSingle();
    if (accountError || !account || account.is_demo || account.auth_status !== 'CONNECTED') {
      throw new Error('MARKETPLACE_ACCOUNT_NOT_READY');
    }

    const { data: run, error: runError } = await service.from('marketplace_sync_runs').insert({
      organization_id: account.organization_id,
      marketplace_account_id: account.id,
      started_at: startedAt,
      status: 'IN_PROGRESS',
      attempt_count: job.attempt_count,
    }).select('id').single();
    if (runError || !run) throw new Error('SYNC_RUN_CREATE_FAILED');
    runId = run.id;

    const accessToken = await loadAccessToken(env, account, service);
    const initialSince = account.last_sync_at
      ? new Date(new Date(account.last_sync_at).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const orders = await fetchEbayOrders(account, accessToken, initialSince);

    const [{ data: mappingRows }, { data: productRows }] = await Promise.all([
      service.from('marketplace_sku_mappings')
        .select('external_sku,product_id')
        .eq('organization_id', account.organization_id)
        .eq('marketplace_account_id', account.id)
        .eq('is_verified', true),
      service.from('products')
        .select('id,sku,name')
        .eq('organization_id', account.organization_id)
        .eq('status', 'ACTIVE'),
    ]);
    const mappings = new Map<string, string>((mappingRows || []).map((row: any) => [row.external_sku, row.product_id]));
    const products = new Map<string, { id: string; name: string }>((productRows || []).map((row: any) => [row.sku, { id: row.id, name: row.name }]));
    const productById = new Map<string, { id: string; name: string }>((productRows || []).map((row: any) => [row.id, { id: row.id, name: row.name }]));
    for (const [sku, productId] of mappings) {
      const product = productById.get(productId);
      if (product) products.set(sku, product);
    }

    let imported = 0;
    let skipped = 0;
    let exceptions = 0;
    for (const order of orders) {
      const result = await importOneOrder(service, account, order, mappings, products);
      if (result.duplicate) skipped++;
      if (result.inserted) imported++;
      exceptions += result.exceptions;
    }

    const completedAt = new Date().toISOString();
    const message = `Fetched ${orders.length} eBay order(s); imported ${imported}; skipped ${skipped} duplicates; raised ${exceptions} SKU exception(s).`;
    await service.from('marketplace_sync_runs').update({
      completed_at: completedAt,
      status: 'COMPLETED',
      orders_fetched: orders.length,
      orders_imported: imported,
      orders_skipped_duplicate: skipped,
      exceptions_raised: exceptions,
      retryable: false,
      next_retry_at: null,
      last_error_code: null,
      last_error_message: null,
      log_message: message,
    }).eq('id', runId);
    await service.from('marketplace_accounts').update({
      last_sync_at: completedAt,
      last_sync_status: exceptions > 0 ? 'PARTIAL' : 'SUCCESS',
      last_sync_message: message,
      updated_at: completedAt,
    }).eq('id', account.id).eq('organization_id', account.organization_id);
    await service.from('marketplace_sync_jobs').update({
      status: 'SUCCEEDED', locked_until: null, completed_at: completedAt,
      updated_at: completedAt, last_error_code: null, last_error_message: null,
    }).eq('id', job.id);
    await logEvent(service, {
      organizationId: account.organization_id,
      accountId: account.id,
      eventType: 'ORDER_SYNC_COMPLETED',
      severity: exceptions > 0 ? 'WARNING' : 'INFO',
      message,
      metadata: { ordersFetched: orders.length, imported, skippedDuplicates: skipped, exceptions },
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'SYNC_FAILED';
    const authRequired = code === 'EBAY_ACCESS_TOKEN_REJECTED' || code === 'EBAY_AUTH_REQUIRED';
    const retryable = code.includes('RETRYABLE') || code === 'EBAY_UNREACHABLE' || code === 'EBAY_REFRESH_TEMPORARY_FAILURE';
    const exhausted = Number(job.attempt_count || 1) >= Number(job.max_attempts || 5);
    const completedAt = new Date().toISOString();
    const nextRetryAt = new Date(Date.now() + Math.min(60, 2 ** Math.max(1, Number(job.attempt_count || 1))) * 60_000).toISOString();
    const safeCode = /^[A-Z0-9_]+$/.test(code) ? code.slice(0, 100) : 'SYNC_FAILED';
    const safeMessage = retryable
      ? 'The marketplace sync failed temporarily and will be retried.'
      : 'The marketplace sync failed and requires attention.';
    if (runId) {
      await service.from('marketplace_sync_runs').update({
        completed_at: completedAt,
        status: 'FAILED',
        retryable: retryable && !exhausted,
        next_retry_at: retryable && !exhausted ? nextRetryAt : null,
        last_error_code: safeCode,
        last_error_message: safeMessage,
        log_message: safeMessage,
      }).eq('id', runId);
    }
    await service.from('marketplace_sync_jobs').update({
      status: exhausted || !retryable ? 'DEAD_LETTER' : 'FAILED',
      scheduled_at: nextRetryAt,
      locked_until: null,
      completed_at: exhausted || !retryable ? completedAt : null,
      updated_at: completedAt,
      last_error_code: safeCode,
      last_error_message: safeMessage,
    }).eq('id', job.id);
    await service.from('marketplace_accounts').update({
      auth_status: authRequired ? 'EXPIRED' : undefined,
      last_sync_status: authRequired ? 'AUTH_REQUIRED' : exhausted || !retryable ? 'FAILED' : 'RETRYING',
      last_sync_message: authRequired ? 'eBay authorization must be renewed before synchronization can continue.' : safeMessage,
      updated_at: completedAt,
    }).eq('id', job.marketplace_account_id).eq('organization_id', job.organization_id);
    await logEvent(service, {
      organizationId: job.organization_id,
      accountId: job.marketplace_account_id,
      eventType: 'ORDER_SYNC_FAILED',
      severity: exhausted || !retryable ? 'ERROR' : 'WARNING',
      errorCode: safeCode,
      message: safeMessage,
      metadata: { retryable, exhausted, attempt: job.attempt_count },
    });
  }
}

export async function processDueEbaySyncJobs(env: WorkerEnv): Promise<void> {
  const service = serviceClient(env);
  if (!service || !env.EBAY_TOKEN_ENCRYPTION_KEY) return;

  const now = Date.now();
  const { data: accounts } = await service.from('marketplace_accounts')
    .select('id,organization_id,auto_sync_interval_minutes,last_sync_at')
    .in('marketplace', ['EBAY_UK','EBAY_US','EBAY_DE'])
    .eq('is_demo', false)
    .eq('auth_status', 'CONNECTED')
    .limit(100);
  for (const account of accounts || []) {
    const { data: activeJobs } = await service.from('marketplace_sync_jobs')
      .select('id')
      .eq('marketplace_account_id', account.id)
      .in('status', ['QUEUED','RUNNING','FAILED'])
      .limit(1);
    if (activeJobs?.length) continue;
    const interval = Math.max(5, Math.min(1440, Number(account.auto_sync_interval_minutes) || 30));
    const dueAt = account.last_sync_at ? new Date(account.last_sync_at).getTime() + interval * 60_000 : 0;
    if (dueAt > now) continue;
    const slot = Math.floor(now / (interval * 60_000));
    await service.from('marketplace_sync_jobs').upsert({
      organization_id: account.organization_id,
      marketplace_account_id: account.id,
      idempotency_key: `auto:${account.id}:${slot}`,
      trigger_reason: 'SCHEDULED',
      status: 'QUEUED',
      scheduled_at: new Date().toISOString(),
    }, { onConflict: 'marketplace_account_id,idempotency_key', ignoreDuplicates: true });
  }

  const { data: jobs, error } = await service.rpc('claim_marketplace_sync_jobs', { p_limit: 5 });
  if (error || !jobs?.length) return;
  for (const job of jobs) await processOneJob(env, service, job);
}
