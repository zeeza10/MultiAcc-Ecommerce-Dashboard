import { Router, Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import type { RepositoryContext } from './repositories/context';
import { SupabaseProductRepository } from './repositories/productRepository';
import { SupabaseInventoryRepository } from './repositories/inventoryRepository';
import { SupabaseOrderRepository } from './repositories/orderRepository';
import { SupabasePurchasingRepository } from './repositories/purchasingRepository';
import { SupabaseWarehouseRepository } from './repositories/warehouseRepository';
import { SupabaseReturnRepository } from './repositories/returnRepository';
import { resolveEffectivePermissions } from '../worker/permission-overrides';
import { permissionByRoute as workerPermissionByRoute } from '../worker/permissions';
import { db } from './db';
import { engine } from './engine';
import { ebayAdapter } from './ebayAdapter';
import { reportsService } from './reports';
import {
  User,
  UserRole,
  Order,
  OrderStatus,
  StockState,
  OwnerType,
  EbayPayout,
  FinancialReconciliation,
  WarehousePackagingJob,
  WarehouseShippingJob,
  DropshippingCalculation,
} from './types';


export const apiRouter = Router();

type AuthenticatedRequest = Request & { nexusUser?: User; organizationId?: string; permissions?: Set<string>; repositoryContext?: RepositoryContext };

const getActiveUser = (req: Request): User => {
  const user = (req as AuthenticatedRequest).nexusUser;
  if (!user) throw new Error('Authenticated user context is missing.');
  return user;
};

const getRepositoryContext = (req: Request): RepositoryContext => {
  const context = (req as AuthenticatedRequest).repositoryContext;
  if (!context) throw new Error('Authenticated repository context is missing.');
  return context;
};

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase server auth is not configured. Protected API requests will fail closed.');
}

const requireSupabaseUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authorization = req.header('authorization') || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!token || !supabaseUrl || !supabaseKey) {
      res.status(401).json({ error: 'A valid Supabase bearer token is required.' });
      return;
    }

    // Use the caller's JWT for every lookup so Supabase RLS remains in force.
    const userClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
      return;
    }

    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('id,full_name,is_active,two_factor_enabled,created_at')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError || !profile || !profile.is_active) {
      res.status(403).json({ error: 'Your account is inactive or its profile is unavailable.' });
      return;
    }

    const requestedOrganizationId = req.header('x-organization-id')?.trim();
    let membershipQuery = userClient
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
    if (membershipError) {
      res.status(403).json({ error: 'Workspace membership could not be verified.' });
      return;
    }
    if (!memberships?.length) {
      res.status(403).json({ error: 'You are not an active member of the requested workspace.' });
      return;
    }
    if (!requestedOrganizationId && memberships.length > 1) {
      res.status(409).json({ error: 'Select an active workspace before making API requests.' });
      return;
    }

    const membership = memberships[0];
    const roleRelation = (membership as any).roles;
    const roleCode = Array.isArray(roleRelation) ? roleRelation[0]?.code : roleRelation?.code;
    const validRoles: UserRole[] = ['SUPER_ADMIN', 'OPS_MANAGER', 'WAREHOUSE_STAFF', 'FINANCE_USER', 'CLIENT_USER', 'VIEWER'];
    if (typeof roleCode !== 'string' || (!validRoles.includes(roleCode as UserRole) && !roleCode.startsWith('CUSTOM_'))) {
      res.status(403).json({ error: 'Your workspace role is not valid.' });
      return;
    }
    if (roleCode === 'CLIENT_USER' && !membership.client_3pl_id) {
      res.status(403).json({ error: 'Your client account is not linked to this workspace. Contact your workspace administrator.' });
      return;
    }

    const { data: rolePermissionRows, error: permissionsError } = await userClient
      .from('role_permissions')
      .select('permissions(code)')
      .eq('role_id', membership.role_id);
    if (permissionsError) {
      res.status(403).json({ error: 'Workspace permissions could not be verified.' });
      return;
    }

    const rolePermissionCodes = (rolePermissionRows || []).map((row: any) => {
      const relation = row.permissions;
      return Array.isArray(relation) ? relation[0]?.code : relation?.code;
    }).filter((code: unknown): code is string => typeof code === 'string');

    const { data: overrideRows, error: overrideError } = await userClient
      .from('organization_member_permission_overrides')
      .select('effect,permissions(code)')
      .eq('organization_id', membership.organization_id)
      .eq('user_id', authData.user.id);
    if (overrideError) {
      res.status(403).json({ error: 'Individual workspace permissions could not be verified.' });
      return;
    }

    const overrides = (overrideRows || []).map((row: any) => {
      const relation = row.permissions;
      const code = Array.isArray(relation) ? relation[0]?.code : relation?.code;
      return { effect: row.effect, code };
    }).filter((row: any): row is { effect: 'GRANT' | 'DENY'; code: string } =>
      (row.effect === 'GRANT' || row.effect === 'DENY') && typeof row.code === 'string',
    );

    const permissions = resolveEffectivePermissions(roleCode, rolePermissionCodes, overrides);

    const request = req as AuthenticatedRequest;
    request.organizationId = membership.organization_id;
    request.permissions = permissions;
    request.nexusUser = {
      id: authData.user.id,
      email: authData.user.email || '',
      name: profile.full_name || authData.user.email || 'User',
      role: roleCode,
      clientId: membership.client_3pl_id || undefined,
      isActive: true,
      twoFactorEnabled: profile.two_factor_enabled,
      failedLoginAttempts: 0,
      createdAt: profile.created_at,
    };
    request.repositoryContext = {
      supabase: userClient,
      organizationId: membership.organization_id,
      userId: authData.user.id,
      client3plId: membership.client_3pl_id || undefined,
      permissions,
    };
    next();
  } catch (error) {
    console.error('Supabase authentication middleware failed:', error);
    res.status(401).json({ error: 'Authentication could not be verified.' });
  }
};

