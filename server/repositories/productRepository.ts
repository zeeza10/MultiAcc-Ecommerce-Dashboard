import type { OwnerType, Product } from '../types';
import type { RepositoryContext } from './context';

export interface ProductCreateInput {
  sku: string;
  name: string;
  barcode?: string;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  weightKg?: number;
  costPriceMinor: number;
  sellingPriceMinor: number;
  lowStockThreshold: number;
  reorderLevel: number;
  category: string;
  ownerType: OwnerType;
  ownerId?: string;
  dataEnvironment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION';
}

export interface StockLedgerQuantityRow {
  product_id: string;
  stock_state: string;
  quantity_delta: number;
}

export interface ProductRepository {
  listForOrganization(options?: { client3plId?: string; onlyClientProducts?: boolean }): Promise<Product[]>;
  listStockLedgerQuantities(productIds: string[], client3plId?: string): Promise<StockLedgerQuantityRow[]>;
  createForOrganization(input: ProductCreateInput): Promise<Product>;
}

type ProductRow = {
  id: string;
  organization_id: string;
  sku: string;
  name: string;
  barcode: string | null;
  dimensions_cm: Record<string, unknown> | null;
  weight_kg: number | string | null;
  owner_type: OwnerType;
  client_3pl_id: string | null;
  status: Product['status'];
  cost_price_minor: number;
  selling_price_minor: number;
  currency: string;
  low_stock_threshold: number;
  reorder_level: number;
  category_name: string | null;
  created_at: string;
  updated_at: string;
  external_id: string | null;
};

const PRODUCT_COLUMNS = [
  'id', 'organization_id', 'sku', 'name', 'barcode', 'dimensions_cm',
  'weight_kg', 'owner_type', 'client_3pl_id', 'status', 'cost_price_minor',
  'selling_price_minor', 'currency', 'low_stock_threshold', 'reorder_level',
  'category_name', 'created_at', 'updated_at', 'external_id',
].join(',');

const PAGE_SIZE = 1000;

const toProduct = (row: ProductRow): Product => {
  const dimensions = row.dimensions_cm || {};
  const lengthCm = Number(dimensions.lengthCm ?? dimensions.length_cm ?? 0);
  const widthCm = Number(dimensions.widthCm ?? dimensions.width_cm ?? 0);
  const heightCm = Number(dimensions.heightCm ?? dimensions.height_cm ?? 0);
  const hasDimensions = lengthCm > 0 || widthCm > 0 || heightCm > 0;

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    barcode: row.barcode || undefined,
    dimensions: hasDimensions ? { lengthCm, widthCm, heightCm } : undefined,
    weightKg: row.weight_kg == null ? undefined : Number(row.weight_kg),
    ownerType: row.owner_type,
    ownerId: row.client_3pl_id || 'operator',
    status: row.status,
    costPriceMinor: Number(row.cost_price_minor),
    sellingPriceMinor: Number(row.selling_price_minor),
    lowStockThreshold: row.low_stock_threshold,
    reorderLevel: row.reorder_level,
    category: row.category_name || 'General',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

/**
 * Request-scoped repository. The supplied Supabase client carries the caller's
 * JWT, so PostgreSQL RLS remains the authorization boundary.
 */
export class SupabaseProductRepository implements ProductRepository {
  constructor(private readonly context: RepositoryContext) {}

  private get client() { return this.context.supabase; }
  private get organizationId() { return this.context.organizationId; }

  async listForOrganization(options: { client3plId?: string; onlyClientProducts?: boolean; dataEnvironment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION' } = {}): Promise<Product[]> {
    const scopedClientId = this.context.client3plId || (options.onlyClientProducts ? options.client3plId : undefined);
    if (options.onlyClientProducts && !scopedClientId) return [];

    const rows: ProductRow[] = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
      let query = this.client
        .from('products')
        .select(PRODUCT_COLUMNS)
        .eq('organization_id', this.organizationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);

      query = query.eq('data_environment', options.dataEnvironment || 'SANDBOX');
      if (scopedClientId) query = query.eq('client_3pl_id', scopedClientId).eq('owner_type', 'CLIENT');

      const { data, error } = await query;
      if (error) throw error;
      const page = (data || []) as unknown as ProductRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return rows.map(toProduct);
  }

  async listStockLedgerQuantities(productIds: string[], client3plId?: string): Promise<StockLedgerQuantityRow[]> {
    if (productIds.length === 0) return [];

    const rows: StockLedgerQuantityRow[] = [];
    const productIdChunkSize = 100;
    for (let start = 0; start < productIds.length; start += productIdChunkSize) {
      const productIdChunk = productIds.slice(start, start + productIdChunkSize);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        let query = this.client
          .from('stock_ledger')
          .select('product_id,stock_state,quantity_delta')
          .eq('organization_id', this.organizationId)
          .in('product_id', productIdChunk)
          .range(offset, offset + PAGE_SIZE - 1);

        const scopedClientId = this.context.client3plId || client3plId;
        if (scopedClientId) query = query.eq('client_3pl_id', scopedClientId);

        const { data, error } = await query;
        if (error) throw error;
        const page = (data || []) as StockLedgerQuantityRow[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
      }
    }

    return rows;
  }

  async createForOrganization(input: ProductCreateInput): Promise<Product> {
    if (this.context.client3plId) throw new Error('Client users cannot create workspace products.');
    let client3plId: string | null = null;
    if (input.ownerType === 'CLIENT') {
      if (!input.ownerId) throw new Error('Select a valid 3PL client for this product.');
      const { data: client, error: clientError } = await this.client
        .from('clients_3pl')
        .select('id,data_environment')
        .eq('id', input.ownerId)
        .eq('organization_id', this.organizationId)
        .maybeSingle();
      if (clientError) throw clientError;
      if (!client) throw new Error('The selected 3PL client does not belong to this workspace.');
      if (input.dataEnvironment && client.data_environment !== input.dataEnvironment) throw new Error('The selected 3PL client belongs to a different data environment.');
      client3plId = client.id;
    }

    const payload = {
      organization_id: this.organizationId,
      sku: input.sku.trim().toUpperCase(),
      name: input.name.trim(),
      barcode: input.barcode?.trim() || null,
      dimensions_cm: input.dimensions || {},
      weight_kg: input.weightKg ?? null,
      owner_type: input.ownerType,
      client_3pl_id: client3plId,
      status: 'ACTIVE',
      cost_price_minor: input.costPriceMinor,
      selling_price_minor: input.sellingPriceMinor,
      low_stock_threshold: input.lowStockThreshold,
      reorder_level: input.reorderLevel,
      category_name: input.category.trim() || 'General',
    };

    const { data, error } = await this.client
      .from('products')
      .insert(payload)
      .select(PRODUCT_COLUMNS)
      .single();

    if (error) throw error;
    return toProduct(data as unknown as ProductRow);
  }
}
