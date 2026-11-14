import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleFulfilmentRoute(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  if (path === '/3pl/clients' && request.method === 'GET') {
    let clientsQuery = auth.repositoryContext.supabase.from('clients_3pl')
      .select('id,company_name,code,contact_email,contact_phone,billing_address,billing_period,rate_card_id,account_status,created_at')
      .eq('organization_id', auth.organizationId).order('company_name', { ascending: true });
    if (auth.user.role === 'CLIENT_USER') clientsQuery = clientsQuery.eq('id', auth.repositoryContext.client3plId);
    const [clientsResult, ratesResult] = await Promise.all([
      clientsQuery,
      auth.repositoryContext.supabase.from('rate_cards')
        .select('id,name,pick_fee_minor,pack_fee_minor,extra_item_fee_minor,storage_pallet_per_month_minor,storage_shelf_per_month_minor,storage_bin_per_month_minor,minimum_monthly_charge_minor,currency')
        .eq('organization_id', auth.organizationId).order('name', { ascending: true }),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (ratesResult.error) throw ratesResult.error;
    const visibleRateCardIds = new Set((clientsResult.data || []).map(row => row.rate_card_id).filter(Boolean));
    const rateCards = (ratesResult.data || []).filter(row => auth.user.role !== 'CLIENT_USER' || visibleRateCardIds.has(row.id)).map(row => ({
      id: row.id, name: row.name, pickFeeMinor: Number(row.pick_fee_minor), packFeeMinor: Number(row.pack_fee_minor),
      extraItemFeeMinor: Number(row.extra_item_fee_minor), storagePalletPerMonthMinor: Number(row.storage_pallet_per_month_minor),
      storageShelfPerMonthMinor: Number(row.storage_shelf_per_month_minor), storageBinPerMonthMinor: Number(row.storage_bin_per_month_minor),
      minimumMonthlyChargeMinor: Number(row.minimum_monthly_charge_minor),
    }));
    return json({ clients: (clientsResult.data || []).map(row => ({
      id: row.id, companyName: row.company_name, code: row.code, contactEmail: row.contact_email || '',
      contactPhone: row.contact_phone || '', billingAddress: typeof row.billing_address === 'string' ? row.billing_address : JSON.stringify(row.billing_address || {}),
      billingPeriod: row.billing_period, rateCardId: row.rate_card_id || '', accountStatus: row.account_status, createdAt: row.created_at,
    })), rateCards });
  }

  if (path === '/3pl/storage-snapshots' && request.method === 'GET') {
    let snapshotsQuery = auth.repositoryContext.supabase.from('storage_snapshots')
      .select('id,client_3pl_id,snapshot_date,occupied_pallets,occupied_shelves,occupied_bins,estimated_cost_minor,currency')
      .eq('organization_id', auth.organizationId).order('snapshot_date', { ascending: false });
    if (auth.user.role === 'CLIENT_USER') snapshotsQuery = snapshotsQuery.eq('client_3pl_id', auth.repositoryContext.client3plId);
    const { data: snapshots, error } = await snapshotsQuery;
    if (error) throw error;
    const clientIds = [...new Set((snapshots || []).map(row => row.client_3pl_id))];
    const { data: clients, error: clientError } = clientIds.length
      ? await auth.repositoryContext.supabase.from('clients_3pl').select('id,company_name')
          .eq('organization_id', auth.organizationId).in('id', clientIds)
      : { data: [], error: null };
    if (clientError) throw clientError;
    const names = new Map((clients || []).map(row => [row.id, row.company_name]));
    return json({ snapshots: (snapshots || []).map(row => ({
      id: row.id, clientId: row.client_3pl_id, clientName: names.get(row.client_3pl_id) || '',
      snapshotDate: row.snapshot_date, occupiedPallets: Number(row.occupied_pallets),
      occupiedShelves: Number(row.occupied_shelves), occupiedBins: Number(row.occupied_bins),
      estimatedCostMinor: Number(row.estimated_cost_minor),
    })) });
  }

  if (path === '/warehouse-services/packaging' && request.method === 'GET') {
    let packagingQuery = auth.repositoryContext.supabase.from('packaging_jobs')
      .select('id,job_number,client_3pl_id,job_date,packaging_type,quantity,material_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,performed_by,notes')
      .eq('organization_id', auth.organizationId).order('job_date', { ascending: false });
    if (auth.user.role === 'CLIENT_USER') packagingQuery = packagingQuery.eq('client_3pl_id', auth.repositoryContext.client3plId);
    const { data: jobs, error } = await packagingQuery;
    if (error) throw error;
    const clientIds = [...new Set((jobs || []).map(row => row.client_3pl_id))];
    const orderIds = [...new Set((jobs || []).map(row => row.order_id).filter(Boolean))];
    const [clientsResult, ordersResult] = await Promise.all([
      clientIds.length ? auth.repositoryContext.supabase.from('clients_3pl').select('id,company_name').eq('organization_id', auth.organizationId).in('id', clientIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? auth.repositoryContext.supabase.from('orders').select('id,order_number').eq('organization_id', auth.organizationId).in('id', orderIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    const clients = new Map((clientsResult.data || []).map(row => [row.id, row.company_name]));
    const orders = new Map((ordersResult.data || []).map(row => [row.id, row.order_number]));
    return json({ packagingJobs: (jobs || []).map(row => ({
      id: row.id, jobNumber: row.job_number, clientId: row.client_3pl_id, clientName: clients.get(row.client_3pl_id) || '',
      date: row.job_date, packagingType: row.packaging_type, quantity: Number(row.quantity),
      materialCostMinor: Number(row.material_cost_minor), serviceChargeMinor: Number(row.service_charge_minor),
      totalChargeMinor: Number(row.total_charge_minor), status: row.status, invoiceId: row.invoice_id || undefined,
      orderNumber: row.order_id ? orders.get(row.order_id) : undefined, performedBy: row.performed_by || '', notes: row.notes || undefined,
    })) });
  }

  if (path === '/warehouse-services/shipping' && request.method === 'GET') {
    let shippingQuery = auth.repositoryContext.supabase.from('shipping_jobs')
      .select('id,dispatch_id,client_3pl_id,job_date,carrier,tracking_number,service_level,parcel_weight_kg,carrier_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,destination')
      .eq('organization_id', auth.organizationId).order('job_date', { ascending: false });
    if (auth.user.role === 'CLIENT_USER') shippingQuery = shippingQuery.eq('client_3pl_id', auth.repositoryContext.client3plId);
    const { data: jobs, error } = await shippingQuery;
    if (error) throw error;
    const clientIds = [...new Set((jobs || []).map(row => row.client_3pl_id))];
    const orderIds = [...new Set((jobs || []).map(row => row.order_id).filter(Boolean))];
    const [clientsResult, ordersResult] = await Promise.all([
      clientIds.length ? auth.repositoryContext.supabase.from('clients_3pl').select('id,company_name').eq('organization_id', auth.organizationId).in('id', clientIds) : Promise.resolve({ data: [], error: null }),
      orderIds.length ? auth.repositoryContext.supabase.from('orders').select('id,order_number').eq('organization_id', auth.organizationId).in('id', orderIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    const clients = new Map((clientsResult.data || []).map(row => [row.id, row.company_name]));
    const orders = new Map((ordersResult.data || []).map(row => [row.id, row.order_number]));
    return json({ shippingJobs: (jobs || []).map(row => ({
      id: row.id, dispatchId: row.dispatch_id, clientId: row.client_3pl_id, clientName: clients.get(row.client_3pl_id) || '',
      date: row.job_date, carrier: row.carrier, trackingNumber: row.tracking_number || '', serviceLevel: row.service_level || '',
      parcelWeightKg: Number(row.parcel_weight_kg), carrierCostMinor: Number(row.carrier_cost_minor),
      serviceChargeMinor: Number(row.service_charge_minor), totalChargeMinor: Number(row.total_charge_minor),
      status: row.status, invoiceId: row.invoice_id || undefined, orderNumber: row.order_id ? orders.get(row.order_id) || '' : '',
      destination: typeof row.destination === 'string' ? row.destination : JSON.stringify(row.destination || {}),
    })) });
  }

  if (path === '/warehouse-services/summary' && request.method === 'GET') {
    let packagingQuery = auth.repositoryContext.supabase.from('packaging_jobs').select('id,status,total_charge_minor').eq('organization_id', auth.organizationId);
    let shippingQuery = auth.repositoryContext.supabase.from('shipping_jobs').select('id,status,total_charge_minor').eq('organization_id', auth.organizationId);
    let storageQuery = auth.repositoryContext.supabase.from('storage_snapshots').select('id,estimated_cost_minor').eq('organization_id', auth.organizationId);
    if (auth.user.role === 'CLIENT_USER') {
      packagingQuery = packagingQuery.eq('client_3pl_id', auth.repositoryContext.client3plId);
      shippingQuery = shippingQuery.eq('client_3pl_id', auth.repositoryContext.client3plId);
      storageQuery = storageQuery.eq('client_3pl_id', auth.repositoryContext.client3plId);
    }
    const [packaging, shipping, storage] = await Promise.all([packagingQuery, shippingQuery, storageQuery]);
    if (packaging.error) throw packaging.error;
    if (shipping.error) throw shipping.error;
    if (storage.error) throw storage.error;
    const packagingRows = packaging.data || [];
    const shippingRows = shipping.data || [];
    const storageRows = storage.data || [];
    return json({ summary: {
      packagingJobs: packagingRows.length, shippingJobs: shippingRows.length, storageSnapshots: storageRows.length,
      packagingChargesMinor: packagingRows.reduce((sum, row) => sum + Number(row.total_charge_minor), 0),
      shippingChargesMinor: shippingRows.reduce((sum, row) => sum + Number(row.total_charge_minor), 0),
      storageEstimatedCostMinor: storageRows.reduce((sum, row) => sum + Number(row.estimated_cost_minor), 0),
    } });
  }


  return null;
}
