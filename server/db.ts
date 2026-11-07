import fs from 'fs';
import path from 'path';
import {
  User,
  MarketplaceAccount,
  SyncRun,
  ExceptionItem,
  Product,
  MarketplaceSkuMap,
  Order,
  OrderStatusHistory,
  Warehouse,
  Location,
  StockLedgerEntry,
  StockBalance,
  StockAdjustment,
  Supplier,
  PurchaseOrder,
  GoodsReceipt,
  ReturnOrder,
  Client3PL,
  RateCard,
  StorageSnapshot,
  Invoice,
  Payment,
  Expense,
  FinancialLedgerEntry,
  AuditLogEntry,
  NotificationItem,
  SystemConfig,
} from './types';

export interface DatabaseSchema {
  users: User[];
  marketplaceAccounts: MarketplaceAccount[];
  syncRuns: SyncRun[];
  exceptions: ExceptionItem[];
  products: Product[];
  skuMappings: MarketplaceSkuMap[];
  orders: Order[];
  orderHistories: OrderStatusHistory[];
  warehouses: Warehouse[];
  locations: Location[];
  stockLedger: StockLedgerEntry[];
  stockAdjustments: StockAdjustment[];
  suppliers: Supplier[];
  purchaseOrders: PurchaseOrder[];
  goodsReceipts: GoodsReceipt[];
  returns: ReturnOrder[];
  clients: Client3PL[];
  rateCards: RateCard[];
  storageSnapshots: StorageSnapshot[];
  invoices: Invoice[];
  payments: Payment[];
  expenses: Expense[];
  financialLedger: FinancialLedgerEntry[];
  auditLogs: AuditLogEntry[];
  notifications: NotificationItem[];
  config: SystemConfig;
}

const DB_FILE_PATH = path.resolve(process.cwd(), 'data', 'database.json');