const routePermissionRules: Array<{ method: string; path: RegExp; permission: string | null }> = [
  { method: 'GET', path: /^\/(auth\/me|me)\/?$/, permission: null },
  { method: 'GET', path: /^\/dashboard\/(kpis|charts)\/?$/, permission: 'dashboard.view' },
  { method: 'GET', path: /^\/orders\/?$/, permission: 'orders.view' },
  { method: 'GET', path: /^\/orders\/[^/]+\/?$/, permission: 'orders.view' },
  { method: 'POST', path: /^\/orders\/?$/, permission: 'orders.create' },
  { method: 'POST', path: /^\/orders\/[^/]+\/transition\/?$/, permission: 'orders.edit' },
  { method: 'PUT', path: /^\/orders\/[^/]+\/?$/, permission: 'orders.edit' },
  { method: 'GET', path: /^\/products\/?$/, permission: 'products.view' },
  { method: 'POST', path: /^\/products\/?$/, permission: 'products.create' },
  { method: 'GET', path: /^\/inventory\/(balances|ledger)\/?$/, permission: 'inventory.view' },
  { method: 'GET', path: /^\/stock\/adjustments\/?$/, permission: 'inventory.view' },
  { method: 'POST', path: /^\/stock\/adjustments\/?$/, permission: 'inventory.adjust' },
  { method: 'POST', path: /^\/stock\/adjustments\/[^/]+\/decision\/?$/, permission: 'inventory.adjust' },
  { method: 'GET', path: /^\/ebay\/(accounts|exceptions)\/?$/, permission: 'marketplace.view' },
  { method: 'POST', path: /^\/ebay\/accounts\/[^/]+\/(sync|connect)\/?$/, permission: 'marketplace.manage' },
  { method: 'POST', path: /^\/ebay\/exceptions\/[^/]+\/resolve\/?$/, permission: 'marketplace.manage' },
  { method: 'GET', path: /^\/(suppliers|purchase-orders)\/?$/, permission: 'purchasing.view' },
  { method: 'POST', path: /^\/purchase-orders\/[^/]+\/receive\/?$/, permission: 'purchasing.manage' },
  { method: 'GET', path: /^\/returns\/?$/, permission: 'returns.view' },
  { method: 'POST', path: /^\/returns\/[^/]+\/disposition\/?$/, permission: 'returns.manage' },
  { method: 'GET', path: /^\/3pl\/(clients|storage-snapshots)\/?$/, permission: 'fulfilment.view' },
  { method: 'POST', path: /^\/3pl\/billing-preview\/?$/, permission: 'fulfilment.view' },
  { method: 'GET', path: /^\/finance\/(invoices|payments|expenses|ledger)\/?$/, permission: 'finance.view' },
  { method: 'POST', path: /^\/finance\/invoices\/[^/]+\/void\/?$/, permission: 'finance.manage' },
  { method: 'POST', path: /^\/finance\/payments\/?$/, permission: 'finance.manage' },
  { method: 'GET', path: /^\/reports\/[^/]+\/?$/, permission: 'reports.view' },
  { method: 'GET', path: /^\/audit-logs\/?$/, permission: 'audit.view' },
  { method: 'GET', path: /^\/notifications\/?$/, permission: 'dashboard.view' },
  { method: 'POST', path: /^\/notifications\/[^/]+\/dismiss\/?$/, permission: 'dashboard.view' },
  { method: 'GET', path: /^\/(system\/config|config)\/?$/, permission: 'dashboard.view' },
  { method: 'POST', path: /^\/system\/config\/?$/, permission: 'settings.manage' },
  { method: 'POST', path: /^\/system\/(reset-demo|reload)\/?$/, permission: 'settings.manage' },
  { method: 'GET', path: /^\/users\/?$/, permission: 'users.manage' },
  { method: 'GET', path: /^\/exceptions\/?$/, permission: 'marketplace.view' },
  { method: 'GET', path: /^\/payouts\/?$/, permission: 'finance.view' },
  { method: 'POST', path: /^\/payouts\/[^/]+\/confirm-deposit\/?$/, permission: 'finance.manage' },
  { method: 'GET', path: /^\/reconciliation\/?$/, permission: 'finance.view' },
  { method: 'GET', path: /^\/warehouse-services\/(summary|packaging|shipping)\/?$/, permission: 'fulfilment.view' },
  { method: 'POST', path: /^\/warehouse-services\/(packaging|shipping)\/?$/, permission: 'fulfilment.manage' },
  { method: 'GET', path: /^\/dropshipping\/calculations\/?$/, permission: 'products.view' },
  { method: 'POST', path: /^\/dropshipping\/calculations\/?$/, permission: 'products.create' },
];

const requireRoutePermission = (req: Request, res: Response, next: NextFunction) => {
  // Prefer the production Worker's canonical permission map. Retain the legacy
  // Express map only for development-only endpoints not yet present in Worker.
  const workerPermission = workerPermissionByRoute(req.method, req.path);
  const legacyRule = routePermissionRules.find(item => item.method === req.method && item.path.test(req.path));
  const mappedPermission = workerPermission === undefined ? legacyRule?.permission : workerPermission;

  if (mappedPermission === undefined) {
    res.status(403).json({ error: 'No authorization rule is configured for this endpoint.' });
    return;
  }
  if (mappedPermission === null) {
    next();
    return;
  }

  const permissions = (req as AuthenticatedRequest).permissions;
  const requiredPermission = req.path.startsWith('/reports/') && req.query.format === 'csv'
    ? 'reports.export'
    : mappedPermission;

  if (!permissions?.has('*') && !permissions?.has(requiredPermission)) {
    res.status(403).json({ error: 'You do not have permission to perform this action in the selected workspace.' });
    return;
  }
  next();
};

/**
 * AUTHENTICATION
 * All business routes below require a verified Supabase user and active workspace membership.
 */
apiRouter.use(requireSupabaseUser);
apiRouter.use(requireRoutePermission);

apiRouter.get('/auth/me', (req: Request, res: Response) => {
  res.json({ user: getActiveUser(req), organizationId: (req as AuthenticatedRequest).organizationId });
});

apiRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    if (user.role === 'CLIENT_USER') {
      res.status(403).json({ error: 'Client users cannot create workspace orders.' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const repository = new SupabaseOrderRepository(getRepositoryContext(req));
    const order = await repository.createOrder(body);
    res.status(201).json({ order });
  } catch (error) {
    console.error('PostgreSQL order creation failed:', error);
    const message = error instanceof Error ? error.message : '';
    const validation = /required|must |invalid|unsupported|between|too long|not found|inactive|authorized|amount/i.test(message);
    res.status(validation ? 400 : 500).json({
      error: validation ? message : 'Order could not be created in the workspace database.',
    });
  }
});

apiRouter.post('/orders/:id/transition', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    if (user.role === 'CLIENT_USER') {
      res.status(403).json({ error: 'Client users cannot transition workspace orders.' });
      return;
    }
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (typeof body.targetStatus !== 'string' || !body.targetStatus.trim()) {
      res.status(400).json({ error: 'A target order status is required.' });
      return;
    }
    const repository = new SupabaseOrderRepository(getRepositoryContext(req));
    const order = await repository.transitionOrder(
      req.params.id,
      body.targetStatus as OrderStatus,
      {
        carrier: typeof body.carrier === 'string' ? body.carrier : undefined,
        trackingNumber: typeof body.trackingNumber === 'string' ? body.trackingNumber : undefined,
        note: typeof body.note === 'string' ? body.note : undefined,
      },
    );
    res.json({ order });
  } catch (error) {
    console.error('PostgreSQL order transition failed:', error);
    const message = error instanceof Error ? error.message : '';
    const expected = /required|authorized|invalid|not found|transition|backordered|unreserved|Configure active|Warehouse staff|membership/i.test(message);
    res.status(expected ? 400 : 500).json({
      error: expected ? message : 'Order status could not be updated in the workspace database.',
    });
  }
});

apiRouter.get('/orders', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const repository = new SupabaseOrderRepository(getRepositoryContext(req));
    const orders = await repository.listOrders({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      accountId: typeof req.query.accountId === 'string' ? req.query.accountId : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      client3plId: user.clientId,
      onlyClientOrders: user.role === 'CLIENT_USER',
    });
    res.json({ orders });
  } catch (error) {
    console.error('PostgreSQL order listing failed:', error);
    res.status(500).json({ error: 'Orders could not be loaded from the workspace database.' });
  }
});

apiRouter.get('/orders/:id', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const repository = new SupabaseOrderRepository(getRepositoryContext(req));
    const result = await repository.getOrder(req.params.id, {
      client3plId: user.clientId,
      onlyClientOrders: user.role === 'CLIENT_USER',
    });
    if (!result) {
      res.status(404).json({ error: 'Order was not found in this workspace.' });
      return;
    }
    res.json(result);
  } catch (error) {
    console.error('PostgreSQL order detail lookup failed:', error);
    res.status(500).json({ error: 'Order details could not be loaded from the workspace database.' });
  }
});

/**
 * PRODUCTS — first organization-scoped PostgreSQL persistence slice.
 * Registered before the legacy demo-data gate so only this migrated domain
 * can use real tenant data while unported demo-backed routes remain disabled.
 */
