/**
 * Data Model Types for NexusOps Integrated Platform
 * Compliant with SRS v0.1 Sections 4, 7, 8, 10, 12, 15, 16
 */

export type UserRole =
  | 'SUPER_ADMIN'
  | 'OPS_MANAGER'
  | 'WAREHOUSE_STAFF'
  | 'FINANCE_USER'
  | 'CLIENT_USER'
  | 'VIEWER';

export type OwnerType = 'OPERATOR' | 'CLIENT';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clientId?: string; // If role is CLIENT_USER
  isActive: boolean;
  twoFactorEnabled: boolean;
  failedLoginAttempts: number;
  lockedUntil?: string;
  createdAt: string;
}

export interface MarketplaceAccount {
  id: string;
  name: string;
  marketplace: 'EBAY_UK' | 'EBAY_US' | 'EBAY_DE';
  sellerUsername: string;
  authStatus: 'CONNECTED' | 'EXPIRED' | 'DISCONNECTED' | 'ERROR';
  environment: 'SANDBOX' | 'PRODUCTION';
  lastSyncAt?: string;
  lastSyncStatus: 'SUCCESS' | 'ERROR' | 'PARTIAL';
  lastSyncMessage?: string;
  tokenExpiresAt?: string;
  autoSyncIntervalMinutes: number;
  isDemo: boolean;
}

export interface SyncRun {
  id: string;
  accountId: string;
  startedAt: string;
  completedAt?: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  ordersFetched: number;
  ordersImported: number;
  ordersSkippedDuplicate: number;
  exceptionsRaised: number;
  logMessage?: string;
}

export interface ExceptionItem {
  id: string;
  type: 'UNMAPPED_SKU' | 'UNKNOWN_ORDER_STATUS' | 'SYNC_FAILURE' | 'RATE_LIMIT';
  source: 'EBAY' | 'SYSTEM' | 'ORDER';
  referenceId: string; // e.g. eBay order ID or external SKU
  details: string;
  rawPayloadSnippet?: string;
  status: 'PENDING' | 'RESOLVED' | 'IGNORED';
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  barcode?: string;
  dimensions?: { lengthCm: number; widthCm: number; heightCm: number };
  weightKg?: number;
  ownerType: OwnerType;
  ownerId: string; // Operator ID or 3PL Client ID
  status: 'ACTIVE' | 'DISCONTINUED' | 'DRAFT';
  costPriceMinor: number; // in cents/pence
  sellingPriceMinor: number;
  lowStockThreshold: number;
  reorderLevel: number;
  category: string;
  createdAt: string;
  updatedAt: string;
}

export interface MarketplaceSkuMap {
  id: string;
  productId: string;
  marketplaceAccountId: string;
  externalSku: string;
  externalListingId: string;
  listingTitle: string;
  createdAt: string;
}

export type OrderStatus =
  | 'New'
  | 'Confirmed'
  | 'Allocated'
  | 'Picked'
  | 'Packed'
  | 'Shipped'
  | 'Delivered'
  | 'Cancelled'
  | 'Returned';

export interface OrderLine {
  id: string;
  orderId: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
  taxAmountMinor: number;
  totalPriceMinor: number;
  isBackordered: boolean;
  reservedQuantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  marketplaceAccountId?: string;
  externalOrderId?: string;
  salesSource: 'EBAY' | 'MANUAL' | 'DIRECT';
  ownerType: OwnerType;
  ownerId: string;
  customerName: string;
  customerEmail: string;
  shippingAddress: {
    name: string;
    street: string;
    city: string;
    county?: string;
    postalCode: string;
    country: string;
  };
  status: OrderStatus;
  paymentState: 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED';
  totalMinor: number;
  taxMinor: number;
  shippingChargeMinor: number;
  currency: string;
  lines: OrderLine[];
  carrier?: string;
  trackingNumber?: string;
  shippingCostMinor?: number;
  rawPayload?: Record<string, any>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  changedBy: string;
  note?: string;
  timestamp: string;
}

