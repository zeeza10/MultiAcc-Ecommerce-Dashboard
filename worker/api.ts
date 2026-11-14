import { createClient } from '@supabase/supabase-js';
import { SupabaseProductRepository } from '../server/repositories/productRepository';
import { SupabaseInventoryRepository } from '../server/repositories/inventoryRepository';
import type { RepositoryContext } from '../server/repositories/context';

type WorkerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

type AuthContext = {
  user: { id: string; email: string; name: string; role: string; clientId?: string };
  organizationId: string;
  permissions: Set<string>;
  repositoryContext: RepositoryContext;
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

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
  if (method === 'GET' && path === '/products') return 'products.view';
  if (method === 'POST' && path === '/products') return 'products.create';
  if (method === 'GET' && path === '/inventory/balances') return 'inventory.view';
  if (method === 'GET' && path === '/inventory/ledger') return 'inventory.view';
  if (method === 'GET' && path === '/stock/adjustments') return 'inventory.view';
  if (method === 'POST' && path === '/stock/adjustments') return 'inventory.adjust';
  if (method === 'POST' && /^\/stock\/adjustments\/[^/]+\/decision$/.test(path)) return 'inventory.adjust';
  return undefined;
};

export async function handleApiRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
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
    if (path === '/products' && request.method === 'GET') {
      const repository = new SupabaseProductRepository(auth.repositoryContext);
      const isClientUser = auth.user.role === 'CLIENT_USER';
      const products = await repository.listForOrganization({
        client3plId: auth.user.clientId,
        onlyClientProducts: isClientUser,
      });
      const balances = await new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
        client3plId: auth.user.clientId,
        onlyClientProducts: isClientUser,
      });
      const balanceByProduct = new Map(balances.map(balance => [balance.productId, balance]));
      return json({ products: products.map(product => {
        const balance = balanceByProduct.get(product.id);
        return {
          ...product,
          stockOnHand: balance?.onHand || 0,
          stockReserved: balance?.reserved || 0,
          stockAvailable: balance?.available || 0,
          stockIncoming: balance?.incoming || 0,
          stockDamaged: balance?.damaged || 0,
        };
      }) });
    }

    if (path === '/products' && request.method === 'POST') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot create workspace products.' }, 403);
      const body = await request.json() as Record<string, unknown>;
      const repository = new SupabaseProductRepository(auth.repositoryContext);
      const product = await repository.createForOrganization({
        sku: String(body.sku || ''),
        name: String(body.name || ''),
        barcode: typeof body.barcode === 'string' ? body.barcode : undefined,
        dimensions: body.dimensions as any,
        weightKg: body.weightKg == null ? undefined : Number(body.weightKg),
        costPriceMinor: Number(body.costPriceMinor || 0),
        sellingPriceMinor: Number(body.sellingPriceMinor || 0),
        lowStockThreshold: Number(body.lowStockThreshold || 0),
        reorderLevel: Number(body.reorderLevel || 0),
        category: String(body.category || 'General'),
        ownerType: (body.ownerType === 'CLIENT' ? 'CLIENT' : 'OPERATOR') as any,
        ownerId: typeof body.ownerId === 'string' ? body.ownerId : undefined,
      });
      return json({ product }, 201);
    }

    const inventory = new SupabaseInventoryRepository(auth.repositoryContext);
    const isClientUser = auth.user.role === 'CLIENT_USER';
    const options = { client3plId: auth.user.clientId, onlyClientProducts: isClientUser };

    if (path === '/inventory/balances' && request.method === 'GET') {
      return json({ balances: await inventory.listBalances(options) });
    }
    if (path === '/inventory/ledger' && request.method === 'GET') {
      return json({ ledger: await inventory.listLedger(options) });
    }
    if (path === '/stock/adjustments' && request.method === 'GET') {
      return json({ adjustments: await inventory.listAdjustments(options) });
    }
    if (path === '/stock/adjustments' && request.method === 'POST') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot adjust workspace inventory.' }, 403);
      const body = await request.json() as Record<string, unknown>;
      const adjustment = await inventory.createAdjustment({
        productId: String(body.productId || ''),
        locationId: typeof body.locationId === 'string' ? body.locationId : undefined,
        quantityDelta: Number(body.quantityDelta),
        targetState: String(body.targetState || 'ON_HAND') as any,
        reasonCode: String(body.reasonCode || 'count_correction') as any,
        note: String(body.note || ''),
      });
      return json({ adjustment }, 201);
    }
    const decisionMatch = path.match(/^\/stock\/adjustments\/([^/]+)\/decision$/);
    if (decisionMatch && request.method === 'POST') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot approve inventory adjustments.' }, 403);
      const body = await request.json() as Record<string, unknown>;
      const decision = body.decision;
      if (decision !== 'APPROVE' && decision !== 'REJECT') return json({ error: 'A valid adjustment decision is required.' }, 400);
      const adjustment = await inventory.decideAdjustment(
        decisionMatch[1],
        decision,
        typeof body.approvalNote === 'string' ? body.approvalNote : '',
      );
      return json({ adjustment });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const expected = /required|must |invalid|unsupported|between|too long|not found|inactive|authorized|amount|select|decision|stock|adjustment/i.test(message);
    return json({ error: expected ? message : 'The workspace database request could not be completed.' }, expected ? 400 : 500);
  }

  return json({ error: 'API route not found.' }, 404);
}
