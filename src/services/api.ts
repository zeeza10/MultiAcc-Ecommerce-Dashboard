import {
  MarketplaceAccount,
  Product,
  Order,
  StockBalance,
  StockLedgerEntry,
  StockAdjustment,
  ExceptionItem,
  Supplier,
  PurchaseOrder,
  ReturnOrder,
  Client3PL,
  RateCard,
  Invoice,
  Payment,
  Expense,
  FinancialLedgerEntry,
  AuditLogEntry,
  NotificationItem,
  SystemConfig,
  EbayPayout,
  FinancialReconciliation,
  WarehousePackagingJob,
  WarehouseShippingJob,
  DropshippingCalculation,
} from '../types';


import { supabase } from '../lib/supabase';
import { notifyApiLoading } from './loadingEvents';
import { fetchWithSessionRecovery } from './authenticatedFetch';


async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  notifyApiLoading(1);
  try {
    const headers = new Headers(options.headers || {});
    const organizationId = window.localStorage.getItem('nexusops_active_organization_id');
    if (organizationId) headers.set('X-Organization-Id', organizationId);
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetchWithSessionRecovery(
      fetch,
      supabase.auth,
      `/api/v1${endpoint}`,
      { ...options, headers },
    );
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      throw new Error(payload?.error || `API request failed (${response.status}).`);
    }
    if (!contentType.includes('application/json')) {
      throw new Error('The authenticated API service is unavailable. Demo/local fallback is disabled.');
    }
    return payload as T;
  } finally {
    notifyApiLoading(-1);
  }
}

async function requestBlob(endpoint: string): Promise<Blob> {
  notifyApiLoading(1);
  try {
    const headers = new Headers();
    const organizationId = window.localStorage.getItem('nexusops_active_organization_id');
    if (organizationId) headers.set('X-Organization-Id', organizationId);
    const response = await fetchWithSessionRecovery(
      fetch,
      supabase.auth,
      `/api/v1${endpoint}`,
      { headers },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || `Report export failed (${response.status}).`);
    }
    if (!(response.headers.get('content-type') || '').includes('text/csv')) {
      throw new Error('The report export did not return a CSV file.');
    }
    return response.blob();
  } finally {
    notifyApiLoading(-1);
  }
}