export type StockState =
  | 'ON_HAND'
  | 'RESERVED'
  | 'AVAILABLE'
  | 'INCOMING'
  | 'DAMAGED'
  | 'QUARANTINED'
  | 'MISSING';

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string;
  isActive: boolean;
}

export interface Location {
  id: string;
  warehouseId: string;
  zone: string;
  aisle: string;
  shelf: string;
  bin: string;
  type: 'PALLET' | 'SHELF' | 'BIN' | 'BULK';
  capacityUnits: number;
  isActive: boolean;
}

export interface StockLedgerEntry {
  id: string;
  skuId: string;
  sku: string;
  productName: string;
  locationId: string;
  locationCode: string;
  ownerType: OwnerType;
  ownerId: string;
  qtyDelta: number; // signed integer (+ or -)
  state: StockState;
  sourceType: 'ORDER_RESERVE' | 'ORDER_DISPATCH' | 'ORDER_CANCEL' | 'PO_RECEIPT' | 'ADJUSTMENT' | 'RETURN_RESTOCK' | 'RETURN_DISPOSITION' | 'CYCLE_COUNT' | 'TRANSFER';
  sourceId: string;
  unitCostMinor?: number;
  note?: string;
  createdBy: string;
  createdAt: string;
}

export interface StockBalance {
  productId: string;
  sku: string;
  ownerId: string;
  onHand: number;
  reserved: number;
  available: number; // onHand - reserved
  incoming: number;
  damaged: number;
  quarantined: number;
  missing: number;
  totalStock: number; // onHand + damaged + quarantined
  weightedAverageCostMinor: number;
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  productId: string;
  sku: string;
  locationId: string;
  quantityDelta: number;
  targetState: StockState;
  reasonCode: 'damage' | 'loss' | 'found' | 'count_correction' | 'quarantine' | 'write_off';
  note: string;
  requestedBy: string;
  requiresApproval: boolean;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  approvedBy?: string;
  approvalNote?: string;
  evaluatedValueMinor: number;
  createdAt: string;
  updatedAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactName: string;
  email: string;
  phone: string;
  paymentTermsDays: number;
  currency: string;
  leadTimeDays: number;
  isActive: boolean;
}

export interface PurchaseOrderLine {
  id: string;
  poId: string;
  productId: string;
  sku: string;
  productName: string;
  orderedQty: number;
  receivedQty: number;
  unitCostMinor: number;
  totalCostMinor: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: 'DRAFT' | 'APPROVED' | 'SENT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
  lines: PurchaseOrderLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: string;
  notes?: string;
  expectedDate?: string;
  createdAt: string;
  approvedBy?: string;
  updatedAt: string;
}

export interface GoodsReceipt {
  id: string;
  receiptNumber: string;
  poId: string;
  poNumber: string;
  receivedBy: string;
  receivedAt: string;
  lines: {
    productId: string;
    sku: string;
    receivedQty: number;
    shortageQty: number;
    damagedQty: number;
    locationId: string;
  }[];
  discrepancyNote?: string;
}

export interface ReturnOrder {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  reasonCode: 'DAMAGED_TRANSIT' | 'WRONG_ITEM' | 'DEFECTIVE' | 'CHANGED_MIND' | 'NOT_AS_DESCRIBED';
  status: 'OPEN' | 'RECEIVED' | 'INSPECTED' | 'CLOSED';
  lines: {
    id: string;
    productId: string;
    sku: string;
    quantity: number;
    disposition?: 'RESTOCK' | 'DAMAGED' | 'QUARANTINE' | 'DISPOSE';
    notes?: string;
  }[];
  refundAmountMinor?: number;
  refundStatus?: 'PENDING' | 'ISSUED';
  createdAt: string;
  inspectedAt?: string;
}