apiRouter.get('/products', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const context = getRepositoryContext(req);
    const repository = new SupabaseProductRepository(context);
    const isClientUser = user.role === 'CLIENT_USER';
    const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
    let dataEnvironment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'SANDBOX';
    if (accountId && accountId !== 'ALL') {
      const { data: account, error: accountError } = await context.supabase
        .from('marketplace_accounts').select('id,is_demo,environment')
        .eq('id', accountId).eq('organization_id', context.organizationId).maybeSingle();
      if (accountError) throw accountError;
      if (!account) {
        res.status(404).json({ error: 'The selected marketplace account was not found in this workspace.' });
        return;
      }
      dataEnvironment = account.is_demo ? 'DEMO' : account.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
    }
    const products = await repository.listForOrganization({
      client3plId: user.clientId,
      onlyClientProducts: isClientUser,
      dataEnvironment,
    });

    const balances = new Map<string, { onHand: number; reserved: number; incoming: number; damaged: number }>();
    if ((context.permissions.has('*') || context.permissions.has('inventory.view')) && products.length > 0) {
      const ledgerRows = await repository.listStockLedgerQuantities(
        products.map(product => product.id),
        isClientUser ? user.clientId : undefined,
      );
      for (const row of ledgerRows) {
        const balance = balances.get(row.product_id) || { onHand: 0, reserved: 0, incoming: 0, damaged: 0 };
        switch (row.stock_state) {
          case 'ON_HAND': balance.onHand += Number(row.quantity_delta); break;
          case 'RESERVED': balance.reserved += Number(row.quantity_delta); break;
          case 'INCOMING': balance.incoming += Number(row.quantity_delta); break;
          case 'DAMAGED': balance.damaged += Number(row.quantity_delta); break;
        }
        balances.set(row.product_id, balance);
      }
    }

    const enhanced = products.map(product => {
      const balance = balances.get(product.id) || { onHand: 0, reserved: 0, incoming: 0, damaged: 0 };
      return {
        ...product,
        ...(user.role === 'WAREHOUSE_STAFF' ? { costPriceMinor: 0, sellingPriceMinor: 0 } : {}),
        stockOnHand: balance.onHand,
        stockReserved: balance.reserved,
        stockAvailable: Math.max(0, balance.onHand - balance.reserved),
        stockIncoming: balance.incoming,
        stockDamaged: balance.damaged,
      };
    });

    res.json({ products: enhanced });
  } catch (error) {
    console.error('PostgreSQL product listing failed:', error);
    res.status(500).json({ error: 'Products could not be loaded from the workspace database.' });
  }
});

apiRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const context = getRepositoryContext(req);
    if (user.role === 'WAREHOUSE_STAFF' || user.role === 'VIEWER') {
      res.status(403).json({ error: 'Not authorized to create products.' });
      return;
    }

    const body = req.body || {};
    const sku = typeof body.sku === 'string' ? body.sku.trim().toUpperCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!sku || !name) {
      res.status(400).json({ error: 'SKU and Name are required.' });
      return;
    }
    if (sku.length > 120 || name.length > 255) {
      res.status(400).json({ error: 'SKU must be at most 120 characters and Name at most 255 characters.' });
      return;
    }

    const parseNonNegativeInteger = (value: unknown, fallback: number): number | null => {
      if (value === undefined || value === null || value === '') return fallback;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
    };
    const costPriceMinor = parseNonNegativeInteger(body.costPriceMinor, 0);
    const sellingPriceMinor = parseNonNegativeInteger(body.sellingPriceMinor, 0);
    const lowStockThreshold = parseNonNegativeInteger(body.lowStockThreshold, 10);
    const reorderLevel = parseNonNegativeInteger(body.reorderLevel, 30);
    if ([costPriceMinor, sellingPriceMinor, lowStockThreshold, reorderLevel].some(value => value === null)) {
      res.status(400).json({ error: 'Prices and stock thresholds must be non-negative whole numbers.' });
      return;
    }

    const ownerType = body.ownerType === undefined ? 'OPERATOR' : body.ownerType;
    if (ownerType !== 'OPERATOR' && ownerType !== 'CLIENT') {
      res.status(400).json({ error: 'Owner type must be OPERATOR or CLIENT.' });
      return;
    }
    const ownerId = typeof body.ownerId === 'string' ? body.ownerId : undefined;

    const parseDimension = (value: unknown): number | null => {
      if (value === undefined || value === null || value === '') return 0;
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };
    const dimensions = body.dimensions && typeof body.dimensions === 'object'
      ? {
          lengthCm: parseDimension(body.dimensions.lengthCm),
          widthCm: parseDimension(body.dimensions.widthCm),
          heightCm: parseDimension(body.dimensions.heightCm),
        }
      : undefined;
    if (dimensions && Object.values(dimensions).some(value => value === null)) {
      res.status(400).json({ error: 'Product dimensions must be valid non-negative numbers.' });
      return;
    }

    const weightKg = body.weightKg === undefined || body.weightKg === null || body.weightKg === ''
      ? undefined
      : Number(body.weightKg);
    if (weightKg !== undefined && (!Number.isFinite(weightKg) || weightKg < 0)) {
      res.status(400).json({ error: 'Product weight must be a valid non-negative number.' });
      return;
    }

    const repository = new SupabaseProductRepository(context);
    const product = await repository.createForOrganization({
      sku,
      name,
      barcode: typeof body.barcode === 'string' ? body.barcode : undefined,
      dimensions: dimensions ? {
        lengthCm: dimensions.lengthCm!,
        widthCm: dimensions.widthCm!,
        heightCm: dimensions.heightCm!,
      } : undefined,
      weightKg,
      costPriceMinor: costPriceMinor!,
      sellingPriceMinor: sellingPriceMinor!,
      lowStockThreshold: lowStockThreshold!,
      reorderLevel: reorderLevel!,
      category: typeof body.category === 'string' ? body.category : 'General',
      ownerType,
      ownerId,
    });

    res.status(201).json({
      product: {
        ...product,
        stockOnHand: 0,
        stockReserved: 0,
        stockAvailable: 0,
        stockIncoming: 0,
        stockDamaged: 0,
      },
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === '23505') {
      res.status(409).json({ error: 'A product with this SKU already exists in this workspace.' });
      return;
    }
    if (error instanceof Error && error.message.includes('3PL client')) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('PostgreSQL product creation failed:', error);
    res.status(500).json({ error: 'Product could not be saved to the workspace database.' });
  }
});

/**
 * INVENTORY READS — backed by the organization-scoped PostgreSQL ledger.
 */
apiRouter.get('/inventory/balances', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const repository = new SupabaseInventoryRepository(getRepositoryContext(req));
    const balances = await repository.listBalances({
      client3plId: user.clientId,
      onlyClientProducts: user.role === 'CLIENT_USER',
    });
    res.json({ balances });
  } catch (error) {
    console.error('PostgreSQL inventory balance read failed:', error);
    res.status(500).json({ error: 'Inventory balances could not be loaded from the workspace database.' });
  }
});

apiRouter.get('/inventory/ledger', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const repository = new SupabaseInventoryRepository(getRepositoryContext(req));
    const ledger = await repository.listLedger({
      client3plId: user.clientId,
      onlyClientProducts: user.role === 'CLIENT_USER',
    });
    res.json({ ledger });
  } catch (error) {
    console.error('PostgreSQL inventory ledger read failed:', error);
    res.status(500).json({ error: 'Inventory ledger could not be loaded from the workspace database.' });
  }
});

apiRouter.get('/stock/adjustments', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    const repository = new SupabaseInventoryRepository(getRepositoryContext(req));
    const adjustments = await repository.listAdjustments({
      client3plId: user.clientId,
      onlyClientProducts: user.role === 'CLIENT_USER',
    });
    res.json({ adjustments });
  } catch (error) {
    console.error('PostgreSQL stock adjustment read failed:', error);
    res.status(500).json({ error: 'Stock adjustments could not be loaded from the workspace database.' });
  }
});

apiRouter.post('/stock/adjustments', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    if (user.role === 'FINANCE_USER' || user.role === 'CLIENT_USER' || user.role === 'VIEWER') {
      res.status(403).json({ error: 'Your workspace role cannot create stock adjustments.' });
      return;
    }

    const body = req.body || {};
    const productId = typeof body.productId === 'string' ? body.productId : '';
    const quantityDelta = Number(body.quantityDelta);
    const targetState = body.targetState;
    const reasonCode = body.reasonCode;
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const validStates = ['ON_HAND', 'DAMAGED', 'QUARANTINED', 'MISSING'];
    const validReasons = ['damage', 'loss', 'found', 'count_correction', 'quarantine', 'write_off'];

    if (!productId || !Number.isSafeInteger(quantityDelta) || quantityDelta === 0) {
      res.status(400).json({ error: 'A product and non-zero whole-number quantity delta are required.' });
      return;
    }
    if (!validStates.includes(targetState)) {
      res.status(400).json({ error: 'A valid target stock state is required.' });
      return;
    }
    if (!validReasons.includes(reasonCode)) {
      res.status(400).json({ error: 'A valid stock adjustment reason is required.' });
      return;
    }
    if (!note || note.length > 1000) {
      res.status(400).json({ error: 'An audit note of 1 to 1000 characters is required.' });
      return;
    }

    const repository = new SupabaseInventoryRepository(getRepositoryContext(req));
    const adjustment = await repository.createAdjustment({
      productId,
      locationId: typeof body.locationId === 'string' && body.locationId.trim() ? body.locationId.trim() : undefined,
      quantityDelta,
      targetState,
      reasonCode,
      note,
    });
    res.status(201).json({ adjustment });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === '42501') {
      res.status(403).json({ error: 'You are not authorized to create this stock adjustment.' });
      return;
    }
    if (code === 'P0002') {
      res.status(404).json({ error: 'The selected product or warehouse location was not found in this workspace.' });
      return;
    }
    if (code === '22023' || code === '22P02' || code === '22003') {
      res.status(400).json({ error: 'The stock adjustment contains invalid values.' });
      return;
    }
    console.error('Transactional stock adjustment creation failed:', error);
    res.status(500).json({ error: 'The stock adjustment could not be saved.' });
  }
});

