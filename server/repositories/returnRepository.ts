import type { ReturnOrder } from '../types';
import type { RepositoryContext } from './context';

type ReturnRow = {
  id: string; return_number: string; order_id: string; reason_code: ReturnOrder['reasonCode'];
  status: ReturnOrder['status']; refund_amount_minor: number | null; refund_status: ReturnOrder['refundStatus'] | null;
  created_at: string; inspected_at: string | null;
};
type ReturnItemRow = {
  id: string; return_id: string; product_id: string; sku: string; quantity: number;
  disposition: ReturnOrder['lines'][number]['disposition'] | null; notes: string | null;
};
type OrderRow = { id: string; order_number: string; customer_name: string };

const PAGE_SIZE = 500;

async function readAll<T>(
  load: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await load(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

/** Return read/write operations use the caller JWT and verified organization scope. */
export class SupabaseReturnRepository {
  constructor(private readonly context: RepositoryContext) {}

  async listReturns(): Promise<ReturnOrder[]> {
    const returns = await readAll<ReturnRow>((from, to) => this.context.supabase
      .from('returns')
      .select('id,return_number,order_id,reason_code,status,refund_amount_minor,refund_status,created_at,inspected_at')
      .eq('organization_id', this.context.organizationId)
      .order('created_at', { ascending: false })
      .range(from, to));
    if (returns.length === 0) return [];

    const returnIds = returns.map(row => row.id);
    const orderIds = [...new Set(returns.map(row => row.order_id))];
    const [items, orders] = await Promise.all([
      readAll<ReturnItemRow>((from, to) => this.context.supabase
        .from('return_items')
        .select('id,return_id,product_id,sku,quantity,disposition,notes')
        .eq('organization_id', this.context.organizationId)
        .in('return_id', returnIds)
        .order('id', { ascending: true })
        .range(from, to)),
      readAll<OrderRow>((from, to) => this.context.supabase
        .from('orders')
        .select('id,order_number,customer_name')
        .eq('organization_id', this.context.organizationId)
        .in('id', orderIds)
        .range(from, to)),
    ]);

    const orderById = new Map(orders.map(order => [order.id, order] as const));
    const linesByReturn = new Map<string, ReturnOrder['lines']>();
    for (const item of items) {
      const lines = linesByReturn.get(item.return_id) || [];
      lines.push({
        id: item.id,
        productId: item.product_id,
        sku: item.sku,
        quantity: Number(item.quantity),
        disposition: item.disposition || undefined,
        notes: item.notes || undefined,
      });
      linesByReturn.set(item.return_id, lines);
    }

    return returns.map(row => {
      const order = orderById.get(row.order_id);
      return {
        id: row.id,
        returnNumber: row.return_number,
        orderId: row.order_id,
        orderNumber: order?.order_number || '',
        customerName: order?.customer_name || '',
        reasonCode: row.reason_code,
        status: row.status,
        lines: linesByReturn.get(row.id) || [],
        refundAmountMinor: row.refund_amount_minor == null ? undefined : Number(row.refund_amount_minor),
        refundStatus: row.refund_status || undefined,
        createdAt: row.created_at,
        inspectedAt: row.inspected_at || undefined,
      };
    });
  }

  async processDisposition(
    returnId: string,
    dispositions: Array<{ lineId: string; disposition: string; quantity: number }>,
    issueRefund: boolean,
    idempotencyKey: string,
  ): Promise<{ success: boolean; return: ReturnOrder; duplicate: boolean }> {
    const { data, error } = await this.context.supabase.rpc('process_workspace_return_disposition', {
      p_organization_id: this.context.organizationId,
      p_return_id: returnId,
      p_dispositions: dispositions,
      p_issue_refund: issueRefund,
      p_idempotency_key: idempotencyKey,
    });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('The database returned an invalid return disposition response.');
    const result = data as { success?: boolean; return?: ReturnOrder; duplicate?: boolean };
    if (!result.success || !result.return) throw new Error('The database returned an incomplete return disposition response.');
    return { success: true, return: result.return, duplicate: Boolean(result.duplicate) };
  }
}
