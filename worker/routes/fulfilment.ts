import type { AuthContext } from '../types';
import { json } from '../http';

async function getVisibleClientIds(auth: AuthContext, url: URL): Promise<string[]> {
  const accountId = url.searchParams.get('accountId');
  let includeDemo = false;
  if (accountId && accountId !== 'ALL') {
    const { data: account, error: accountError } = await auth.repositoryContext.supabase
      .from('marketplace_accounts').select('id,is_demo')
      .eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
    if (accountError) throw accountError;
    if (!account) throw new Error('The selected marketplace account was not found in this workspace.');
    includeDemo = Boolean(account.is_demo);
  }

  let query = auth.repositoryContext.supabase.from('clients_3pl')
    .select('id').eq('organization_id', auth.organizationId);
  if (auth.user.role === 'CLIENT_USER') {
    if (!auth.repositoryContext.client3plId) return [];
    query = query.eq('id', auth.repositoryContext.client3plId);
  } else {
    query = includeDemo
      ? query.like('external_id', 'demo:%')
      : query.or('external_id.is.null,external_id.not.like.demo:%');
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => row.id);
}

export async function handleFulfilmentRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
  if (path === '/warehouse-services/packaging' && request.method === 'POST') {
    if (auth.user.role === 'CLIENT_USER') return json({ error: 'Client users cannot create warehouse jobs.' }, 403);
    const body = await request.json() as Record<string, unknown>;
    const clientId = String(body.clientId || '');
    const visibleClientIds = await getVisibleClientIds(auth, url);
    if (!visibleClientIds.includes(clientId)) return json({ error: 'The selected 3PL client is not available in this account context.' }, 404);
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
    if (!clientId) return json({ error: 'Select a 3PL client.' }, 400);
    const visibleClientIds = await getVisibleClientIds(auth, url);
    if (!visibleClientIds.includes(clientId)) return json({ error: 'The selected 3PL client is not available in this account context.' }, 404);
    if (auth.user.role === 'CLIENT_USER' && clientId !== auth.repositoryContext.client3plId) return json({ error: 'You cannot view another client billing preview.' }, 403);
    const { data: client, error: clientError } = await auth.repositoryContext.supabase.from('clients_3pl')
      .select('id,company_name,code,billing_period,rate_card_id').eq('organization_id', auth.organizationId).eq('id', clientId).maybeSingle();
    if (clientError) throw new Error('3PL client details could not be loaded.');
    if (!client) return json({ error: '3PL client not found.' }, 404);
    const now = new Date();
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const [storage, packaging, shipping, invoices, rateCard, settings] = await Promise.all([
      auth.repositoryContext.supabase.from('storage_snapshots').select('estimated_cost_minor').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId).gte('snapshot_date', periodStart).lte('snapshot_date', periodEnd),
      auth.repositoryContext.supabase.from('packaging_jobs').select('total_charge_minor,quantity').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId).gte('job_date', periodStart).lte('job_date', periodEnd),
      auth.repositoryContext.supabase.from('shipping_jobs').select('total_charge_minor').eq('organization_id', auth.organizationId).eq('client_3pl_id', clientId).gte('job_date', periodStart).lte('job_date', periodEnd),
      auth.repositoryContext.supabase.from('invoices').select('total_minor,paid_amount_minor,status').eq('organization_id', auth.organizationId).eq('recipient_type', 'CLIENT').eq('recipient_id', clientId),
      client.rate_card_id ? auth.repositoryContext.supabase.from('rate_cards').select('currency').eq('organization_id', auth.organizationId).eq('id', client.rate_card_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      auth.repositoryContext.supabase.from('system_settings').select('base_currency,default_vat_rate_percent').eq('organization_id', auth.organizationId).maybeSingle(),
    ]);
    for (const result of [storage, packaging, shipping, invoices, rateCard, settings]) if (result.error) throw new Error('Billing preview source data could not be loaded.');
    const sum = (items: any[], field: string) => (items || []).reduce((total, row) => total + Number(row[field] || 0), 0);
    const storageMinor = sum(storage.data || [], 'estimated_cost_minor');
    const packagingMinor = sum(packaging.data || [], 'total_charge_minor');
    const shippingMinor = sum(shipping.data || [], 'total_charge_minor');
    const invoicedMinor = sum(invoices.data || [], 'total_minor');
    const paidMinor = sum(invoices.data || [], 'paid_amount_minor');
    const subtotalMinor = storageMinor + packagingMinor + shippingMinor;
    const vatRatePercent = Number(settings.data?.default_vat_rate_percent ?? 0);
    const vatMinor = Math.round(subtotalMinor * vatRatePercent / 100);
    return json({
      client: { id: client.id, companyName: client.company_name, code: client.code, billingPeriod: client.billing_period },
      period: { start: periodStart, end: periodEnd },
      currency: String(rateCard.data?.currency || settings.data?.base_currency || 'GBP').trim(),
      vatRatePercent, estimatedStorageMinor: storageMinor,
      estimatedHandlingMinor: packagingMinor + shippingMinor,
      totalEstimatedChargesMinor: subtotalMinor, estimatedVatMinor: vatMinor,
      totalWithVatMinor: subtotalMinor + vatMinor,
      invoicedMinor, paidMinor, outstandingMinor: Math.max(0, invoicedMinor - paidMinor),
      packedUnits: sum(packaging.data || [], 'quantity'),
    });
  }

  if (path === '/3pl/clients' && request.method === 'GET') {
    const visibleClientIds = await getVisibleClientIds(auth, url);
    if (visibleClientIds.length === 0) return json({ clients: [], rateCards: [] });
    let ratesQuery = auth.repositoryContext.supabase.from('rate_cards')
      .select('id,name,pick_fee_minor,pack_fee_minor,extra_item_fee_minor,storage_pallet_per_month_minor,storage_shelf_per_month_minor,storage_bin_per_month_minor,minimum_monthly_charge_minor,currency,external_id')
      .eq('organization_id', auth.organizationId);
    const accountId = url.searchParams.get('accountId');
    let includeDemo = false;
    if (accountId && accountId !== 'ALL') {
      const { data: account } = await auth.repositoryContext.supabase.from('marketplace_accounts')
        .select('is_demo').eq('id', accountId).eq('organization_id', auth.organizationId).maybeSingle();
      includeDemo = Boolean(account?.is_demo);
    }
    ratesQuery = includeDemo
      ? ratesQuery.like('external_id', 'demo:%')
      : ratesQuery.or('external_id.is.null,external_id.not.like.demo:%');
    const [clientsResult, ratesResult] = await Promise.all([
      auth.repositoryContext.supabase.from('clients_3pl')
        .select('id,company_name,code,contact_email,contact_phone,billing_address,billing_period,rate_card_id,account_status,created_at')
        .eq('organization_id', auth.organizationId).in('id', visibleClientIds)
        .order('company_name', { ascending: true }),
      ratesQuery.order('name', { ascending: true }),
    ]);
    if (clientsResult.error) throw clientsResult.error;
    if (ratesResult.error) throw ratesResult.error;
    const visibleRateCardIds = new Set((clientsResult.data || []).map(row => row.rate_card_id).filter(Boolean));
    const rateCards = (ratesResult.data || []).filter(row => auth.user.role !== 'CLIENT_USER' || visibleRateCardIds.has(row.id)).map(row => ({
      id: row.id, name: row.name, pickFeeMinor: Number(row.pick_fee_minor), packFeeMinor: Number(row.pack_fee_minor),
      extraItemFeeMinor: Number(row.extra_item_fee_minor), storagePalletPerMonthMinor: Number(row.storage_pallet_per_month_minor),
      storageShelfPerMonthMinor: Number(row.storage_shelf_per_month_minor), storageBinPerMonthMinor: Number(row.storage_bin_per_month_minor),
      minimumMonthlyChargeMinor: Number(row.minimum_monthly_charge_minor), currency: String(row.currency || 'GBP').trim(),
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
      .eq('organization_id', auth.organizationId).in('client_3pl_id', visibleClientIds).order('snapshot_date', { ascending: false });
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
    const visibleClientIds = await getVisibleClientIds(auth, url);
    if (visibleClientIds.length === 0) return json({ packagingJobs: [] });
    let packagingQuery = auth.repositoryContext.supabase.from('packaging_jobs')
      .select('id,job_number,client_3pl_id,job_date,packaging_type,quantity,material_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,performed_by,notes')
      .eq('organization_id', auth.organizationId).in('client_3pl_id', visibleClientIds).order('job_date', { ascending: false });
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
    const visibleClientIds = await getVisibleClientIds(auth, url);
    if (visibleClientIds.length === 0) return json({ shippingJobs: [] });
    let shippingQuery = auth.repositoryContext.supabase.from('shipping_jobs')
      .select('id,dispatch_id,client_3pl_id,job_date,carrier,tracking_number,service_level,parcel_weight_kg,carrier_cost_minor,service_charge_minor,total_charge_minor,status,invoice_id,order_id,destination')
      .eq('organization_id', auth.organizationId).in('client_3pl_id', visibleClientIds).order('job_date', { ascending: false });
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
    const visibleClientIds = await getVisibleClientIds(auth, url);
    if (visibleClientIds.length === 0) return json({ summary: { packagingJobs: 0, shippingJobs: 0, storageSnapshots: 0, packagingChargesMinor: 0, shippingChargesMinor: 0, storageEstimatedCostMinor: 0 } });
    let packagingQuery = auth.repositoryContext.supabase.from('packaging_jobs').select('id,status,total_charge_minor').eq('organization_id', auth.organizationId);
    let shippingQuery = auth.repositoryContext.supabase.from('shipping_jobs').select('id,status,total_charge_minor').eq('organization_id', auth.organizationId);
    let storageQuery = auth.repositoryContext.supabase.from('storage_snapshots').select('id,estimated_cost_minor').eq('organization_id', auth.organizationId);
    packagingQuery = packagingQuery.in('client_3pl_id', visibleClientIds);
    shippingQuery = shippingQuery.in('client_3pl_id', visibleClientIds);
    storageQuery = storageQuery.in('client_3pl_id', visibleClientIds);
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