apiRouter.post('/stock/adjustments/:id/decision', async (req: Request, res: Response) => {
  try {
    const user = getActiveUser(req);
    if (user.role !== 'OPS_MANAGER' && user.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Only Operations Manager or Super Admin can approve stock adjustments.' });
      return;
    }

    const decision = req.body?.decision;
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      res.status(400).json({ error: 'Decision must be APPROVE or REJECT.' });
      return;
    }
    const approvalNote = typeof req.body?.approvalNote === 'string' ? req.body.approvalNote.trim() : '';
    if (approvalNote.length > 1000) {
      res.status(400).json({ error: 'Approval note must be at most 1000 characters.' });
      return;
    }

    const repository = new SupabaseInventoryRepository(getRepositoryContext(req));
    const adjustment = await repository.decideAdjustment(req.params.id, decision, approvalNote);
    res.json({ adjustment });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === '42501') {
      res.status(403).json({ error: 'Approval denied. Check your role and separation-of-duties requirements.' });
      return;
    }
    if (code === 'P0002') {
      res.status(404).json({ error: 'The stock adjustment was not found in this workspace.' });
      return;
    }
    if (code === '55000') {
      res.status(409).json({ error: 'This stock adjustment has already been reviewed.' });
      return;
    }
    if (code === '22023' || code === '22P02') {
      res.status(400).json({ error: 'The stock adjustment decision contains invalid values.' });
      return;
    }
    console.error('Transactional stock adjustment decision failed:', error);
    res.status(500).json({ error: 'The stock adjustment decision could not be saved.' });
  }
});

apiRouter.get('/suppliers', async (req: Request, res: Response) => {
  try {
    const repository = new SupabasePurchasingRepository(getRepositoryContext(req));
    res.json({ suppliers: await repository.listSuppliers(typeof req.query.accountId === 'string' ? req.query.accountId : undefined) });
  } catch (error) {
    console.error('PostgreSQL supplier listing failed:', error);
    res.status(500).json({ error: 'Suppliers could not be loaded from the workspace database.' });
  }
});

apiRouter.get('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const repository = new SupabasePurchasingRepository(getRepositoryContext(req));
    const [purchaseOrders, receipts] = await Promise.all([
      repository.listPurchaseOrders(typeof req.query.accountId === 'string' ? req.query.accountId : undefined),
      repository.listGoodsReceipts(typeof req.query.accountId === 'string' ? req.query.accountId : undefined),
    ]);
    res.json({ purchaseOrders, receipts });
  } catch (error) {
    console.error('PostgreSQL purchasing listing failed:', error);
    res.status(500).json({ error: 'Purchase orders and receipts could not be loaded from the workspace database.' });
  }
});
apiRouter.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const repository = new SupabasePurchasingRepository(getRepositoryContext(req));
    const supplier = await repository.createSupplier({
      name: typeof body.name === 'string' ? body.name : '',
      code: typeof body.code === 'string' ? body.code : '',
      contactName: typeof body.contactName === 'string' ? body.contactName : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
      phone: typeof body.phone === 'string' ? body.phone : undefined,
      paymentTermsDays: typeof body.paymentTermsDays === 'number' ? body.paymentTermsDays : Number(body.paymentTermsDays ?? 0),
      currency: typeof body.currency === 'string' ? body.currency : 'GBP',
      leadTimeDays: typeof body.leadTimeDays === 'number' ? body.leadTimeDays : Number(body.leadTimeDays ?? 0),
    });
    res.status(201).json({ supplier });
  } catch (error) {
    console.error('PostgreSQL supplier creation failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /permission|authorized|row-level security|policy/i.test(message)
      ? 403
      : /required|must be|characters|days|length|currency|details/i.test(message)
        ? 400
        : /duplicate key|unique constraint/i.test(message)
          ? 409
          : 500;
    res.status(status).json({ error: status === 500 ? 'Supplier could not be created.' : message });
  }
});

apiRouter.post('/purchase-orders', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (!Array.isArray(body.lines) || typeof body.idempotencyKey !== 'string') {
      res.status(400).json({ error: 'Purchase order lines and a request ID are required.' });
      return;
    }
    const lines = body.lines.map(value => {
      const line = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return {
        productId: typeof line.productId === 'string' ? line.productId : '',
        orderedQty: typeof line.orderedQty === 'number' ? line.orderedQty : Number(line.orderedQty),
        unitCostMinor: typeof line.unitCostMinor === 'number' ? line.unitCostMinor : Number(line.unitCostMinor),
      };
    });
    const repository = new SupabasePurchasingRepository(getRepositoryContext(req));
    const purchaseOrder = await repository.createPurchaseOrder({
      supplierId: typeof body.supplierId === 'string' ? body.supplierId : '',
      expectedDate: typeof body.expectedDate === 'string' ? body.expectedDate : undefined,
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      taxMinor: typeof body.taxMinor === 'number' ? body.taxMinor : Number(body.taxMinor ?? 0),
      lines,
    }, body.idempotencyKey);
    res.status(201).json({ purchaseOrder });
  } catch (error) {
    console.error('Transactional purchase order creation failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /authorized|authentication|membership|permission|does not belong/i.test(message)
      ? 403
      : /not found|not active/i.test(message)
        ? 404
        : /invalid|must |required|exceeds|cannot|duplicate|request ID|already used|select a supplier|between 1/i.test(message)
          ? 400
          : 500;
    res.status(status).json({ error: status === 500 ? 'Purchase order could not be created.' : message });
  }
});

apiRouter.post('/purchase-orders/:id/approve', async (req: Request, res: Response) => {
  try {
    const repository = new SupabasePurchasingRepository(getRepositoryContext(req));
    const purchaseOrder = await repository.approvePurchaseOrder(req.params.id);
    res.json({ purchaseOrder });
  } catch (error) {
    console.error('Transactional purchase order approval failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /authorized|authentication|membership|permission/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : /only draft|must contain/i.test(message)
          ? 400
          : 500;
    res.status(status).json({ error: status === 500 ? 'Purchase order could not be approved.' : message });
  }
});

apiRouter.post('/purchase-orders/:id/receive', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (!Array.isArray(body.items)) {
      res.status(400).json({ error: 'Receipt items are required.' });
      return;
    }
    if (typeof body.idempotencyKey !== 'string') {
      res.status(400).json({ error: 'A receipt request ID is required. Reopen the receipt form and try again.' });
      return;
    }
    const items = body.items.map((value) => {
      const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return {
        productId: typeof item.productId === 'string' ? item.productId : '',
        receivedQty: typeof item.receivedQty === 'number' ? item.receivedQty : Number(item.receivedQty),
        damagedQty: typeof item.damagedQty === 'number' ? item.damagedQty : Number(item.damagedQty ?? 0),
        locationId: typeof item.locationId === 'string' ? item.locationId : undefined,
      };
    });
    const repository = new SupabasePurchasingRepository(getRepositoryContext(req));
    const result = await repository.receivePurchaseOrder(
      req.params.id,
      items,
      typeof body.discrepancyNote === 'string' ? body.discrepancyNote : undefined,
      body.idempotencyKey,
    );
    res.json(result);
  } catch (error) {
    console.error('Transactional purchase receipt failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /authorized|authentication|membership|permission/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : /invalid|must |required|exceeds|cannot|only approved|exactly one|duplicate|request ID|location|configure|negative|at least one|already used/i.test(message)
          ? 400
          : 500;
    res.status(status).json({
      error: status === 500
        ? 'The goods receipt could not be posted. No stock or accounting changes were committed.'
        : message,
    });
  }
});


