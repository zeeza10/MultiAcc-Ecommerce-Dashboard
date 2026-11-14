import type { AuthContext } from '../types';
import { json } from '../http';


import { SupabaseProductRepository } from '../../server/repositories/productRepository';
import { SupabaseInventoryRepository } from '../../server/repositories/inventoryRepository';
import { SupabaseWarehouseRepository } from '../../server/repositories/warehouseRepository';

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
