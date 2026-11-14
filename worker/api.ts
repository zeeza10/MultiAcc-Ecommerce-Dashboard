import { createClient } from '@supabase/supabase-js';
import { handleDashboardRoute } from './routes/dashboard';
import { handleMarketplaceRoute } from './routes/marketplace';
import { handleSystemRoute } from './routes/system';
import { handleFulfilmentRoute } from './routes/fulfilment';
import { handleFinanceRoute } from './routes/finance';
import { json } from './http';
import type { AuthContext, WorkerEnv } from './types';
import { SupabaseProductRepository } from '../server/repositories/productRepository';
import { SupabaseInventoryRepository } from '../server/repositories/inventoryRepository';
import { SupabaseOrderRepository } from '../server/repositories/orderRepository';
import { SupabasePurchasingRepository } from '../server/repositories/purchasingRepository';
import { SupabaseReturnRepository } from '../server/repositories/returnRepository';
import { SupabaseWarehouseRepository } from '../server/repositories/warehouseRepository';

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
    if (path === '/orders' && request.method === 'GET') {
      const repository = new SupabaseOrderRepository(auth.repositoryContext);
      const isClientUser = auth.user.role === 'CLIENT_USER';
      const orders = await repository.listOrders({
        status: url.searchParams.get('status') || undefined,
        accountId: url.searchParams.get('accountId') || undefined,
        search: url.searchParams.get('search') || undefined,
        client3plId: auth.user.clientId,
        onlyClientOrders: isClientUser,
      });
      return json({ orders });
    }

    const orderDetailMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderDetailMatch && request.method === 'GET') {
      const result = await new SupabaseOrderRepository(auth.repositoryContext).getOrder(orderDetailMatch[1], {
        client3plId: auth.user.clientId,
        onlyClientOrders: auth.user.role === 'CLIENT_USER',
      });
      return result ? json(result) : json({ error: 'Order not found in this workspace.' }, 404);
    }

    if (path === '/orders' && request.method === 'POST') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot create workspace orders.' }, 403);
      const body = await request.json() as Record<string, unknown>;
      const order = await new SupabaseOrderRepository(auth.repositoryContext).createOrder(body);
      return json({ order }, 201);
    }

    const orderTransitionMatch = path.match(/^\/orders\/([^/]+)\/transition$/);
    if (orderTransitionMatch && request.method === 'POST') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot transition workspace orders.' }, 403);
      const body = await request.json() as Record<string, unknown>;
      if (typeof body.targetStatus !== 'string' || !body.targetStatus.trim()) {
        return json({ error: 'A target order status is required.' }, 400);
      }
      const order = await new SupabaseOrderRepository(auth.repositoryContext).transitionOrder(
        orderTransitionMatch[1],
        body.targetStatus as any,
        {
          carrier: typeof body.carrier === 'string' ? body.carrier : undefined,
          trackingNumber: typeof body.trackingNumber === 'string' ? body.trackingNumber : undefined,
          note: typeof body.note === 'string' ? body.note : undefined,
        },
      );
      return json({ order });
    }

    if (path === '/suppliers' && request.method === 'GET') {
      const suppliers = await new SupabasePurchasingRepository(auth.repositoryContext).listSuppliers();
      return json({ suppliers });
    }

    if (path === '/suppliers' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const supplier = await new SupabasePurchasingRepository(auth.repositoryContext).createSupplier({
        name: String(body.name || ''),
        code: String(body.code || ''),
        contactName: typeof body.contactName === 'string' ? body.contactName : undefined,
        email: typeof body.email === 'string' ? body.email : undefined,
        phone: typeof body.phone === 'string' ? body.phone : undefined,
        paymentTermsDays: Number(body.paymentTermsDays),
        currency: String(body.currency || ''),
        leadTimeDays: Number(body.leadTimeDays),
      });
      return json({ supplier }, 201);
    }

    if (path === '/purchase-orders' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      if (typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) {
        return json({ error: 'An idempotency key is required to create a purchase order.' }, 400);
      }
      const purchaseOrder = await new SupabasePurchasingRepository(auth.repositoryContext).createPurchaseOrder(body, body.idempotencyKey);
      return json({ purchaseOrder }, 201);
    }

    const purchaseOrderActionMatch = path.match(/^\/purchase-orders\/([^/]+)\/(approve|receive)$/);
    if (purchaseOrderActionMatch && request.method === 'POST') {
      const repository = new SupabasePurchasingRepository(auth.repositoryContext);
      if (purchaseOrderActionMatch[2] === 'approve') {
        const purchaseOrder = await repository.approvePurchaseOrder(purchaseOrderActionMatch[1]);
        return json({ purchaseOrder });
      }
      const body = await request.json() as Record<string, unknown>;
      if (!Array.isArray(body.items) || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) {
        return json({ error: 'Receipt items and an idempotency key are required.' }, 400);
      }
      const result = await repository.receivePurchaseOrder(
        purchaseOrderActionMatch[1],
        body.items as Array<{ productId: string; receivedQty: number; damagedQty: number; locationId?: string }>,
        typeof body.discrepancyNote === 'string' ? body.discrepancyNote : undefined,
        body.idempotencyKey,
      );
      return json(result, 201);
    }

    if (path === '/purchase-orders' && request.method === 'GET') {
      const repository = new SupabasePurchasingRepository(auth.repositoryContext);
      const [purchaseOrders, receipts] = await Promise.all([
        repository.listPurchaseOrders(),
        repository.listGoodsReceipts(),
      ]);
      return json({ purchaseOrders, receipts });
    }

    if (path === '/returns' && request.method === 'GET') {
      const returns = await new SupabaseReturnRepository(auth.repositoryContext).listReturns();
      return json({ returns });
    }

    const returnDispositionMatch = path.match(/^\/returns\/([^/]+)\/disposition$/);
    if (returnDispositionMatch && request.method === 'POST') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot process workspace returns.' }, 403);
      const body = await request.json() as Record<string, unknown>;
      if (!Array.isArray(body.dispositions) || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim()) {
        return json({ error: 'Return dispositions and an idempotency key are required.' }, 400);
      }
      const result = await new SupabaseReturnRepository(auth.repositoryContext).processDisposition(
        returnDispositionMatch[1],
        body.dispositions as Array<{ lineId: string; disposition: string; quantity: number }>,
        Boolean(body.issueRefund),
        body.idempotencyKey,
      );
      return json(result);
    }

    const fulfilmentResponse = await handleFulfilmentRoute(path, request, auth);
    if (fulfilmentResponse) return fulfilmentResponse;
    const financeResponse = await handleFinanceRoute(path, request, url, auth);
    if (financeResponse) return financeResponse;

    if (path === '/warehouses' && request.method === 'GET') {
      if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot view the workspace-wide warehouse layout.' }, 403);
      const layout = await new SupabaseWarehouseRepository(auth.repositoryContext).getLayout();
      return json(layout);
    }

    if (path === '/warehouses' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const warehouse = await new SupabaseWarehouseRepository(auth.repositoryContext).createWarehouse({
        name: String(body.name || ''),
        code: String(body.code || ''),
        address: typeof body.address === 'string' ? body.address : undefined,
      });
      return json({ warehouse }, 201);
    }

    const locationCreateMatch = path.match(/^\/warehouses\/([^/]+)\/locations$/);
    if (locationCreateMatch && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>;
      const location = await new SupabaseWarehouseRepository(auth.repositoryContext).createLocation({
        warehouseId: locationCreateMatch[1],
        locationCode: String(body.locationCode || ''),
        locationType: String(body.locationType || ''),
        zone: typeof body.zone === 'string' ? body.zone : undefined,
        aisle: typeof body.aisle === 'string' ? body.aisle : undefined,
        shelf: typeof body.shelf === 'string' ? body.shelf : undefined,
        bin: typeof body.bin === 'string' ? body.bin : undefined,
        capacityUnits: body.capacityUnits == null ? undefined : Number(body.capacityUnits),
      });
      return json({ location }, 201);
    }

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