apiRouter.get('/warehouses', async (req: Request, res: Response) => {
  try {
    const repository = new SupabaseWarehouseRepository(getRepositoryContext(req));
    res.json(await repository.getLayout(typeof req.query.accountId === 'string' ? req.query.accountId : undefined));
  } catch (error) {
    console.error('PostgreSQL warehouse layout failed:', error);
    res.status(500).json({ error: 'Warehouse layout could not be loaded from the workspace database.' });
  }
});

apiRouter.post('/warehouses', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const repository = new SupabaseWarehouseRepository(getRepositoryContext(req));
    const warehouse = await repository.createWarehouse({
      name: typeof body.name === 'string' ? body.name : '',
      code: typeof body.code === 'string' ? body.code : '',
      address: typeof body.address === 'string' ? body.address : undefined,
    });
    res.status(201).json({ warehouse });
  } catch (error) {
    console.error('PostgreSQL warehouse creation failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /permission|authorized|row-level security|policy/i.test(message) ? 403 : /required|must be|characters|length|invalid/i.test(message) ? 400 : 500;
    res.status(status).json({ error: status === 500 ? 'Warehouse could not be created.' : message });
  }
});

apiRouter.post('/warehouses/:id/locations', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    const repository = new SupabaseWarehouseRepository(getRepositoryContext(req));
    const location = await repository.createLocation({
      warehouseId: req.params.id,
      locationCode: typeof body.locationCode === 'string' ? body.locationCode : '',
      locationType: typeof body.locationType === 'string' ? body.locationType : '',
      zone: typeof body.zone === 'string' ? body.zone : undefined,
      aisle: typeof body.aisle === 'string' ? body.aisle : undefined,
      shelf: typeof body.shelf === 'string' ? body.shelf : undefined,
      bin: typeof body.bin === 'string' ? body.bin : undefined,
      capacityUnits: typeof body.capacityUnits === 'number' ? body.capacityUnits : Number(body.capacityUnits ?? 0),
    });
    res.status(201).json({ location });
  } catch (error) {
    console.error('PostgreSQL warehouse location creation failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /permission|authorized|row-level security|policy/i.test(message) ? 403 : /not active|select a warehouse|must be|characters|supported|capacity|invalid/i.test(message) ? 400 : 500;
    res.status(status).json({ error: status === 500 ? 'Warehouse location could not be created.' : message });
  }
});

apiRouter.get('/returns', async (req: Request, res: Response) => {
  try {
    const repository = new SupabaseReturnRepository(getRepositoryContext(req));
    res.json({ returns: await repository.listReturns(typeof req.query.accountId === 'string' ? req.query.accountId : undefined) });
  } catch (error) {
    console.error('PostgreSQL returns listing failed:', error);
    res.status(500).json({ error: 'Returns could not be loaded from the workspace database.' });
  }
});

apiRouter.post('/returns/:id/disposition', async (req: Request, res: Response) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {};
    if (!Array.isArray(body.dispositions) || typeof body.idempotencyKey !== 'string') {
      res.status(400).json({ error: 'Return dispositions and a request ID are required.' });
      return;
    }
    const dispositions = body.dispositions.map(value => {
      const item = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      return {
        lineId: typeof item.lineId === 'string' ? item.lineId : '',
        disposition: typeof item.disposition === 'string' ? item.disposition : '',
        quantity: typeof item.quantity === 'number' ? item.quantity : Number(item.quantity),
      };
    });
    const repository = new SupabaseReturnRepository(getRepositoryContext(req));
    const result = await repository.processDisposition(
      req.params.id,
      dispositions,
      body.issueRefund === true,
      body.idempotencyKey,
    );
    res.json(result);
  } catch (error) {
    console.error('Transactional return disposition failed:', error);
    const message = error instanceof Error ? error.message : '';
    const status = /authorized|authentication|membership|permission|does not belong/i.test(message)
      ? 403
      : /not found/i.test(message)
        ? 404
        : /invalid|must |required|exceeds|cannot|only open|only be dispositioned|unsupported|already been issued|request ID|already used|location|configure|whole-number|full returned quantity/i.test(message)
          ? 400
          : 500;
    res.status(status).json({
      error: status === 500
        ? 'Return disposition could not be posted. No stock or refund entries were committed.'
        : message,
    });
  }
});

/**
 * Legacy demo-backed routes remain blocked outside explicit local demo mode.
 * Migrated PostgreSQL routes above finish their response before this middleware.
 */
apiRouter.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.NEXUS_DEMO_MODE !== 'true') {
    res.status(503).json({ error: 'Business data storage is not yet connected to the organization-scoped database. Demo records are disabled in production.' });
    return;
  }
  next();
});

/**
 * INVENTORY & STOCK LEDGER
 */
/**
 * STOCK ADJUSTMENTS & APPROVALS
 */
/**
 * EBAY INTEGRATION & EXCEPTION QUEUE
 */
apiRouter.get('/ebay/accounts', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({
    accounts: raw.marketplaceAccounts,
    recentSyncs: raw.syncRuns.slice(0, 10),
  });
});

apiRouter.post('/ebay/accounts/:id/sync', async (req: Request, res: Response) => {
  try {
    const result = await ebayAdapter.fetchOrders(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Sync failed' });
  }
});

apiRouter.post('/ebay/accounts/:id/connect', async (req: Request, res: Response) => {
  try {
    const result = await ebayAdapter.connect(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'OAuth connect failed' });
  }
});

apiRouter.get('/ebay/exceptions', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ exceptions: raw.exceptions });
});

apiRouter.post('/ebay/exceptions/:id/resolve', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const exc = raw.exceptions.find((e) => e.id === req.params.id);

  if (!exc) {
    res.status(404).json({ error: 'Exception item not found' });
    return;
  }

  const { targetProductId, resolutionNote } = req.body;
  const product = raw.products.find((p) => p.id === targetProductId);

  if (!product) {
    res.status(400).json({ error: 'Target product not found for mapping.' });
    return;
  }

  const now = new Date().toISOString();
  exc.status = 'RESOLVED';
  exc.resolvedAt = now;
  exc.resolvedBy = user.name;
  exc.resolutionNote = resolutionNote || `Mapped to internal product ${product.sku} (${product.name})`;

  // Extract external sku from snippet if available
  let externalSku = 'UNKNOWN_EXT_SKU';
  try {
    if (exc.rawPayloadSnippet) {
      const parsed = JSON.parse(exc.rawPayloadSnippet);
      externalSku = parsed.sku || parsed.externalSku || externalSku;
    }
  } catch {}

  // Add to MarketplaceSkuMap
  raw.skuMappings.push({
    id: `map_${Date.now()}`,
    productId: product.id,
    marketplaceAccountId: 'mkt_ebay_uk',
    externalSku,
    externalListingId: `lst_${Date.now()}`,
    listingTitle: product.name,
    createdAt: now,
  });

  // Re-link pending orders with this external SKU
  for (const o of raw.orders) {
    for (const l of o.lines) {
      if (l.sku === externalSku || l.productId === 'UNMAPPED') {
        l.productId = product.id;
        l.sku = product.sku;
        l.productName = product.name;
      }
    }
    if (o.notes?.includes('unmapped')) {
      o.notes = undefined;
    }
  }

  db.save();
  res.json({ success: true, exception: exc });
});

/**
 * PURCHASING & RECEIVING (PHASE 2)
 */
apiRouter.get('/suppliers', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ suppliers: raw.suppliers });
});

apiRouter.get('/purchase-orders', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ purchaseOrders: raw.purchaseOrders, receipts: raw.goodsReceipts });
});

