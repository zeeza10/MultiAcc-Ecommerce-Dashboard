import { createClient } from '@supabase/supabase-js';
import { handleDashboardRoute } from './routes/dashboard';
import { handleMarketplaceRoute } from './routes/marketplace';
import { handleSystemRoute } from './routes/system';
import { handleFulfilmentRoute } from './routes/fulfilment';
import { handleFinanceRoute } from './routes/finance';
import { handleOrderPurchasingRoute } from './routes/orders-purchasing';
import { handleReturnRoute } from './routes/returns';
import { handleInventoryRoute } from './routes/inventory';
import { json } from './http';
import type { AuthContext, WorkerEnv } from './types';

const validRoles = new Set(['SUPER_ADMIN', 'OPS_MANAGER', 'WAREHOUSE_STAFF', 'FINANCE_USER', 'CLIENT_USER', 'VIEWER']);

async function authenticate(request: Request, env: WorkerEnv): Promise<AuthContext | Response> {
  const authorization = request.headers.get('Authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;

  if (!token) return json({ error: 'A valid Supabase bearer token is required.' }, 401);
  if (!url || !key) return json({ error: 'Supabase API configuration is missing.' }, 503);

  const client = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'Your session is invalid or expired. Please sign in again.' }, 401);

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,full_name,is_active,two_factor_enabled,created_at')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.is_active) {
    return json({ error: 'Your account is inactive or its profile is unavailable.' }, 403);
  }

  const requestedOrganizationId = request.headers.get('X-Organization-Id')?.trim();
  let membershipQuery = client
    .from('organization_members')
    .select('organization_id,role_id,client_3pl_id,roles(code)')
    .eq('user_id', authData.user.id)
    .eq('is_active', true);

  if (requestedOrganizationId) {
    membershipQuery = membershipQuery.eq('organization_id', requestedOrganizationId).limit(1);
  } else {
    membershipQuery = membershipQuery.order('joined_at', { ascending: true }).limit(2);
  }

  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) return json({ error: 'Workspace membership could not be verified.' }, 403);
  if (!memberships?.length) return json({ error: 'You are not an active member of the requested workspace.' }, 403);
  if (!requestedOrganizationId && memberships.length > 1) {
    return json({ error: 'Select an active workspace before making API requests.' }, 409);
  }

  const membership = memberships[0] as any;
  const relation = membership.roles;
  const roleCode = Array.isArray(relation) ? relation[0]?.code : relation?.code;
  if (!validRoles.has(roleCode)) return json({ error: 'Your workspace role is not valid.' }, 403);

  const { data: permissionRows, error: permissionError } = await client
    .from('role_permissions')
    .select('permissions(code)')
    .eq('role_id', membership.role_id);
  if (permissionError) return json({ error: 'Workspace permissions could not be verified.' }, 403);

  const permissions = new Set<string>(
    roleCode === 'SUPER_ADMIN'
      ? ['*']
      : (permissionRows || []).map((row: any) => {
          const permission = row.permissions;
          return Array.isArray(permission) ? permission[0]?.code : permission?.code;
        }).filter((code: unknown): code is string => typeof code === 'string'),
  );

  return {
    user: {
      id: authData.user.id,
      email: authData.user.email || '',
      name: profile.full_name || authData.user.email || 'User',
      role: roleCode,
      clientId: membership.client_3pl_id || undefined,
    },
    organizationId: membership.organization_id,
    permissions,
    repositoryContext: {
      supabase: client,
      organizationId: membership.organization_id,
      userId: authData.user.id,
      permissions,
    },
  };
}

