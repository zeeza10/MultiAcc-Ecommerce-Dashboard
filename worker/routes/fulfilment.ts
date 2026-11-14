import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleFulfilmentRoute(path: string, request: Request, auth: AuthContext): Promise<Response | null> {
  if (path === '/warehouse-services/packaging' && request.method === 'POST') {
    if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot create warehouse jobs.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const clientId = String(body.clientId || '');
    let orderId: string | null = null;
    if (body.orderNumber) {
      const { data: order, error: orderError } = await auth.repositoryContext.supabase.from('orders')
        .select('id').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId)
        .eq('order_number', String(body.orderNumber)).maybeSingle();
      if (orderError) throw new Error('The selected order could not be verified.');
      if (!order) throw new Error('The selected order does not belong to this client.');
      orderId = order.id;
    }
    const { data, error } = await auth.repositoryContext.supabase.rpc('create_packaging_job', {
      p_organization_id: auth.organizationId, p_client_3pl_id: clientId,
      p_job_date: body.jobDate ? String(body.jobDate) : new Date().toISOString().slice(0, 10),
      p_packaging_type: String(body.packagingType || ''),
      p_quantity: Number(body.quantity), p_material_cost_minor: Number(body.materialCostMinor || 0),
      p_order_id: orderId, p_notes: body.notes == null ? null : String(body.notes),
    });
    if (error) throw new Error(error.message || 'Packaging job could not be saved.');
    const row = data as Record<string, any>;
    return json({ job: {
      id: row.id, jobNumber: row.job_number, clientId: row.client_3pl_id, date: row.job_date,
      packagingType: row.packaging_type, quantity: Number(row.quantity), materialCostMinor: Number(row.material_cost_minor),
      serviceChargeMinor: Number(row.service_charge_minor), totalChargeMinor: Number(row.total_charge_minor),
      status: row.status, invoiceId: row.invoice_id || undefined, orderId: row.order_id || undefined,
      performedBy: row.performed_by || '', notes: row.notes || undefined,
    } }, 201);
  }

  if (path === '/warehouse-services/shipping' && request.method === 'POST') {
    if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot create warehouse jobs.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const clientId = String(body.clientId || '');
    let orderId: string | null = null;
    if (body.orderNumber) {
      const { data: order, error: orderError } = await auth.repositoryContext.supabase.from('orders')
        .select('id').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId)
        .eq('order_number', String(body.orderNumber)).maybeSingle();
      if (orderError) throw new Error('The selected order could not be verified.');
      if (!order) throw new Error('The selected order does not belong to this client.');
      orderId = order.id;
    }
    const { data, error } = await auth.repositoryContext.supabase.rpc('create_shipping_job', {
      p_organization_id: auth.organizationId, p_client_3pl_id: clientId,
      p_job_date: body.jobDate ? String(body.jobDate) : new Date().toISOString().slice(0, 10),
      p_carrier: String(body.carrier || ''), p_tracking_number: body.trackingNumber == null ? null : String(body.trackingNumber),
      p_service_level: String(body.serviceLevel || ''), p_parcel_weight_kg: Number(body.parcelWeightKg),
      p_carrier_cost_minor: Number(body.carrierCostMinor || 0), p_service_charge_minor: Number(body.serviceChargeMinor || 0),
      p_destination: String(body.destination || ''), p_order_id: orderId,
    });
    if (error) throw new Error(error.message || 'Shipping job could not be saved.');
    const row = data as Record<string, any>;
    return json({ job: {
      id: row.id, dispatchId: row.dispatch_id, clientId: row.client_3pl_id, date: row.job_date,
      carrier: row.carrier, trackingNumber: row.tracking_number || '', serviceLevel: row.service_level,
      parcelWeightKg: Number(row.parcel_weight_kg), carrierCostMinor: Number(row.carrier_cost_minor),
      serviceChargeMinor: Number(row.service_charge_minor), totalChargeMinor: Number(row.total_charge_minor),
      status: row.status, invoiceId: row.invoice_id || undefined, orderId: row.order_id || undefined,
      destination: row.destination?.destination || '',
    } }, 201);
  }

  if (path === '/3pl/billing-preview' && request.method === 'POST') {
    const body = await request.json() as { clientId?: string };
    const clientId = String(body.clientId || '');
    if (auth.user.role === 'CLIENT_USER' && clientId !== auth.repositoryContext.client3plId) return json({ error: 'You cannot view another client billing preview.' }, 403);
    const { data: client, error: clientError } = await auth.repositoryContext.supabase.from('clients_3pl')
      .select('id,company_name,code').eq('organization_id', auth.organizationId).eq('id', clientId).maybeSingle();
    if (clientError) throw clientError;
    if (!client) return json({ error: '3PL client not found.' }, 404);
    const [storage, packaging, shipping, invoices] = await Promise.all([
      auth.repositoryContext.supabase.from('storage_snapshots').select('estimated_cost_minor').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId),
      auth.repositoryContext.supabase.from('packaging_jobs').select('total_charge_minor,quantity').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId),
      auth.repositoryContext.supabase.from('shipping_jobs').select('total_charge_minor').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId),
      auth.repositoryContext.supabase.from('invoices').select('total_minor,paid_amount_minor,status').eq('organization_id', auth.organizationId).eq('recipient_id', clientId),
    ]);
    for (const result of [storage, packaging, shipping, invoices]) if (result.error) throw result.error;
    const sum = (items: any[], field: string) => (items || []).reduce((total, row) => total + Number(row[field] || 0), 0);
    const storageMinor = sum(storage.data || [], 'estimated_cost_minor');
    const packagingMinor = sum(packaging.data || [], 'total_charge_minor');
    const shippingMinor = sum(shipping.data || [], 'total_charge_minor');
    const invoicedMinor = sum(invoices.data || [], 'total_minor');
    const paidMinor = sum(invoices.data || [], 'paid_amount_minor');
    return json({ client, storageChargesMinor: storageMinor, packagingChargesMinor: packagingMinor,
      shippingChargesMinor: shippingMinor, invoicedMinor, paidMinor, outstandingMinor: Math.max(0, invoicedMinor - paidMinor),
      packedUnits: sum(packaging.data || [], 'quantity') });
  }

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