apiRouter.post('/purchase-orders/:id/receive', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const po = raw.purchaseOrders.find((p) => p.id === req.params.id);

  if (!po) {
    res.status(404).json({ error: 'Purchase Order not found' });
    return;
  }

  const { items, discrepancyNote } = req.body;
  const now = new Date().toISOString();
  const receiptNumber = `GRN-2026-${String(raw.goodsReceipts.length + 1).padStart(3, '0')}`;

  const receiptLines: any[] = [];
  let allFulfilled = true;

  for (const item of items || []) {
    const line = po.lines.find((l) => l.productId === item.productId || l.sku === item.sku);
    if (line) {
      const qtyReceived = Number(item.receivedQty) || 0;
      const qtyDamaged = Number(item.damagedQty) || 0;
      const shortage = Math.max(0, line.orderedQty - (line.receivedQty + qtyReceived));

      line.receivedQty += qtyReceived;
      if (line.receivedQty < line.orderedQty) allFulfilled = false;

      receiptLines.push({
        productId: line.productId,
        sku: line.sku,
        receivedQty: qtyReceived,
        shortageQty: shortage,
        damagedQty: qtyDamaged,
        locationId: raw.locations[0]?.id || 'loc_def',
      });

      // Post to append-only stock ledger (FR-PO-02, AT-06)
      if (qtyReceived > 0) {
        raw.stockLedger.push({
          id: `stk_rcpt_${Date.now()}_${line.sku}`,
          skuId: line.productId,
          sku: line.sku,
          productName: line.productName,
          locationId: raw.locations[0]?.id || 'loc_def',
          locationCode: 'Zone A / A1 / S01 / B01',
          ownerType: 'OPERATOR',
          ownerId: 'operator',
          qtyDelta: qtyReceived,
          state: 'ON_HAND',
          sourceType: 'PO_RECEIPT',
          sourceId: receiptNumber,
          unitCostMinor: line.unitCostMinor,
          note: `Received under ${receiptNumber} against PO ${po.poNumber}`,
          createdBy: user.email,
          createdAt: now,
        });

        // Double-entry financial posting: Debit Inventory Asset, Credit GRNI (Table 12.2)
        const totalReceivedValue = qtyReceived * line.unitCostMinor;
        raw.financialLedger.push({
          id: `fin_grn_inv_${Date.now()}`,
          accountId: '1300',
          accountName: 'Inventory Asset',
          debitMinor: totalReceivedValue,
          creditMinor: 0,
          sourceType: 'RECEIPT',
          sourceId: receiptNumber,
          note: `GRN ${receiptNumber} Receipt of ${qtyReceived}x ${line.sku}`,
          createdAt: now,
        });
        raw.financialLedger.push({
          id: `fin_grn_liab_${Date.now()}`,
          accountId: '2050',
          accountName: 'Goods Received Not Invoiced (GRNI)',
          debitMinor: 0,
          creditMinor: totalReceivedValue,
          sourceType: 'RECEIPT',
          sourceId: receiptNumber,
          note: `Accrued inventory liability for ${receiptNumber}`,
          createdAt: now,
        });
      }
    }
  }

  po.status = allFulfilled ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
  po.updatedAt = now;

  const receipt = {
    id: `rcpt_${Date.now()}`,
    receiptNumber,
    poId: po.id,
    poNumber: po.poNumber,
    receivedBy: user.email,
    receivedAt: now,
    lines: receiptLines,
    discrepancyNote,
  };

  raw.goodsReceipts.unshift(receipt);
  db.save();
  res.json({ success: true, receipt, purchaseOrder: po });
});

/**
 * RETURNS & REFUNDS (PHASE 2)
 */
apiRouter.get('/returns', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ returns: raw.returns });
});

apiRouter.post('/returns/:id/disposition', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const ret = raw.returns.find((r) => r.id === req.params.id);

  if (!ret) {
    res.status(404).json({ error: 'Return record not found' });
    return;
  }

  const { dispositions, issueRefund } = req.body;
  const now = new Date().toISOString();

  // dispositions: array of { lineId, disposition: 'RESTOCK' | 'DAMAGED' | 'QUARANTINE' | 'DISPOSE', quantity }
  for (const disp of dispositions || []) {
    const line = ret.lines.find((l) => l.id === disp.lineId);
    if (line) {
      line.disposition = disp.disposition;
      const targetState: StockState =
        disp.disposition === 'RESTOCK'
          ? 'ON_HAND'
          : disp.disposition === 'DAMAGED'
          ? 'DAMAGED'
          : disp.disposition === 'QUARANTINE'
          ? 'QUARANTINED'
          : 'ON_HAND';

      if (disp.disposition !== 'DISPOSE') {
        // Post to append-only stock ledger (FR-RET-03, AT-10)
        raw.stockLedger.push({
          id: `stk_ret_${Date.now()}_${line.sku}`,
          skuId: line.productId,
          sku: line.sku,
          productName: line.sku,
          locationId: disp.disposition === 'RESTOCK' ? 'loc_def' : 'loc_damaged',
          locationCode: disp.disposition === 'RESTOCK' ? 'Zone A / A1 / S01 / B01' : 'Quarantine / Q1 / S01 / Q-DMG',
          ownerType: 'OPERATOR',
          ownerId: 'operator',
          qtyDelta: line.quantity,
          state: targetState,
          sourceType: 'RETURN_DISPOSITION',
          sourceId: ret.returnNumber,
          note: `Customer return disposition [${disp.disposition}] for ${ret.returnNumber}`,
          createdBy: user.email,
          createdAt: now,
        });
      }
    }
  }

  if (issueRefund) {
    ret.refundStatus = 'ISSUED';
    // Double entry: Debit Sales Returns, Credit Marketplace Clearing/Bank (Table 12.2)
    if (ret.refundAmountMinor) {
      raw.financialLedger.push({
        id: `fin_ref_dr_${Date.now()}`,
        accountId: '4100',
        accountName: 'Sales Returns & Allowances',
        debitMinor: ret.refundAmountMinor,
        creditMinor: 0,
        sourceType: 'REFUND',
        sourceId: ret.returnNumber,
        note: `Customer refund for Return ${ret.returnNumber}`,
        createdAt: now,
      });
      raw.financialLedger.push({
        id: `fin_ref_cr_${Date.now()}`,
        accountId: '1100',
        accountName: 'Marketplace Clearing (eBay UK)',
        debitMinor: 0,
        creditMinor: ret.refundAmountMinor,
        sourceType: 'REFUND',
        sourceId: ret.returnNumber,
        note: `Clearing offset for refund ${ret.returnNumber}`,
        createdAt: now,
      });
    }
  }

  ret.status = 'INSPECTED';
  ret.inspectedAt = now;
  db.save();
  res.json({ success: true, return: ret });
});

/**
 * 3PL CLIENTS & STORAGE (PHASE 3)
 */
apiRouter.get('/3pl/clients', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ clients: raw.clients, rateCards: raw.rateCards });
});

apiRouter.get('/3pl/storage-snapshots', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ snapshots: raw.storageSnapshots });
});

apiRouter.post('/3pl/billing-preview', (req: Request, res: Response) => {
  const raw = db.getRawData();
  const { clientId } = req.body;
  const client = raw.clients.find((c) => c.id === clientId) || raw.clients[0];
  const rateCard = raw.rateCards.find((r) => r.id === client.rateCardId) || raw.rateCards[0];

  // Storage preview based on snapshot
  const snapshot = raw.storageSnapshots.find((s) => s.clientId === client.id) || {
    occupiedPallets: 4,
    occupiedShelves: 6,
    occupiedBins: 12,
  };

  const palletCharge = (snapshot.occupiedPallets || 0) * rateCard.storagePalletPerMonthMinor;
  const shelfCharge = (snapshot.occupiedShelves || 0) * rateCard.storageShelfPerMonthMinor;
  const binCharge = (snapshot.occupiedBins || 0) * rateCard.storageBinPerMonthMinor;
  const subtotalStorage = palletCharge + shelfCharge + binCharge;

  // Handling charges from client orders
  const clientOrders = raw.orders.filter((o) => o.ownerId === client.id);
  const pickPackUnits = clientOrders.reduce((a, o) => a + o.lines.reduce((acc, l) => acc + l.quantity, 0), 0);
  const handlingCharge = pickPackUnits * (rateCard.pickFeeMinor + rateCard.packFeeMinor);

  const grandTotal = Math.max(rateCard.minimumMonthlyChargeMinor, subtotalStorage + handlingCharge);

  res.json({
    client,
    rateCard,
    preview: {
      palletChargeMinor: palletCharge,
      shelfChargeMinor: shelfCharge,
      binChargeMinor: binCharge,
      subtotalStorageMinor: subtotalStorage,
      handlingChargeMinor: handlingCharge,
      unitsHandled: pickPackUnits,
      grandTotalMinor: grandTotal,
      isMinimumApplied: grandTotal === rateCard.minimumMonthlyChargeMinor && subtotalStorage + handlingCharge < rateCard.minimumMonthlyChargeMinor,
    },
  });
});

