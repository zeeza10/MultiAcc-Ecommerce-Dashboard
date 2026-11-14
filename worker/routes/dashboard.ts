import { SupabaseInventoryRepository } from '../../server/repositories/inventoryRepository';
import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleDashboardRoute(path: string, request: Request, url: URL, auth: AuthContext): Promise<Response | null> {
  if (path === '/dashboard/kpis' && request.method === 'GET') {
    const period = url.searchParams.get('period') || '30D';
    const accountId = url.searchParams.get('accountId');
    const now = new Date();
    const start = new Date(now);
    if (period === '7D') start.setDate(start.getDate() - 7);
    else if (period === '90D') start.setDate(start.getDate() - 90);
    else if (period === 'YTD') start.setMonth(0, 1);
    else start.setDate(start.getDate() - 30);

    const storeScoped = Boolean(accountId && accountId !== 'ALL');
    const canViewInventory = auth.permissions.has('*') || auth.permissions.has('inventory.view');

    let ordersQuery = auth.repositoryContext.supabase
      .from('orders')
      .select('id,status,total_minor,currency,created_at,marketplace_account_id')
      .eq('organization_id', auth.organizationId)
      .gte('created_at', start.toISOString());
    if (accountId && accountId !== 'ALL') ordersQuery = ordersQuery.eq('marketplace_account_id', accountId);
    if (auth.user.role === 'CLIENT_USER' && auth.user.clientId) ordersQuery = ordersQuery.eq('client_3pl_id', auth.user.clientId);

    const settingsQuery = auth.repositoryContext.supabase.from('system_settings').select('active_release_phase').eq('organization_id', auth.organizationId).maybeSingle();
    const [ordersResult, productsResult, inventoryBalances, invoiceResult, expenseResult, settingsResult] = await Promise.all([
      ordersQuery,
      canViewInventory && !storeScoped
        ? (() => {
            let query = auth.repositoryContext.supabase.from('products').select('id,currency,low_stock_threshold,cost_price_minor').eq('organization_id', auth.organizationId);
            if (auth.user.role === 'CLIENT_USER' && auth.user.clientId) query = query.eq('client_3pl_id', auth.user.clientId).eq('owner_type', 'CLIENT');
            return query;
          })()
        : Promise.resolve({ data: [], error: null }),
      canViewInventory && !storeScoped
        ? new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
            client3plId: auth.user.clientId,
            onlyClientProducts: auth.user.role === 'CLIENT_USER',
          })
        : Promise.resolve([]),
      !storeScoped && auth.user.role !== 'CLIENT_USER' && (auth.permissions.has('*') || auth.permissions.has('finance.view'))
        ? auth.repositoryContext.supabase.from('invoices').select('invoice_type,recipient_type,total_minor,paid_amount_minor,currency,status,issue_date').eq('organization_id', auth.organizationId)
        : Promise.resolve({ data: [], error: null }),
      !storeScoped && auth.user.role !== 'CLIENT_USER' && (auth.permissions.has('*') || auth.permissions.has('finance.view'))
        ? auth.repositoryContext.supabase.from('expenses').select('amount_minor,currency,status').eq('organization_id', auth.organizationId)
        : Promise.resolve({ data: [], error: null }),
      settingsQuery,
    ]);
    if (ordersResult.error || productsResult.error || invoiceResult.error || expenseResult.error || settingsResult.error) {
      throw new Error('Dashboard source records could not be loaded.');
    }
    let products = productsResult.data || [];
    let balances: any[] = inventoryBalances || [];
    let invoices = invoiceResult.data || [];
    let expenses = expenseResult.data || [];

    if (storeScoped) {
      const { data: store, error: storeError } = await auth.repositoryContext.supabase
        .from('marketplace_accounts').select('id').eq('organization_id', auth.organizationId).eq('id', accountId).maybeSingle();
      if (storeError) throw storeError;
      if (!store) return json({ error: 'Marketplace store was not found in this organization.' }, 404);

      const [inventoryAllocationsResult, financeAllocationsResult] = await Promise.all([
        canViewInventory
          ? auth.repositoryContext.supabase.from('marketplace_inventory_allocations')
              .select('product_id,allocated_quantity,reserved_quantity')
              .eq('organization_id', auth.organizationId).eq('marketplace_account_id', accountId)
          : Promise.resolve({ data: [], error: null }),
        auth.permissions.has('*') || auth.permissions.has('finance.view')
          ? auth.repositoryContext.supabase.from('marketplace_finance_allocations')
              .select('source_type,source_id,amount_minor,currency')
              .eq('organization_id', auth.organizationId).eq('marketplace_account_id', accountId)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (inventoryAllocationsResult.error || financeAllocationsResult.error) {
        throw new Error('Store inventory or finance allocations could not be loaded.');
      }

      const allocatedRows = inventoryAllocationsResult.data || [];
      const productIds = [...new Set(allocatedRows.map(row => row.product_id))];
      const productResult = productIds.length
        ? await auth.repositoryContext.supabase.from('products')
            .select('id,currency,low_stock_threshold,cost_price_minor')
            .eq('organization_id', auth.organizationId).in('id', productIds)
        : { data: [], error: null };
      if (productResult.error) throw productResult.error;
      products = productResult.data || [];
      const productByIdForAllocation = new Map(products.map(row => [row.id, row]));
      balances = allocatedRows.map(row => ({
        productId: row.product_id,
        onHand: Number(row.allocated_quantity || 0),
        reserved: Number(row.reserved_quantity || 0),
        available: Math.max(0, Number(row.allocated_quantity || 0) - Number(row.reserved_quantity || 0)),
        incoming: 0, damaged: 0, quarantined: 0, missing: 0, totalStock: Number(row.allocated_quantity || 0),
        weightedAverageCostMinor: Number(productByIdForAllocation.get(row.product_id)?.cost_price_minor || 0),
      }));

      const financeAllocations = financeAllocationsResult.data || [];
      const invoiceIds = [...new Set(financeAllocations.filter(row => row.source_type === 'INVOICE').map(row => row.source_id))];
      const expenseIds = [...new Set(financeAllocations.filter(row => row.source_type === 'EXPENSE').map(row => row.source_id))];
      const [storeInvoices, storeExpenses] = await Promise.all([
        invoiceIds.length
          ? auth.repositoryContext.supabase.from('invoices')
              .select('invoice_type,recipient_type,total_minor,paid_amount_minor,currency,status,issue_date,id')
              .eq('organization_id', auth.organizationId).in('id', invoiceIds)
          : Promise.resolve({ data: [], error: null }),
        expenseIds.length
          ? auth.repositoryContext.supabase.from('expenses')
              .select('amount_minor,currency,status,id')
              .eq('organization_id', auth.organizationId).in('id', expenseIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (storeInvoices.error || storeExpenses.error) throw new Error('Store finance source records could not be loaded.');
      const invoiceAllocations = new Map(financeAllocations.filter(row => row.source_type === 'INVOICE').map(row => [row.source_id, Number(row.amount_minor)]));
      invoices = (storeInvoices.data || []).map(row => ({
        ...row,
        total_minor: Math.min(Number(row.total_minor || 0), invoiceAllocations.get(row.id) || 0),
        paid_amount_minor: Math.min(Number(row.paid_amount_minor || 0), invoiceAllocations.get(row.id) || 0),
      }));
      const expenseAllocations = new Map(financeAllocations.filter(row => row.source_type === 'EXPENSE').map(row => [row.source_id, Number(row.amount_minor)]));
      expenses = (storeExpenses.data || []).map(row => ({
        ...row, amount_minor: Math.min(Number(row.amount_minor || 0), expenseAllocations.get(row.id) || 0),
      }));
    }

    const orders = ordersResult.data || [];
    const activeOrders = orders.filter(row => !['CANCELLED', 'VOID', 'REFUNDED'].includes(String(row.status).toUpperCase()));
    const pendingOrders = orders.filter(row => ['NEW', 'PENDING', 'CONFIRMED', 'ALLOCATED', 'PICKED', 'PACKED'].includes(String(row.status).toUpperCase()));
    const currencies = new Map();
    for (const row of activeOrders) {
      const currency = String(row.currency || 'GBP').trim();
      currencies.set(currency, (currencies.get(currency) || 0) + 1);
    }
    const productCurrencyCounts = new Map();
    for (const product of products) {
      const productCurrency = String(product.currency || 'GBP').trim();
      productCurrencyCounts.set(productCurrency, (productCurrencyCounts.get(productCurrency) || 0) + 1);
    }
    const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      || [...productCurrencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      || 'GBP';
    const revenueMinor = activeOrders.filter(row => String(row.currency || 'GBP').trim() === currency)
      .reduce((sum, row) => sum + Number(row.total_minor || 0), 0);
    const productById = new Map(products.map(product => [product.id, product]));
    const lowStockItems = balances.filter(balance =>
      Number(balance.available || 0) <= Number(productById.get(balance.productId)?.low_stock_threshold || 0)
    ).length;
    const totalStockUnits = balances.reduce((sum, balance) => sum + Number(balance.onHand || 0), 0);
    const inventoryValueMinor = (inventoryBalances || []).reduce((sum, balance) => {
      const product = productById.get(balance.productId);
      if (String(product?.currency || 'GBP').trim() !== currency) return sum;
      return sum + Number(balance.onHand || 0) * Number(balance.weightedAverageCostMinor || 0);
    }, 0);
    
    const outstandingForCurrency = (row: any) =>
      String(row.currency || '').trim() === currency
      && !['PAID', 'VOID', 'DRAFT'].includes(String(row.status).toUpperCase())
      ? Math.max(0, Number(row.total_minor || 0) - Number(row.paid_amount_minor || 0))
      : 0;
    const supplierPayablesMinor = invoices
      .filter(row => row.recipient_type === 'SUPPLIER')
      .reduce((sum, row) => sum + outstandingForCurrency(row), 0);
    const clientReceivablesMinor = invoices
      .filter(row => row.recipient_type === 'CLIENT')
      .reduce((sum, row) => sum + outstandingForCurrency(row), 0);
    const storageRevenueMinor = invoices
      .filter(row => row.invoice_type === 'STORAGE'
        && String(row.currency || '').trim() === currency
        && !['DRAFT', 'VOID'].includes(String(row.status).toUpperCase())
        && String(row.issue_date || '') >= start.toISOString().slice(0, 10)
        && String(row.issue_date || '') <= now.toISOString().slice(0, 10))
      .reduce((sum, row) => sum + Number(row.total_minor || 0), 0);
    const outstandingPaymentsMinor = invoices
      .filter(row => String(row.status).toUpperCase() === 'OVERDUE')
      .reduce((sum, row) => sum + outstandingForCurrency(row), 0);
    return json({ kpis: {
      totalOrders: activeOrders.length,
      pendingOrders: pendingOrders.length,
      revenueMinor,
      lowStockItems: storeScoped ? null : lowStockItems,
      totalStockUnits: storeScoped ? null : totalStockUnits,
      inventoryValueMinor: storeScoped ? null : inventoryValueMinor,
      supplierPayablesMinor: storeScoped ? null : supplierPayablesMinor,
      clientReceivablesMinor: storeScoped ? null : clientReceivablesMinor,
      storageRevenueMinor: storeScoped ? null : storageRevenueMinor,
      outstandingPaymentsMinor: storeScoped ? null : outstandingPaymentsMinor,
      storeScoped,
      currency,
      activePhase: settingsResult.data?.active_release_phase || 'ALL',
    }, userRole: auth.user.role, dataCoverage: {
      financeInvoices: invoices.length,
      expenseRecords: expenses.length,
    } });
  }

  if (path === '/dashboard/charts' && request.method === 'GET') {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const accountId = url.searchParams.get('accountId');
    const storeScoped = Boolean(accountId && accountId !== 'ALL');
    const canViewInventory = auth.permissions.has('*') || auth.permissions.has('inventory.view');
    let chartOrdersQuery = auth.repositoryContext.supabase.from('orders')
      .select('id,status,total_minor,currency,created_at')
      .eq('organization_id', auth.organizationId)
      .gte('created_at', since.toISOString());
    if (accountId && accountId !== 'ALL') chartOrdersQuery = chartOrdersQuery.eq('marketplace_account_id', accountId);
    if (auth.user.role === 'CLIENT_USER' && auth.user.clientId) {
      chartOrdersQuery = chartOrdersQuery.eq('client_3pl_id', auth.user.clientId);
    }
    const [ordersResult, balances] = await Promise.all([
      chartOrdersQuery,
      canViewInventory && !storeScoped
        ? new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
            client3plId: auth.user.clientId,
            onlyClientProducts: auth.user.role === 'CLIENT_USER',
          })
        : Promise.resolve([]),
    ]);
    if (ordersResult.error) throw new Error('Dashboard chart records could not be loaded.');
    let chartBalances: any[] = balances || [];
    if (storeScoped && canViewInventory) {
      const { data: allocations, error: allocationError } = await auth.repositoryContext.supabase
        .from('marketplace_inventory_allocations')
        .select('allocated_quantity,reserved_quantity')
        .eq('organization_id', auth.organizationId)
        .eq('marketplace_account_id', accountId);
      if (allocationError) throw allocationError;
      chartBalances = (allocations || []).map(row => ({
        onHand: Number(row.allocated_quantity || 0),
        reserved: Number(row.reserved_quantity || 0),
        available: Math.max(0, Number(row.allocated_quantity || 0) - Number(row.reserved_quantity || 0)),
        incoming: 0, damaged: 0, quarantined: 0,
      }));
    }
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(since);
      date.setDate(since.getDate() + index);
      return date.toISOString().slice(5, 10);
    });
    const chartCurrencyCounts = new Map();
    for (const row of ordersResult.data || []) {
      const currency = String(row.currency || 'GBP').trim();
      chartCurrencyCounts.set(currency, (chartCurrencyCounts.get(currency) || 0) + 1);
    }
    const chartCurrency = [...chartCurrencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'GBP';
    const trend = days.map(date => {
      const rows = (ordersResult.data || []).filter(row =>
        String(row.created_at).slice(5, 10) === date && String(row.currency || 'GBP').trim() === chartCurrency
      );
      return { date, orders: rows.length, revenue: rows.reduce((sum, row) => sum + Number(row.total_minor || 0), 0) / 100 };
    });
    const statusCounts: Record<string, number> = {};
    for (const row of ordersResult.data || []) statusCounts[String(row.status)] = (statusCounts[String(row.status)] || 0) + 1;
    const currencyOrderIds = (ordersResult.data || [])
      .filter(row => String(row.currency || 'GBP').trim() === chartCurrency)
      .map(row => row.id);
    const itemResult = currencyOrderIds.length
      ? await auth.repositoryContext.supabase.from('order_items')
          .select('sku,product_name,quantity,total_price_minor')
          .eq('organization_id', auth.organizationId)
          .in('order_id', currencyOrderIds)
      : { data: [], error: null };
    if (itemResult.error) throw new Error('Dashboard top SKU records could not be loaded.');
    const skuTotals = new Map<string, { sku: string; name: string; units: number; revenueMinor: number }>();
    for (const item of itemResult.data || []) {
      const sku = String(item.sku || '');
      const current = skuTotals.get(sku) || { sku, name: String(item.product_name || sku), units: 0, revenueMinor: 0 };
      current.units += Number(item.quantity || 0);
      current.revenueMinor += Number(item.total_price_minor || 0);
      skuTotals.set(sku, current);
    }
    const topSkus = [...skuTotals.values()]
      .sort((a, b) => b.revenueMinor - a.revenueMinor)
      .slice(0, 5)
      .map(item => ({ sku: item.sku, name: item.name, units: item.units, revenue: item.revenueMinor / 100 }));
    const stockByState = chartBalances.reduce((acc: Record<string, number>, row: any) => {
      acc.available = (acc.available || 0) + Number(row.available || 0);
      acc.reserved = (acc.reserved || 0) + Number(row.reserved || 0);
      acc.onHand = (acc.onHand || 0) + Number(row.onHand || 0);
      acc.incoming = (acc.incoming || 0) + Number(row.incoming || 0);
      acc.damaged = (acc.damaged || 0) + Number(row.damaged || 0);
      acc.quarantined = (acc.quarantined || 0) + Number(row.quarantined || 0);
      return acc;
    }, {});
    return json({ trend, statusCounts, stockByState: canViewInventory ? stockByState : null, topSkus, inventoryAvailable: canViewInventory, storeScoped });
  }


  return null;
}
