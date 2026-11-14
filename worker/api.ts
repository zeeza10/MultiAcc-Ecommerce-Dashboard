import { createClient } from '@supabase/supabase-js';
import { SupabaseProductRepository } from '../server/repositories/productRepository';
import { SupabaseInventoryRepository } from '../server/repositories/inventoryRepository';
import { SupabaseOrderRepository } from '../server/repositories/orderRepository';
import { SupabasePurchasingRepository } from '../server/repositories/purchasingRepository';
import { SupabaseReturnRepository } from '../server/repositories/returnRepository';
import { SupabaseWarehouseRepository } from '../server/repositories/warehouseRepository';
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
  if (method === 'GET' && /^\/dashboard\/(kpis|charts)$/.test(path)) return 'dashboard.view';
  if (method === 'GET' && path === '/ebay/accounts') return 'marketplace.view';
  if (method === 'GET' && path === '/ebay/exceptions') return 'marketplace.view';
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

    if (path === '/3pl/clients' && request.method === 'GET') {
      const [clientsResult, ratesResult] = await Promise.all([
        auth.repositoryContext.supabase.from('clients_3pl')
          .select('id,company_name,code,contact_email,contact_phone,billing_address,billing_period,rate_card_id,account_status,created_at')
          .eq('organization_id', auth.organizationId).order('company_name', { ascending: true }),
        auth.repositoryContext.supabase.from('rate_cards')
          .select('id,name,pick_fee_minor,pack_fee_minor,extra_item_fee_minor,storage_pallet_per_month_minor,storage_shelf_per_month_minor,storage_bin_per_month_minor,minimum_monthly_charge_minor,currency')
          .eq('organization_id', auth.organizationId).order('name', { ascending: true }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (ratesResult.error) throw ratesResult.error;
      const rateCards = (ratesResult.data || []).map(row => ({
        id: row.id, name: row.name, pickFeeMinor: Number(row.pick_fee_minor), packFeeMinor: Number(row.pack_fee_minor),
        extraItemFeeMinor: Number(row.extra_item_fee_minor), storagePalletPerMonthMinor: Number(row.storage_pallet_per_month_minor),
        storageShelfPerMonthMinor: Number(row.storage_shelf_per_month_minor), storageBinPerMonthMinor: Number(row.storage_bin_per_month_minor),
        minimumMonthlyChargeMinor: Number(row.minimum_monthly_charge_minor),
      }));
      return json({ clients: (clientsResult.data || []).map(row => ({
        id: row.id, companyName: row.company_name, code: row.code, contactEmail: row.contact_email || '',
        contactPhone: row.contact_phone || '', billingAddress: typeof row.billing_address === 'string' ? row.billing_address : JSON.stringify(row.billing_address || {}),
        billingPeriod: row.billing_period, rateCardId: row.rate_card_id || '', accountStatus: row.account_status, createdAt: row.created_at,
      })), rateCards });
    }

    if (path === '/3pl/storage-snapshots' && request.method === 'GET') {
      const { data: snapshots, error } = await auth.repositoryContext.supabase.from('storage_snapshots')
        .select('id,client_3pl_id,snapshot_date,occupied_pallets,occupied_shelves,occupied_bins,estimated_cost_minor,currency')
        .eq('organization_id', auth.organizationId).order('snapshot_date', { ascending: false });
      if (error) throw error;
      const clientIds = [...new Set((snapshots || []).map(row => row.client_3pl_id))];
      const { data: clients, error: clientError } = clientIds.length
        ? await auth.repositoryContext.supabase.from('clients_3pl').select('id,company_name')
            .eq('organization_id', auth.organizationId).in('id', clientIds)
        : { data: [], error: null };
      if (clientError) throw clientError;
      const names = new Map((clients || []).map(row => [row.id, row.company_name]));
      return json({ snapshots: (snapshots || []).map(row => ({
        id: row.id, clientId: row.client_3pl_id, clientName: names.get(row.client_3pl_id) || '',
        snapshotDate: row.snapshot_date, occupiedPallets: Number(row.occupied_pallets),
        occupiedShelves: Number(row.occupied_shelves), occupiedBins: Number(row.occupied_bins),
        estimatedCostMinor: Number(row.estimated_cost_minor),
      })) });
    }

    if (path === '/warehouse-services/packaging' && request.method === 'GET') {
      const { data: jobs, error } = await auth.repositoryContext.supabase.from('packaging_jobs')
        .select('id,job_number,client_3pl_id,job_date,packaging_type,quantity,material_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,performed_by,notes')
        .eq('organization_id', auth.organizationId).order('job_date', { ascending: false });
      if (error) throw error;
      const clientIds = [...new Set((jobs || []).map(row => row.client_3pl_id))];
      const orderIds = [...new Set((jobs || []).map(row => row.order_id).filter(Boolean))];
      const [clientsResult, ordersResult] = await Promise.all([
        clientIds.length ? auth.repositoryContext.supabase.from('clients_3pl').select('id,company_name').eq('organization_id', auth.organizationId).in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        orderIds.length ? auth.repositoryContext.supabase.from('orders').select('id,order_number').eq('organization_id', auth.organizationId).in('id', orderIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (ordersResult.error) throw ordersResult.error;
      const clients = new Map((clientsResult.data || []).map(row => [row.id, row.company_name]));
      const orders = new Map((ordersResult.data || []).map(row => [row.id, row.order_number]));
      return json({ packagingJobs: (jobs || []).map(row => ({
        id: row.id, jobNumber: row.job_number, clientId: row.client_3pl_id, clientName: clients.get(row.client_3pl_id) || '',
        date: row.job_date, packagingType: row.packaging_type, quantity: Number(row.quantity),
        materialCostMinor: Number(row.material_cost_minor), serviceChargeMinor: Number(row.service_charge_minor),
        totalChargeMinor: Number(row.total_charge_minor), status: row.status, invoiceId: row.invoice_id || undefined,
        orderNumber: row.order_id ? orders.get(row.order_id) : undefined, performedBy: row.performed_by || '', notes: row.notes || undefined,
      })) });
    }

    if (path === '/warehouse-services/shipping' && request.method === 'GET') {
      const { data: jobs, error } = await auth.repositoryContext.supabase.from('shipping_jobs')
        .select('id,dispatch_id,client_3pl_id,job_date,carrier,tracking_number,service_level,parcel_weight_kg,carrier_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,destination')
        .eq('organization_id', auth.organizationId).order('job_date', { ascending: false });
      if (error) throw error;
      const clientIds = [...new Set((jobs || []).map(row => row.client_3pl_id))];
      const orderIds = [...new Set((jobs || []).map(row => row.order_id).filter(Boolean))];
      const [clientsResult, ordersResult] = await Promise.all([
        clientIds.length ? auth.repositoryContext.supabase.from('clients_3pl').select('id,company_name').eq('organization_id', auth.organizationId).in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        orderIds.length ? auth.repositoryContext.supabase.from('orders').select('id,order_number').eq('organization_id', auth.organizationId).in('id', orderIds) : Promise.resolve({ data: [], error: null }),
      ]);
      if (clientsResult.error) throw clientsResult.error;
      if (ordersResult.error) throw ordersResult.error;
      const clients = new Map((clientsResult.data || []).map(row => [row.id, row.company_name]));
      const orders = new Map((ordersResult.data || []).map(row => [row.id, row.order_number]));
      return json({ shippingJobs: (jobs || []).map(row => ({
        id: row.id, dispatchId: row.dispatch_id, clientId: row.client_3pl_id, clientName: clients.get(row.client_3pl_id) || '',
        date: row.job_date, carrier: row.carrier, trackingNumber: row.tracking_number || '', serviceLevel: row.service_level || '',
        parcelWeightKg: Number(row.parcel_weight_kg), carrierCostMinor: Number(row.carrier_cost_minor),
        serviceChargeMinor: Number(row.service_charge_minor), totalChargeMinor: Number(row.total_charge_minor),
        status: row.status, invoiceId: row.invoice_id || undefined, orderNumber: row.order_id ? orders.get(row.order_id) || '' : '',
        destination: typeof row.destination === 'string' ? row.destination : JSON.stringify(row.destination || {}),
      })) });
    }

    if (path === '/warehouse-services/summary' && request.method === 'GET') {
      const [packaging, shipping, storage] = await Promise.all([
        auth.repositoryContext.supabase.from('packaging_jobs').select('id,status,total_charge_minor').eq('organization_id', auth.organizationId),
        auth.repositoryContext.supabase.from('shipping_jobs').select('id,status,total_charge_minor').eq('organization_id', auth.organizationId),
        auth.repositoryContext.supabase.from('storage_snapshots').select('id,estimated_cost_minor').eq('organization_id', auth.organizationId),
      ]);
      if (packaging.error) throw packaging.error;
      if (shipping.error) throw shipping.error;
      if (storage.error) throw storage.error;
      const packagingRows = packaging.data || [];
      const shippingRows = shipping.data || [];
      const storageRows = storage.data || [];
      return json({ summary: {
        packagingJobs: packagingRows.length, shippingJobs: shippingRows.length, storageSnapshots: storageRows.length,
        packagingChargesMinor: packagingRows.reduce((sum, row) => sum + Number(row.total_charge_minor), 0),
        shippingChargesMinor: shippingRows.reduce((sum, row) => sum + Number(row.total_charge_minor), 0),
        storageEstimatedCostMinor: storageRows.reduce((sum, row) => sum + Number(row.estimated_cost_minor), 0),
      } });
    }

    if (path === '/finance/invoices' && request.method === 'GET') {
      const { data: invoices, error } = await auth.repositoryContext.supabase
        .from('invoices')
        .select('id,invoice_number,invoice_type,recipient_type,recipient_id,recipient_name,issue_date,due_date,subtotal_minor,vat_rate_percent,vat_amount_minor,total_minor,paid_amount_minor,currency,status,void_reason,is_immutable,created_at')
        .eq('organization_id', auth.organizationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (invoices || []).map(row => row.id);
      const { data: items, error: itemError } = ids.length
        ? await auth.repositoryContext.supabase.from('invoice_items')
            .select('id,invoice_id,description,quantity,unit_price_minor,total_minor')
            .eq('organization_id', auth.organizationId).in('invoice_id', ids)
        : { data: [], error: null };
      if (itemError) throw itemError;
      const linesByInvoice = new Map<string, any[]>();
      for (const item of items || []) {
        const lines = linesByInvoice.get(item.invoice_id) || [];
        lines.push({ description: item.description, quantity: Number(item.quantity), unitPriceMinor: Number(item.unit_price_minor), totalMinor: Number(item.total_minor) });
        linesByInvoice.set(item.invoice_id, lines);
      }
      return json({ invoices: (invoices || []).map(row => ({
        id: row.id, invoiceNumber: row.invoice_number, type: row.invoice_type, recipientType: row.recipient_type,
        recipientId: row.recipient_id || '', recipientName: row.recipient_name, issueDate: row.issue_date, dueDate: row.due_date,
        subtotalMinor: Number(row.subtotal_minor), vatRatePercent: Number(row.vat_rate_percent), vatAmountMinor: Number(row.vat_amount_minor),
        totalMinor: Number(row.total_minor), paidAmountMinor: Number(row.paid_amount_minor), status: row.status,
        lines: linesByInvoice.get(row.id) || [], voidReason: row.void_reason || undefined,
        isImmutable: Boolean(row.is_immutable), createdAt: row.created_at,
      })) });
    }

    if (path === '/finance/payments' && request.method === 'GET') {
      const { data: payments, error } = await auth.repositoryContext.supabase
        .from('payments')
        .select('id,payment_number,amount_minor,currency,payment_method,payment_date,reference,payer_name,unallocated_credit_minor,recorded_by,created_at')
        .eq('organization_id', auth.organizationId)
        .order('payment_date', { ascending: false });
      if (error) throw error;
      const paymentIds = (payments || []).map(row => row.id);
      const { data: allocations, error: allocationError } = paymentIds.length
        ? await auth.repositoryContext.supabase.from('payment_allocations')
            .select('id,payment_id,invoice_id,amount_minor')
            .eq('organization_id', auth.organizationId).in('payment_id', paymentIds)
        : { data: [], error: null };
      if (allocationError) throw allocationError;
      const invoiceIds = [...new Set((allocations || []).map(row => row.invoice_id))];
      const { data: invoices, error: invoiceError } = invoiceIds.length
        ? await auth.repositoryContext.supabase.from('invoices').select('id,invoice_number')
            .eq('organization_id', auth.organizationId).in('id', invoiceIds)
        : { data: [], error: null };
      if (invoiceError) throw invoiceError;
      const invoiceNumbers = new Map((invoices || []).map(row => [row.id, row.invoice_number]));
      const allocationsByPayment = new Map<string, any[]>();
      for (const allocation of allocations || []) {
        const rows = allocationsByPayment.get(allocation.payment_id) || [];
        rows.push({ invoiceId: allocation.invoice_id, invoiceNumber: invoiceNumbers.get(allocation.invoice_id) || '', amountMinor: Number(allocation.amount_minor) });
        allocationsByPayment.set(allocation.payment_id, rows);
      }
      return json({ payments: (payments || []).map(row => ({
        id: row.id, paymentNumber: row.payment_number, amountMinor: Number(row.amount_minor), paymentMethod: row.payment_method,
        paymentDate: row.payment_date, reference: row.reference || '', payerName: row.payer_name || '',
        allocations: allocationsByPayment.get(row.id) || [], unallocatedCreditMinor: Number(row.unallocated_credit_minor),
        recordedBy: row.recorded_by || '', createdAt: row.created_at,
      })) });
    }

    if (path === '/finance/expenses' && request.method === 'GET') {
      const { data, error } = await auth.repositoryContext.supabase
        .from('expenses')
        .select('id,expense_number,category,supplier_name,expense_date,amount_minor,vat_minor,currency,allocated_to,status,approved_by,note')
        .eq('organization_id', auth.organizationId)
        .order('expense_date', { ascending: false });
      if (error) throw error;
      return json({ expenses: (data || []).map(row => ({
        id: row.id, expenseNumber: row.expense_number, category: row.category, supplierName: row.supplier_name || '',
        date: row.expense_date, amountMinor: Number(row.amount_minor), vatMinor: Number(row.vat_minor),
        allocatedTo: row.allocated_to || undefined, status: row.status, approvedBy: row.approved_by || undefined, note: row.note || undefined,
      })) });
    }

    if (path === '/finance/ledger' && request.method === 'GET') {
      const { data: entries, error } = await auth.repositoryContext.supabase
        .from('journal_entries')
        .select('id,source_type,source_id,description,created_at,status')
        .eq('organization_id', auth.organizationId)
        .eq('status', 'POSTED')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const entryIds = (entries || []).map(row => row.id);
      const { data: lines, error: lineError } = entryIds.length
        ? await auth.repositoryContext.supabase.from('journal_entry_lines')
            .select('id,journal_entry_id,account_id,debit_minor,credit_minor,description')
            .eq('organization_id', auth.organizationId).in('journal_entry_id', entryIds)
        : { data: [], error: null };
      if (lineError) throw lineError;
      const accountIds = [...new Set((lines || []).map(row => row.account_id))];
      const { data: accounts, error: accountError } = accountIds.length
        ? await auth.repositoryContext.supabase.from('chart_of_accounts')
            .select('id,account_code,account_name').eq('organization_id', auth.organizationId).in('id', accountIds)
        : { data: [], error: null };
      if (accountError) throw accountError;
      const entryById = new Map((entries || []).map(row => [row.id, row]));
      const accountById = new Map((accounts || []).map(row => [row.id, row]));
      return json({ ledger: (lines || []).map(line => {
        const entry = entryById.get(line.journal_entry_id);
        const account = accountById.get(line.account_id);
        return {
          id: line.id, accountId: account?.account_code || line.account_id, accountName: account?.account_name || 'Unknown account',
          debitMinor: Number(line.debit_minor), creditMinor: Number(line.credit_minor),
          sourceType: entry?.source_type || 'EXPENSE', sourceId: entry?.source_id || '',
          note: line.description || entry?.description || undefined, createdAt: entry?.created_at || '',
        };
      }) });
    }

    if (path === '/payouts' && request.method === 'GET') {
      if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view')) {
        return json({ error: 'Marketplace account access is required to view payout account details.' }, 403);
      }
      let query = auth.repositoryContext.supabase
        .from('marketplace_payouts')
        .select('id,payout_reference,marketplace_account_id,total_sales_minor,total_fees_minor,refunds_minor,shipping_adjustments_minor,other_adjustments_minor,net_payout_minor,currency,payout_date,status,transaction_id,bank_deposit_status,bank_reference,notes')
        .eq('organization_id', auth.organizationId).order('payout_date', { ascending: false });
      const accountId = url.searchParams.get('accountId');
      if (accountId && accountId !== 'ALL') query = query.eq('marketplace_account_id', accountId);
      const { data: payouts, error } = await query;
      if (error) throw error;
      const accountIds = [...new Set((payouts || []).map(row => row.marketplace_account_id))];
      const { data: accounts, error: accountError } = accountIds.length
        ? await auth.repositoryContext.supabase.from('marketplace_accounts').select('id,name')
            .eq('organization_id', auth.organizationId).in('id', accountIds)
        : { data: [], error: null };
      if (accountError) throw accountError;
      const payoutIds = (payouts || []).map(row => row.id);
      const { data: payoutOrders, error: orderError } = payoutIds.length
        ? await auth.repositoryContext.supabase.from('payout_orders').select('payout_id,order_id')
            .eq('organization_id', auth.organizationId).in('payout_id', payoutIds)
        : { data: [], error: null };
      if (orderError) throw orderError;
      const accountNames = new Map((accounts || []).map(row => [row.id, row.name]));
      const ordersByPayout = new Map<string, string[]>();
      for (const row of payoutOrders || []) {
        const ids = ordersByPayout.get(row.payout_id) || [];
        ids.push(row.order_id);
        ordersByPayout.set(row.payout_id, ids);
      }
      return json({ payouts: (payouts || []).map(row => ({
        id: row.id, payoutId: row.payout_reference, marketplaceAccountId: row.marketplace_account_id,
        accountName: accountNames.get(row.marketplace_account_id) || '', totalSalesMinor: Number(row.total_sales_minor),
        totalFeesMinor: Number(row.total_fees_minor), refundsMinor: Number(row.refunds_minor),
        shippingAdjustmentsMinor: Number(row.shipping_adjustments_minor), otherAdjustmentsMinor: Number(row.other_adjustments_minor),
        netPayoutMinor: Number(row.net_payout_minor), currency: row.currency.trim(), payoutDate: row.payout_date,
        status: row.status, transactionId: row.transaction_id || '', bankDepositStatus: row.bank_deposit_status,
        bankReference: row.bank_reference || undefined, orderIds: ordersByPayout.get(row.id) || [], notes: row.notes || undefined,
      })) });
    }

    if (path === '/reconciliation' && request.method === 'GET') {
      if (!auth.permissions.has('*') && !auth.permissions.has('marketplace.view')) {
        return json({ error: 'Marketplace account access is required to view reconciliation account details.' }, 403);
      }
      let query = auth.repositoryContext.supabase
        .from('financial_reconciliations')
        .select('id,period,marketplace_account_id,expected_payout_minor,actual_payout_minor,difference_minor,unmatched_transactions_count,status,last_reconciled_at,reconciled_by,audit_notes,breakdown')
        .eq('organization_id', auth.organizationId).order('created_at', { ascending: false });
      const accountId = url.searchParams.get('accountId');
      if (accountId && accountId !== 'ALL') query = query.eq('marketplace_account_id', accountId);
      const { data: reconciliations, error } = await query;
      if (error) throw error;
      const accountIds = [...new Set((reconciliations || []).map(row => row.marketplace_account_id).filter(Boolean))];
      const { data: accounts, error: accountError } = accountIds.length
        ? await auth.repositoryContext.supabase.from('marketplace_accounts').select('id,name')
            .eq('organization_id', auth.organizationId).in('id', accountIds)
        : { data: [], error: null };
      if (accountError) throw accountError;
      const accountNames = new Map((accounts || []).map(row => [row.id, row.name]));
      return json({ reconciliations: (reconciliations || []).map(row => ({
        id: row.id, period: row.period, marketplaceAccountId: row.marketplace_account_id || '',
        accountName: accountNames.get(row.marketplace_account_id) || '', expectedPayoutMinor: Number(row.expected_payout_minor),
        actualPayoutMinor: Number(row.actual_payout_minor), differenceMinor: Number(row.difference_minor),
        unmatchedTransactionsCount: Number(row.unmatched_transactions_count), status: row.status,
        lastReconciledAt: row.last_reconciled_at || '', reconciledBy: row.reconciled_by || '',
        auditNotes: row.audit_notes || '', breakdown: row.breakdown,
      })) });
    }

    if (path === '/dashboard/kpis' && request.method === 'GET') {
      const period = url.searchParams.get('period') || '30D';
      const accountId = url.searchParams.get('accountId');
      const now = new Date();
      const start = new Date(now);
      if (period === '7D') start.setDate(start.getDate() - 7);
      else if (period === '90D') start.setDate(start.getDate() - 90);
      else if (period === 'YTD') start.setMonth(0, 1);
      else start.setDate(start.getDate() - 30);

      let ordersQuery = auth.repositoryContext.supabase
        .from('orders')
        .select('id,status,total_minor,currency,created_at,marketplace_account_id')
        .eq('organization_id', auth.organizationId)
        .gte('created_at', start.toISOString());
      if (accountId && accountId !== 'ALL') ordersQuery = ordersQuery.eq('marketplace_account_id', accountId);
      if (auth.user.role === 'CLIENT_USER' && auth.user.clientId) ordersQuery = ordersQuery.eq('client_3pl_id', auth.user.clientId);

      const [ordersResult, productsResult, inventoryBalances, invoiceResult, expenseResult] = await Promise.all([
        ordersQuery,
        auth.repositoryContext.supabase.from('products').select('id,currency,low_stock_threshold').eq('organization_id', auth.organizationId),
        new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
          client3plId: auth.user.clientId,
          onlyClientProducts: auth.user.role === 'CLIENT_USER',
        }),
        auth.permissions.has('*') || auth.permissions.has('finance.view')
          ? auth.repositoryContext.supabase.from('invoices').select('total_minor,paid_amount_minor,currency,status').eq('organization_id', auth.organizationId)
          : Promise.resolve({ data: [], error: null }),
        auth.permissions.has('*') || auth.permissions.has('finance.view')
          ? auth.repositoryContext.supabase.from('expenses').select('amount_minor,currency,status').eq('organization_id', auth.organizationId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (ordersResult.error || productsResult.error || invoiceResult.error || expenseResult.error) {
        throw new Error('Dashboard source records could not be loaded.');
      }
      const orders = ordersResult.data || [];
      const activeOrders = orders.filter(row => !['CANCELLED', 'VOID', 'REFUNDED'].includes(String(row.status).toUpperCase()));
      const pendingOrders = orders.filter(row => ['NEW', 'PENDING', 'CONFIRMED', 'ALLOCATED', 'PICKED', 'PACKED'].includes(String(row.status).toUpperCase()));
      const currencies = new Map();
      for (const row of activeOrders) {
        const currency = String(row.currency || 'GBP').trim();
        currencies.set(currency, (currencies.get(currency) || 0) + Number(row.total_minor || 0));
      }
      const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'GBP';
      const revenueMinor = activeOrders.filter(row => String(row.currency || 'GBP').trim() === currency)
        .reduce((sum, row) => sum + Number(row.total_minor || 0), 0);
      const lowStockItems = (inventoryBalances || []).filter(balance =>
        Number(balance.available || 0) <= Number((productsResult.data || []).find(product => product.id === balance.productId)?.low_stock_threshold || 0)
      ).length;
      const totalStockUnits = (inventoryBalances || []).reduce((sum, balance) => sum + Number(balance.onHand || 0), 0);
      const inventoryValueMinor = (inventoryBalances || []).reduce((sum, balance) => sum + (Number(balance.onHand || 0) * Number(balance.weightedAverageCostMinor || 0)), 0);
      const invoices = invoiceResult.data || [];
      const expenses = expenseResult.data || [];
      return json({ kpis: {
        totalOrders: activeOrders.length,
        pendingOrders: pendingOrders.length,
        revenueMinor,
        lowStockItems,
        totalStockUnits,
        inventoryValueMinor,
        supplierPayablesMinor: 0,
        clientReceivablesMinor: invoices.filter(row => !['PAID', 'VOID'].includes(String(row.status).toUpperCase()))
          .reduce((sum, row) => sum + Math.max(0, Number(row.total_minor || 0) - Number(row.paid_amount_minor || 0)), 0),
        storageRevenueMinor: 0,
        outstandingPaymentsMinor: invoices.reduce((sum, row) => sum + Math.max(0, Number(row.total_minor || 0) - Number(row.paid_amount_minor || 0)), 0),
        currency,
        activePhase: 'ALL',
      }, userRole: auth.user.role, dataCoverage: {
        supplierPayables: 'not-yet-implemented',
        storageRevenue: 'not-yet-implemented',
        expenseRecords: expenses.length,
      } });
    }

    if (path === '/dashboard/charts' && request.method === 'GET') {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      const [ordersResult, balances] = await Promise.all([
        auth.repositoryContext.supabase.from('orders')
          .select('id,status,total_minor,currency,created_at')
          .eq('organization_id', auth.organizationId)
          .gte('created_at', since.toISOString()),
        new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
          client3plId: auth.user.clientId,
          onlyClientProducts: auth.user.role === 'CLIENT_USER',
        }),
      ]);
      if (ordersResult.error) throw new Error('Dashboard chart records could not be loaded.');
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(since);
        date.setDate(since.getDate() + index);
        return date.toISOString().slice(5, 10);
      });
      const trend = days.map(date => {
        const rows = (ordersResult.data || []).filter(row => String(row.created_at).slice(5, 10) === date);
        return { date, orders: rows.length, revenue: rows.reduce((sum, row) => sum + Number(row.total_minor || 0), 0) / 100 };
      });
      const statusCounts: Record<string, number> = {};
      for (const row of ordersResult.data || []) statusCounts[String(row.status)] = (statusCounts[String(row.status)] || 0) + 1;
      const stockByState = (balances || []).reduce((acc: Record<string, number>, row: any) => {
        acc.available = (acc.available || 0) + Number(row.available || 0);
        acc.reserved = (acc.reserved || 0) + Number(row.reserved || 0);
        acc.onHand = (acc.onHand || 0) + Number(row.onHand || 0);
        acc.incoming = (acc.incoming || 0) + Number(row.incoming || 0);
        acc.damaged = (acc.damaged || 0) + Number(row.damaged || 0);
        acc.quarantined = (acc.quarantined || 0) + Number(row.quarantined || 0);
        return acc;
      }, {});
      return json({ trend, statusCounts, stockByState, topSkus: [] });
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
      return json({ accounts: (accountsResult.data || []).map(row => ({
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

    if (path === '/audit-logs' && request.method === 'GET') {
      const { data, error } = await auth.repositoryContext.supabase.from('audit_logs')
        .select('id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes,created_at')
        .eq('organization_id', auth.organizationId).order('created_at', { ascending: false }).limit(500);
      if (error) throw new Error('Audit history could not be loaded.');
      const actorIds = [...new Set((data || []).map(row => row.actor_id).filter(Boolean))];
      const { data: profiles } = actorIds.length
        ? await auth.repositoryContext.supabase.from('profiles').select('id,full_name,email').in('id', actorIds)
        : { data: [] };
      const actorNames = new Map((profiles || []).map(row => [row.id, row.full_name || row.email || 'System']));
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
