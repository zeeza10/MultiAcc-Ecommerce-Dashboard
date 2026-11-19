import type { RepositoryContext } from './context';

type WarehouseRow = {
  id: string;
  name: string;
  code: string;
  address: Record<string, unknown> | null;
  is_active: boolean;
};
type LocationRow = {
  id: string;
  warehouse_id: string;
  zone: string | null;
  aisle: string | null;
  shelf: string | null;
  bin: string | null;
  location_code: string;
  location_type: string;
  capacity_units: number;
  is_active: boolean;
};
type LedgerRow = {
  location_id: string | null;
  product_id: string;
  quantity_delta: number;
  stock_state: string;
};

const PAGE_SIZE = 500;

async function getDataEnvironment(context: RepositoryContext, accountId?: string): Promise<'DEMO' | 'SANDBOX' | 'PRODUCTION'> {
  if (!accountId || accountId === 'ALL') return 'PRODUCTION';
  const { data, error } = await context.supabase.from('marketplace_accounts')
    .select('is_demo,environment').eq('id', accountId).eq('organization_id', context.organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('The selected marketplace account was not found in this workspace.');
  if (data.is_demo) return 'DEMO';
  return data.environment === 'PRODUCTION' ? 'PRODUCTION' : 'SANDBOX';
}

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

/** Organization-scoped warehouse and location access using the caller JWT and RLS. */
export class SupabaseWarehouseRepository {
  constructor(private readonly context: RepositoryContext) {}

  async getLayout(accountId?: string): Promise<{
    warehouses: Array<{
      id: string; name: string; code: string; address: string; isActive: boolean;
      totalCapacity: number; occupiedQty: number; zones: Array<{
        name: string; aisles: string; type: string; capacity: number; locationCount: number;
      }>;
    }>;
    locations: Array<{
      id: string; warehouseId: string; warehouseName: string; zone: string;
      aisle: string; shelf: string; bin: string; locationCode: string;
      locationType: string; capacityUnits: number; currentQty: number;
      occupiedQty: number; skuCount: number; isActive: boolean;
    }>;
  }> {
    const dataEnvironment = await getDataEnvironment(this.context, accountId);
    const warehouses = await readAll<WarehouseRow>((from, to) => {
      let query = this.context.supabase.from('warehouses')
        .select('id,name,code,address,is_active')
        .eq('organization_id', this.context.organizationId);
      query = query.eq('data_environment', dataEnvironment);
      return query.order('code', { ascending: true }).range(from, to);
    });
    const warehouseIds = warehouses.map(row => row.id);
    if (warehouseIds.length === 0) return { warehouses: [], locations: [] };
    const locations = await readAll<LocationRow>((from, to) => this.context.supabase
      .from('warehouse_locations')
      .select('id,warehouse_id,zone,aisle,shelf,bin,location_code,location_type,capacity_units,is_active')
      .eq('organization_id', this.context.organizationId)
      .in('warehouse_id', warehouseIds)
      .order('location_code', { ascending: true })
      .range(from, to));
    const locationIds = locations.map(row => row.id);
    const ledger = locationIds.length === 0 ? [] : await readAll<LedgerRow>((from, to) => this.context.supabase
      .from('stock_ledger')
      .select('location_id,product_id,quantity_delta,stock_state')
      .eq('organization_id', this.context.organizationId)
      .in('location_id', locationIds)
      .range(from, to));

    const warehouseById = new Map(warehouses.map(row => [row.id, row] as const));
    const onHandByLocation = new Map<string, number>();
    const occupiedByLocation = new Map<string, number>();
    const skusByLocation = new Map<string, Set<string>>();
    for (const entry of ledger) {
      if (!entry.location_id) continue;
      if (entry.stock_state === 'ON_HAND') {
        onHandByLocation.set(entry.location_id, (onHandByLocation.get(entry.location_id) || 0) + Number(entry.quantity_delta));
      }
      if (['ON_HAND', 'DAMAGED', 'QUARANTINED'].includes(entry.stock_state)) {
        occupiedByLocation.set(entry.location_id, (occupiedByLocation.get(entry.location_id) || 0) + Number(entry.quantity_delta));
      }
      if (entry.stock_state === 'ON_HAND' && entry.quantity_delta !== 0) {
        const set = skusByLocation.get(entry.location_id) || new Set<string>();
        set.add(entry.product_id);
        skusByLocation.set(entry.location_id, set);
      }
    }

    const mappedLocations = locations.map(row => ({
      id: row.id,
      warehouseId: row.warehouse_id,
      warehouseName: warehouseById.get(row.warehouse_id)?.name || 'Unknown warehouse',
      zone: row.zone || '',
      aisle: row.aisle || '',
      shelf: row.shelf || '',
      bin: row.bin || '',
      locationCode: row.location_code,
      locationType: row.location_type,
      capacityUnits: Number(row.capacity_units),
      currentQty: Math.max(0, onHandByLocation.get(row.id) || 0),
      occupiedQty: Math.max(0, occupiedByLocation.get(row.id) || 0),
      skuCount: skusByLocation.get(row.id)?.size || 0,
      isActive: row.is_active,
    }));

    const locationsByWarehouse = new Map<string, typeof mappedLocations>();
    for (const location of mappedLocations) {
      const group = locationsByWarehouse.get(location.warehouseId) || [];
      group.push(location);
      locationsByWarehouse.set(location.warehouseId, group);
    }

    return {
      warehouses: warehouses.map(row => {
        const childLocations = locationsByWarehouse.get(row.id) || [];
        const zones = new Map<string, typeof childLocations>();
        for (const location of childLocations) {
          const name = location.zone || 'Unassigned zone';
          const group = zones.get(name) || [];
          group.push(location);
          zones.set(name, group);
        }
        const address = row.address || {};
        return {
          id: row.id,
          name: row.name,
          code: row.code,
          address: String(address.formatted || address.line1 || ''),
          isActive: row.is_active,
          totalCapacity: childLocations.reduce((sum, location) => sum + location.capacityUnits, 0),
          occupiedQty: childLocations.reduce((sum, location) => sum + location.occupiedQty, 0),
          zones: [...zones.entries()].map(([name, zoneLocations]) => ({
            name,
            aisles: [...new Set(zoneLocations.map(location => location.aisle).filter(Boolean))].join(', ') || '—',
            type: [...new Set(zoneLocations.map(location => location.locationType))].join(' / '),
            capacity: zoneLocations.reduce((sum, location) => sum + location.capacityUnits, 0),
            locationCount: zoneLocations.length,
          })),
        };
      }),
      locations: mappedLocations,
    };
  }

  async createWarehouse(input: { name: string; code: string; address?: string; dataEnvironment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION' }) {
    const name = input.name.trim();
    const code = input.code.trim().toUpperCase();
    const address = (input.address || '').trim();
    if (!name || name.length > 160) throw new Error('Warehouse name is required and must be at most 160 characters.');
    if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/.test(code)) throw new Error('Warehouse code must be 2–40 characters using letters, numbers, hyphens, or underscores.');
    if (address.length > 1000) throw new Error('Warehouse address must be at most 1,000 characters.');

    const { data, error } = await this.context.supabase
      .from('warehouses')
      .insert({
        organization_id: this.context.organizationId,
        name,
        code,
        address: address ? { formatted: address } : {},
        is_active: true,
        data_environment: input.dataEnvironment || 'PRODUCTION',
      })
      .select('id,name,code,address,is_active')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async createLocation(input: {
    warehouseId: string; locationCode: string; locationType: string; dataEnvironment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION';
    zone?: string; aisle?: string; shelf?: string; bin?: string; capacityUnits?: number;
  }) {
    const locationCode = input.locationCode.trim().toUpperCase();
    const locationType = input.locationType.trim().toUpperCase();
    const allowedTypes = new Set(['BIN', 'SHELF', 'PALLET', 'STAGING', 'QUARANTINE', 'RECEIVING']);
    const capacity = input.capacityUnits ?? 0;
    if (!input.warehouseId) throw new Error('Select a warehouse for this location.');
    if (!/^[A-Z0-9][A-Z0-9._-]{0,49}$/.test(locationCode)) throw new Error('Location code must be 1–50 characters using letters, numbers, dots, hyphens, or underscores.');
    if (!allowedTypes.has(locationType)) throw new Error('Select a supported location type.');
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 10000000) throw new Error('Capacity must be a whole number between 0 and 10,000,000.');

    const { data: warehouse, error: warehouseError } = await this.context.supabase
      .from('warehouses')
      .select('id,data_environment')
      .eq('id', input.warehouseId)
      .eq('organization_id', this.context.organizationId)
      .eq('is_active', true)
      .maybeSingle();
    if (warehouseError) throw new Error(warehouseError.message);
    if (!warehouse) throw new Error('The selected warehouse is not active in this workspace.');
    if (input.dataEnvironment && warehouse.data_environment !== input.dataEnvironment) throw new Error('The selected warehouse belongs to a different data environment.');

    const { data, error } = await this.context.supabase
      .from('warehouse_locations')
      .insert({
        organization_id: this.context.organizationId,
        warehouse_id: input.warehouseId,
        location_code: locationCode,
        location_type: locationType,
        zone: input.zone?.trim() || null,
        aisle: input.aisle?.trim() || null,
        shelf: input.shelf?.trim() || null,
        bin: input.bin?.trim() || null,
        capacity_units: capacity,
        is_active: true,
      })
      .select('id,warehouse_id,zone,aisle,shelf,bin,location_code,location_type,capacity_units,is_active')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
}
