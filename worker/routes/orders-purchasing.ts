import type { AuthContext } from '../types';
import { json } from '../http';
import { SupabaseOrderRepository } from '../../server/repositories/orderRepository';
import { SupabasePurchasingRepository } from '../../server/repositories/purchasingRepository';



export async function handleOrderPurchasingRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
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

  const orderEditMatch = path.match(/^\/orders\/([^/]+)$/);
  if (orderEditMatch && request.method === 'PUT') {
    if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot edit workspace orders.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const { error } = await auth.repositoryContext.supabase.rpc('update_workspace_order', {
      p_organization_id: auth.organizationId,
      p_order_id: orderEditMatch[1],
      p_order: body,
    });
    if (error) throw new Error(error.message || 'Order could not be updated.');
    const result = await new SupabaseOrderRepository(auth.repositoryContext).getOrder(orderEditMatch[1]);
    return result ? json({ order: result.order }) : json({ error: 'Updated order could not be reloaded.' }, 500);
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
    const suppliers = await new SupabasePurchasingRepository(auth.repositoryContext).listSuppliers(url.searchParams.get('accountId') || undefined);
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
      repository.listPurchaseOrders(url.searchParams.get('accountId') || undefined),
      repository.listGoodsReceipts(url.searchParams.get('accountId') || undefined),
    ]);
    return json({ purchaseOrders, receipts });
  }

  return null;
}
