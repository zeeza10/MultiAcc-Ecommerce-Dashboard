import {
  User,
  UserRole,
  MarketplaceAccount,
  Product,
  Order,
  OrderStatus,
  StockState,
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
} from '../server/types';

export type {
  User,
  UserRole,
  MarketplaceAccount,
  Product,
  Order,
  OrderStatus,
  StockState,
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
};

export type NavItem =
  | 'dashboard'
  | 'orders'
  | 'ebay-accounts'
  | 'customers'
  | 'returns'
  | 'products'
  | 'inventory'
  | 'adjustments'
  | 'dropshipping'
  | 'warehouse'
  | 'locations'
  | 'warehouse-services'
  | 'suppliers'
  | 'purchase-orders'
  | '3pl-clients'
  | 'fulfilment'
  | 'shipping'
  | 'storage'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'payouts'
  | 'reconciliation'
  | 'profitability'
  | 'reports'
  | 'notifications'
  | 'audit-log'
  | 'settings';