/**
 * FINANCE & LEDGERS (PHASE 4)
 */
apiRouter.get('/finance/invoices', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  let invoices = [...raw.invoices];

  if (user.role === 'CLIENT_USER') {
    invoices = invoices.filter((i) => i.recipientId === user.clientId);
  }

  res.json({ invoices });
});

apiRouter.post('/finance/invoices/:id/void', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();

  // Rule: Voiding financial records requires Super Admin and a mandatory reason (SRS S4, A.4.2, AT-13)
  if (user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Permission denied: Only Super Admin can void financial records.' });
    return;
  }

  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    res.status(400).json({ error: 'A mandatory void reason must be provided.' });
    return;
  }

  const inv = raw.invoices.find((i) => i.id === req.params.id);
  if (!inv) {
    res.status(404).json({ error: 'Invoice not found' });
    return;
  }

  const now = new Date().toISOString();
  inv.status = 'VOID';
  inv.voidReason = reason;

  // Reversing entry in financial ledger (Table 12.2, BR-05)
  raw.financialLedger.push({
    id: `fin_rev_${Date.now()}`,
    accountId: '1200',
    accountName: 'Accounts Receivable',
    debitMinor: 0,
    creditMinor: inv.totalMinor,
    sourceType: 'INVOICE',
    sourceId: inv.invoiceNumber,
    note: `Reversing entry for VOIDED invoice ${inv.invoiceNumber}. Reason: ${reason}`,
    createdAt: now,
  });

  raw.auditLogs.unshift({
    id: `aud_${Date.now()}`,
    actorId: user.id,
    actorName: user.name,
    action: 'VOID',
    entity: 'Invoice',
    entityId: inv.id,
    afterSnapshot: JSON.parse(JSON.stringify(inv)),
    notes: `Voided invoice ${inv.invoiceNumber}. Reason: ${reason}`,
    timestamp: now,
  });

  db.save();
  res.json({ success: true, invoice: inv });
});

apiRouter.get('/finance/payments', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ payments: raw.payments });
});

apiRouter.post('/finance/payments', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const { amountMinor, paymentMethod, reference, payerName, allocations } = req.body;

  if (!amountMinor || !allocations || allocations.length === 0) {
    res.status(400).json({ error: 'Amount and invoice allocations are required.' });
    return;
  }

  const now = new Date().toISOString();
  const paymentNumber = `PAY-2026-${String(raw.payments.length + 1).padStart(3, '0')}`;

  let totalAllocated = 0;
  for (const alloc of allocations) {
    const inv = raw.invoices.find((i) => i.id === alloc.invoiceId);
    if (inv) {
      const allocAmt = Number(alloc.amountMinor);
      inv.paidAmountMinor += allocAmt;
      totalAllocated += allocAmt;
      inv.status = inv.paidAmountMinor >= inv.totalMinor ? 'PAID' : 'PART_PAID';
    }
  }

  const unallocated = Math.max(0, Number(amountMinor) - totalAllocated);

  const payment: any = {
    id: `pay_${Date.now()}`,
    paymentNumber,
    amountMinor: Number(amountMinor),
    paymentMethod: paymentMethod || 'BANK_TRANSFER',
    paymentDate: now.split('T')[0],
    reference: reference || 'BANK-MATCH',
    payerName: payerName || 'Client Settlement',
    recordedBy: user.email,
    allocations,
    unallocatedCreditMinor: unallocated,
    createdAt: now,
  };

  raw.payments.unshift(payment);

  // Financial ledger posting: Debit Cash, Credit AR (Table 12.2)
  raw.financialLedger.push({
    id: `fin_pay_dr_${Date.now()}`,
    accountId: '1000',
    accountName: 'Operating Bank Account',
    debitMinor: Number(amountMinor),
    creditMinor: 0,
    sourceType: 'PAYMENT',
    sourceId: paymentNumber,
    note: `Recorded client payment ${paymentNumber} ref: ${reference}`,
    createdAt: now,
  });
  raw.financialLedger.push({
    id: `fin_pay_cr_${Date.now()}`,
    accountId: '1200',
    accountName: 'Accounts Receivable',
    debitMinor: 0,
    creditMinor: Number(amountMinor),
    sourceType: 'PAYMENT',
    sourceId: paymentNumber,
    note: `Settlement against allocated invoices`,
    createdAt: now,
  });

  db.save();
  res.status(201).json({ payment });
});

apiRouter.get('/finance/expenses', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ expenses: raw.expenses });
});

apiRouter.get('/finance/ledger', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ ledger: raw.financialLedger });
});

/**
 * 14 REPORTS & EXPORTS
 */
apiRouter.get('/reports/:id', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const { startDate, endDate, accountId, sku } = req.query;

  try {
    const reportData = reportsService.generateReport(req.params.id, {
      startDate: startDate as string,
      endDate: endDate as string,
      accountId: accountId as string,
      clientId: user.clientId,
      sku: sku as string,
      userRole: user.role,
    });

    if (req.query.format === 'csv') {
      const csv = reportsService.exportToCsv(reportData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${reportData.id}_${Date.now()}.csv"`);
      res.send(csv);
      return;
    }

    res.json(reportData);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Report generation error' });
  }
});

/**
 * SYSTEM AUDIT LOG, NOTIFICATIONS & CONFIG
 */
apiRouter.get('/audit-logs', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ logs: raw.auditLogs });
});

apiRouter.get('/notifications', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ notifications: raw.notifications });
});

apiRouter.post('/notifications/:id/dismiss', (req: Request, res: Response) => {
  const raw = db.getRawData();
  const notif = raw.notifications.find((n) => n.id === req.params.id);
  if (notif) {
    notif.isDismissed = true;
    db.save();
  }
  res.json({ success: true });
});

apiRouter.get('/system/config', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ config: raw.config });
});

apiRouter.post('/system/config', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();

  if (user.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Only Super Admin can update system configuration.' });
    return;
  }

  raw.config = { ...raw.config, ...req.body };
  db.save();
  res.json({ config: raw.config });
});

apiRouter.post('/system/reset-demo', (_req: Request, res: Response) => {
  db.resetToSeed();
  res.json({ success: true, message: 'Database reset to verified baseline seed data.' });
});

apiRouter.post('/system/reload', (_req: Request, res: Response) => {
  db.reload();
  res.json({ success: true, message: 'Database reloaded from disk.' });
});

// Common alias endpoints
apiRouter.get('/users', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ users: raw.users });
});
apiRouter.get('/config', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ config: raw.config });
});
apiRouter.get('/me', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  res.json({ user });
});
apiRouter.get('/exceptions', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ exceptions: raw.exceptions });
});

/**
 * PHASE 4 – EBAY PAYOUTS & RECONCILIATION
 */
apiRouter.get('/payouts', (req: Request, res: Response) => {
  const raw = db.getRawData();
  const { accountId } = req.query;
  let payouts = raw.payouts || [];
  if (accountId && accountId !== 'ALL') {
    payouts = payouts.filter((p) => p.marketplaceAccountId === accountId);
  }
  res.json({ payouts });
});