export interface Client3PL {
  id: string;
  companyName: string;
  code: string;
  contactEmail: string;
  contactPhone: string;
  billingAddress: string;
  billingPeriod: 'WEEKLY' | 'MONTHLY';
  rateCardId: string;
  accountStatus: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

export interface RateCard {
  id: string;
  name: string;
  pickFeeMinor: number;
  packFeeMinor: number;
  extraItemFeeMinor: number;
  storagePalletPerMonthMinor: number;
  storageShelfPerMonthMinor: number;
  storageBinPerMonthMinor: number;
  minimumMonthlyChargeMinor: number;
}

export interface StorageSnapshot {
  id: string;
  clientId: string;
  clientName: string;
  snapshotDate: string;
  occupiedPallets: number;
  occupiedShelves: number;
  occupiedBins: number;
  estimatedCostMinor: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: '3PL_SERVICE' | 'STORAGE' | 'SUPPLIER' | 'DIRECT_SALE';
  recipientType: 'CLIENT' | 'SUPPLIER' | 'CUSTOMER';
  recipientId: string;
  recipientName: string;
  issueDate: string;
  dueDate: string;
  subtotalMinor: number;
  vatRatePercent: number;
  vatAmountMinor: number;
  totalMinor: number;
  paidAmountMinor: number;
  status: 'DRAFT' | 'ISSUED' | 'PART_PAID' | 'PAID' | 'OVERDUE' | 'VOID';
  lines: {
    description: string;
    quantity: number;
    unitPriceMinor: number;
    totalMinor: number;
  }[];
  voidReason?: string;
  isImmutable: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  amountMinor: number;
  paymentMethod: 'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER';
  paymentDate: string;
  reference: string;
  payerName: string;
  allocations: {
    invoiceId: string;
    invoiceNumber: string;
    amountMinor: number;
  }[];
  unallocatedCreditMinor: number;
  recordedBy: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  expenseNumber: string;
  category: 'PACKAGING' | 'SHIPPING_CARRIER' | 'WAREHOUSE_RENT' | 'SOFTWARE_FEES' | 'EQUIPMENT' | 'UTILITIES' | 'OTHER';
  supplierName: string;
  date: string;
  amountMinor: number;
  vatMinor: number;
  allocatedTo?: 'ORDERS' | 'SKUS' | 'CLIENTS' | 'GENERAL';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'PAID';
  approvedBy?: string;
  note?: string;
}

export interface FinancialLedgerEntry {
  id: string;
  accountId: string; // e.g. 1000 Cash, 1200 AR, 2000 AP, 4000 Sales, 5000 COGS
  accountName: string;
  debitMinor: number;
  creditMinor: number;
  sourceType: 'INVOICE' | 'PAYMENT' | 'EXPENSE' | 'RECEIPT' | 'SHIPMENT' | 'REFUND';
  sourceId: string;
  note?: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'VOID' | 'EXPORT' | 'SYNC';
  entity: string;
  entityId: string;
  beforeSnapshot?: Record<string, any>;
  afterSnapshot?: Record<string, any>;
  notes?: string;
  timestamp: string;
}

export interface NotificationItem {
  id: string;
  type:
    | 'LOW_STOCK'
    | 'OUT_OF_STOCK'
    | 'EBAY_SYNC_FAILURE'
    | 'UNMAPPED_SKU'
    | 'PENDING_ORDER_TOO_LONG'
    | 'ADJUSTMENT_AWAITING_APPROVAL'
    | 'OVERDUE_INVOICE'
    | 'LEDGER_RECONCILIATION_DIFFERENCE'
    | 'RETURN_AWAITING_INSPECTION';
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  referenceUrl?: string;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

export interface SystemConfig {
  baseCurrency: string;
  businessTimezone: string;
  defaultVatRatePercent: number;
  adjustmentApprovalThresholdValueMinor: number;
  adjustmentApprovalThresholdQuantity: number;
  activeReleasePhase: 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'ALL';
  allowNegativeStock: boolean;
  autoSyncEnabled: boolean;
}
