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
  | 'warehouse'
  | 'locations'
  | 'suppliers'
  | 'purchase-orders'
  | '3pl-clients'
  | 'fulfilment'
  | 'shipping'
  | 'storage'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'profitability'
  | 'reports'
  | 'notifications'
  | 'audit-log'
  | 'settings';