export const api = {
  // Auth

  // Dashboard
  getKPIs: (period = '30D', accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') => {
    let url = `/dashboard/kpis?period=${encodeURIComponent(period)}&environment=${environment}`;
    if (accountId && accountId !== 'ALL') url += `&accountId=${encodeURIComponent(accountId)}`;
    return request<{ kpis: any; userRole: string }>(url);
  },
  getCharts: (accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') => request<any>(`/dashboard/charts?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`),

  // Orders
  getOrderCount: (accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') => request<{ count: number }>(`/orders/count?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`),
  getOrders: (params: { status?: string; accountId?: string; search?: string; environment?: 'DEMO' | 'SANDBOX' | 'PRODUCTION' } = {}) => {
    const q = new URLSearchParams();
    if (params.status && params.status !== 'ALL') q.set('status', params.status);
    if (params.accountId && params.accountId !== 'ALL') q.set('accountId', params.accountId);
    if (params.search) q.set('search', params.search);
    if (params.environment) q.set('environment', params.environment);
    return request<{ orders: Order[] }>(`/orders?${q.toString()}`);
  },
  getOrder: (id: string) => request<{ order: Order; histories: any[] }>(`/orders/${id}`),
  createOrder: (payload: any, accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') =>
    request<{ order: Order }>(`/orders?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  transitionOrder: (id: string, targetStatus: string, options: { carrier?: string; trackingNumber?: string; note?: string } = {}) =>
    request<{ order: Order }>(`/orders/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus, ...options }),
    }),

  // Products
  getProducts: (accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') => request<{ products: (Product & { stockOnHand: number; stockReserved: number; stockAvailable: number; stockIncoming: number; stockDamaged: number })[] }>(`/products?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`),
  createProduct: (payload: any, accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') =>
    request<{ product: Product }>(`/products?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Inventory & Ledger
  getBalances: (accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') => request<{ balances: StockBalance[] }>(`/inventory/balances?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`),
  getStockLedger: (accountId?: string, environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION' = 'PRODUCTION') => request<{ ledger: StockLedgerEntry[] }>(`/inventory/ledger?environment=${environment}${accountId && accountId !== 'ALL' ? `&accountId=${encodeURIComponent(accountId)}` : ''}`),
  allocateStoreInventory: (payload: { marketplaceAccountId: string; productId: string; allocatedQuantity: number; reservedQuantity?: number }) =>
    request<{ allocation: unknown }>('/inventory/allocations', { method: 'POST', body: JSON.stringify(payload) }),

  // Stock Adjustments
  getAdjustments: () => request<{ adjustments: StockAdjustment[] }>('/stock/adjustments'),
  createAdjustment: (payload: any) =>
    request<{ adjustment: StockAdjustment }>('/stock/adjustments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  processAdjustment: (id: string, decision: 'APPROVE' | 'REJECT', approvalNote: string) =>
    request<{ adjustment: StockAdjustment }>(`/stock/adjustments/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, approvalNote }),
    }),

  // eBay Accounts & Sync
  getEbayAccounts: (accountId?: string) => request<{ accounts: MarketplaceAccount[]; recentSyncs: any[]; integrationReady: boolean; integrationMessage: string; productionOAuthEnabled: boolean }>(`/ebay/accounts${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  createEbayAccount: (payload: { name: string; marketplace: 'EBAY_UK' | 'EBAY_US' | 'EBAY_DE'; environment: 'SANDBOX' | 'PRODUCTION' }) => request<{ account: MarketplaceAccount }>('/ebay/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  getEbayIntegrationConfig: () => request<{ environments: Array<{ environment: string; configured: boolean; clientIdMasked: string; credentialVersion: number; updatedAt: string | null }>; productionOAuthEnabled: boolean; encryptionReady: boolean }>('/ebay/integration/config'),
  getEbayIntegrationEvents: (accountId?: string) => request<{ events: Array<{ id: string; accountId: string | null; accountName: string; sellerUsername: string; eventType: string; severity: string; errorCode: string | null; message: string; apiName: string; httpStatus: number | null; providerCode: string | null; createdAt: string; nextSyncAt: string | null; retryable: boolean }> }>(`/ebay/integration/events${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  saveEbayIntegrationConfig: (payload: { environment: 'SANDBOX' | 'PRODUCTION'; clientId: string; clientSecret: string; ruName: string; expectedVersion: number }) => request<{ success: boolean }>('/ebay/integration/config', { method: 'POST', body: JSON.stringify(payload) }),
  syncEbayAccount: (id: string) =>
    request<{
      status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
      orders: {
        status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
        fetched?: number; imported?: number; skipped?: number; exceptions?: number; pagesPending?: boolean;
        error?: { code: string; message: string; stage: string; httpStatus: number | null };
      };
      inventory: {
        status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
        fetched?: number; offersFetched?: number; pagesPending?: boolean;
        error?: { code: string; message: string; stage: string; httpStatus: number | null };
      };
      imported: number; skipped: number; exceptions: number; fetched: number;
    }>(`/ebay/accounts/${id}/sync`, { method: 'POST' }),
  getEbayListings: (id: string, limit = 50, offset = 0) =>
    request<{ listings: Array<{ sku: string; title: string; description: string; imageUrls: string[]; condition: string; inventoryQuantity: number | null; listingStatus: string; offers: any[]; syncedAt: string }>; total: number; limit: number; offset: number }>(`/ebay/accounts/${id}/listings?limit=${limit}&offset=${offset}`),
  connectEbayAccount: (id: string) =>
    request<{ authorizationUrl: string }>(`/ebay/accounts/${id}/connect`, { method: 'POST' }),
  getExceptions: (accountId?: string) => request<{ exceptions: ExceptionItem[] }>(`/ebay/exceptions${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  resolveException: (id: string, targetProductId: string, resolutionNote?: string) =>
    request<{ success: boolean; exception: ExceptionItem }>(`/ebay/exceptions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ targetProductId, resolutionNote }),
    }),

  // Phase 2: Purchasing & Returns
  getSuppliers: (accountId?: string) => request<{ suppliers: Supplier[] }>(`/suppliers${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  createSupplier: (payload: { name: string; code: string; contactName?: string; email?: string; phone?: string; paymentTermsDays: number; currency: string; leadTimeDays: number }, accountId?: string) =>
    request<{ supplier: Supplier }>(`/suppliers${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, { method: 'POST', body: JSON.stringify(payload) }),
  getPurchaseOrders: (accountId?: string) => request<{ purchaseOrders: PurchaseOrder[]; receipts: any[] }>(`/purchase-orders${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  createPurchaseOrder: (payload: { supplierId: string; expectedDate?: string; notes?: string; taxMinor: number; lines: Array<{ productId: string; orderedQty: number; unitCostMinor: number }> }, idempotencyKey: string, accountId?: string) =>
    request<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({ ...payload, idempotencyKey }),
    }),
  approvePurchaseOrder: (id: string) =>
    request<{ purchaseOrder: PurchaseOrder }>(`/purchase-orders/${id}/approve`, { method: 'POST' }),
  receivePO: (id: string, items: any[], discrepancyNote: string | undefined, idempotencyKey: string) =>
    request<{ success: boolean; receipt: any; purchaseOrder: PurchaseOrder; duplicate: boolean }>(`/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ items, discrepancyNote, idempotencyKey }),
    }),
  getReturns: (accountId?: string) => request<{ returns: ReturnOrder[] }>(`/returns${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  processReturnDisposition: (id: string, dispositions: any[], issueRefund: boolean, idempotencyKey: string) =>
    request<{ success: boolean; return: ReturnOrder; duplicate: boolean }>(`/returns/${id}/disposition`, {
      method: 'POST',
      body: JSON.stringify({ dispositions, issueRefund, idempotencyKey }),
    }),

  // Phase 3: 3PL
  get3PLClients: (accountId?: string) => request<{ clients: Client3PL[]; rateCards: RateCard[] }>(`/3pl/clients${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  getStorageSnapshots: (accountId?: string) => request<{ snapshots: any[] }>(`/3pl/storage-snapshots${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  getBillingPreview: (clientId: string, accountId?: string) =>
    request<any>(`/3pl/billing-preview${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify({ clientId }),
    }),

  // Phase 4: Finance
  getInvoices: (accountId?: string) => request<{ invoices: Invoice[] }>(`/finance/invoices${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  voidInvoice: (id: string, reason: string) =>
    request<{ success: boolean; invoice: Invoice }>(`/finance/invoices/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getPayments: (accountId?: string) => request<{ payments: Payment[] }>(`/finance/payments${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  recordPayment: (payload: any) =>
    request<{ payment: Payment }>('/finance/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getExpenses: (accountId?: string) => request<{ expenses: Expense[] }>(`/finance/expenses${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  getFinancialLedger: (accountId?: string) => request<{ ledger: FinancialLedgerEntry[] }>(`/finance/ledger${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  allocateStoreFinance: (payload: { marketplaceAccountId: string; sourceType: 'INVOICE' | 'EXPENSE' | 'PAYMENT' | 'JOURNAL_ENTRY'; sourceId: string; amountMinor: number; currency: string; note?: string }) =>
    request<{ allocation: unknown }>('/finance/allocations', { method: 'POST', body: JSON.stringify(payload) }),

  // Reports
  getReport: (id: string, params: { startDate?: string; endDate?: string; accountId?: string; sku?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (params.accountId) q.set('accountId', params.accountId);
    if (params.sku) q.set('sku', params.sku);
    return request<any>(`/reports/${id}?${q.toString()}`);
  },
  exportReport: (id: string, params: { startDate?: string; endDate?: string; accountId?: string; sku?: string } = {}) => {
    const q = new URLSearchParams({ format: 'csv' });
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (params.accountId) q.set('accountId', params.accountId);
    if (params.sku) q.set('sku', params.sku);
    return requestBlob(`/reports/${id}?${q.toString()}`);
  },

  // Order Editing
  editOrder: (
    id: string,
    payload: {
      items?: { sku: string; quantity: number; unitPriceMinor: number }[];
      shippingFeeMinor?: number;
      customerName?: string;
      customerEmail?: string;
      shippingAddress?: any;
      notes?: string;
      reason: string;
      status?: any;
      allowOverride?: boolean;
    }
  ) =>
    request<{ order: Order }>(`/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // Phase 4: eBay Payouts & Reconciliation
  getPayouts: (accountId?: string) => {
    const q = accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return request<{ payouts: EbayPayout[]; balances: any }>(`/payouts${q}`);
  },
  confirmPayoutDeposit: (id: string, bankReference: string) =>
    request<{ payout: EbayPayout; success: boolean }>(`/payouts/${id}/confirm-deposit`, {
      method: 'POST',
      body: JSON.stringify({ bankReference }),
    }),
  getReconciliations: (accountId?: string) => {
    const q = accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : '';
    return request<{ reconciliations: FinancialReconciliation[] }>(`/reconciliation${q}`);
  },

  // Warehouse layout
  getWarehouseLayout: (accountId?: string) => request<{
    warehouses: Array<{ id: string; name: string; code: string; address: string; isActive: boolean; totalCapacity: number; occupiedQty: number; zones: Array<{ name: string; aisles: string; type: string; capacity: number; locationCount: number }> }>;
    locations: Array<{ id: string; warehouseId: string; warehouseName: string; zone: string; aisle: string; shelf: string; bin: string; locationCode: string; locationType: string; capacityUnits: number; currentQty: number; occupiedQty: number; skuCount: number; isActive: boolean }>;
  }>(`/warehouses${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  createWarehouse: (payload: { name: string; code: string; address?: string }, accountId?: string) =>
    request<{ warehouse: unknown }>(`/warehouses${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, { method: 'POST', body: JSON.stringify(payload) }),
  createWarehouseLocation: (warehouseId: string, payload: { locationCode: string; locationType: string; zone?: string; aisle?: string; shelf?: string; bin?: string; capacityUnits?: number }, accountId?: string) =>
    request<{ location: unknown }>(`/warehouses/${warehouseId}/locations${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, { method: 'POST', body: JSON.stringify(payload) }),

  // Phase 3: Warehouse Services
  getWarehouseServicesSummary: (accountId?: string) => request<any>(`/warehouse-services/summary${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  getPackagingJobs: (accountId?: string) => request<{ packagingJobs: WarehousePackagingJob[] }>(`/warehouse-services/packaging${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  createPackagingJob: (payload: Partial<WarehousePackagingJob>, accountId?: string) =>
    request<{ job: WarehousePackagingJob }>(`/warehouse-services/packaging${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getShippingJobs: (accountId?: string) => request<{ shippingJobs: WarehouseShippingJob[] }>(`/warehouse-services/shipping${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  createShippingJob: (payload: Partial<WarehouseShippingJob>, accountId?: string) =>
    request<{ job: WarehouseShippingJob }>(`/warehouse-services/shipping${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 1: Dropshipping Calculator
  getDropshippingCalculations: (accountId?: string) =>
    request<{ calculations: DropshippingCalculation[] }>(`/dropshipping/calculations${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`),
  saveDropshippingCalculation: (payload: Partial<DropshippingCalculation>, accountId?: string) =>
    request<{ calculation: DropshippingCalculation }>(`/dropshipping/calculations${accountId && accountId !== 'ALL' ? `?accountId=${encodeURIComponent(accountId)}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // System
  getAuditLogs: () => request<{ logs: AuditLogEntry[] }>('/audit-logs'),
  getNotifications: () => request<{ notifications: NotificationItem[] }>('/notifications'),
  dismissNotification: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/dismiss`, { method: 'POST' }),
  getConfig: () => request<{ config: SystemConfig }>('/system/config'),
  updateConfig: (config: Partial<SystemConfig>) =>
    request<{ config: SystemConfig }>('/system/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
  resetDemo: () => request<{ success: boolean; message: string }>('/system/reset-demo', { method: 'POST' }),
  getHealth: () => request<{ success: boolean; message: string; platform: string }>('/health'),
  inviteEmployee: (payload: { email: string; fullName: string; roleId: string }) =>
    request<{ success: boolean; invitationId: string; email: string; message: string }>('/access/invitations', {
      method: 'POST', body: JSON.stringify(payload),
    }),
};

