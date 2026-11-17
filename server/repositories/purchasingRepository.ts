import type { GoodsReceipt, PurchaseOrder, PurchaseOrderLine, Supplier } from '../types';
import type { RepositoryContext } from './context';

type SupplierRow = {
  id: string; name: string; code: string; contact_name: string | null;
  email: string | null; phone: string | null; payment_terms_days: number;
  currency: string; lead_time_days: number; is_active: boolean;
};
type PurchaseOrderRow = {
  id: string; po_number: string; supplier_id: string; status: PurchaseOrder['status'];
  subtotal_minor: number | string; tax_minor: number | string; total_minor: number | string;
  currency: string; notes: string | null; expected_date: string | null;
  created_at: string; approved_by: string | null; updated_at: string;
};
type PurchaseOrderItemRow = {
  id: string; purchase_order_id: string; product_id: string; sku: string;
  product_name: string; ordered_qty: number; received_qty: number;
  unit_cost_minor: number | string; total_cost_minor: number | string;
};
type ReceiptRow = {
  id: string; receipt_number: string; purchase_order_id: string;
  received_by: string | null; received_at: string; discrepancy_note: string | null;
};
type ReceiptItemRow = {
  id: string; goods_receipt_id: string; product_id: string; location_id: string | null;
  received_qty: number; shortage_qty: number; damaged_qty: number;
  product: { sku?: string } | null;
};

const PAGE_SIZE = 500;

