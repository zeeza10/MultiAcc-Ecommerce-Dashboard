import type { AuthContext } from '../types';
import { json } from '../http';


import { SupabaseProductRepository } from '../../server/repositories/productRepository';
import { SupabaseInventoryRepository } from '../../server/repositories/inventoryRepository';
import { SupabaseWarehouseRepository } from '../../server/repositories/warehouseRepository';

// Store-aware inventory reads use marketplace allocations while preserving the physical workspace ledger for All Stores.
export async function handleInventoryRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
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
    const accountId = url.searchParams.get('accountId');
    let includeDemo = false;
    if (accountId && accountId !== 'ALL') {
      const { data: account, error: accountError } = await auth.repositoryContext.supabase
        .from('marketplace_accounts')
        .select('id,is_demo')
        .eq('id', accountId)
        .eq('organization_id', auth.organizationId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: 'The selected marketplace account was not found in this workspace.' }, 404);
      includeDemo = Boolean(account.is_demo);
    }
    let products = await repository.listForOrganization({
      client3plId: auth.user.clientId,
      onlyClientProducts: isClientUser,
      includeDemo,
    });
    let balances = await new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
      client3plId: auth.user.clientId,
      onlyClientProducts: isClientUser,
    });
    if (accountId && accountId !== 'ALL') {
      if (!auth.permissions.has('*') && !auth.permissions.has('inventory.view')) return json({ error: 'Inventory access is required.' }, 403);
      const { data: mappings, error: mappingError } = await auth.repositoryContext.supabase
        .from('marketplace_sku_mappings').select('product_id')
        .eq('organization_id', auth.organizationId).eq('marketplace_account_id', accountId);
      if (mappingError) throw mappingError;
      const ids = [...new Set((mappings || []).map(row => row.product_id))];
      products = products.filter(product => ids.includes(product.id));
      const { data: allocations, error: allocationError } = await auth.repositoryContext.supabase
        .from('marketplace_inventory_allocations').select('product_id,allocated_quantity,reserved_quantity')
        .eq('organization_id', auth.organizationId).eq('marketplace_account_id', accountId);
      if (allocationError) throw allocationError;
      const allocationByProduct = new Map((allocations || []).map(row => [row.product_id, row]));
      balances = products.map(product => {
        const allocation = allocationByProduct.get(product.id);
        const allocated = Number(allocation?.allocated_quantity || 0);
        const reserved = Number(allocation?.reserved_quantity || 0);
        return { productId: product.id, sku: product.sku, ownerId: product.ownerId,
          onHand: allocated, reserved, available: Math.max(0, allocated-reserved),
          incoming: 0, damaged: 0, quarantined: 0, missing: 0, totalStock: allocated,
          weightedAverageCostMinor: product.costPriceMinor };
      });
    }
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

  if (path === '/inventory/allocations' && request.method === 'POST') {
    if (!auth.permissions.has('*') && !auth.permissions.has('inventory.manage')) return json({ error: 'Inventory management permission is required.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const allocated = Number(body.allocatedQuantity);
    const reserved = Number(body.reservedQuantity || 0);
    if (!Number.isSafeInteger(allocated) || !Number.isSafeInteger(reserved) || allocated < 0 || reserved < 0 || reserved > allocated) {
      return json({ error: 'Allocated and reserved quantities must be valid whole numbers.' }, 400);
    }
    const { data, error } = await auth.repositoryContext.supabase.rpc('set_marketplace_inventory_allocation', {
      p_organization_id: auth.organizationId,
      p_marketplace_account_id: String(body.marketplaceAccountId || ''),
      p_product_id: String(body.productId || ''),
      p_allocated_quantity: allocated,
      p_reserved_quantity: reserved,
      p_source: String(body.source || 'MANUAL'),
    });
    if (error) throw new Error(error.message || 'Store inventory allocation failed.');
    return json({ allocation: data }, 201);
  }

  if (path === '/inventory/balances' && request.method === 'GET') {
    const accountId = url.searchParams.get('accountId');
    if (accountId && accountId !== 'ALL') {
      if (!auth.permissions.has('*') && !auth.permissions.has('inventory.view')) return json({ error: 'Inventory access is required.' }, 403);
      const { data: allocations, error } = await auth.repositoryContext.supabase
        .from('marketplace_inventory_allocations')
        .select('product_id,allocated_quantity,reserved_quantity')
        .eq('organization_id', auth.organizationId)
        .eq('marketplace_account_id', accountId);
      if (error) throw error;
      const ids = [...new Set((allocations || []).map(row => row.product_id))];
      const { data: products, error: productError } = ids.length
        ? await auth.repositoryContext.supabase.from('products')
            .select('id,sku,name,owner_type,client_3pl_id,cost_price_minor')
            .eq('organization_id', auth.organizationId).in('id', ids)
        : { data: [], error: null };
      if (productError) throw productError;
      const productById = new Map((products || []).map(row => [row.id, row]));
      return json({ balances: (allocations || []).map(row => {
        const product = productById.get(row.product_id);
        const onHand = Number(row.allocated_quantity || 0);
        const reserved = Number(row.reserved_quantity || 0);
        return {
          productId: row.product_id, sku: product?.sku || '', ownerId: product?.client_3pl_id || 'operator',
          onHand, reserved, available: Math.max(0, onHand - reserved), incoming: 0,
          damaged: 0, quarantined: 0, missing: 0, totalStock: onHand,
          weightedAverageCostMinor: Number(product?.cost_price_minor || 0),
        };
      }) });
    }
    return json({ balances: await inventory.listBalances(options) });
  }
  if (path === '/inventory/ledger' && request.method === 'GET') {
    const accountId = url.searchParams.get('accountId');
    if (accountId && accountId !== 'ALL') {
      if (!auth.permissions.has('*') && !auth.permissions.has('inventory.view')) return json({ error: 'Inventory access is required.' }, 403);
      const { data, error } = await auth.repositoryContext.supabase
        .from('stock_ledger')
        .select('id,product_id,location_id,client_3pl_id,quantity_delta,stock_state,source_type,source_id,unit_cost_minor,note,created_by,created_at,marketplace_account_id,products(sku,name)')
        .eq('organization_id', auth.organizationId)
        .eq('marketplace_account_id', accountId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return json({ ledger: (data || []).map(row => ({
        id: row.id, skuId: row.product_id, sku: (row.products as any)?.sku || '',
        productName: (row.products as any)?.name || '', locationId: row.location_id || '',
        locationCode: '', ownerType: 'OPERATOR', ownerId: row.client_3pl_id || 'operator',
        qtyDelta: Number(row.quantity_delta), state: row.stock_state, sourceType: row.source_type,
        sourceId: row.source_id || '', unitCostMinor: row.unit_cost_minor == null ? undefined : Number(row.unit_cost_minor),
        note: row.note || undefined, createdBy: row.created_by || '', createdAt: row.created_at,
      })) });
    }
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
  return null;
}
