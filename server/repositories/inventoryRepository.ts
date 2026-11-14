import type { RepositoryContext } from './context';
import { SupabaseProductRepository } from './productRepository';
import type { Product, StockAdjustment, StockBalance, StockLedgerEntry, StockState } from '../types';

type StockLedgerRow = {
  id: string;
  product_id: string;
  location_id: string | null;
  client_3pl_id: string | null;
  quantity_delta: number;
  stock_state: string;
  source_type: string;
  source_id: string | null;
  unit_cost_minor: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type StockAdjustmentRow = {
  id: string;
  adjustment_number: string;
  product_id: string;
  location_id: string | null;
  quantity_delta: number;
  target_state: string;
  reason_code: string;
  note: string | null;
  requested_by: string | null;
  requires_approval: boolean;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approved_by: string | null;
  approval_note: string | null;
  evaluated_value_minor: number;
  created_at: string;
  updated_at: string;
};

type LocationRow = { id: string; location_code: string };

const PAGE_SIZE = 1000;

export interface InventoryRepository {
  listBalances(options?: { client3plId?: string; onlyClientProducts?: boolean }): Promise<StockBalance[]>;
  listLedger(options?: { client3plId?: string; onlyClientProducts?: boolean }): Promise<StockLedgerEntry[]>;
  listAdjustments(options?: { client3plId?: string; onlyClientProducts?: boolean }): Promise<StockAdjustment[]>;
}

/**
 * Read-side inventory repository. All reads use the caller's JWT and explicit
 * organization filters; RLS remains the independent tenant authorization layer.
 */
export class SupabaseInventoryRepository implements InventoryRepository {
  private readonly products: SupabaseProductRepository;

  constructor(private readonly context: RepositoryContext) {
    this.products = new SupabaseProductRepository(context);
  }

  async listBalances(options: { client3plId?: string; onlyClientProducts?: boolean } = {}): Promise<StockBalance[]> {
    const products = await this.products.listForOrganization(options);
    if (products.length === 0) return [];

    const ledger = await this.products.listStockLedgerQuantities(
      products.map(product => product.id),
      options.onlyClientProducts ? options.client3plId : undefined,
    );
    const balances = new Map<string, StockBalance>();

    for (const product of products) {
      balances.set(product.id, {
        productId: product.id,
        sku: product.sku,
        ownerId: product.ownerId,
        onHand: 0,
        reserved: 0,
        available: 0,
        incoming: 0,
        damaged: 0,
        quarantined: 0,
        missing: 0,
        totalStock: 0,
        weightedAverageCostMinor: product.costPriceMinor,
      });
    }

    for (const entry of ledger) {
      const balance = balances.get(entry.product_id);
      if (!balance) continue;
      const quantity = Number(entry.quantity_delta);
      switch (entry.stock_state) {
        case 'ON_HAND': balance.onHand += quantity; break;
        case 'RESERVED': balance.reserved += quantity; break;
        case 'INCOMING': balance.incoming += quantity; break;
        case 'DAMAGED': balance.damaged += quantity; break;
        case 'QUARANTINED': balance.quarantined += quantity; break;
        case 'MISSING': balance.missing += quantity; break;
      }
    }

    for (const balance of balances.values()) {
      balance.available = Math.max(0, balance.onHand - balance.reserved);
      balance.totalStock = balance.onHand + balance.damaged + balance.quarantined;
    }

    return [...balances.values()];
  }

  async listLedger(options: { client3plId?: string; onlyClientProducts?: boolean } = {}): Promise<StockLedgerEntry[]> {
    const products = await this.products.listForOrganization(options);
    if (products.length === 0) return [];

    const productById = new Map<string, Product>(products.map(product => [product.id, product]));
    const productIds = products.map(product => product.id);
    const [ledgerRows, locationRows] = await Promise.all([
      this.readLedgerRows(productIds, options.onlyClientProducts ? options.client3plId : undefined),
      this.readLocations(),
    ]);
    const locationById = new Map(locationRows.map(location => [location.id, location.location_code]));

    return ledgerRows.map(row => {
      const product = productById.get(row.product_id);
      return {
        id: row.id,
        skuId: row.product_id,
        sku: product?.sku || '',
        productName: product?.name || '',
        locationId: row.location_id || '',
        locationCode: row.location_id ? locationById.get(row.location_id) || '' : '',
        ownerType: product?.ownerType || 'OPERATOR',
        ownerId: row.client_3pl_id || 'operator',
        qtyDelta: Number(row.quantity_delta),
        state: row.stock_state as StockState,
        sourceType: row.source_type as StockLedgerEntry['sourceType'],
        sourceId: row.source_id || '',
        unitCostMinor: row.unit_cost_minor == null ? undefined : Number(row.unit_cost_minor),
        note: row.note || undefined,
        createdBy: row.created_by || '',
        createdAt: row.created_at,
      };
    });
  }

  async listAdjustments(options: { client3plId?: string; onlyClientProducts?: boolean } = {}): Promise<StockAdjustment[]> {
    const products = await this.products.listForOrganization(options);
    if (products.length === 0) return [];

    const productById = new Map<string, Product>(products.map(product => [product.id, product]));
    const rows: StockAdjustmentRow[] = [];
    const productIds = products.map(product => product.id);

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.context.supabase
        .from('stock_adjustments')
        .select('id,adjustment_number,product_id,location_id,quantity_delta,target_state,reason_code,note,requested_by,requires_approval,status,approved_by,approval_note,evaluated_value_minor,created_at,updated_at')
        .eq('organization_id', this.context.organizationId)
        .in('product_id', productIds)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data || []) as unknown as StockAdjustmentRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return rows.map(row => ({
      id: row.id,
      adjustmentNumber: row.adjustment_number,
      productId: row.product_id,
      sku: productById.get(row.product_id)?.sku || '',
      locationId: row.location_id || '',
      quantityDelta: Number(row.quantity_delta),
      targetState: row.target_state as StockState,
      reasonCode: row.reason_code as StockAdjustment['reasonCode'],
      note: row.note || '',
      requestedBy: row.requested_by || '',
      requiresApproval: row.requires_approval,
      status: row.status,
      approvedBy: row.approved_by || undefined,
      approvalNote: row.approval_note || undefined,
      evaluatedValueMinor: Number(row.evaluated_value_minor),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  private async readLedgerRows(productIds: string[], client3plId?: string): Promise<StockLedgerRow[]> {
    const rows: StockLedgerRow[] = [];
    const productIdChunkSize = 100;
    for (let start = 0; start < productIds.length; start += productIdChunkSize) {
      const productIdChunk = productIds.slice(start, start + productIdChunkSize);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = this.context.supabase
          .from('stock_ledger')
          .select('id,product_id,location_id,client_3pl_id,quantity_delta,stock_state,source_type,source_id,unit_cost_minor,note,created_by,created_at')
          .eq('organization_id', this.context.organizationId)
          .in('product_id', productIdChunk)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (client3plId) query = query.eq('client_3pl_id', client3plId);

        const { data, error } = await query;
        if (error) throw error;
        const page = (data || []) as unknown as StockLedgerRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  private async readLocations(): Promise<LocationRow[]> {
    const rows: LocationRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await this.context.supabase
        .from('warehouse_locations')
        .select('id,location_code')
        .eq('organization_id', this.context.organizationId)
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data || []) as LocationRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    return rows;
  }
}