class DatabaseService {
  private data!: DatabaseSchema;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const dir = path.dirname(DB_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
        this.data = JSON.parse(raw);
      } else {
        this.seedInitialData();
        this.save();
      }
    } catch (err) {
      console.warn('Failed to load database from file, re-initializing with seed data:', err);
      this.seedInitialData();
      this.save();
    }
  }

  public save() {
    try {
      const dir = path.dirname(DB_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error persisting database to disk:', err);
    }
  }

  public getRawData(): DatabaseSchema {
    return this.data;
  }

  public reload() {
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        this.data = JSON.parse(fs.readFileSync(DB_FILE_PATH, 'utf-8'));
      }
    } catch (err) {
      console.error('Failed to reload database:', err);
    }
  }

  public resetToSeed() {
    this.seedInitialData();
    this.save();
  }

  private seedInitialData() {
    const now = new Date().toISOString();
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();

    const config: SystemConfig = {
      baseCurrency: 'GBP',
      businessTimezone: 'Europe/London',
      defaultVatRatePercent: 20,
      adjustmentApprovalThresholdValueMinor: 25000, // £250.00
      adjustmentApprovalThresholdQuantity: 10,
      activeReleasePhase: 'ALL',
      allowNegativeStock: false,
      autoSyncEnabled: true,
    };

    const users: User[] = [
      {
        id: 'usr_superadmin',
        email: 'sarah.jenkins@nexusops.com',
        name: 'Sarah Jenkins (Super Admin)',
        role: 'SUPER_ADMIN',
        isActive: true,
        twoFactorEnabled: true,
        failedLoginAttempts: 0,
        createdAt: twoDaysAgo,
      },
      {
        id: 'usr_opsmanager',
        email: 'marcus.reid@nexusops.com',
        name: 'Marcus Reid (Operations Manager)',
        role: 'OPS_MANAGER',
        isActive: true,
        twoFactorEnabled: true,
        failedLoginAttempts: 0,
        createdAt: twoDaysAgo,
      },
      {
        id: 'usr_warehouse',
        email: 'jack.miller@nexusops.com',
        name: 'Jack Miller (Warehouse Staff)',
        role: 'WAREHOUSE_STAFF',
        isActive: true,
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
        createdAt: twoDaysAgo,
      },
      {
        id: 'usr_finance',
        email: 'elena.rostova@nexusops.com',
        name: 'Elena Rostova (Finance Controller)',
        role: 'FINANCE_USER',
        isActive: true,
        twoFactorEnabled: true,
        failedLoginAttempts: 0,
        createdAt: twoDaysAgo,
      },
      {
        id: 'usr_client_apex',
        email: 'david.chen@apex-electronics.com',
        name: 'David Chen (3PL Client - Apex)',
        role: 'CLIENT_USER',
        clientId: 'client_apex',
        isActive: true,
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
        createdAt: twoDaysAgo,
      },
      {
        id: 'usr_viewer',
        email: 'arthur.p@auditors.co.uk',
        name: 'Arthur Pendelton (Viewer / Auditor)',
        role: 'VIEWER',
        isActive: true,
        twoFactorEnabled: false,
        failedLoginAttempts: 0,
        createdAt: twoDaysAgo,
      },
    ];

    const marketplaceAccounts: MarketplaceAccount[] = [
      {
        id: 'mkt_ebay_uk',
        name: 'Nexus Tech Direct (UK)',
        marketplace: 'EBAY_UK',
        sellerUsername: 'nexus_direct_uk',
        authStatus: 'CONNECTED',
        environment: 'PRODUCTION',
        lastSyncAt: new Date(Date.now() - 600000).toISOString(),
        lastSyncStatus: 'SUCCESS',
        lastSyncMessage: 'Poll complete: 14 orders inspected, 2 new imported.',
        tokenExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
        autoSyncIntervalMinutes: 15,
        isDemo: true,
      },
      {
        id: 'mkt_ebay_us',
        name: 'Nexus Global Outlet (US)',
        marketplace: 'EBAY_US',
        sellerUsername: 'nexus_outlet_us',
        authStatus: 'CONNECTED',
        environment: 'PRODUCTION',
        lastSyncAt: new Date(Date.now() - 1800000).toISOString(),
        lastSyncStatus: 'SUCCESS',
        lastSyncMessage: 'Poll complete: 6 orders checked, 1 new imported.',
        tokenExpiresAt: new Date(Date.now() + 86400000 * 25).toISOString(),
        autoSyncIntervalMinutes: 30,
        isDemo: true,
      },
    ];

    const syncRuns: SyncRun[] = [
      {
        id: 'sync_001',
        accountId: 'mkt_ebay_uk',
        startedAt: new Date(Date.now() - 610000).toISOString(),
        completedAt: new Date(Date.now() - 600000).toISOString(),
        status: 'COMPLETED',
        ordersFetched: 14,
        ordersImported: 2,
        ordersSkippedDuplicate: 12,
        exceptionsRaised: 0,
        logMessage: 'Incremental sync succeeded with high-water mark.',
      },
      {
        id: 'sync_002',
        accountId: 'mkt_ebay_us',
        startedAt: new Date(Date.now() - 1810000).toISOString(),
        completedAt: new Date(Date.now() - 1800000).toISOString(),
        status: 'COMPLETED',
        ordersFetched: 6,
        ordersImported: 1,
        ordersSkippedDuplicate: 5,
        exceptionsRaised: 1,
        logMessage: 'Order imported with unmapped line item routed to exception queue.',
      },
    ];

    const exceptions: ExceptionItem[] = [
      {
        id: 'exc_001',
        type: 'UNMAPPED_SKU',
        source: 'EBAY',
        referenceId: 'EBAY-US-99201',
        details: 'External listing SKU "EB-WIRE-EXT-RED" does not map to any active internal catalog product.',
        rawPayloadSnippet: '{"externalSku": "EB-WIRE-EXT-RED", "orderId": "19-10822-44120", "title": "Heavy Duty Extension Cable 5M - Red"}',
        status: 'PENDING',
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
    ];

    const warehouses: Warehouse[] = [
      {
        id: 'wh_main',
        name: 'Nexus Central Fulfillment Hub',
        code: 'WH-01',
        address: 'Unit 4, Gateway Logistics Park, Milton Keynes, MK17 8EB, UK',
        isActive: true,
      },
    ];

    const locations: Location[] = [
      {
        id: 'loc_def',
        warehouseId: 'wh_main',
        zone: 'Zone A',
        aisle: 'A1',
        shelf: 'S01',
        bin: 'B01',
        type: 'SHELF',
        capacityUnits: 500,
        isActive: true,
      },
      {
        id: 'loc_bulk_01',
        warehouseId: 'wh_main',
        zone: 'Zone B',
        aisle: 'B2',
        shelf: 'S03',
        bin: 'P01',
        type: 'PALLET',
        capacityUnits: 2000,
        isActive: true,
      },
      {
        id: 'loc_damaged',
        warehouseId: 'wh_main',
        zone: 'Quarantine',
        aisle: 'Q1',
        shelf: 'S01',
        bin: 'Q-DMG',
        type: 'BIN',
        capacityUnits: 150,
        isActive: true,
      },
    ];

    const clients: Client3PL[] = [
      {
        id: 'client_apex',
        companyName: 'Apex Electronics Ltd',
        code: 'APEX',
        contactEmail: 'logistics@apex-electronics.com',
        contactPhone: '+44 20 7946 0912',
        billingAddress: '42 High Holborn, London, WC1V 6EA',
        billingPeriod: 'MONTHLY',
        rateCardId: 'rc_std_3pl',
        accountStatus: 'ACTIVE',
        createdAt: twoDaysAgo,
      },
      {
        id: 'client_nordic',
        companyName: 'Nordic Goods Trading',
        code: 'NORD',
        contactEmail: 'contact@nordicgoods.co.uk',
        contactPhone: '+44 161 496 0188',
        billingAddress: '15 Oxford Road, Manchester, M1 5AN',
        billingPeriod: 'MONTHLY',
        rateCardId: 'rc_std_3pl',
        accountStatus: 'ACTIVE',
        createdAt: twoDaysAgo,
      },
    ];

    const rateCards: RateCard[] = [
      {
        id: 'rc_std_3pl',
        name: 'Standard 3PL Commercial Rate Card v2026',
        pickFeeMinor: 150, // £1.50 per pick
        packFeeMinor: 100, // £1.00 per pack
        extraItemFeeMinor: 40, // £0.40 per extra line item
        storagePalletPerMonthMinor: 1800, // £18.00 per pallet
        storageShelfPerMonthMinor: 600, // £6.00 per shelf
        storageBinPerMonthMinor: 250, // £2.50 per bin
        minimumMonthlyChargeMinor: 15000, // £150.00 min charge
      },
    ];

    const products: Product[] = [
      {
        id: 'prd_001',
        sku: 'NX-AUD-001',
        name: 'Nexus Pro Active Noise-Cancelling Headphones',
        barcode: '5060001001018',
        dimensions: { lengthCm: 22, widthCm: 18, heightCm: 8 },
        weightKg: 0.35,
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        status: 'ACTIVE',
        costPriceMinor: 3800, // £38.00
        sellingPriceMinor: 8999, // £89.99
        lowStockThreshold: 15,
        reorderLevel: 50,
        category: 'Audio',
        createdAt: twoDaysAgo,
        updatedAt: now,
      },
      {
        id: 'prd_002',
        sku: 'NX-CAM-002',
        name: 'Nexus 4K Ultra Wide StreamCam with Stereo Mic',
        barcode: '5060001001025',
        dimensions: { lengthCm: 12, widthCm: 6, heightCm: 5 },
        weightKg: 0.22,
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        status: 'ACTIVE',
        costPriceMinor: 2400, // £24.00
        sellingPriceMinor: 5999, // £59.99
        lowStockThreshold: 20,
        reorderLevel: 60,
        category: 'Video',
        createdAt: twoDaysAgo,
        updatedAt: now,
      },
      {
        id: 'prd_003',
        sku: 'NX-MOU-003',
        name: 'Nexus Precision Ergonomic Bluetooth Mouse',
        barcode: '5060001001032',
        dimensions: { lengthCm: 14, widthCm: 9, heightCm: 6 },
        weightKg: 0.15,
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        status: 'ACTIVE',
        costPriceMinor: 1250, // £12.50
        sellingPriceMinor: 3499, // £34.99
        lowStockThreshold: 10,
        reorderLevel: 40,
        category: 'Peripherals',
        createdAt: twoDaysAgo,
        updatedAt: now,
      },
      {
        id: 'prd_004',
        sku: 'NX-KEY-004',
        name: 'Nexus RGB Mechanical Gaming Keyboard - Brown Switches',
        barcode: '5060001001049',
        dimensions: { lengthCm: 45, widthCm: 16, heightCm: 4 },
        weightKg: 0.95,
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        status: 'ACTIVE',
        costPriceMinor: 3100, // £31.00
        sellingPriceMinor: 7499, // £74.99
        lowStockThreshold: 12,
        reorderLevel: 35,
        category: 'Peripherals',
        createdAt: twoDaysAgo,
        updatedAt: now,
      },
      {
        id: 'prd_005',
        sku: 'NX-HUB-005',
        name: 'Nexus 8-in-1 Aluminum USB-C Hub 100W PD',
        barcode: '5060001001056',
        dimensions: { lengthCm: 15, widthCm: 5, heightCm: 2 },
        weightKg: 0.12,
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        status: 'ACTIVE',
        costPriceMinor: 1100, // £11.00
        sellingPriceMinor: 2999, // £29.99
        lowStockThreshold: 25,
        reorderLevel: 75,
        category: 'Accessories',
        createdAt: twoDaysAgo,
        updatedAt: now,
      },
      // 3PL client product
      {
        id: 'prd_apex_01',
        sku: 'APX-SPK-100',
        name: 'Apex SoundPulse Rugged Waterproof Speaker',
        barcode: '5060002002011',
        dimensions: { lengthCm: 18, widthCm: 8, heightCm: 8 },
        weightKg: 0.48,
        ownerType: 'CLIENT',
        ownerId: 'client_apex',
        status: 'ACTIVE',
        costPriceMinor: 1950, // client confidential
        sellingPriceMinor: 4999,
        lowStockThreshold: 20,
        reorderLevel: 50,
        category: 'Audio',
        createdAt: twoDaysAgo,
        updatedAt: now,
      },
    ];

    const skuMappings: MarketplaceSkuMap[] = [
      {
        id: 'map_001',
        productId: 'prd_001',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalSku: 'EBAY-UK-NXAUD001',
        externalListingId: '265892100411',
        listingTitle: 'Nexus Pro Wireless ANC Headphones - Black',
        createdAt: twoDaysAgo,
      },
      {
        id: 'map_002',
        productId: 'prd_002',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalSku: 'EBAY-UK-NXCAM002',
        externalListingId: '265892100412',
        listingTitle: 'Nexus 4K Ultra Wide Streaming Webcam HD',
        createdAt: twoDaysAgo,
      },
      {
        id: 'map_003',
        productId: 'prd_003',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalSku: 'EBAY-UK-NXMOU003',
        externalListingId: '265892100413',
        listingTitle: 'Ergonomic Wireless Bluetooth Optical Mouse',
        createdAt: twoDaysAgo,
      },
      {
        id: 'map_004',
        productId: 'prd_004',
        marketplaceAccountId: 'mkt_ebay_us',
        externalSku: 'EBAY-US-NXKEY004',
        externalListingId: '384910293811',
        listingTitle: 'Nexus Mechanical RGB Keyboard Tactile Brown',
        createdAt: twoDaysAgo,
      },
      {
        id: 'map_005',
        productId: 'prd_005',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalSku: 'EBAY-UK-NXHUB005',
        externalListingId: '265892100415',
        listingTitle: 'USB C Hub Multiport Adapter 8 in 1 Aluminum',
        createdAt: twoDaysAgo,
      },
    ];

    const stockLedger: StockLedgerEntry[] = [
      // Initial opening balances (SRS Checklist data item 3)
      {
        id: 'stk_001',
        skuId: 'prd_001',
        sku: 'NX-AUD-001',
        productName: 'Nexus Pro Active Noise-Cancelling Headphones',
        locationId: 'loc_def',
        locationCode: 'Zone A / A1 / S01 / B01',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        qtyDelta: 65,
        state: 'ON_HAND',
        sourceType: 'PO_RECEIPT',
        sourceId: 'rcpt_init_001',
        unitCostMinor: 3800,
        note: 'Opening stock count verified',
        createdBy: 'sarah.jenkins@nexusops.com',
        createdAt: twoDaysAgo,
      },
      {
        id: 'stk_002',
        skuId: 'prd_002',
        sku: 'NX-CAM-002',
        productName: 'Nexus 4K Ultra Wide StreamCam with Stereo Mic',
        locationId: 'loc_def',
        locationCode: 'Zone A / A1 / S01 / B01',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        qtyDelta: 18, // near low stock (threshold is 20)
        state: 'ON_HAND',
        sourceType: 'PO_RECEIPT',
        sourceId: 'rcpt_init_002',
        unitCostMinor: 2400,
        note: 'Opening stock count verified',
        createdBy: 'sarah.jenkins@nexusops.com',
        createdAt: twoDaysAgo,
      },
      {
        id: 'stk_003',
        skuId: 'prd_003',
        sku: 'NX-MOU-003',
        productName: 'Nexus Precision Ergonomic Bluetooth Mouse',
        locationId: 'loc_def',
        locationCode: 'Zone A / A1 / S01 / B01',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        qtyDelta: 85,
        state: 'ON_HAND',
        sourceType: 'PO_RECEIPT',
        sourceId: 'rcpt_init_003',
        unitCostMinor: 1250,
        note: 'Opening stock count verified',
        createdBy: 'sarah.jenkins@nexusops.com',
        createdAt: twoDaysAgo,
      },
      {
        id: 'stk_004',
        skuId: 'prd_004',
        sku: 'NX-KEY-004',
        productName: 'Nexus RGB Mechanical Gaming Keyboard - Brown Switches',
        locationId: 'loc_bulk_01',
        locationCode: 'Zone B / B2 / S03 / P01',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        qtyDelta: 9, // Below low stock threshold (12) -> triggers Alert N-01
        state: 'ON_HAND',
        sourceType: 'PO_RECEIPT',
        sourceId: 'rcpt_init_004',
        unitCostMinor: 3100,
        note: 'Opening stock count verified',
        createdBy: 'sarah.jenkins@nexusops.com',
        createdAt: twoDaysAgo,
      },
      {
        id: 'stk_005',
        skuId: 'prd_005',
        sku: 'NX-HUB-005',
        productName: 'Nexus 8-in-1 Aluminum USB-C Hub 100W PD',
        locationId: 'loc_def',
        locationCode: 'Zone A / A1 / S01 / B01',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        qtyDelta: 120,
        state: 'ON_HAND',
        sourceType: 'PO_RECEIPT',
        sourceId: 'rcpt_init_005',
        unitCostMinor: 1100,
        note: 'Opening stock count verified',
        createdBy: 'sarah.jenkins@nexusops.com',
        createdAt: twoDaysAgo,
      },
      {
        id: 'stk_006',
        skuId: 'prd_apex_01',
        sku: 'APX-SPK-100',
        productName: 'Apex SoundPulse Rugged Waterproof Speaker',
        locationId: 'loc_def',
        locationCode: 'Zone A / A1 / S01 / B01',
        ownerType: 'CLIENT',
        ownerId: 'client_apex',
        qtyDelta: 45,
        state: 'ON_HAND',
        sourceType: 'PO_RECEIPT',
        sourceId: 'rcpt_init_apex',
        unitCostMinor: 1950,
        note: 'Client inbound delivery',
        createdBy: 'jack.miller@nexusops.com',
        createdAt: twoDaysAgo,
      },
      // Damaged quarantine stock entry
      {
        id: 'stk_007',
        skuId: 'prd_001',
        sku: 'NX-AUD-001',
        productName: 'Nexus Pro Active Noise-Cancelling Headphones',
        locationId: 'loc_damaged',
        locationCode: 'Quarantine / Q1 / S01 / Q-DMG',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        qtyDelta: 2,
        state: 'DAMAGED',
        sourceType: 'RETURN_DISPOSITION',
        sourceId: 'ret_001',
        unitCostMinor: 3800,
        note: 'Customer return inspected - broken hinge',
        createdBy: 'jack.miller@nexusops.com',
        createdAt: yesterday,
      },
    ];

    const orders: Order[] = [
      {
        id: 'ord_1001',
        orderNumber: 'NX-ORD-2026-001',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalOrderId: '19-09412-88211',
        salesSource: 'EBAY',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        customerName: 'Oliver Smith',
        customerEmail: 'oliver.smith.gb@example.co.uk',
        shippingAddress: {
          name: 'Oliver Smith',
          street: '14 Kensington Church Street',
          city: 'London',
          postalCode: 'W8 4EP',
          country: 'United Kingdom',
        },
        status: 'Delivered',
        paymentState: 'PAID',
        totalMinor: 8999,
        taxMinor: 1500,
        shippingChargeMinor: 0,
        currency: 'GBP',
        carrier: 'Royal Mail',
        trackingNumber: 'GB982103841RM',
        shippingCostMinor: 450,
        rawPayload: {
          ebayOrderId: '19-09412-88211',
          buyer: { username: 'oliver_smith_22', registrationAddress: { countryCode: 'GB' } },
          pricingSummary: { priceSubtotal: { value: '89.99', currency: 'GBP' } },
        },
        lines: [
          {
            id: 'ordl_1001_1',
            orderId: 'ord_1001',
            productId: 'prd_001',
            sku: 'NX-AUD-001',
            productName: 'Nexus Pro Active Noise-Cancelling Headphones',
            quantity: 1,
            unitPriceMinor: 8999,
            taxAmountMinor: 1500,
            totalPriceMinor: 8999,
            isBackordered: false,
            reservedQuantity: 0,
          },
        ],
        createdAt: twoDaysAgo,
        updatedAt: yesterday,
      },
      {
        id: 'ord_1002',
        orderNumber: 'NX-ORD-2026-002',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalOrderId: '19-09415-33419',
        salesSource: 'EBAY',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        customerName: 'Emily Watson',
        customerEmail: 'emily.watson@example.co.uk',
        shippingAddress: {
          name: 'Emily Watson',
          street: '88 George Street',
          city: 'Edinburgh',
          postalCode: 'EH2 3BU',
          country: 'United Kingdom',
        },
        status: 'Shipped',
        paymentState: 'PAID',
        totalMinor: 9498,
        taxMinor: 1583,
        shippingChargeMinor: 0,
        currency: 'GBP',
        carrier: 'DPD UK',
        trackingNumber: 'DPD-1599-2849102',
        shippingCostMinor: 520,
        lines: [
          {
            id: 'ordl_1002_1',
            orderId: 'ord_1002',
            productId: 'prd_002',
            sku: 'NX-CAM-002',
            productName: 'Nexus 4K Ultra Wide StreamCam with Stereo Mic',
            quantity: 1,
            unitPriceMinor: 5999,
            taxAmountMinor: 1000,
            totalPriceMinor: 5999,
            isBackordered: false,
            reservedQuantity: 0,
          },
          {
            id: 'ordl_1002_2',
            orderId: 'ord_1002',
            productId: 'prd_003',
            sku: 'NX-MOU-003',
            productName: 'Nexus Precision Ergonomic Bluetooth Mouse',
            quantity: 1,
            unitPriceMinor: 3499,
            taxAmountMinor: 583,
            totalPriceMinor: 3499,
            isBackordered: false,
            reservedQuantity: 0,
          },
        ],
        createdAt: yesterday,
        updatedAt: yesterday,
      },
      {
        id: 'ord_1003',
        orderNumber: 'NX-ORD-2026-003',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalOrderId: '19-09419-77102',
        salesSource: 'EBAY',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        customerName: 'James Henderson',
        customerEmail: 'j.henderson@example.co.uk',
        shippingAddress: {
          name: 'James Henderson',
          street: '12 Deansgate Arcade',
          city: 'Manchester',
          postalCode: 'M3 2BW',
          country: 'United Kingdom',
        },
        status: 'Picked',
        paymentState: 'PAID',
        totalMinor: 5998,
        taxMinor: 1000,
        shippingChargeMinor: 0,
        currency: 'GBP',
        lines: [
          {
            id: 'ordl_1003_1',
            orderId: 'ord_1003',
            productId: 'prd_005',
            sku: 'NX-HUB-005',
            productName: 'Nexus 8-in-1 Aluminum USB-C Hub 100W PD',
            quantity: 2,
            unitPriceMinor: 2999,
            taxAmountMinor: 500,
            totalPriceMinor: 5998,
            isBackordered: false,
            reservedQuantity: 2,
          },
        ],
        createdAt: yesterday,
        updatedAt: now,
      },
      {
        id: 'ord_1004',
        orderNumber: 'NX-ORD-2026-004',
        marketplaceAccountId: 'mkt_ebay_us',
        externalOrderId: '19-10820-55019',
        salesSource: 'EBAY',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        customerName: 'Michael Chang',
        customerEmail: 'mchang@example.com',
        shippingAddress: {
          name: 'Michael Chang',
          street: '742 Evergreen Terrace',
          city: 'Springfield',
          county: 'OR',
          postalCode: '97477',
          country: 'United States',
        },
        status: 'Allocated',
        paymentState: 'PAID',
        totalMinor: 7499,
        taxMinor: 0,
        shippingChargeMinor: 999,
        currency: 'GBP',
        lines: [
          {
            id: 'ordl_1004_1',
            orderId: 'ord_1004',
            productId: 'prd_004',
            sku: 'NX-KEY-004',
            productName: 'Nexus RGB Mechanical Gaming Keyboard - Brown Switches',
            quantity: 1,
            unitPriceMinor: 7499,
            taxAmountMinor: 0,
            totalPriceMinor: 7499,
            isBackordered: false,
            reservedQuantity: 1,
          },
        ],
        createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
        updatedAt: now,
      },
      {
        id: 'ord_1005',
        orderNumber: 'NX-ORD-2026-005',
        marketplaceAccountId: 'mkt_ebay_uk',
        externalOrderId: '19-09431-10294',
        salesSource: 'EBAY',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        customerName: 'Chloe Bennett',
        customerEmail: 'chloe.b@example.co.uk',
        shippingAddress: {
          name: 'Chloe Bennett',
          street: '5 Victoria Square',
          city: 'Birmingham',
          postalCode: 'B1 1BD',
          country: 'United Kingdom',
        },
        status: 'Confirmed',
        paymentState: 'PAID',
        totalMinor: 8999,
        taxMinor: 1500,
        shippingChargeMinor: 0,
        currency: 'GBP',
        lines: [
          {
            id: 'ordl_1005_1',
            orderId: 'ord_1005',
            productId: 'prd_001',
            sku: 'NX-AUD-001',
            productName: 'Nexus Pro Active Noise-Cancelling Headphones',
            quantity: 1,
            unitPriceMinor: 8999,
            taxAmountMinor: 1500,
            totalPriceMinor: 8999,
            isBackordered: false,
            reservedQuantity: 1,
          },
        ],
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
        updatedAt: now,
      },
      {
        id: 'ord_1006',
        orderNumber: 'NX-ORD-2026-006',
        salesSource: 'MANUAL',
        ownerType: 'CLIENT',
        ownerId: 'client_apex',
        customerName: 'TechHub Retail Stores',
        customerEmail: 'purchasing@techhub.co.uk',
        shippingAddress: {
          name: 'TechHub Central Inbound',
          street: '9 Wharf Road',
          city: 'Leeds',
          postalCode: 'LS1 5QZ',
          country: 'United Kingdom',
        },
        status: 'New',
        paymentState: 'PENDING',
        totalMinor: 19996,
        taxMinor: 3332,
        shippingChargeMinor: 1200,
        currency: 'GBP',
        lines: [
          {
            id: 'ordl_1006_1',
            orderId: 'ord_1006',
            productId: 'prd_apex_01',
            sku: 'APX-SPK-100',
            productName: 'Apex SoundPulse Rugged Waterproof Speaker',
            quantity: 4,
            unitPriceMinor: 4999,
            taxAmountMinor: 833,
            totalPriceMinor: 19996,
            isBackordered: false,
            reservedQuantity: 0,
          },
        ],
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        updatedAt: now,
      },
    ];

    const orderHistories: OrderStatusHistory[] = [
      {
        id: 'hist_001',
        orderId: 'ord_1001',
        fromStatus: 'New',
        toStatus: 'Confirmed',
        changedBy: 'System (eBay Auto-import)',
        note: 'Order imported with paid checkout',
        timestamp: twoDaysAgo,
      },
      {
        id: 'hist_002',
        orderId: 'ord_1001',
        fromStatus: 'Confirmed',
        toStatus: 'Allocated',
        changedBy: 'System (Inventory Engine)',
        note: 'Stock reserved from Zone A / A1 / S01 / B01',
        timestamp: twoDaysAgo,
      },
      {
        id: 'hist_003',
        orderId: 'ord_1001',
        fromStatus: 'Allocated',
        toStatus: 'Picked',
        changedBy: 'jack.miller@nexusops.com',
        timestamp: yesterday,
      },
      {
        id: 'hist_004',
        orderId: 'ord_1001',
        fromStatus: 'Picked',
        toStatus: 'Packed',
        changedBy: 'jack.miller@nexusops.com',
        timestamp: yesterday,
      },
      {
        id: 'hist_005',
        orderId: 'ord_1001',
        fromStatus: 'Packed',
        toStatus: 'Shipped',
        changedBy: 'jack.miller@nexusops.com',
        note: 'Royal Mail tracking GB982103841RM attached',
        timestamp: yesterday,
      },
      {
        id: 'hist_006',
        orderId: 'ord_1001',
        fromStatus: 'Shipped',
        toStatus: 'Delivered',
        changedBy: 'System (Carrier Callback)',
        timestamp: yesterday,
      },
    ];

    const stockAdjustments: StockAdjustment[] = [
      {
        id: 'adj_001',
        adjustmentNumber: 'ADJ-2026-001',
        productId: 'prd_001',
        sku: 'NX-AUD-001',
        locationId: 'loc_def',
        quantityDelta: -2,
        targetState: 'DAMAGED',
        reasonCode: 'damage',
        note: 'Transit damage discovered during unboxing of returned carton.',
        requestedBy: 'jack.miller@nexusops.com',
        requiresApproval: false, // under threshold
        status: 'APPROVED',
        approvedBy: 'System (Auto-approved under threshold)',
        approvalNote: 'Value £76.00 below £250.00 approval gate',
        evaluatedValueMinor: 7600,
        createdAt: yesterday,
        updatedAt: yesterday,
      },
      {
        id: 'adj_002',
        adjustmentNumber: 'ADJ-2026-002',
        productId: 'prd_004',
        sku: 'NX-KEY-004',
        locationId: 'loc_bulk_01',
        quantityDelta: 15,
        targetState: 'ON_HAND',
        reasonCode: 'found',
        note: 'Found full unlabelled master box in mezzanine rack during cycle count.',
        requestedBy: 'jack.miller@nexusops.com',
        requiresApproval: true, // 15 units > 10 units threshold, value £465 > £250
        status: 'PENDING_APPROVAL',
        evaluatedValueMinor: 46500,
        createdAt: new Date(Date.now() - 14400000).toISOString(),
        updatedAt: new Date(Date.now() - 14400000).toISOString(),
      },
    ];

    const suppliers: Supplier[] = [
      {
        id: 'sup_001',
        name: 'Shenzhen Sonic Acoustic Electronics Co.',
        code: 'SONIC-AUDIO',
        contactName: 'Wei Zhang',
        email: 'orders@sonicacoustic.cn',
        phone: '+86 755 8399 1022',
        paymentTermsDays: 30,
        currency: 'USD',
        leadTimeDays: 21,
        isActive: true,
      },
      {
        id: 'sup_002',
        name: 'Precision Optics & CamTech Ltd',
        code: 'PREC-CAM',
        contactName: 'Alistair Ross',
        email: 'sales@precisioncam.co.uk',
        phone: '+44 121 772 9011',
        paymentTermsDays: 45,
        currency: 'GBP',
        leadTimeDays: 10,
        isActive: true,
      },
    ];

    const purchaseOrders: PurchaseOrder[] = [
      {
        id: 'po_2026_01',
        poNumber: 'PO-2026-001',
        supplierId: 'sup_002',
        supplierName: 'Precision Optics & CamTech Ltd',
        status: 'PARTIALLY_RECEIVED',
        currency: 'GBP',
        subtotalMinor: 120000,
        taxMinor: 24000,
        totalMinor: 144000,
        expectedDate: new Date(Date.now() + 86400000 * 4).toISOString(),
        createdAt: twoDaysAgo,
        approvedBy: 'sarah.jenkins@nexusops.com',
        updatedAt: yesterday,
        lines: [
          {
            id: 'pol_01_1',
            poId: 'po_2026_01',
            productId: 'prd_002',
            sku: 'NX-CAM-002',
            productName: 'Nexus 4K Ultra Wide StreamCam with Stereo Mic',
            orderedQty: 50,
            receivedQty: 30, // 20 remaining -> demonstrates partial receiving (AT-06)
            unitCostMinor: 2400,
            totalCostMinor: 120000,
          },
        ],
      },
      {
        id: 'po_2026_02',
        poNumber: 'PO-2026-002',
        supplierId: 'sup_001',
        supplierName: 'Shenzhen Sonic Acoustic Electronics Co.',
        status: 'APPROVED',
        currency: 'GBP',
        subtotalMinor: 380000,
        taxMinor: 0,
        totalMinor: 380000,
        expectedDate: new Date(Date.now() + 86400000 * 14).toISOString(),
        createdAt: yesterday,
        approvedBy: 'sarah.jenkins@nexusops.com',
        updatedAt: yesterday,
        lines: [
          {
            id: 'pol_02_1',
            poId: 'po_2026_02',
            productId: 'prd_001',
            sku: 'NX-AUD-001',
            productName: 'Nexus Pro Active Noise-Cancelling Headphones',
            orderedQty: 100,
            receivedQty: 0,
            unitCostMinor: 3800,
            totalCostMinor: 380000,
          },
        ],
      },
    ];

    const goodsReceipts: GoodsReceipt[] = [
      {
        id: 'rcpt_001',
        receiptNumber: 'GRN-2026-001',
        poId: 'po_2026_01',
        poNumber: 'PO-2026-001',
        receivedBy: 'jack.miller@nexusops.com',
        receivedAt: yesterday,
        lines: [
          {
            productId: 'prd_002',
            sku: 'NX-CAM-002',
            receivedQty: 30,
            shortageQty: 20,
            damagedQty: 0,
            locationId: 'loc_def',
          },
        ],
        discrepancyNote: 'Partial pallet shipment received. Vendor back-ordering remaining 20 units.',
      },
    ];

    const returns: ReturnOrder[] = [
      {
        id: 'ret_001',
        returnNumber: 'RET-2026-001',
        orderId: 'ord_1001',
        orderNumber: 'NX-ORD-2026-001',
        customerName: 'Oliver Smith',
        reasonCode: 'DAMAGED_TRANSIT',
        status: 'INSPECTED',
        lines: [
          {
            id: 'retl_001_1',
            productId: 'prd_001',
            sku: 'NX-AUD-001',
            quantity: 1,
            disposition: 'DAMAGED', // routed to quarantine/damage (AT-10)
            notes: 'Headband cracked upon unboxing by customer.',
          },
        ],
        refundAmountMinor: 8999,
        refundStatus: 'ISSUED',
        createdAt: yesterday,
        inspectedAt: yesterday,
      },
    ];

    const storageSnapshots: StorageSnapshot[] = [
      {
        id: 'snap_001',
        clientId: 'client_apex',
        clientName: 'Apex Electronics Ltd',
        snapshotDate: new Date(Date.now() - 86400000 * 7).toISOString(),
        occupiedPallets: 4,
        occupiedShelves: 6,
        occupiedBins: 12,
        estimatedCostMinor: 13800, // £138.00
      },
    ];

    const invoices: Invoice[] = [
      {
        id: 'inv_001',
        invoiceNumber: 'INV-2026-001',
        type: '3PL_SERVICE',
        recipientType: 'CLIENT',
        recipientId: 'client_apex',
        recipientName: 'Apex Electronics Ltd',
        issueDate: yesterday,
        dueDate: new Date(Date.now() + 86400000 * 29).toISOString(),
        subtotalMinor: 24500,
        vatRatePercent: 20,
        vatAmountMinor: 4900,
        totalMinor: 29400,
        paidAmountMinor: 15000,
        status: 'PART_PAID',
        isImmutable: true,
        lines: [
          {
            description: 'Order Fulfilment - Pick & Pack fee (50 dispatches)',
            quantity: 50,
            unitPriceMinor: 250,
            totalMinor: 12500,
          },
          {
            description: 'Warehouse Storage Rental - Zone B Shelf occupancy',
            quantity: 2,
            unitPriceMinor: 6000,
            totalMinor: 12000,
          },
        ],
        createdAt: yesterday,
      },
      {
        id: 'inv_002',
        invoiceNumber: 'INV-2026-002',
        type: 'STORAGE',
        recipientType: 'CLIENT',
        recipientId: 'client_nordic',
        recipientName: 'Nordic Goods Trading',
        issueDate: twoDaysAgo,
        dueDate: new Date(Date.now() - 86400000 * 2).toISOString(), // Overdue -> triggers N-07
        subtotalMinor: 18000,
        vatRatePercent: 20,
        vatAmountMinor: 3600,
        totalMinor: 21600,
        paidAmountMinor: 0,
        status: 'OVERDUE',
        isImmutable: true,
        lines: [
          {
            description: 'Pallet bay monthly reserve (1 bay)',
            quantity: 1,
            unitPriceMinor: 18000,
            totalMinor: 18000,
          },
        ],
        createdAt: twoDaysAgo,
      },
    ];

    const payments: Payment[] = [
      {
        id: 'pay_001',
        paymentNumber: 'PAY-2026-001',
        amountMinor: 15000,
        paymentMethod: 'BANK_TRANSFER',
        paymentDate: yesterday,
        reference: 'BACS-REF-APEX-8812',
        payerName: 'Apex Electronics Ltd',
        recordedBy: 'elena.rostova@nexusops.com',
        unallocatedCreditMinor: 0,
        allocations: [
          {
            invoiceId: 'inv_001',
            invoiceNumber: 'INV-2026-001',
            amountMinor: 15000,
          },
        ],
        createdAt: yesterday,
      },
    ];

    const expenses: Expense[] = [
      {
        id: 'exp_001',
        expenseNumber: 'EXP-2026-001',
        category: 'PACKAGING',
        supplierName: 'EcoPack Boxes & Bubblewrap Ltd',
        date: yesterday,
        amountMinor: 18500,
        vatMinor: 3700,
        allocatedTo: 'ORDERS',
        status: 'APPROVED',
        approvedBy: 'sarah.jenkins@nexusops.com',
        note: 'Batch purchase of FSC certified corrugated boxes for Q4.',
      },
      {
        id: 'exp_002',
        expenseNumber: 'EXP-2026-002',
        category: 'SHIPPING_CARRIER',
        supplierName: 'Royal Mail Wholesale Account',
        date: yesterday,
        amountMinor: 42000,
        vatMinor: 0,
        allocatedTo: 'ORDERS',
        status: 'APPROVED',
        approvedBy: 'sarah.jenkins@nexusops.com',
        note: 'Weekly tracked postage prepaid postage block.',
      },
    ];

    const financialLedger: FinancialLedgerEntry[] = [
      // Double entry for goods receipt
      {
        id: 'fin_001',
        accountId: '1300',
        accountName: 'Inventory Asset',
        debitMinor: 72000, // 30 cameras received @ £24
        creditMinor: 0,
        sourceType: 'RECEIPT',
        sourceId: 'rcpt_001',
        note: 'GRN-2026-001 Receipt of 30 NX-CAM-002',
        createdAt: yesterday,
      },
      {
        id: 'fin_002',
        accountId: '2050',
        accountName: 'Goods Received Not Invoiced (GRNI)',
        debitMinor: 0,
        creditMinor: 72000,
        sourceType: 'RECEIPT',
        sourceId: 'rcpt_001',
        note: 'GRN-2026-001 Accrued inventory liability',
        createdAt: yesterday,
      },
      // Double entry for Order 1001 dispatch
      {
        id: 'fin_003',
        accountId: '5000',
        accountName: 'Cost of Goods Sold (COGS)',
        debitMinor: 3800,
        creditMinor: 0,
        sourceType: 'SHIPMENT',
        sourceId: 'ord_1001',
        note: 'Dispatch of NX-ORD-2026-001 (1x NX-AUD-001)',
        createdAt: yesterday,
      },
      {
        id: 'fin_004',
        accountId: '1300',
        accountName: 'Inventory Asset',
        debitMinor: 0,
        creditMinor: 3800,
        sourceType: 'SHIPMENT',
        sourceId: 'ord_1001',
        note: 'Stock relief for dispatch of NX-ORD-2026-001',
        createdAt: yesterday,
      },
      // Sales Revenue recognition for Order 1001
      {
        id: 'fin_005',
        accountId: '1100',
        accountName: 'Marketplace Clearing (eBay UK)',
        debitMinor: 8999,
        creditMinor: 0,
        sourceType: 'SHIPMENT',
        sourceId: 'ord_1001',
        note: 'Revenue recognized from eBay Order 19-09412-88211',
        createdAt: yesterday,
      },
      {
        id: 'fin_006',
        accountId: '4000',
        accountName: 'Sales Revenue',
        debitMinor: 0,
        creditMinor: 7499,
        sourceType: 'SHIPMENT',
        sourceId: 'ord_1001',
        note: 'Sales net of tax',
        createdAt: yesterday,
      },
      {
        id: 'fin_007',
        accountId: '2100',
        accountName: 'VAT Output Tax Payable',
        debitMinor: 0,
        creditMinor: 1500,
        sourceType: 'SHIPMENT',
        sourceId: 'ord_1001',
        note: 'VAT 20% on retail sales',
        createdAt: yesterday,
      },
    ];

    const notifications: NotificationItem[] = [
      {
        id: 'notif_001',
        type: 'LOW_STOCK',
        title: 'Low Stock Alert: NX-KEY-004',
        message: 'SKU NX-KEY-004 is at 9 available units (low stock threshold is 12).',
        severity: 'WARNING',
        referenceUrl: '/stock/products',
        isRead: false,
        isDismissed: false,
        createdAt: yesterday,
      },
      {
        id: 'notif_002',
        type: 'UNMAPPED_SKU',
        title: 'Unmapped eBay SKU Detected',
        message: 'External SKU "EB-WIRE-EXT-RED" received on US store order requires mapping.',
        severity: 'WARNING',
        referenceUrl: '/sales/ebay-accounts',
        isRead: false,
        isDismissed: false,
        createdAt: new Date(Date.now() - 1800000).toISOString(),
      },
      {
        id: 'notif_003',
        type: 'ADJUSTMENT_AWAITING_APPROVAL',
        title: 'Stock Adjustment Pending Approval',
        message: 'Adjustment ADJ-2026-002 (+15 units NX-KEY-004, value £465.00) awaits Manager sign-off.',
        severity: 'INFO',
        referenceUrl: '/stock/adjustments',
        isRead: false,
        isDismissed: false,
        createdAt: new Date(Date.now() - 14400000).toISOString(),
      },
      {
        id: 'notif_004',
        type: 'OVERDUE_INVOICE',
        title: 'Overdue 3PL Invoice: INV-2026-002',
        message: 'Invoice INV-2026-002 for Nordic Goods Trading (£216.00) is past its due date.',
        severity: 'CRITICAL',
        referenceUrl: '/finance/invoices',
        isRead: false,
        isDismissed: false,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    const auditLogs: AuditLogEntry[] = [
      {
        id: 'aud_001',
        actorId: 'usr_superadmin',
        actorName: 'Sarah Jenkins',
        action: 'CREATE',
        entity: 'SystemConfig',
        entityId: 'cfg_init',
        afterSnapshot: { baseCurrency: 'GBP', businessTimezone: 'Europe/London' },
        notes: 'Initial production system configuration setup.',
        timestamp: twoDaysAgo,
      },
      {
        id: 'aud_002',
        actorId: 'usr_superadmin',
        actorName: 'Sarah Jenkins',
        action: 'SYNC',
        entity: 'MarketplaceAccount',
        entityId: 'mkt_ebay_uk',
        afterSnapshot: { syncResult: 'SUCCESS', count: 14 },
        notes: 'Manual trigger of eBay UK order polling adapter.',
        timestamp: yesterday,
      },
      {
        id: 'aud_003',
        actorId: 'usr_warehouse',
        actorName: 'Jack Miller',
        action: 'UPDATE',
        entity: 'Order',
        entityId: 'ord_1001',
        beforeSnapshot: { status: 'Packed' },
        afterSnapshot: { status: 'Shipped', carrier: 'Royal Mail', trackingNumber: 'GB982103841RM' },
        notes: 'Dispatched order and updated stock ledger deduction.',
        timestamp: yesterday,
      },
    ];

    this.data = {
      users,
      marketplaceAccounts,
      syncRuns,
      exceptions,
      products,
      skuMappings,
      orders,
      orderHistories,
      warehouses,
      locations,
      stockLedger,
      stockAdjustments,
      suppliers,
      purchaseOrders,
      goodsReceipts,
      returns,
      clients,
      rateCards,
      storageSnapshots,
      invoices,
      payments,
      expenses,
      financialLedger,
      auditLogs,
      notifications,
      config,
    };
  }
}

export const db = new DatabaseService();
