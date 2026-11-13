import {
  User,
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


import { getAccessToken } from './supabaseAuth';

// Detect if running on a static hosting provider (e.g. Cloudflare Pages, GitHub Pages)
const isKnownStaticHost = (): boolean => {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host.includes('.pages.dev') ||
    host.includes('.github.io') ||
    host.includes('.netlify.app') ||
    host.includes('.vercel.app') ||
    host.includes('cloudflare') ||
    (!host.includes('localhost') && !host.includes('127.0.0.1') && !window.location.port)
  );
};

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new Error('Authentication required. Please sign in again.');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`/api/v1${endpoint}`, { ...options, headers });
  } catch {
    throw new Error('The application API is unavailable. No demo or local-storage fallback was used.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : null;

  if (!response.ok) {
    const message = payload && typeof payload.error === 'string'
      ? payload.error
      : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  if (!contentType.includes('application/json')) {
    throw new Error('The API returned an unexpected response format.');
  }
  return payload as T;
}

export const api = {
  // Auth

  // Dashboard
  getKPIs: (period = '30D', accountId?: string) => {
    let url = `/dashboard/kpis?period=${encodeURIComponent(period)}`;
    if (accountId && accountId !== 'ALL') url += `&accountId=${encodeURIComponent(accountId)}`;
    return request<{ kpis: any; userRole: string }>(url);
  },
  getCharts: () => request<any>('/dashboard/charts'),

  // Orders
  getOrders: (params: { status?: string; accountId?: string; search?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.status && params.status !== 'ALL') q.set('status', params.status);
    if (params.accountId && params.accountId !== 'ALL') q.set('accountId', params.accountId);
    if (params.search) q.set('search', params.search);
    return request<{ orders: Order[] }>(`/orders?${q.toString()}`);
  },
  getOrder: (id: string) => request<{ order: Order; histories: any[] }>(`/orders/${id}`),
  createOrder: (payload: any) =>
    request<{ order: Order }>('/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  transitionOrder: (id: string, targetStatus: string, options: { carrier?: string; trackingNumber?: string; note?: string } = {}) =>
    request<{ order: Order }>(`/orders/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ targetStatus, ...options }),
    }),

  // Products
  getProducts: () => request<{ products: (Product & { stockOnHand: number; stockReserved: number; stockAvailable: number; stockIncoming: number; stockDamaged: number })[] }>('/products'),
  createProduct: (payload: any) =>
    request<{ product: Product }>('/products', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Inventory & Ledger
  getBalances: () => request<{ balances: StockBalance[] }>('/inventory/balances'),
  getStockLedger: () => request<{ ledger: StockLedgerEntry[] }>('/inventory/ledger'),

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
  getEbayAccounts: () => request<{ accounts: MarketplaceAccount[]; recentSyncs: any[] }>('/ebay/accounts'),
  syncEbayAccount: (id: string) =>
    request<{ imported: number; skipped: number; exceptions: number }>(`/ebay/accounts/${id}/sync`, { method: 'POST' }),
  connectEbayAccount: (id: string) =>
    request<{ success: boolean; message: string }>(`/ebay/accounts/${id}/connect`, { method: 'POST' }),
  getExceptions: () => request<{ exceptions: ExceptionItem[] }>('/ebay/exceptions'),
  resolveException: (id: string, targetProductId: string, resolutionNote?: string) =>
    request<{ success: boolean; exception: ExceptionItem }>(`/ebay/exceptions/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ targetProductId, resolutionNote }),
    }),

  // Phase 2: Purchasing & Returns
  getSuppliers: () => request<{ suppliers: Supplier[] }>('/suppliers'),
  getPurchaseOrders: () => request<{ purchaseOrders: PurchaseOrder[]; receipts: any[] }>('/purchase-orders'),
  receivePO: (id: string, items: any[], discrepancyNote?: string) =>
    request<{ success: boolean; receipt: any; purchaseOrder: PurchaseOrder }>(`/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: JSON.stringify({ items, discrepancyNote }),
    }),
  getReturns: () => request<{ returns: ReturnOrder[] }>('/returns'),
  processReturnDisposition: (id: string, dispositions: any[], issueRefund = false) =>
    request<{ success: boolean; return: ReturnOrder }>(`/returns/${id}/disposition`, {
      method: 'POST',
      body: JSON.stringify({ dispositions, issueRefund }),
    }),

  // Phase 3: 3PL
  get3PLClients: () => request<{ clients: Client3PL[]; rateCards: RateCard[] }>('/3pl/clients'),
  getStorageSnapshots: () => request<{ snapshots: any[] }>('/3pl/storage-snapshots'),
  getBillingPreview: (clientId: string) =>
    request<any>('/3pl/billing-preview', {
      method: 'POST',
      body: JSON.stringify({ clientId }),
    }),

  // Phase 4: Finance
  getInvoices: () => request<{ invoices: Invoice[] }>('/finance/invoices'),
  voidInvoice: (id: string, reason: string) =>
    request<{ success: boolean; invoice: Invoice }>(`/finance/invoices/${id}/void`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  getPayments: () => request<{ payments: Payment[] }>('/finance/payments'),
  recordPayment: (payload: any) =>
    request<{ payment: Payment }>('/finance/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getExpenses: () => request<{ expenses: Expense[] }>('/finance/expenses'),
  getFinancialLedger: () => request<{ ledger: FinancialLedgerEntry[] }>('/finance/ledger'),

  // Reports
  getReport: (id: string, params: { startDate?: string; endDate?: string; accountId?: string; sku?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.startDate) q.set('startDate', params.startDate);
    if (params.endDate) q.set('endDate', params.endDate);
    if (params.accountId) q.set('accountId', params.accountId);
    if (params.sku) q.set('sku', params.sku);
    return request<any>(`/reports/${id}?${q.toString()}`);
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

  // Phase 3: Warehouse Services
  getWarehouseServicesSummary: () => request<any>('/warehouse-services/summary'),
  getPackagingJobs: () => request<{ packagingJobs: WarehousePackagingJob[] }>('/warehouse-services/packaging'),
  createPackagingJob: (payload: Partial<WarehousePackagingJob>) =>
    request<{ job: WarehousePackagingJob }>('/warehouse-services/packaging', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getShippingJobs: () => request<{ shippingJobs: WarehouseShippingJob[] }>('/warehouse-services/shipping'),
  createShippingJob: (payload: Partial<WarehouseShippingJob>) =>
    request<{ job: WarehouseShippingJob }>('/warehouse-services/shipping', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Phase 1: Dropshipping Calculator
  getDropshippingCalculations: () =>
    request<{ calculations: DropshippingCalculation[] }>('/dropshipping/calculations'),
  saveDropshippingCalculation: (payload: Partial<DropshippingCalculation>) =>
    request<{ calculation: DropshippingCalculation }>('/dropshipping/calculations', {
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
};

