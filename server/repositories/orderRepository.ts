import type { Order, OrderLine, OrderStatus, OwnerType } from '../types';
import type { RepositoryContext } from './context';

type OrderRow = {
  id: string;
  organization_id: string;
  order_number: string;
  marketplace_account_id: string | null;
  external_order_id: string | null;
  sales_source: Order['salesSource'];
  owner_type: OwnerType;
  client_3pl_id: string | null;
  customer_name: string;
  customer_email: string | null;
  shipping_address: Record<string, unknown> | null;
  status: OrderStatus;
  payment_state: Order['paymentState'];
  total_minor: number | string;
  tax_minor: number | string;
  shipping_charge_minor: number | string;
  shipping_cost_minor: number | string | null;
  currency: string;
  carrier: string | null;
  tracking_number: string | null;
  raw_payload: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  sku: string;
  product_name: string;
  quantity: number;
  unit_price_minor: number | string;
  tax_amount_minor: number | string;
  total_price_minor: number | string;
  is_backordered: boolean;
  reserved_quantity: number;
};

type OrderHistoryRow = {
  id: string;
  order_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  note: string | null;
  changed_at: string;
};

const PAGE_SIZE = 500;
const ORDER_COLUMNS = [
  'id', 'organization_id', 'order_number', 'marketplace_account_id',
  'external_order_id', 'sales_source', 'owner_type', 'client_3pl_id',
  'customer_name', 'customer_email', 'shipping_address', 'status',
  'payment_state', 'total_minor', 'tax_minor', 'shipping_charge_minor',
  'shipping_cost_minor', 'currency', 'carrier', 'tracking_number',
  'raw_payload', 'notes', 'created_at', 'updated_at',
].join(',');

export interface OrderListOptions {
  status?: string;
  accountId?: string;
  dataEnvironment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION';
  search?: string;
  client3plId?: string;
  onlyClientOrders?: boolean;
}

export interface OrderRepository {
  listOrders(options?: OrderListOptions): Promise<Order[]>;
  createOrder(payload: Record<string, unknown>): Promise<Order>;
  transitionOrder(orderId: string, targetStatus: OrderStatus, options?: { carrier?: string; trackingNumber?: string; note?: string }): Promise<Order>;
  getOrder(orderId: string, options?: Pick<OrderListOptions, 'client3plId' | 'onlyClientOrders'>): Promise<{ order: Order; histories: Array<Record<string, unknown>> } | null>;
}

const mapOrderItem = (row: OrderItemRow): OrderLine => ({
  id: row.id,
  orderId: row.order_id,
  productId: row.product_id || '',
  sku: row.sku,
  productName: row.product_name,
  quantity: Number(row.quantity),
  unitPriceMinor: Number(row.unit_price_minor),
  taxAmountMinor: Number(row.tax_amount_minor),
  totalPriceMinor: Number(row.total_price_minor),
  isBackordered: Boolean(row.is_backordered),
  reservedQuantity: Number(row.reserved_quantity),
});

