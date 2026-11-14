import { SupabaseInventoryRepository } from '../../server/repositories/inventoryRepository';
import type { AuthContext } from '../types';
import { json } from '../http';

export async function handleDashboardRoute(path: string, url: URL, auth: AuthContext): Promise<Response | null> {
  if (path === '/dashboard/kpis' && request.method === 'GET') {
    const period = url.searchParams.get('period') || '30D';
    const accountId = url.searchParams.get('accountId');
    const now = new Date();
    const start = new Date(now);
    if (period === '7D') start.setDate(start.getDate() - 7);
    else if (period === '90D') start.setDate(start.getDate() - 90);
    else if (period === 'YTD') start.setMonth(0, 1);
    else start.setDate(start.getDate() - 30);

    let ordersQuery = auth.repositoryContext.supabase
      .from('orders')
      .select('id,status,total_minor,currency,created_at,marketplace_account_id')
      .eq('organization_id', auth.organizationId)
      .gte('created_at', start.toISOString());
    if (accountId && accountId !== 'ALL') ordersQuery = ordersQuery.eq('marketplace_account_id', accountId);
    if (auth.user.role === 'CLIENT_USER' && auth.user.clientId) ordersQuery = ordersQuery.eq('client_3pl_id', auth.user.clientId);

    const [ordersResult, productsResult, inventoryBalances, invoiceResult, expenseResult] = await Promise.all([
      ordersQuery,
      auth.repositoryContext.supabase.from('products').select('id,currency,low_stock_threshold').eq('organization_id', auth.organizationId),
      new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
        client3plId: auth.user.clientId,
        onlyClientProducts: auth.user.role === 'CLIENT_USER',
      }),
      auth.permissions.has('*') || auth.permissions.has('finance.view')
        ? auth.repositoryContext.supabase.from('invoices').select('invoice_type,recipient_type,total_minor,paid_amount_minor,currency,status,issue_date').eq('organization_id', auth.organizationId)
        : Promise.resolve({ data: [], error: null }),
      auth.permissions.has('*') || auth.permissions.has('finance.view')
        ? auth.repositoryContext.supabase.from('expenses').select('amount_minor,currency,status').eq('organization_id', auth.organizationId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (ordersResult.error || productsResult.error || invoiceResult.error || expenseResult.error) {
      throw new Error('Dashboard source records could not be loaded.');
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
    for (const product of productsResult.data || []) {
      const productCurrency = String(product.currency || 'GBP').trim();
      productCurrencyCounts.set(productCurrency, (productCurrencyCounts.get(productCurrency) || 0) + 1);
    }
    const currency = [...currencies.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      || [...productCurrencyCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      || 'GBP';
    const revenueMinor = activeOrders.filter(row => String(row.currency || 'GBP').trim() === currency)
      .reduce((sum, row) => sum + Number(row.total_minor || 0), 0);
    const productById = new Map((productsResult.data || []).map(product => [product.id, product]));
    const lowStockItems = (inventoryBalances || []).filter(balance =>
      Number(balance.available || 0) <= Number(productById.get(balance.productId)?.low_stock_threshold || 0)
    ).length;
    const totalStockUnits = (inventoryBalances || []).reduce((sum, balance) => sum + Number(balance.onHand || 0), 0);
    const inventoryValueMinor = (inventoryBalances || []).reduce((sum, balance) => {
      const product = productById.get(balance.productId);
      if (String(product?.currency || 'GBP').trim() !== currency) return sum;
      return sum + Number(balance.onHand || 0) * Number(balance.weightedAverageCostMinor || 0);
    }, 0);
    const invoices = invoiceResult.data || [];
    const expenses = expenseResult.data || [];
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
      lowStockItems,
      totalStockUnits,
      inventoryValueMinor,
      supplierPayablesMinor,
      clientReceivablesMinor,
      storageRevenueMinor,
      outstandingPaymentsMinor,
      currency,
      activePhase: 'ALL',
    }, userRole: auth.user.role, dataCoverage: {
      financeInvoices: invoices.length,
      expenseRecords: expenses.length,
    } });
  }

  if (path === '/dashboard/charts' && request.method === 'GET') {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const [ordersResult, balances] = await Promise.all([
      auth.repositoryContext.supabase.from('orders')
        .select('id,status,total_minor,currency,created_at')
        .eq('organization_id', auth.organizationId)
        .gte('created_at', since.toISOString()),
      new SupabaseInventoryRepository(auth.repositoryContext).listBalances({
        client3plId: auth.user.clientId,
        onlyClientProducts: auth.user.role === 'CLIENT_USER',
      }),
    ]);
    if (ordersResult.error) throw new Error('Dashboard chart records could not be loaded.');
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
    const stockByState = (balances || []).reduce((acc: Record<string, number>, row: any) => {
      acc.available = (acc.available || 0) + Number(row.available || 0);
      acc.reserved = (acc.reserved || 0) + Number(row.reserved || 0);
      acc.onHand = (acc.onHand || 0) + Number(row.onHand || 0);
      acc.incoming = (acc.incoming || 0) + Number(row.incoming || 0);
      acc.damaged = (acc.damaged || 0) + Number(row.damaged || 0);
      acc.quarantined = (acc.quarantined || 0) + Number(row.quarantined || 0);
      return acc;
    }, {});
    return json({ trend, statusCounts, stockByState, topSkus: [] });
  }


  return null;
}