apiRouter.post('/payouts/:id/confirm-deposit', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const payout = (raw.payouts || []).find((p) => p.id === req.params.id);
  if (!payout) {
    res.status(404).json({ error: 'Payout not found' });
    return;
  }

  payout.status = 'BANK_CONFIRMED';
  payout.bankDepositStatus = 'RECONCILED';
  payout.bankReference = req.body.bankReference || `BANK-DEP-${Date.now()}`;

  const now = new Date().toISOString();
  raw.financialLedger.push({
    id: `fin_pay_dep_${Date.now()}`,
    accountId: '1000',
    accountName: 'Operating Cash at Bank (Barclays)',
    debitMinor: payout.netPayoutMinor,
    creditMinor: 0,
    sourceType: 'PAYMENT',
    sourceId: payout.id,
    note: `Bank Deposit Cleared for ${payout.accountName} Payout ${payout.payoutId}`,
    createdAt: now,
  });

  raw.financialLedger.push({
    id: `fin_pay_clr_${Date.now()}`,
    accountId: '1250',
    accountName: 'Marketplace Settlement Clearing',
    debitMinor: 0,
    creditMinor: payout.netPayoutMinor,
    sourceType: 'PAYMENT',
    sourceId: payout.id,
    note: `Clearing settlement for ${payout.payoutId}`,
    createdAt: now,
  });

  raw.auditLogs.unshift({
    id: `aud_payout_${Date.now()}`,
    actorId: user.id,
    actorName: user.name,
    action: 'APPROVE',
    entity: 'EbayPayout',
    entityId: payout.id,
    notes: `Confirmed bank deposit for payout ${payout.payoutId} by ${user.name}`,
    timestamp: now,
  });

  db.save();
  res.json({ success: true, payout });
});

apiRouter.get('/reconciliation', (req: Request, res: Response) => {
  const raw = db.getRawData();
  const { accountId } = req.query;
  let reconciliations = raw.reconciliations || [];
  if (accountId && accountId !== 'ALL') {
    reconciliations = reconciliations.filter((r) => r.marketplaceAccountId === accountId);
  }
  res.json({ reconciliations });
});

/**
 * PHASE 3 – WAREHOUSE SERVICES (STORAGE, PACKAGING, SHIPPING, BILLING)
 */
apiRouter.get('/warehouse-services/summary', (req: Request, res: Response) => {
  const raw = db.getRawData();
  const clients = raw.clients || [];
  const pkgJobs = raw.packagingJobs || [];
  const shpJobs = raw.shippingJobs || [];

  const totalPackagingCharges = pkgJobs.reduce((acc, j) => acc + j.totalChargeMinor, 0);
  const totalShippingCharges = shpJobs.reduce((acc, j) => acc + j.totalChargeMinor, 0);
  const totalStorageCharges = 21600;
  const totalServiceCharges = totalPackagingCharges + totalShippingCharges + totalStorageCharges;
  const totalPaid = 36000;
  const outstandingBalance = Math.max(0, totalServiceCharges - totalPaid);

  res.json({
    summary: {
      totalClients: clients.length,
      totalServicesProvided: pkgJobs.length + shpJobs.length + 18,
      totalPackagingChargesMinor: totalPackagingCharges,
      totalShippingChargesMinor: totalShippingCharges,
      totalStorageChargesMinor: totalStorageCharges,
      totalServiceChargesMinor: totalServiceCharges,
      totalPaidMinor: totalPaid,
      outstandingBalanceMinor: outstandingBalance,
      currency: raw.config.baseCurrency,
    },
    clients,
    packagingJobs: pkgJobs,
    shippingJobs: shpJobs,
  });
});

apiRouter.get('/warehouse-services/packaging', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ packagingJobs: raw.packagingJobs || [] });
});

apiRouter.post('/warehouse-services/packaging', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const body = req.body;

  const now = new Date().toISOString();
  const newJob: WarehousePackagingJob = {
    id: `pkg_${Date.now()}`,
    jobNumber: `PKG-2026-${String((raw.packagingJobs || []).length + 1).padStart(3, '0')}`,
    clientId: body.clientId,
    clientName: body.clientName || 'Client',
    date: now,
    packagingType: body.packagingType || 'CUSTOM_BOX',
    quantity: Number(body.quantity) || 1,
    materialCostMinor: Number(body.materialCostMinor) || 1000,
    serviceChargeMinor: Number(body.serviceChargeMinor) || 2000,
    totalChargeMinor: (Number(body.materialCostMinor) || 1000) + (Number(body.serviceChargeMinor) || 2000),
    status: 'COMPLETED',
    orderNumber: body.orderNumber,
    performedBy: user.name,
    notes: body.notes,
  };

  raw.packagingJobs = raw.packagingJobs || [];
  raw.packagingJobs.unshift(newJob);
  db.save();
  res.status(201).json({ job: newJob });
});

apiRouter.get('/warehouse-services/shipping', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ shippingJobs: raw.shippingJobs || [] });
});

apiRouter.post('/warehouse-services/shipping', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const body = req.body;

  const now = new Date().toISOString();
  const newJob: WarehouseShippingJob = {
    id: `shp_${Date.now()}`,
    dispatchId: `DSP-2026-${String((raw.shippingJobs || []).length + 1).padStart(3, '0')}`,
    clientId: body.clientId,
    clientName: body.clientName || 'Client',
    date: now,
    carrier: body.carrier || 'Royal Mail',
    trackingNumber: body.trackingNumber || `TRACK-${Date.now()}`,
    serviceLevel: body.serviceLevel || 'Standard Tracked',
    parcelWeightKg: Number(body.parcelWeightKg) || 1.0,
    carrierCostMinor: Number(body.carrierCostMinor) || 450,
    serviceChargeMinor: Number(body.serviceChargeMinor) || 750,
    totalChargeMinor: (Number(body.carrierCostMinor) || 450) + (Number(body.serviceChargeMinor) || 750),
    status: 'DISPATCHED',
    orderNumber: body.orderNumber || 'DIRECT',
    destination: body.destination || 'United Kingdom',
  };

  raw.shippingJobs = raw.shippingJobs || [];
  raw.shippingJobs.unshift(newJob);
  db.save();
  res.status(201).json({ job: newJob });
});

/**
 * PHASE 1 – DROPSHIPPING COST CALCULATOR
 */
apiRouter.get('/dropshipping/calculations', (_req: Request, res: Response) => {
  const raw = db.getRawData();
  res.json({ calculations: raw.dropshippingCalculations || [] });
});

apiRouter.post('/dropshipping/calculations', (req: Request, res: Response) => {
  const user = getActiveUser(req);
  const raw = db.getRawData();
  const body = req.body;

  const now = new Date().toISOString();
  const calc: DropshippingCalculation = {
    id: `ds_${Date.now()}`,
    productId: body.productId,
    sku: body.sku,
    productName: body.productName,
    supplierName: body.supplierName,
    purchaseCostMinor: Number(body.purchaseCostMinor) || 0,
    supplierCostMinor: Number(body.supplierCostMinor) || 0,
    shippingCostMinor: Number(body.shippingCostMinor) || 0,
    packagingCostMinor: Number(body.packagingCostMinor) || 0,
    additionalExpensesMinor: Number(body.additionalExpensesMinor) || 0,
    sellingPriceMinor: Number(body.sellingPriceMinor) || 0,
    marketplaceFeePercent: Number(body.marketplaceFeePercent) || 12.8,
    marketplaceFeeMinor: Number(body.marketplaceFeeMinor) || 0,
    otherCostsMinor: Number(body.otherCostsMinor) || 0,
    shippingOption: body.shippingOption || 'SHIPPING_INCLUDED',
    shippingChargedToCustomerMinor: Number(body.shippingChargedToCustomerMinor) || 0,
    totalCostMinor: Number(body.totalCostMinor) || 0,
    grossProfitMinor: Number(body.grossProfitMinor) || 0,
    marginPercent: Number(body.marginPercent) || 0,
    netProfitMinor: Number(body.netProfitMinor) || 0,
    currency: body.currency || 'GBP',
    updatedAt: now,
    updatedBy: user.name,
  };

  raw.dropshippingCalculations = raw.dropshippingCalculations || [];
  const existingIdx = raw.dropshippingCalculations.findIndex((c) => c.sku === calc.sku);
  if (existingIdx >= 0) {
    raw.dropshippingCalculations[existingIdx] = calc;
  } else {
    raw.dropshippingCalculations.unshift(calc);
  }

  db.save();
  res.status(201).json({ calculation: calc });
});

// 404 for unhandled API calls
apiRouter.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