const mapOrder = (row: OrderRow, lines: OrderLine[], includeRawPayload = false): Order => {
  const address = row.shipping_address || {};
  return {
    id: row.id,
    orderNumber: row.order_number,
    marketplaceAccountId: row.marketplace_account_id || undefined,
    externalOrderId: row.external_order_id || undefined,
    salesSource: row.sales_source,
    ownerType: row.owner_type,
    ownerId: row.client_3pl_id || 'operator',
    customerName: row.customer_name,
    customerEmail: row.customer_email || '',
    shippingAddress: {
      name: String(address.name || row.customer_name),
      street: String(address.street || ''),
      city: String(address.city || ''),
      county: typeof address.county === 'string' ? address.county : undefined,
      postalCode: String(address.postalCode || address.postal_code || ''),
      country: String(address.country || address.country_code || ''),
    },
    status: row.status,
    paymentState: row.payment_state,
    totalMinor: Number(row.total_minor),
    taxMinor: Number(row.tax_minor),
    shippingChargeMinor: Number(row.shipping_charge_minor),
    currency: row.currency.trim(),
    lines,
    carrier: row.carrier || undefined,
    trackingNumber: row.tracking_number || undefined,
    shippingCostMinor: row.shipping_cost_minor == null ? undefined : Number(row.shipping_cost_minor),
    ...(includeRawPayload && row.raw_payload ? { rawPayload: row.raw_payload } : {}),
    notes: row.notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Read-only order persistence slice. Every query is scoped to the verified
 * workspace and uses the request's caller-JWT Supabase client, preserving RLS.
 */
export class SupabaseOrderRepository implements OrderRepository {
  constructor(private readonly context: RepositoryContext) {}

  private async readOrderRows(options: OrderListOptions = {}): Promise<OrderRow[]> {
    const rows: OrderRow[] = [];
    const scopedClientId = this.context.client3plId || (options.onlyClientOrders ? options.client3plId : undefined);
    if (options.onlyClientOrders && !scopedClientId) return [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = this.context.supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .eq('organization_id', this.context.organizationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      if (options.dataEnvironment) query = query.eq('data_environment', options.dataEnvironment);
      if (options.status && options.status !== 'ALL') query = query.eq('status', options.status);
      if (options.accountId && options.accountId !== 'ALL') query = query.eq('marketplace_account_id', options.accountId);
      if (scopedClientId) query = query.eq('client_3pl_id', scopedClientId);

      const { data, error } = await query;
      if (error) throw error;
      const page = (data || []) as unknown as OrderRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const search = options.search?.trim().toLocaleLowerCase();
    if (!search) return rows;
    return rows.filter(row => [
      row.order_number,
      row.external_order_id || '',
      row.customer_name,
      row.customer_email || '',
    ].some(value => value.toLocaleLowerCase().includes(search)));
  }

  private async readItems(orderIds: string[]): Promise<OrderItemRow[]> {
    if (orderIds.length === 0) return [];
    const rows: OrderItemRow[] = [];
    for (let start = 0; start < orderIds.length; start += 100) {
      const ids = orderIds.slice(start, start + 100);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await this.context.supabase
          .from('order_items')
          .select('id,order_id,product_id,sku,product_name,quantity,unit_price_minor,tax_amount_minor,total_price_minor,is_backordered,reserved_quantity')
          .eq('organization_id', this.context.organizationId)
          .in('order_id', ids)
          .order('id', { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const page = (data || []) as unknown as OrderItemRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }
    return rows;
  }

  async createOrder(payload: Record<string, unknown>): Promise<Order> {
    if (this.context.client3plId) throw new Error('Client users cannot create workspace orders.');
    const { data, error } = await this.context.supabase.rpc('create_workspace_order', {
      p_organization_id: this.context.organizationId,
      p_order: payload,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('The database returned an invalid order response.');
    const result = data as { order?: OrderRow; lines?: OrderItemRow[] };
    if (!result.order || !Array.isArray(result.lines)) throw new Error('The database returned an incomplete order response.');
    return mapOrder(result.order, result.lines.map(mapOrderItem));
  }

  async transitionOrder(
    orderId: string,
    targetStatus: OrderStatus,
    options: { carrier?: string; trackingNumber?: string; note?: string } = {},
  ): Promise<Order> {
    if (this.context.client3plId) throw new Error('Client users cannot transition workspace orders.');
    const { data, error } = await this.context.supabase.rpc('transition_workspace_order', {
      p_organization_id: this.context.organizationId,
      p_order_id: orderId,
      p_target_status: targetStatus,
      p_options: options,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('The database returned an invalid order transition response.');
    const result = data as { order?: OrderRow; lines?: OrderItemRow[] };
    if (!result.order || !Array.isArray(result.lines)) throw new Error('The database returned an incomplete order transition response.');
    return mapOrder(result.order, result.lines.map(mapOrderItem));
  }

  async listOrders(options: OrderListOptions = {}): Promise<Order[]> {
    const rows = await this.readOrderRows(options);
    const items = await this.readItems(rows.map(row => row.id));
    const itemsByOrder = new Map<string, OrderLine[]>();
    for (const item of items) {
      const lines = itemsByOrder.get(item.order_id) || [];
      lines.push(mapOrderItem(item));
      itemsByOrder.set(item.order_id, lines);
    }
    return rows.map(row => mapOrder(row, itemsByOrder.get(row.id) || []));
  }

  async getOrder(
    orderId: string,
    options: Pick<OrderListOptions, 'client3plId' | 'onlyClientOrders'> & { includeRawPayload?: boolean } = {},
  ): Promise<{ order: Order; histories: Array<Record<string, unknown>> } | null> {
    let query = this.context.supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('organization_id', this.context.organizationId)
      .eq('id', orderId);
    const scopedClientId = this.context.client3plId || (options.onlyClientOrders ? options.client3plId : undefined);
    if (options.onlyClientOrders && !scopedClientId) return null;
    if (scopedClientId) query = query.eq('client_3pl_id', scopedClientId);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as OrderRow;
    const [itemsResult, historyResult] = await Promise.all([
      this.readItems([row.id]),
      this.context.supabase
        .from('order_status_history')
        .select('id,order_id,from_status,to_status,changed_by,note,changed_at')
        .eq('organization_id', this.context.organizationId)
        .eq('order_id', row.id)
        .order('changed_at', { ascending: true }),
    ]);
    if (historyResult.error) throw historyResult.error;

    const lines = itemsResult.map(mapOrderItem);
    const histories = ((historyResult.data || []) as unknown as OrderHistoryRow[]).map(history => ({
      id: history.id,
      orderId: history.order_id,
      fromStatus: history.from_status || undefined,
      toStatus: history.to_status,
      changedBy: history.changed_by || '',
      note: history.note || undefined,
      timestamp: history.changed_at,
    }));
    return { order: mapOrder(row, lines, options.includeRawPayload === true), histories };
  }
}