async function getDataEnvironment(context: RepositoryContext, accountId?: string): Promise<'DEMO' | 'SANDBOX' | 'PRODUCTION'> {
  if (!accountId || accountId === 'ALL') return 'SANDBOX';
  const { data, error } = await context.supabase
    .from('marketplace_accounts')
    .select('is_demo,environment')
    .eq('id', accountId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The selected marketplace account was not found in this workspace.');
  if (data.is_demo) return 'DEMO';
  return data.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}

async function readAll<T>(load: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await load(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Read-only purchasing data access, scoped to the verified organization and caller JWT. */
export class SupabasePurchasingRepository {
  constructor(private readonly context: RepositoryContext) {}

  async listSuppliers(accountId?: string): Promise<Supplier[]> {
    const dataEnvironment = await getDataEnvironment(this.context, accountId);
    const rows = await readAll<SupplierRow>((from, to) => {
      let query = this.context.supabase
        .from('suppliers')
        .select('id,name,code,contact_name,email,phone,payment_terms_days,currency,lead_time_days,is_active')
        .eq('organization_id', this.context.organizationId);
      query = query.eq('data_environment', dataEnvironment);
      return query.order('name', { ascending: true }).range(from, to);
    });
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      code: row.code,
      contactName: row.contact_name || '',
      email: row.email || '',
      phone: row.phone || '',
      paymentTermsDays: Number(row.payment_terms_days),
      currency: row.currency.trim(),
      leadTimeDays: Number(row.lead_time_days),
      isActive: row.is_active,
    }));
  }

  async listPurchaseOrders(accountId?: string): Promise<PurchaseOrder[]> {
    const dataEnvironment = await getDataEnvironment(this.context, accountId);
    const [orders, suppliers] = await Promise.all([
      readAll<PurchaseOrderRow>((from, to) => {
        let query = this.context.supabase
          .from('purchase_orders')
          .select('id,po_number,supplier_id,status,subtotal_minor,tax_minor,total_minor,currency,notes,expected_date,created_at,approved_by,updated_at,external_id')
          .eq('organization_id', this.context.organizationId);
        query = query.eq('data_environment', dataEnvironment);
        return query.order('created_at', { ascending: false }).range(from, to);
      }),
      this.listSuppliers(accountId),
    ]);
    if (orders.length === 0) return [];
    const orderIds = orders.map(order => order.id);
    const items: PurchaseOrderItemRow[] = [];
    for (let start = 0; start < orderIds.length; start += 100) {
      const ids = orderIds.slice(start, start + 100);
      items.push(...await readAll<PurchaseOrderItemRow>((from, to) => this.context.supabase
        .from('purchase_order_items')
        .select('id,purchase_order_id,product_id,sku,product_name,ordered_qty,received_qty,unit_cost_minor,total_cost_minor')
        .eq('organization_id', this.context.organizationId)
        .in('purchase_order_id', ids)
        .order('id', { ascending: true })
        .range(from, to)));
    }
    const supplierById = new Map(suppliers.map(supplier => [supplier.id, supplier] as const));
    const linesByOrder = new Map<string, PurchaseOrderLine[]>();
    for (const item of items) {
      const lines = linesByOrder.get(item.purchase_order_id) || [];
      lines.push({
        id: item.id,
        poId: item.purchase_order_id,
        productId: item.product_id,
        sku: item.sku,
        productName: item.product_name,
        orderedQty: Number(item.ordered_qty),
        receivedQty: Number(item.received_qty),
        unitCostMinor: Number(item.unit_cost_minor),
        totalCostMinor: Number(item.total_cost_minor),
      });
      linesByOrder.set(item.purchase_order_id, lines);
    }
    return orders.map(row => ({
      id: row.id,
      poNumber: row.po_number,
      supplierId: row.supplier_id,
      supplierName: supplierById.get(row.supplier_id)?.name || '',
      status: row.status,
      lines: linesByOrder.get(row.id) || [],
      subtotalMinor: Number(row.subtotal_minor),
      taxMinor: Number(row.tax_minor),
      totalMinor: Number(row.total_minor),
      currency: row.currency.trim(),
      notes: row.notes || undefined,
      expectedDate: row.expected_date || undefined,
      createdAt: row.created_at,
      approvedBy: row.approved_by || undefined,
      updatedAt: row.updated_at,
    }));
  }

  async listGoodsReceipts(accountId?: string): Promise<GoodsReceipt[]> {
    const dataEnvironment = await getDataEnvironment(this.context, accountId);
    const orders = await readAll<Pick<PurchaseOrderRow, 'id' | 'po_number'>>((from, to) => {
      let query = this.context.supabase
        .from('purchase_orders')
        .select('id,po_number,data_environment')
        .eq('organization_id', this.context.organizationId)
        .eq('data_environment', dataEnvironment);
      return query.range(from, to);
    });
    const visiblePoIds = orders.map(order => order.id);
    if (visiblePoIds.length === 0) return [];
    const receipts = await readAll<ReceiptRow>((from, to) => this.context.supabase
      .from('goods_receipts')
      .select('id,receipt_number,purchase_order_id,received_by,received_at,discrepancy_note')
      .eq('organization_id', this.context.organizationId)
      .in('purchase_order_id', visiblePoIds)
      .order('received_at', { ascending: false })
      .range(from, to));
    if (receipts.length === 0) return [];
    const receiptIds = receipts.map(receipt => receipt.id);
    const items: ReceiptItemRow[] = [];
    for (let start = 0; start < receiptIds.length; start += 100) {
      const ids = receiptIds.slice(start, start + 100);
      items.push(...await readAll<ReceiptItemRow>((from, to) => this.context.supabase
        .from('goods_receipt_items')
        .select('id,goods_receipt_id,product_id,location_id,received_qty,shortage_qty,damaged_qty')
        .eq('organization_id', this.context.organizationId)
        .in('goods_receipt_id', ids)
        .order('id', { ascending: true })
        .range(from, to)));
    }
    const poIds = [...new Set(receipts.map(receipt => receipt.purchase_order_id))];
    const poItems: Array<Pick<PurchaseOrderItemRow, 'purchase_order_id' | 'product_id' | 'sku'>> = [];
    for (let start = 0; start < poIds.length; start += 100) {
      const ids = poIds.slice(start, start + 100);
      poItems.push(...await readAll<Pick<PurchaseOrderItemRow, 'purchase_order_id' | 'product_id' | 'sku'>>((from, to) => this.context.supabase
        .from('purchase_order_items')
        .select('purchase_order_id,product_id,sku')
        .eq('organization_id', this.context.organizationId)
        .in('purchase_order_id', ids)
        .range(from, to)));
    }
    const skuByPoProduct = new Map(poItems.map(item => [item.purchase_order_id + ':' + item.product_id, item.sku] as const));
    const orderNumberById = new Map(orders.map(order => [order.id, order.po_number] as const));
    const poIdByReceipt = new Map(receipts.map(receipt => [receipt.id, receipt.purchase_order_id] as const));
    const linesByReceipt = new Map<string, GoodsReceipt['lines']>();
    for (const item of items) {
      const lines = linesByReceipt.get(item.goods_receipt_id) || [];
      lines.push({
        productId: item.product_id,
        sku: skuByPoProduct.get(poIdByReceipt.get(item.goods_receipt_id) + ':' + item.product_id) || '',
        receivedQty: Number(item.received_qty),
        shortageQty: Number(item.shortage_qty),
        damagedQty: Number(item.damaged_qty),
        locationId: item.location_id || '',
      });
      linesByReceipt.set(item.goods_receipt_id, lines);
    }
    return receipts.map(row => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      poId: row.purchase_order_id,
      poNumber: orderNumberById.get(row.purchase_order_id) || '',
      receivedBy: row.received_by || '',
      receivedAt: row.received_at,
      lines: linesByReceipt.get(row.id) || [],
      discrepancyNote: row.discrepancy_note || undefined,
    }));
  }
  async receivePurchaseOrder(
    purchaseOrderId: string,
    items: Array<{ productId: string; receivedQty: number; damagedQty: number; locationId?: string }>,
    discrepancyNote: string | undefined,
    idempotencyKey: string,
  ): Promise<{ success: boolean; receipt: GoodsReceipt; purchaseOrder: PurchaseOrder; duplicate: boolean }> {
    const { data, error } = await this.context.supabase.rpc('receive_workspace_purchase_order', {
      p_organization_id: this.context.organizationId,
      p_purchase_order_id: purchaseOrderId,
      p_items: items,
      p_discrepancy_note: discrepancyNote ?? null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') {
      throw new Error('The database returned an invalid goods receipt response.');
    }
    const result = data as {
      success?: boolean;
      receipt?: GoodsReceipt;
      purchaseOrder?: PurchaseOrder;
      duplicate?: boolean;
    };
    if (!result.success || !result.receipt || !result.purchaseOrder) {
      throw new Error('The database returned an incomplete goods receipt response.');
    }
    return {
      success: true,
      receipt: result.receipt,
      purchaseOrder: result.purchaseOrder,
      duplicate: Boolean(result.duplicate),
    };
  }

  async createSupplier(input: {
    name: string; code: string; contactName?: string; email?: string; phone?: string;
    paymentTermsDays: number; currency: string; leadTimeDays: number;
    dataEnvironment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION';
  }): Promise<Supplier> {
    const name = input.name.trim();
    const code = input.code.trim().toUpperCase();
    const currency = input.currency.trim().toUpperCase();
    if (!name || name.length > 160) throw new Error('Supplier name is required and must be at most 160 characters.');
    if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) throw new Error('Supplier code must be 2–40 characters using letters, numbers, hyphens, or underscores.');
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Supplier currency must be a three-letter currency code.');
    if (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0 || input.paymentTermsDays > 365) throw new Error('Payment terms must be between 0 and 365 days.');
    if (!Number.isInteger(input.leadTimeDays) || input.leadTimeDays < 0 || input.leadTimeDays > 365) throw new Error('Lead time must be between 0 and 365 days.');
    const email = input.email?.trim() || '';
    const phone = input.phone?.trim() || '';
    const contactName = input.contactName?.trim() || '';
    if (email.length > 254 || phone.length > 40 || contactName.length > 120) throw new Error('Supplier contact details exceed the supported length.');

    const { data, error } = await this.context.supabase
      .from('suppliers')
      .insert({
        organization_id: this.context.organizationId,
        name,
        code,
        contact_name: contactName || null,
        email: email || null,
        phone: phone || null,
        payment_terms_days: input.paymentTermsDays,
        currency,
        lead_time_days: input.leadTimeDays,
        is_active: true,
        data_environment: input.dataEnvironment || 'SANDBOX',
      })
      .select('id,name,code,contact_name,email,phone,payment_terms_days,currency,lead_time_days,is_active')
      .single();
    if (error) throw new Error(error.message);
    return {
      id: data.id,
      name: data.name,
      code: data.code,
      contactName: data.contact_name || '',
      email: data.email || '',
      phone: data.phone || '',
      paymentTermsDays: Number(data.payment_terms_days),
      currency: data.currency.trim(),
      leadTimeDays: Number(data.lead_time_days),
      isActive: data.is_active,
    };
  }

  async createPurchaseOrder(
    payload: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<PurchaseOrder> {
    const { data, error } = await this.context.supabase.rpc('create_workspace_purchase_order', {
      p_organization_id: this.context.organizationId,
      p_order: payload,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('The database returned an invalid purchase order response.');
    const result = data as { success?: boolean; purchaseOrder?: PurchaseOrder };
    if (!result.success || !result.purchaseOrder) throw new Error('The database returned an incomplete purchase order response.');
    return result.purchaseOrder;
  }

  async approvePurchaseOrder(purchaseOrderId: string): Promise<PurchaseOrder> {
    const { data, error } = await this.context.supabase.rpc('approve_workspace_purchase_order', {
      p_organization_id: this.context.organizationId,
      p_purchase_order_id: purchaseOrderId,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('The database returned an invalid purchase order approval response.');
    const result = data as { success?: boolean; purchaseOrder?: PurchaseOrder };
    if (!result.success || !result.purchaseOrder) throw new Error('The database returned an incomplete purchase order approval response.');
    return result.purchaseOrder;
  }

}