const permissionByRoute = (method: string, path: string): string | null | undefined => {
  if (method === 'GET' && /^\/(auth\/me|me)\/?$/.test(path)) return null;
  if (method === 'GET' && /^\/dashboard\/(kpis|charts)$/.test(path)) return 'dashboard.view';
  if (method === 'GET' && path === '/ebay/accounts') return 'marketplace.view';
  if (method === 'GET' && path === '/ebay/exceptions') return 'marketplace.view';
  if (method === 'POST' && /^\/ebay\/exceptions\/[^/]+\/resolve$/.test(path)) return 'marketplace.manage';
  if (method === 'GET' && path === '/audit-logs') return 'audit.view';
  if (method === 'GET' && path === '/notifications') return 'dashboard.view';
  if (method === 'POST' && /^\/notifications\/[^/]+\/dismiss$/.test(path)) return 'dashboard.view';
  if (method === 'GET' && path === '/products') return 'products.view';
  if (method === 'POST' && path === '/products') return 'products.create';
  if (method === 'GET' && path === '/inventory/balances') return 'inventory.view';
  if (method === 'GET' && path === '/inventory/ledger') return 'inventory.view';
  if (method === 'GET' && path === '/stock/adjustments') return 'inventory.view';
  if (method === 'POST' && path === '/stock/adjustments') return 'inventory.adjust';
  if (method === 'POST' && /^\/stock\/adjustments\/[^/]+\/decision$/.test(path)) return 'inventory.adjust';
  if (method === 'GET' && path === '/orders') return 'orders.view';
  if (method === 'GET' && /^\/orders\/[^/]+$/.test(path)) return 'orders.view';
  if (method === 'POST' && path === '/orders') return 'orders.create';
  if (method === 'POST' && /^\/orders\/[^/]+\/transition$/.test(path)) return 'orders.edit';
  if (method === 'GET' && path === '/suppliers') return 'purchasing.view';
  if (method === 'POST' && path === '/suppliers') return 'purchasing.manage';
  if (method === 'POST' && path === '/purchase-orders') return 'purchasing.manage';
  if (method === 'POST' && /^\/purchase-orders\/[^/]+\/(approve|receive)$/.test(path)) return 'purchasing.manage';
  if (method === 'GET' && path === '/purchase-orders') return 'purchasing.view';
  if (method === 'GET' && path === '/returns') return 'returns.view';
  if (method === 'POST' && /^\/returns\/[^/]+\/disposition$/.test(path)) return 'returns.manage';
  if (method === 'GET' && path === '/3pl/clients') return 'fulfilment.view';
  if (method === 'GET' && path === '/3pl/storage-snapshots') return 'fulfilment.view';
  if (method === 'GET' && path === '/warehouse-services/summary') return 'fulfilment.view';
  if (method === 'GET' && path === '/warehouse-services/packaging') return 'fulfilment.view';
  if (method === 'GET' && path === '/warehouse-services/shipping') return 'fulfilment.view';
  if (method === 'GET' && path === '/finance/invoices') return 'finance.view';
  if (method === 'GET' && path === '/finance/payments') return 'finance.view';
  if (method === 'GET' && path === '/finance/expenses') return 'finance.view';
  if (method === 'GET' && path === '/finance/ledger') return 'finance.view';
  if (method === 'GET' && path === '/payouts') return 'finance.view';
  if (method === 'GET' && path === '/reconciliation') return 'finance.view';
  if (method === 'GET' && path === '/warehouses') return 'inventory.view';
  if (method === 'POST' && path === '/warehouses') return 'inventory.manage';
  if (method === 'POST' && /^\/warehouses\/[^/]+\/locations$/.test(path)) return 'inventory.manage';
  return undefined;
};

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health' || url.pathname === '/api/v1/health') {
    return json({ success: true, message: 'MultiAcc Backend Worker is running', platform: 'Cloudflare Workers' });
  }
  if (!url.pathname.startsWith('/api/v1/')) return json({ error: 'API route not found.' }, 404);

  const path = url.pathname.slice('/api/v1'.length).replace(/\/$/, '') || '/';
  const auth = await authenticate(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'GET' && (path === '/auth/me' || path === '/me')) {
    return json({ user: { ...auth.user, isActive: true }, organizationId: auth.organizationId });
  }

  const requiredPermission = permissionByRoute(request.method, path);
  if (requiredPermission === undefined) {
    return json({ error: 'This API module has not yet been migrated to the Cloudflare Worker.' }, 501);
  }
  if (requiredPermission && !auth.permissions.has('*') && !auth.permissions.has(requiredPermission)) {
    return json({ error: 'You do not have permission to perform this action in the selected workspace.' }, 403);
  }

  try {
    const orderPurchasingResponse = await handleOrderPurchasingRoute(path, request, url, auth);
    if (orderPurchasingResponse) return orderPurchasingResponse;
    const returnResponse = await handleReturnRoute(path, request, auth);
    if (returnResponse) return returnResponse;

    const fulfilmentResponse = await handleFulfilmentRoute(path, request, auth);
    if (fulfilmentResponse) return fulfilmentResponse;
    const financeResponse = await handleFinanceRoute(path, request, url, auth);
    if (financeResponse) return financeResponse;

    const inventoryResponse = await handleInventoryRoute(path, request, auth);
    if (inventoryResponse) return inventoryResponse;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const expected = /required|must |invalid|unsupported|between|too long|not found|inactive|authorized|amount|select|decision|stock|adjustment/i.test(message);
    return json({ error: expected ? message : 'The workspace database request could not be completed.' }, expected ? 400 : 500);
  }

  return json({ error: 'API route not found.' }, 404);
}
