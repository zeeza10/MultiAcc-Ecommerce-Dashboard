/**
 * Client-Side Database & API Handler for Cloudflare Pages / Static Hosting
 * This enables the entire application to work seamlessly when deployed to
 * Cloudflare Pages, GitHub Pages, Vercel, or Netlify without a Node.js Express server.
 */

import {
  User,
  MarketplaceAccount,
  Product,
  Order,
  OrderStatus,
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
} from '../types';

const STORAGE_KEY = 'nexusops_client_db_v2';
const LEGACY_STORAGE_KEY = 'nexusops_client_db_v1';

export interface ClientDatabaseState {
  users: User[];
  marketplaceAccounts: MarketplaceAccount[];
  exceptions: ExceptionItem[];
  products: Product[];
  orders: Order[];
  orderHistories: any[];
  warehouses: any[];
  locations: any[];
  stockLedger: any[];
  stockAdjustments: any[];
  suppliers: any[];
  purchaseOrders: any[];
  returns: any[];
  clients: any[];
  rateCards: any[];
  invoices: any[];
  payments: any[];
  expenses: any[];
  financialLedger: any[];
  auditLogs: any[];
  notifications: any[];
  config: any;
  [key: string]: any;
}

const SEED_DATA: any = {
  "users": [
    {
      "id": "usr_superadmin",
      "email": "sarah.jenkins@nexusops.com",
      "name": "Sarah Jenkins (Super Admin)",
      "role": "SUPER_ADMIN",
      "isActive": true,
      "twoFactorEnabled": true,
      "failedLoginAttempts": 0,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "usr_opsmanager",
      "email": "marcus.reid@nexusops.com",
      "name": "Marcus Reid (Operations Manager)",
      "role": "OPS_MANAGER",
      "isActive": true,
      "twoFactorEnabled": true,
      "failedLoginAttempts": 0,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "usr_warehouse",
      "email": "jack.miller@nexusops.com",
      "name": "Jack Miller (Warehouse Staff)",
      "role": "WAREHOUSE_STAFF",
      "isActive": true,
      "twoFactorEnabled": false,
      "failedLoginAttempts": 0,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "usr_finance",
      "email": "elena.rostova@nexusops.com",
      "name": "Elena Rostova (Finance Controller)",
      "role": "FINANCE_USER",
      "isActive": true,
      "twoFactorEnabled": true,
      "failedLoginAttempts": 0,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "usr_client_apex",
      "email": "david.chen@apex-electronics.com",
      "name": "David Chen (3PL Client - Apex)",
      "role": "CLIENT_USER",
      "clientId": "client_apex",
      "isActive": true,
      "twoFactorEnabled": false,
      "failedLoginAttempts": 0,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "usr_viewer",
      "email": "arthur.p@auditors.co.uk",
      "name": "Arthur Pendelton (Viewer / Auditor)",
      "role": "VIEWER",
      "isActive": true,
      "twoFactorEnabled": false,
      "failedLoginAttempts": 0,
      "createdAt": "2026-10-31T15:21:20.991Z"
    }
  ],
  "marketplaceAccounts": [
    {
      "id": "mkt_ebay_uk",
      "name": "Nexus Tech Direct (UK)",
      "marketplace": "EBAY_UK",
      "sellerUsername": "nexus_direct_uk",
      "authStatus": "CONNECTED",
      "environment": "PRODUCTION",
      "lastSyncAt": "2026-11-07T15:16:20.991Z",
      "lastSyncStatus": "SUCCESS",
      "lastSyncMessage": "Poll complete: 28 orders inspected, 3 new imported.",
      "tokenExpiresAt": "2026-12-07T15:21:20.991Z",
      "autoSyncIntervalMinutes": 15,
      "isDemo": true
    },
    {
      "id": "mkt_ebay_us",
      "name": "Nexus Global Outlet (US)",
      "marketplace": "EBAY_US",
      "sellerUsername": "nexus_outlet_us",
      "authStatus": "CONNECTED",
      "environment": "PRODUCTION",
      "lastSyncAt": "2026-11-07T15:06:20.991Z",
      "lastSyncStatus": "SUCCESS",
      "lastSyncMessage": "Poll complete: 12 orders checked, 2 new imported.",
      "tokenExpiresAt": "2026-12-02T15:21:20.991Z",
      "autoSyncIntervalMinutes": 30,
      "isDemo": true
    },
    {
      "id": "mkt_ebay_de",
      "name": "Nexus Tech Europe (DE)",
      "marketplace": "EBAY_DE",
      "sellerUsername": "nexus_de_shop",
      "authStatus": "CONNECTED",
      "environment": "PRODUCTION",
      "lastSyncAt": "2026-11-07T14:56:20.991Z",
      "lastSyncStatus": "SUCCESS",
      "lastSyncMessage": "Poll complete: 9 orders checked, 1 new imported.",
      "tokenExpiresAt": "2026-12-05T15:21:20.991Z",
      "autoSyncIntervalMinutes": 30,
      "isDemo": true
    }
  ],
  "syncRuns": [],
  "exceptions": [
    {
      "id": "exc_001",
      "type": "UNMAPPED_SKU",
      "source": "EBAY",
      "referenceId": "EBAY-US-99201",
      "details": "External listing SKU \"EB-WIRE-EXT-RED\" does not map to any active internal catalog product.",
      "rawPayloadSnippet": "{\"externalSku\": \"EB-WIRE-EXT-RED\", \"orderId\": \"19-10822-44120\", \"title\": \"Heavy Duty Extension Cable 5M - Red\"}",
      "status": "PENDING",
      "createdAt": "2026-11-05T15:21:20.991Z"
    }
  ],
  "products": [
    {
      "id": "prd_001",
      "sku": "NX-AUD-001",
      "name": "Nexus Pro Active Noise-Cancelling Headphones",
      "barcode": "5060001001018",
      "dimensions": {
        "lengthCm": 22,
        "widthCm": 18,
        "heightCm": 8
      },
      "weightKg": 0.35,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 3800,
      "sellingPriceMinor": 8999,
      "lowStockThreshold": 15,
      "reorderLevel": 50,
      "category": "Audio",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_002",
      "sku": "NX-CAM-002",
      "name": "Nexus 4K Ultra Wide StreamCam with Stereo Mic",
      "barcode": "5060001001025",
      "dimensions": {
        "lengthCm": 12,
        "widthCm": 6,
        "heightCm": 5
      },
      "weightKg": 0.22,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 2400,
      "sellingPriceMinor": 5999,
      "lowStockThreshold": 10,
      "reorderLevel": 30,
      "category": "Video",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_003",
      "sku": "NX-MOU-003",
      "name": "Nexus Precision Ergonomic Bluetooth Mouse",
      "barcode": "5060001001032",
      "dimensions": {
        "lengthCm": 14,
        "widthCm": 9,
        "heightCm": 5
      },
      "weightKg": 0.15,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 1250,
      "sellingPriceMinor": 3499,
      "lowStockThreshold": 20,
      "reorderLevel": 60,
      "category": "Accessories",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_004",
      "sku": "NX-KEY-004",
      "name": "Nexus RGB Mechanical Gaming Keyboard - Brown Switches",
      "barcode": "5060001001049",
      "dimensions": {
        "lengthCm": 45,
        "widthCm": 16,
        "heightCm": 4
      },
      "weightKg": 0.95,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 3100,
      "sellingPriceMinor": 7499,
      "lowStockThreshold": 10,
      "reorderLevel": 25,
      "category": "Accessories",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_005",
      "sku": "NX-HUB-005",
      "name": "Nexus 8-in-1 Aluminum USB-C Hub 100W PD",
      "barcode": "5060001001056",
      "dimensions": {
        "lengthCm": 16,
        "widthCm": 7,
        "heightCm": 2
      },
      "weightKg": 0.18,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 1100,
      "sellingPriceMinor": 2999,
      "lowStockThreshold": 25,
      "reorderLevel": 80,
      "category": "Adapters",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_006",
      "sku": "NX-MIC-006",
      "name": "Nexus Studio Broadcast USB Condenser Microphone",
      "barcode": "5060001001063",
      "dimensions": {
        "lengthCm": 24,
        "widthCm": 14,
        "heightCm": 12
      },
      "weightKg": 0.85,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 4200,
      "sellingPriceMinor": 9999,
      "lowStockThreshold": 12,
      "reorderLevel": 35,
      "category": "Audio",
      "createdAt": "2026-11-01T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_007",
      "sku": "NX-STAND-007",
      "name": "Nexus Ergonomic Aluminum Laptop Riser Stand",
      "barcode": "5060001001070",
      "dimensions": {
        "lengthCm": 28,
        "widthCm": 26,
        "heightCm": 6
      },
      "weightKg": 0.72,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 1450,
      "sellingPriceMinor": 3999,
      "lowStockThreshold": 15,
      "reorderLevel": 45,
      "category": "Accessories",
      "createdAt": "2026-11-01T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_008",
      "sku": "NX-CHG-008",
      "name": "Nexus 65W GaN Fast Charger Dual USB-C",
      "barcode": "5060001001087",
      "dimensions": {
        "lengthCm": 8,
        "widthCm": 5,
        "heightCm": 4
      },
      "weightKg": 0.14,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 950,
      "sellingPriceMinor": 2499,
      "lowStockThreshold": 30,
      "reorderLevel": 100,
      "category": "Power",
      "createdAt": "2026-11-02T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_009",
      "sku": "NX-CAB-009",
      "name": "Nexus Thunderbolt 4 High Speed Braided Cable 1M",
      "barcode": "5060001001094",
      "dimensions": {
        "lengthCm": 15,
        "widthCm": 10,
        "heightCm": 2
      },
      "weightKg": 0.08,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 680,
      "sellingPriceMinor": 1999,
      "lowStockThreshold": 40,
      "reorderLevel": 120,
      "category": "Cables",
      "createdAt": "2026-11-02T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_010",
      "sku": "NX-LIGHT-010",
      "name": "Nexus Studio LED Key Light with Desk Clamp",
      "barcode": "5060001001100",
      "dimensions": {
        "lengthCm": 35,
        "widthCm": 24,
        "heightCm": 8
      },
      "weightKg": 1.45,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 3400,
      "sellingPriceMinor": 7999,
      "lowStockThreshold": 8,
      "reorderLevel": 20,
      "category": "Video",
      "createdAt": "2026-11-03T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_011",
      "sku": "NX-SSD-011",
      "name": "Nexus Rugged 1TB Portable NVMe External SSD",
      "barcode": "5060001001117",
      "dimensions": {
        "lengthCm": 10,
        "widthCm": 6,
        "heightCm": 2
      },
      "weightKg": 0.11,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 4800,
      "sellingPriceMinor": 10999,
      "lowStockThreshold": 10,
      "reorderLevel": 30,
      "category": "Storage",
      "createdAt": "2026-11-03T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_012",
      "sku": "NX-PAD-012",
      "name": "Nexus XL Spill-Proof Gaming Desk Mat (900x400mm)",
      "barcode": "5060001001124",
      "dimensions": {
        "lengthCm": 42,
        "widthCm": 8,
        "heightCm": 8
      },
      "weightKg": 0.65,
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "status": "ACTIVE",
      "costPriceMinor": 580,
      "sellingPriceMinor": 1799,
      "lowStockThreshold": 20,
      "reorderLevel": 50,
      "category": "Accessories",
      "createdAt": "2026-11-04T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_apex_01",
      "sku": "APX-SPK-100",
      "name": "Apex SoundPulse Rugged Waterproof Speaker",
      "barcode": "5069992002014",
      "dimensions": {
        "lengthCm": 20,
        "widthCm": 10,
        "heightCm": 10
      },
      "weightKg": 0.65,
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "status": "ACTIVE",
      "costPriceMinor": 1950,
      "sellingPriceMinor": 4999,
      "lowStockThreshold": 20,
      "reorderLevel": 50,
      "category": "Audio",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_apex_02",
      "sku": "APX-EAR-200",
      "name": "Apex PureBass Wireless Earbuds with ANC",
      "barcode": "5069992002021",
      "dimensions": {
        "lengthCm": 10,
        "widthCm": 8,
        "heightCm": 4
      },
      "weightKg": 0.12,
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "status": "ACTIVE",
      "costPriceMinor": 2100,
      "sellingPriceMinor": 5499,
      "lowStockThreshold": 15,
      "reorderLevel": 40,
      "category": "Audio",
      "createdAt": "2026-11-01T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_bolt_01",
      "sku": "BLT-SND-10",
      "name": "Bolt CinemaSound 120W Compact TV Soundbar",
      "barcode": "5069993003011",
      "dimensions": {
        "lengthCm": 65,
        "widthCm": 12,
        "heightCm": 10
      },
      "weightKg": 2.8,
      "ownerType": "CLIENT",
      "ownerId": "client_bolt",
      "status": "ACTIVE",
      "costPriceMinor": 5200,
      "sellingPriceMinor": 12999,
      "lowStockThreshold": 8,
      "reorderLevel": 25,
      "category": "Audio",
      "createdAt": "2026-11-01T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_luma_01",
      "sku": "LUM-CAM-01",
      "name": "Luma Smart 2K Pan & Tilt Indoor WiFi Camera",
      "barcode": "5069994004018",
      "dimensions": {
        "lengthCm": 15,
        "widthCm": 12,
        "heightCm": 12
      },
      "weightKg": 0.38,
      "ownerType": "CLIENT",
      "ownerId": "client_luma",
      "status": "ACTIVE",
      "costPriceMinor": 1650,
      "sellingPriceMinor": 4299,
      "lowStockThreshold": 15,
      "reorderLevel": 45,
      "category": "Smart Home",
      "createdAt": "2026-11-02T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "prd_nordic_01",
      "sku": "NRD-WRM-01",
      "name": "Nordic Eco Wool Heated Smart Throw Blanket",
      "barcode": "5069995005015",
      "dimensions": {
        "lengthCm": 40,
        "widthCm": 35,
        "heightCm": 12
      },
      "weightKg": 1.85,
      "ownerType": "CLIENT",
      "ownerId": "client_nordic",
      "status": "ACTIVE",
      "costPriceMinor": 3100,
      "sellingPriceMinor": 7999,
      "lowStockThreshold": 10,
      "reorderLevel": 30,
      "category": "Home",
      "createdAt": "2026-11-03T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    }
  ],
  "skuMappings": [
    {
      "id": "map_01",
      "marketplaceAccountId": "mkt_ebay_uk",
      "marketplaceSku": "EBAY-UK-NXAUD001",
      "productId": "prd_001",
      "internalSku": "NX-AUD-001",
      "isVerified": true,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "map_02",
      "marketplaceAccountId": "mkt_ebay_uk",
      "marketplaceSku": "EBAY-UK-NXCAM002",
      "productId": "prd_002",
      "internalSku": "NX-CAM-002",
      "isVerified": true,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "map_03",
      "marketplaceAccountId": "mkt_ebay_us",
      "marketplaceSku": "EBAY-US-NXKEY004",
      "productId": "prd_004",
      "internalSku": "NX-KEY-004",
      "isVerified": true,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "map_04",
      "marketplaceAccountId": "mkt_ebay_uk",
      "marketplaceSku": "EBAY-UK-NXHUB005",
      "productId": "prd_005",
      "internalSku": "NX-HUB-005",
      "isVerified": true,
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "map_05",
      "marketplaceAccountId": "mkt_ebay_de",
      "marketplaceSku": "EBAY-DE-NXMIC006",
      "productId": "prd_006",
      "internalSku": "NX-MIC-006",
      "isVerified": true,
      "createdAt": "2026-11-01T15:21:20.991Z"
    },
    {
      "id": "map_06",
      "marketplaceAccountId": "mkt_ebay_uk",
      "marketplaceSku": "EBAY-UK-NXSSD011",
      "productId": "prd_011",
      "internalSku": "NX-SSD-011",
      "isVerified": true,
      "createdAt": "2026-11-03T15:21:20.991Z"
    }
  ],
  "orders": [
    {
      "id": "ord_gen_1001",
      "orderNumber": "NX-ORD-2026-001",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09411-2017",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Oliver Smith",
      "customerEmail": "oliver.smith.gb@example.co.uk",
      "shippingAddress": {
        "name": "Oliver Smith",
        "street": "14 Kensington Church Street",
        "city": "London",
        "postalCode": "W8 4EP",
        "country": "GB"
      },
      "status": "Delivered",
      "paymentState": "PAID",
      "totalMinor": 17998,
      "taxMinor": 3600,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "DPD UK Next Day",
      "trackingNumber": "DPD-GB-892020",
      "shippingCostMinor": 580,
      "lines": [
        {
          "id": "ordl_ord_gen_1001_1",
          "orderId": "ord_gen_1001",
          "productId": "prd_001",
          "sku": "NX-AUD-001",
          "productName": "Nexus Pro Active Noise-Cancelling Headphones",
          "quantity": 2,
          "unitPriceMinor": 8999,
          "taxAmountMinor": 3600,
          "totalPriceMinor": 17998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-01T04:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1002",
      "orderNumber": "NX-ORD-2026-002",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09412-2034",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Emily Watson",
      "customerEmail": "emily.watson@example.co.uk",
      "shippingAddress": {
        "name": "Emily Watson",
        "street": "88 George Street",
        "city": "Edinburgh",
        "postalCode": "EH2 3BU",
        "country": "GB"
      },
      "status": "Delivered",
      "paymentState": "PAID",
      "totalMinor": 17997,
      "taxMinor": 3599,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "DHL Express Worldwide",
      "trackingNumber": "DHL-GB-892021",
      "shippingCostMinor": 1250,
      "lines": [
        {
          "id": "ordl_ord_gen_1002_1",
          "orderId": "ord_gen_1002",
          "productId": "prd_002",
          "sku": "NX-CAM-002",
          "productName": "Nexus 4K Ultra Wide StreamCam with Stereo Mic",
          "quantity": 3,
          "unitPriceMinor": 5999,
          "taxAmountMinor": 3599,
          "totalPriceMinor": 17997,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-01T09:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1003",
      "orderNumber": "NX-ORD-2026-003",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09413-2051",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "James Henderson",
      "customerEmail": "j.henderson@example.co.uk",
      "shippingAddress": {
        "name": "James Henderson",
        "street": "12 Deansgate Arcade",
        "city": "Manchester",
        "postalCode": "M3 2BW",
        "country": "GB"
      },
      "status": "Delivered",
      "paymentState": "PAID",
      "totalMinor": 3499,
      "taxMinor": 700,
      "shippingChargeMinor": 499,
      "currency": "GBP",
      "carrier": "FedEx Priority",
      "trackingNumber": "FEDEX-GB-892022",
      "shippingCostMinor": 950,
      "lines": [
        {
          "id": "ordl_ord_gen_1003_1",
          "orderId": "ord_gen_1003",
          "productId": "prd_003",
          "sku": "NX-MOU-003",
          "productName": "Nexus Precision Ergonomic Bluetooth Mouse",
          "quantity": 1,
          "unitPriceMinor": 3499,
          "taxAmountMinor": 700,
          "totalPriceMinor": 3499,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-01T14:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1004",
      "orderNumber": "NX-ORD-2026-004",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09414-2068",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Michael Chang",
      "customerEmail": "mchang@example.com",
      "shippingAddress": {
        "name": "Michael Chang",
        "street": "742 Evergreen Terrace",
        "city": "Springfield",
        "postalCode": "97477",
        "country": "US"
      },
      "status": "Delivered",
      "paymentState": "PAID",
      "totalMinor": 14998,
      "taxMinor": 3000,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "Evri Standard Parcel",
      "trackingNumber": "EVRI-GB-892023",
      "shippingCostMinor": 320,
      "lines": [
        {
          "id": "ordl_ord_gen_1004_1",
          "orderId": "ord_gen_1004",
          "productId": "prd_004",
          "sku": "NX-KEY-004",
          "productName": "Nexus RGB Mechanical Gaming Keyboard - Brown Switches",
          "quantity": 2,
          "unitPriceMinor": 7499,
          "taxAmountMinor": 3000,
          "totalPriceMinor": 14998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-01T19:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1005",
      "orderNumber": "NX-ORD-2026-005",
      "marketplaceAccountId": "mkt_ebay_de",
      "externalOrderId": "19-09415-2085",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Chloe Bennett",
      "customerEmail": "chloe.b@example.co.uk",
      "shippingAddress": {
        "name": "Chloe Bennett",
        "street": "5 Victoria Square",
        "city": "Birmingham",
        "postalCode": "B1 1BD",
        "country": "GB"
      },
      "status": "Delivered",
      "paymentState": "PAID",
      "totalMinor": 8997,
      "taxMinor": 1799,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "Royal Mail 24 Tracked",
      "trackingNumber": "RM-GB-892024",
      "shippingCostMinor": 450,
      "lines": [
        {
          "id": "ordl_ord_gen_1005_1",
          "orderId": "ord_gen_1005",
          "productId": "prd_005",
          "sku": "NX-HUB-005",
          "productName": "Nexus 8-in-1 Aluminum USB-C Hub 100W PD",
          "quantity": 3,
          "unitPriceMinor": 2999,
          "taxAmountMinor": 1799,
          "totalPriceMinor": 8997,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-02T00:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1006",
      "orderNumber": "NX-ORD-2026-006",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09416-2102",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Hans Gruber",
      "customerEmail": "h.gruber@berlin-tech.de",
      "shippingAddress": {
        "name": "Hans Gruber",
        "street": "Friedrichstraße 43",
        "city": "Berlin",
        "postalCode": "10117",
        "country": "DE"
      },
      "status": "Shipped",
      "paymentState": "PAID",
      "totalMinor": 9999,
      "taxMinor": 2000,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "DPD UK Next Day",
      "trackingNumber": "DPD-GB-892025",
      "shippingCostMinor": 580,
      "lines": [
        {
          "id": "ordl_ord_gen_1006_1",
          "orderId": "ord_gen_1006",
          "productId": "prd_006",
          "sku": "NX-MIC-006",
          "productName": "Nexus Studio Broadcast USB Condenser Microphone",
          "quantity": 1,
          "unitPriceMinor": 9999,
          "taxAmountMinor": 2000,
          "totalPriceMinor": 9999,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-02T05:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1007",
      "orderNumber": "NX-ORD-2026-007",
      "salesSource": "MANUAL",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Sarah O'Connor",
      "customerEmail": "sarah.oc@dublin.ie",
      "shippingAddress": {
        "name": "Sarah O'Connor",
        "street": "22 Grafton Street",
        "city": "Dublin",
        "postalCode": "D02 K832",
        "country": "IE"
      },
      "status": "Shipped",
      "paymentState": "PAID",
      "totalMinor": 7998,
      "taxMinor": 1600,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "DHL Express Worldwide",
      "trackingNumber": "DHL-GB-892026",
      "shippingCostMinor": 1250,
      "lines": [
        {
          "id": "ordl_ord_gen_1007_1",
          "orderId": "ord_gen_1007",
          "productId": "prd_007",
          "sku": "NX-STAND-007",
          "productName": "Nexus Ergonomic Aluminum Laptop Riser Stand",
          "quantity": 2,
          "unitPriceMinor": 3999,
          "taxAmountMinor": 1600,
          "totalPriceMinor": 7998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-02T10:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1008",
      "orderNumber": "NX-ORD-2026-008",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09418-2136",
      "salesSource": "EBAY",
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "customerName": "Thomas Davies",
      "customerEmail": "t.davies@cardiff.co.uk",
      "shippingAddress": {
        "name": "Thomas Davies",
        "street": "18 St Mary Street",
        "city": "Cardiff",
        "postalCode": "CF10 1AU",
        "country": "GB"
      },
      "status": "Shipped",
      "paymentState": "PAID",
      "totalMinor": 7497,
      "taxMinor": 1499,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "FedEx Priority",
      "trackingNumber": "FEDEX-GB-892027",
      "shippingCostMinor": 950,
      "lines": [
        {
          "id": "ordl_ord_gen_1008_1",
          "orderId": "ord_gen_1008",
          "productId": "prd_008",
          "sku": "NX-CHG-008",
          "productName": "Nexus 65W GaN Fast Charger Dual USB-C",
          "quantity": 3,
          "unitPriceMinor": 2499,
          "taxAmountMinor": 1499,
          "totalPriceMinor": 7497,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-02T15:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1009",
      "orderNumber": "NX-ORD-2026-009",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09419-2153",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "TechHub Retail Stores",
      "customerEmail": "purchasing@techhub.co.uk",
      "shippingAddress": {
        "name": "TechHub Central Inbound",
        "street": "9 Wharf Road",
        "city": "Leeds",
        "postalCode": "LS1 5QZ",
        "country": "GB"
      },
      "status": "Shipped",
      "paymentState": "PAID",
      "totalMinor": 1999,
      "taxMinor": 400,
      "shippingChargeMinor": 499,
      "currency": "GBP",
      "carrier": "Evri Standard Parcel",
      "trackingNumber": "EVRI-GB-892028",
      "shippingCostMinor": 320,
      "lines": [
        {
          "id": "ordl_ord_gen_1009_1",
          "orderId": "ord_gen_1009",
          "productId": "prd_009",
          "sku": "NX-CAB-009",
          "productName": "Nexus Thunderbolt 4 High Speed Braided Cable 1M",
          "quantity": 1,
          "unitPriceMinor": 1999,
          "taxAmountMinor": 400,
          "totalPriceMinor": 1999,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-02T20:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1010",
      "orderNumber": "NX-ORD-2026-010",
      "marketplaceAccountId": "mkt_ebay_de",
      "externalOrderId": "19-09420-2170",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Alexander Rossi",
      "customerEmail": "a.rossi@milano.it",
      "shippingAddress": {
        "name": "Alexander Rossi",
        "street": "Corso Buenos Aires 12",
        "city": "Milano",
        "postalCode": "20124",
        "country": "IT"
      },
      "status": "Shipped",
      "paymentState": "PAID",
      "totalMinor": 15998,
      "taxMinor": 3200,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "carrier": "Royal Mail 24 Tracked",
      "trackingNumber": "RM-GB-892029",
      "shippingCostMinor": 450,
      "lines": [
        {
          "id": "ordl_ord_gen_1010_1",
          "orderId": "ord_gen_1010",
          "productId": "prd_010",
          "sku": "NX-LIGHT-010",
          "productName": "Nexus Studio LED Key Light with Desk Clamp",
          "quantity": 2,
          "unitPriceMinor": 7999,
          "taxAmountMinor": 3200,
          "totalPriceMinor": 15998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-03T01:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1011",
      "orderNumber": "NX-ORD-2026-011",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09421-2187",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Fiona MacLeod",
      "customerEmail": "f.macleod@glasgow.ac.uk",
      "shippingAddress": {
        "name": "Fiona MacLeod",
        "street": "54 Buchanan Street",
        "city": "Glasgow",
        "postalCode": "G1 3HA",
        "country": "GB"
      },
      "status": "Packed",
      "paymentState": "PAID",
      "totalMinor": 32997,
      "taxMinor": 6599,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1011_1",
          "orderId": "ord_gen_1011",
          "productId": "prd_011",
          "sku": "NX-SSD-011",
          "productName": "Nexus Rugged 1TB Portable NVMe External SSD",
          "quantity": 3,
          "unitPriceMinor": 10999,
          "taxAmountMinor": 6599,
          "totalPriceMinor": 32997,
          "isBackordered": false,
          "reservedQuantity": 3
        }
      ],
      "createdAt": "2026-11-03T06:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1012",
      "orderNumber": "NX-ORD-2026-012",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09422-2204",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Liam Murphy",
      "customerEmail": "liam.m@belfast.co.uk",
      "shippingAddress": {
        "name": "Liam Murphy",
        "street": "7 Donegall Square",
        "city": "Belfast",
        "postalCode": "BT1 5HD",
        "country": "GB"
      },
      "status": "Packed",
      "paymentState": "PAID",
      "totalMinor": 1799,
      "taxMinor": 360,
      "shippingChargeMinor": 499,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1012_1",
          "orderId": "ord_gen_1012",
          "productId": "prd_012",
          "sku": "NX-PAD-012",
          "productName": "Nexus XL Spill-Proof Gaming Desk Mat (900x400mm)",
          "quantity": 1,
          "unitPriceMinor": 1799,
          "taxAmountMinor": 360,
          "totalPriceMinor": 1799,
          "isBackordered": false,
          "reservedQuantity": 1
        }
      ],
      "createdAt": "2026-11-03T11:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1013",
      "orderNumber": "NX-ORD-2026-013",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09423-2221",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Oliver Smith",
      "customerEmail": "oliver.smith.gb@example.co.uk",
      "shippingAddress": {
        "name": "Oliver Smith",
        "street": "14 Kensington Church Street",
        "city": "London",
        "postalCode": "W8 4EP",
        "country": "GB"
      },
      "status": "Packed",
      "paymentState": "PAID",
      "totalMinor": 9998,
      "taxMinor": 2000,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1013_1",
          "orderId": "ord_gen_1013",
          "productId": "prd_apex_01",
          "sku": "APX-SPK-100",
          "productName": "Apex SoundPulse Rugged Waterproof Speaker",
          "quantity": 2,
          "unitPriceMinor": 4999,
          "taxAmountMinor": 2000,
          "totalPriceMinor": 9998,
          "isBackordered": false,
          "reservedQuantity": 2
        }
      ],
      "createdAt": "2026-11-03T16:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1014",
      "orderNumber": "NX-ORD-2026-014",
      "salesSource": "MANUAL",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Emily Watson",
      "customerEmail": "emily.watson@example.co.uk",
      "shippingAddress": {
        "name": "Emily Watson",
        "street": "88 George Street",
        "city": "Edinburgh",
        "postalCode": "EH2 3BU",
        "country": "GB"
      },
      "status": "Packed",
      "paymentState": "PAID",
      "totalMinor": 16497,
      "taxMinor": 3299,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1014_1",
          "orderId": "ord_gen_1014",
          "productId": "prd_apex_02",
          "sku": "APX-EAR-200",
          "productName": "Apex PureBass Wireless Earbuds with ANC",
          "quantity": 3,
          "unitPriceMinor": 5499,
          "taxAmountMinor": 3299,
          "totalPriceMinor": 16497,
          "isBackordered": false,
          "reservedQuantity": 3
        }
      ],
      "createdAt": "2026-11-03T21:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1015",
      "orderNumber": "NX-ORD-2026-015",
      "marketplaceAccountId": "mkt_ebay_de",
      "externalOrderId": "19-09425-2255",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "James Henderson",
      "customerEmail": "j.henderson@example.co.uk",
      "shippingAddress": {
        "name": "James Henderson",
        "street": "12 Deansgate Arcade",
        "city": "Manchester",
        "postalCode": "M3 2BW",
        "country": "GB"
      },
      "status": "Picked",
      "paymentState": "PAID",
      "totalMinor": 12999,
      "taxMinor": 2600,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1015_1",
          "orderId": "ord_gen_1015",
          "productId": "prd_bolt_01",
          "sku": "BLT-SND-10",
          "productName": "Bolt CinemaSound 120W Compact TV Soundbar",
          "quantity": 1,
          "unitPriceMinor": 12999,
          "taxAmountMinor": 2600,
          "totalPriceMinor": 12999,
          "isBackordered": false,
          "reservedQuantity": 1
        }
      ],
      "createdAt": "2026-11-04T02:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1016",
      "orderNumber": "NX-ORD-2026-016",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09426-2272",
      "salesSource": "EBAY",
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "customerName": "Michael Chang",
      "customerEmail": "mchang@example.com",
      "shippingAddress": {
        "name": "Michael Chang",
        "street": "742 Evergreen Terrace",
        "city": "Springfield",
        "postalCode": "97477",
        "country": "US"
      },
      "status": "Picked",
      "paymentState": "PAID",
      "totalMinor": 8598,
      "taxMinor": 1720,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1016_1",
          "orderId": "ord_gen_1016",
          "productId": "prd_luma_01",
          "sku": "LUM-CAM-01",
          "productName": "Luma Smart 2K Pan & Tilt Indoor WiFi Camera",
          "quantity": 2,
          "unitPriceMinor": 4299,
          "taxAmountMinor": 1720,
          "totalPriceMinor": 8598,
          "isBackordered": false,
          "reservedQuantity": 2
        }
      ],
      "createdAt": "2026-11-04T07:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1017",
      "orderNumber": "NX-ORD-2026-017",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09427-2289",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Chloe Bennett",
      "customerEmail": "chloe.b@example.co.uk",
      "shippingAddress": {
        "name": "Chloe Bennett",
        "street": "5 Victoria Square",
        "city": "Birmingham",
        "postalCode": "B1 1BD",
        "country": "GB"
      },
      "status": "Picked",
      "paymentState": "PAID",
      "totalMinor": 23997,
      "taxMinor": 4799,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1017_1",
          "orderId": "ord_gen_1017",
          "productId": "prd_nordic_01",
          "sku": "NRD-WRM-01",
          "productName": "Nordic Eco Wool Heated Smart Throw Blanket",
          "quantity": 3,
          "unitPriceMinor": 7999,
          "taxAmountMinor": 4799,
          "totalPriceMinor": 23997,
          "isBackordered": false,
          "reservedQuantity": 3
        }
      ],
      "createdAt": "2026-11-04T12:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1018",
      "orderNumber": "NX-ORD-2026-018",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09428-2306",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Hans Gruber",
      "customerEmail": "h.gruber@berlin-tech.de",
      "shippingAddress": {
        "name": "Hans Gruber",
        "street": "Friedrichstraße 43",
        "city": "Berlin",
        "postalCode": "10117",
        "country": "DE"
      },
      "status": "Picked",
      "paymentState": "PAID",
      "totalMinor": 8999,
      "taxMinor": 1800,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1018_1",
          "orderId": "ord_gen_1018",
          "productId": "prd_001",
          "sku": "NX-AUD-001",
          "productName": "Nexus Pro Active Noise-Cancelling Headphones",
          "quantity": 1,
          "unitPriceMinor": 8999,
          "taxAmountMinor": 1800,
          "totalPriceMinor": 8999,
          "isBackordered": false,
          "reservedQuantity": 1
        }
      ],
      "createdAt": "2026-11-04T17:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1019",
      "orderNumber": "NX-ORD-2026-019",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09429-2323",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Sarah O'Connor",
      "customerEmail": "sarah.oc@dublin.ie",
      "shippingAddress": {
        "name": "Sarah O'Connor",
        "street": "22 Grafton Street",
        "city": "Dublin",
        "postalCode": "D02 K832",
        "country": "IE"
      },
      "status": "Allocated",
      "paymentState": "PAID",
      "totalMinor": 11998,
      "taxMinor": 2400,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1019_1",
          "orderId": "ord_gen_1019",
          "productId": "prd_002",
          "sku": "NX-CAM-002",
          "productName": "Nexus 4K Ultra Wide StreamCam with Stereo Mic",
          "quantity": 2,
          "unitPriceMinor": 5999,
          "taxAmountMinor": 2400,
          "totalPriceMinor": 11998,
          "isBackordered": false,
          "reservedQuantity": 2
        }
      ],
      "createdAt": "2026-11-04T22:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1020",
      "orderNumber": "NX-ORD-2026-020",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09430-2340",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Thomas Davies",
      "customerEmail": "t.davies@cardiff.co.uk",
      "shippingAddress": {
        "name": "Thomas Davies",
        "street": "18 St Mary Street",
        "city": "Cardiff",
        "postalCode": "CF10 1AU",
        "country": "GB"
      },
      "status": "Allocated",
      "paymentState": "PAID",
      "totalMinor": 10497,
      "taxMinor": 2099,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1020_1",
          "orderId": "ord_gen_1020",
          "productId": "prd_003",
          "sku": "NX-MOU-003",
          "productName": "Nexus Precision Ergonomic Bluetooth Mouse",
          "quantity": 3,
          "unitPriceMinor": 3499,
          "taxAmountMinor": 2099,
          "totalPriceMinor": 10497,
          "isBackordered": false,
          "reservedQuantity": 3
        }
      ],
      "createdAt": "2026-11-05T03:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1021",
      "orderNumber": "NX-ORD-2026-021",
      "salesSource": "MANUAL",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "TechHub Retail Stores",
      "customerEmail": "purchasing@techhub.co.uk",
      "shippingAddress": {
        "name": "TechHub Central Inbound",
        "street": "9 Wharf Road",
        "city": "Leeds",
        "postalCode": "LS1 5QZ",
        "country": "GB"
      },
      "status": "Allocated",
      "paymentState": "PAID",
      "totalMinor": 7499,
      "taxMinor": 1500,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1021_1",
          "orderId": "ord_gen_1021",
          "productId": "prd_004",
          "sku": "NX-KEY-004",
          "productName": "Nexus RGB Mechanical Gaming Keyboard - Brown Switches",
          "quantity": 1,
          "unitPriceMinor": 7499,
          "taxAmountMinor": 1500,
          "totalPriceMinor": 7499,
          "isBackordered": false,
          "reservedQuantity": 1
        }
      ],
      "createdAt": "2026-11-05T08:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1022",
      "orderNumber": "NX-ORD-2026-022",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09432-2374",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Alexander Rossi",
      "customerEmail": "a.rossi@milano.it",
      "shippingAddress": {
        "name": "Alexander Rossi",
        "street": "Corso Buenos Aires 12",
        "city": "Milano",
        "postalCode": "20124",
        "country": "IT"
      },
      "status": "Allocated",
      "paymentState": "PAID",
      "totalMinor": 5998,
      "taxMinor": 1200,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1022_1",
          "orderId": "ord_gen_1022",
          "productId": "prd_005",
          "sku": "NX-HUB-005",
          "productName": "Nexus 8-in-1 Aluminum USB-C Hub 100W PD",
          "quantity": 2,
          "unitPriceMinor": 2999,
          "taxAmountMinor": 1200,
          "totalPriceMinor": 5998,
          "isBackordered": false,
          "reservedQuantity": 2
        }
      ],
      "createdAt": "2026-11-05T13:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1023",
      "orderNumber": "NX-ORD-2026-023",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09433-2391",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Fiona MacLeod",
      "customerEmail": "f.macleod@glasgow.ac.uk",
      "shippingAddress": {
        "name": "Fiona MacLeod",
        "street": "54 Buchanan Street",
        "city": "Glasgow",
        "postalCode": "G1 3HA",
        "country": "GB"
      },
      "status": "Confirmed",
      "paymentState": "PAID",
      "totalMinor": 29997,
      "taxMinor": 5999,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1023_1",
          "orderId": "ord_gen_1023",
          "productId": "prd_006",
          "sku": "NX-MIC-006",
          "productName": "Nexus Studio Broadcast USB Condenser Microphone",
          "quantity": 3,
          "unitPriceMinor": 9999,
          "taxAmountMinor": 5999,
          "totalPriceMinor": 29997,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-05T18:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1024",
      "orderNumber": "NX-ORD-2026-024",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09434-2408",
      "salesSource": "EBAY",
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "customerName": "Liam Murphy",
      "customerEmail": "liam.m@belfast.co.uk",
      "shippingAddress": {
        "name": "Liam Murphy",
        "street": "7 Donegall Square",
        "city": "Belfast",
        "postalCode": "BT1 5HD",
        "country": "GB"
      },
      "status": "Confirmed",
      "paymentState": "PAID",
      "totalMinor": 3999,
      "taxMinor": 800,
      "shippingChargeMinor": 499,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1024_1",
          "orderId": "ord_gen_1024",
          "productId": "prd_007",
          "sku": "NX-STAND-007",
          "productName": "Nexus Ergonomic Aluminum Laptop Riser Stand",
          "quantity": 1,
          "unitPriceMinor": 3999,
          "taxAmountMinor": 800,
          "totalPriceMinor": 3999,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-05T23:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1025",
      "orderNumber": "NX-ORD-2026-025",
      "marketplaceAccountId": "mkt_ebay_de",
      "externalOrderId": "19-09435-2425",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Oliver Smith",
      "customerEmail": "oliver.smith.gb@example.co.uk",
      "shippingAddress": {
        "name": "Oliver Smith",
        "street": "14 Kensington Church Street",
        "city": "London",
        "postalCode": "W8 4EP",
        "country": "GB"
      },
      "status": "Confirmed",
      "paymentState": "PAID",
      "totalMinor": 4998,
      "taxMinor": 1000,
      "shippingChargeMinor": 499,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1025_1",
          "orderId": "ord_gen_1025",
          "productId": "prd_008",
          "sku": "NX-CHG-008",
          "productName": "Nexus 65W GaN Fast Charger Dual USB-C",
          "quantity": 2,
          "unitPriceMinor": 2499,
          "taxAmountMinor": 1000,
          "totalPriceMinor": 4998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-06T04:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1026",
      "orderNumber": "NX-ORD-2026-026",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09436-2442",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Emily Watson",
      "customerEmail": "emily.watson@example.co.uk",
      "shippingAddress": {
        "name": "Emily Watson",
        "street": "88 George Street",
        "city": "Edinburgh",
        "postalCode": "EH2 3BU",
        "country": "GB"
      },
      "status": "Confirmed",
      "paymentState": "PAID",
      "totalMinor": 5997,
      "taxMinor": 1199,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1026_1",
          "orderId": "ord_gen_1026",
          "productId": "prd_009",
          "sku": "NX-CAB-009",
          "productName": "Nexus Thunderbolt 4 High Speed Braided Cable 1M",
          "quantity": 3,
          "unitPriceMinor": 1999,
          "taxAmountMinor": 1199,
          "totalPriceMinor": 5997,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-06T09:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1027",
      "orderNumber": "NX-ORD-2026-027",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09437-2459",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "James Henderson",
      "customerEmail": "j.henderson@example.co.uk",
      "shippingAddress": {
        "name": "James Henderson",
        "street": "12 Deansgate Arcade",
        "city": "Manchester",
        "postalCode": "M3 2BW",
        "country": "GB"
      },
      "status": "Confirmed",
      "paymentState": "PAID",
      "totalMinor": 7999,
      "taxMinor": 1600,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1027_1",
          "orderId": "ord_gen_1027",
          "productId": "prd_010",
          "sku": "NX-LIGHT-010",
          "productName": "Nexus Studio LED Key Light with Desk Clamp",
          "quantity": 1,
          "unitPriceMinor": 7999,
          "taxAmountMinor": 1600,
          "totalPriceMinor": 7999,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-06T14:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1028",
      "orderNumber": "NX-ORD-2026-028",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09438-2476",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Michael Chang",
      "customerEmail": "mchang@example.com",
      "shippingAddress": {
        "name": "Michael Chang",
        "street": "742 Evergreen Terrace",
        "city": "Springfield",
        "postalCode": "97477",
        "country": "US"
      },
      "status": "Cancelled",
      "paymentState": "VOIDED",
      "totalMinor": 21998,
      "taxMinor": 4400,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1028_1",
          "orderId": "ord_gen_1028",
          "productId": "prd_011",
          "sku": "NX-SSD-011",
          "productName": "Nexus Rugged 1TB Portable NVMe External SSD",
          "quantity": 2,
          "unitPriceMinor": 10999,
          "taxAmountMinor": 4400,
          "totalPriceMinor": 21998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-06T19:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1029",
      "orderNumber": "NX-ORD-2026-029",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09439-2493",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Chloe Bennett",
      "customerEmail": "chloe.b@example.co.uk",
      "shippingAddress": {
        "name": "Chloe Bennett",
        "street": "5 Victoria Square",
        "city": "Birmingham",
        "postalCode": "B1 1BD",
        "country": "GB"
      },
      "status": "Returned",
      "paymentState": "PAID",
      "totalMinor": 5397,
      "taxMinor": 1079,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1029_1",
          "orderId": "ord_gen_1029",
          "productId": "prd_012",
          "sku": "NX-PAD-012",
          "productName": "Nexus XL Spill-Proof Gaming Desk Mat (900x400mm)",
          "quantity": 3,
          "unitPriceMinor": 1799,
          "taxAmountMinor": 1079,
          "totalPriceMinor": 5397,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "notes": "Customer reported defective audio jack.",
      "createdAt": "2026-11-07T00:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1030",
      "orderNumber": "NX-ORD-2026-030",
      "marketplaceAccountId": "mkt_ebay_de",
      "externalOrderId": "19-09440-2510",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Hans Gruber",
      "customerEmail": "h.gruber@berlin-tech.de",
      "shippingAddress": {
        "name": "Hans Gruber",
        "street": "Friedrichstraße 43",
        "city": "Berlin",
        "postalCode": "10117",
        "country": "DE"
      },
      "status": "New",
      "paymentState": "PAID",
      "totalMinor": 4999,
      "taxMinor": 1000,
      "shippingChargeMinor": 499,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1030_1",
          "orderId": "ord_gen_1030",
          "productId": "prd_apex_01",
          "sku": "APX-SPK-100",
          "productName": "Apex SoundPulse Rugged Waterproof Speaker",
          "quantity": 1,
          "unitPriceMinor": 4999,
          "taxAmountMinor": 1000,
          "totalPriceMinor": 4999,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-07T05:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1031",
      "orderNumber": "NX-ORD-2026-031",
      "marketplaceAccountId": "mkt_ebay_uk",
      "externalOrderId": "19-09441-2527",
      "salesSource": "EBAY",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "customerName": "Sarah O'Connor",
      "customerEmail": "sarah.oc@dublin.ie",
      "shippingAddress": {
        "name": "Sarah O'Connor",
        "street": "22 Grafton Street",
        "city": "Dublin",
        "postalCode": "D02 K832",
        "country": "IE"
      },
      "status": "New",
      "paymentState": "PAID",
      "totalMinor": 10998,
      "taxMinor": 2200,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1031_1",
          "orderId": "ord_gen_1031",
          "productId": "prd_apex_02",
          "sku": "APX-EAR-200",
          "productName": "Apex PureBass Wireless Earbuds with ANC",
          "quantity": 2,
          "unitPriceMinor": 5499,
          "taxAmountMinor": 2200,
          "totalPriceMinor": 10998,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-07T10:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "ord_gen_1032",
      "orderNumber": "NX-ORD-2026-032",
      "marketplaceAccountId": "mkt_ebay_us",
      "externalOrderId": "19-09442-2544",
      "salesSource": "EBAY",
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "customerName": "Thomas Davies",
      "customerEmail": "t.davies@cardiff.co.uk",
      "shippingAddress": {
        "name": "Thomas Davies",
        "street": "18 St Mary Street",
        "city": "Cardiff",
        "postalCode": "CF10 1AU",
        "country": "GB"
      },
      "status": "New",
      "paymentState": "PAID",
      "totalMinor": 38997,
      "taxMinor": 7799,
      "shippingChargeMinor": 0,
      "currency": "GBP",
      "lines": [
        {
          "id": "ordl_ord_gen_1032_1",
          "orderId": "ord_gen_1032",
          "productId": "prd_bolt_01",
          "sku": "BLT-SND-10",
          "productName": "Bolt CinemaSound 120W Compact TV Soundbar",
          "quantity": 3,
          "unitPriceMinor": 12999,
          "taxAmountMinor": 7799,
          "totalPriceMinor": 38997,
          "isBackordered": false,
          "reservedQuantity": 0
        }
      ],
      "createdAt": "2026-11-07T15:21:20.992Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    }
  ],
  "orderHistories": [
    {
      "id": "hst_ord_gen_1001_1",
      "orderId": "ord_gen_1001",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-01T04:21:20.991Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1001_2",
      "orderId": "ord_gen_1001",
      "previousStatus": "New",
      "newStatus": "Delivered",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-01T06:21:20.991Z",
      "notes": "Order transitioned to Delivered."
    },
    {
      "id": "hst_ord_gen_1002_1",
      "orderId": "ord_gen_1002",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-01T09:21:20.991Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1002_2",
      "orderId": "ord_gen_1002",
      "previousStatus": "New",
      "newStatus": "Delivered",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-01T11:21:20.991Z",
      "notes": "Order transitioned to Delivered."
    },
    {
      "id": "hst_ord_gen_1003_1",
      "orderId": "ord_gen_1003",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-01T14:21:20.991Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1003_2",
      "orderId": "ord_gen_1003",
      "previousStatus": "New",
      "newStatus": "Delivered",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-01T16:21:20.991Z",
      "notes": "Order transitioned to Delivered."
    },
    {
      "id": "hst_ord_gen_1004_1",
      "orderId": "ord_gen_1004",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-01T19:21:20.991Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1004_2",
      "orderId": "ord_gen_1004",
      "previousStatus": "New",
      "newStatus": "Delivered",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-01T21:21:20.991Z",
      "notes": "Order transitioned to Delivered."
    },
    {
      "id": "hst_ord_gen_1005_1",
      "orderId": "ord_gen_1005",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-02T00:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1005_2",
      "orderId": "ord_gen_1005",
      "previousStatus": "New",
      "newStatus": "Delivered",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-02T02:21:20.992Z",
      "notes": "Order transitioned to Delivered."
    },
    {
      "id": "hst_ord_gen_1006_1",
      "orderId": "ord_gen_1006",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-02T05:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1006_2",
      "orderId": "ord_gen_1006",
      "previousStatus": "New",
      "newStatus": "Shipped",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-02T07:21:20.992Z",
      "notes": "Order transitioned to Shipped."
    },
    {
      "id": "hst_ord_gen_1007_1",
      "orderId": "ord_gen_1007",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-02T10:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1007_2",
      "orderId": "ord_gen_1007",
      "previousStatus": "New",
      "newStatus": "Shipped",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-02T12:21:20.992Z",
      "notes": "Order transitioned to Shipped."
    },
    {
      "id": "hst_ord_gen_1008_1",
      "orderId": "ord_gen_1008",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-02T15:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1008_2",
      "orderId": "ord_gen_1008",
      "previousStatus": "New",
      "newStatus": "Shipped",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-02T17:21:20.992Z",
      "notes": "Order transitioned to Shipped."
    },
    {
      "id": "hst_ord_gen_1009_1",
      "orderId": "ord_gen_1009",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-02T20:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1009_2",
      "orderId": "ord_gen_1009",
      "previousStatus": "New",
      "newStatus": "Shipped",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-02T22:21:20.992Z",
      "notes": "Order transitioned to Shipped."
    },
    {
      "id": "hst_ord_gen_1010_1",
      "orderId": "ord_gen_1010",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-03T01:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1010_2",
      "orderId": "ord_gen_1010",
      "previousStatus": "New",
      "newStatus": "Shipped",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-03T03:21:20.992Z",
      "notes": "Order transitioned to Shipped."
    },
    {
      "id": "hst_ord_gen_1011_1",
      "orderId": "ord_gen_1011",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-03T06:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1011_2",
      "orderId": "ord_gen_1011",
      "previousStatus": "New",
      "newStatus": "Packed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-03T08:21:20.992Z",
      "notes": "Order transitioned to Packed."
    },
    {
      "id": "hst_ord_gen_1012_1",
      "orderId": "ord_gen_1012",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-03T11:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1012_2",
      "orderId": "ord_gen_1012",
      "previousStatus": "New",
      "newStatus": "Packed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-03T13:21:20.992Z",
      "notes": "Order transitioned to Packed."
    },
    {
      "id": "hst_ord_gen_1013_1",
      "orderId": "ord_gen_1013",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-03T16:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1013_2",
      "orderId": "ord_gen_1013",
      "previousStatus": "New",
      "newStatus": "Packed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-03T18:21:20.992Z",
      "notes": "Order transitioned to Packed."
    },
    {
      "id": "hst_ord_gen_1014_1",
      "orderId": "ord_gen_1014",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-03T21:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1014_2",
      "orderId": "ord_gen_1014",
      "previousStatus": "New",
      "newStatus": "Packed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-03T23:21:20.992Z",
      "notes": "Order transitioned to Packed."
    },
    {
      "id": "hst_ord_gen_1015_1",
      "orderId": "ord_gen_1015",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-04T02:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1015_2",
      "orderId": "ord_gen_1015",
      "previousStatus": "New",
      "newStatus": "Picked",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-04T04:21:20.992Z",
      "notes": "Order transitioned to Picked."
    },
    {
      "id": "hst_ord_gen_1016_1",
      "orderId": "ord_gen_1016",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-04T07:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1016_2",
      "orderId": "ord_gen_1016",
      "previousStatus": "New",
      "newStatus": "Picked",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-04T09:21:20.992Z",
      "notes": "Order transitioned to Picked."
    },
    {
      "id": "hst_ord_gen_1017_1",
      "orderId": "ord_gen_1017",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-04T12:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1017_2",
      "orderId": "ord_gen_1017",
      "previousStatus": "New",
      "newStatus": "Picked",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-04T14:21:20.992Z",
      "notes": "Order transitioned to Picked."
    },
    {
      "id": "hst_ord_gen_1018_1",
      "orderId": "ord_gen_1018",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-04T17:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1018_2",
      "orderId": "ord_gen_1018",
      "previousStatus": "New",
      "newStatus": "Picked",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-04T19:21:20.992Z",
      "notes": "Order transitioned to Picked."
    },
    {
      "id": "hst_ord_gen_1019_1",
      "orderId": "ord_gen_1019",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-04T22:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1019_2",
      "orderId": "ord_gen_1019",
      "previousStatus": "New",
      "newStatus": "Allocated",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-05T00:21:20.992Z",
      "notes": "Order transitioned to Allocated."
    },
    {
      "id": "hst_ord_gen_1020_1",
      "orderId": "ord_gen_1020",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-05T03:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1020_2",
      "orderId": "ord_gen_1020",
      "previousStatus": "New",
      "newStatus": "Allocated",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-05T05:21:20.992Z",
      "notes": "Order transitioned to Allocated."
    },
    {
      "id": "hst_ord_gen_1021_1",
      "orderId": "ord_gen_1021",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-05T08:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1021_2",
      "orderId": "ord_gen_1021",
      "previousStatus": "New",
      "newStatus": "Allocated",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-05T10:21:20.992Z",
      "notes": "Order transitioned to Allocated."
    },
    {
      "id": "hst_ord_gen_1022_1",
      "orderId": "ord_gen_1022",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-05T13:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1022_2",
      "orderId": "ord_gen_1022",
      "previousStatus": "New",
      "newStatus": "Allocated",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-05T15:21:20.992Z",
      "notes": "Order transitioned to Allocated."
    },
    {
      "id": "hst_ord_gen_1023_1",
      "orderId": "ord_gen_1023",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-05T18:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1023_2",
      "orderId": "ord_gen_1023",
      "previousStatus": "New",
      "newStatus": "Confirmed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-05T20:21:20.992Z",
      "notes": "Order transitioned to Confirmed."
    },
    {
      "id": "hst_ord_gen_1024_1",
      "orderId": "ord_gen_1024",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-05T23:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1024_2",
      "orderId": "ord_gen_1024",
      "previousStatus": "New",
      "newStatus": "Confirmed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-06T01:21:20.992Z",
      "notes": "Order transitioned to Confirmed."
    },
    {
      "id": "hst_ord_gen_1025_1",
      "orderId": "ord_gen_1025",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-06T04:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1025_2",
      "orderId": "ord_gen_1025",
      "previousStatus": "New",
      "newStatus": "Confirmed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-06T06:21:20.992Z",
      "notes": "Order transitioned to Confirmed."
    },
    {
      "id": "hst_ord_gen_1026_1",
      "orderId": "ord_gen_1026",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-06T09:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1026_2",
      "orderId": "ord_gen_1026",
      "previousStatus": "New",
      "newStatus": "Confirmed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-06T11:21:20.992Z",
      "notes": "Order transitioned to Confirmed."
    },
    {
      "id": "hst_ord_gen_1027_1",
      "orderId": "ord_gen_1027",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-06T14:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1027_2",
      "orderId": "ord_gen_1027",
      "previousStatus": "New",
      "newStatus": "Confirmed",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-06T16:21:20.992Z",
      "notes": "Order transitioned to Confirmed."
    },
    {
      "id": "hst_ord_gen_1028_1",
      "orderId": "ord_gen_1028",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-06T19:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1028_2",
      "orderId": "ord_gen_1028",
      "previousStatus": "New",
      "newStatus": "Cancelled",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-06T21:21:20.992Z",
      "notes": "Order transitioned to Cancelled."
    },
    {
      "id": "hst_ord_gen_1029_1",
      "orderId": "ord_gen_1029",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-07T00:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1029_2",
      "orderId": "ord_gen_1029",
      "previousStatus": "New",
      "newStatus": "Returned",
      "changedBy": "usr_opsmanager",
      "timestamp": "2026-11-07T02:21:20.992Z",
      "notes": "Order transitioned to Returned."
    },
    {
      "id": "hst_ord_gen_1030_1",
      "orderId": "ord_gen_1030",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-07T05:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1031_1",
      "orderId": "ord_gen_1031",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-07T10:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    },
    {
      "id": "hst_ord_gen_1032_1",
      "orderId": "ord_gen_1032",
      "previousStatus": "None",
      "newStatus": "New",
      "changedBy": "ebay_sync_worker",
      "timestamp": "2026-11-07T15:21:20.992Z",
      "notes": "Order captured via marketplace synchronization API."
    }
  ],
  "warehouses": [
    {
      "id": "wh_main",
      "name": "Nexus Central Fulfillment Hub",
      "code": "WH-01",
      "address": "Unit 4, Gateway Logistics Park, Milton Keynes, MK17 8EB, UK",
      "isActive": true
    },
    {
      "id": "wh_north",
      "name": "Nexus Northern Distribution Centre",
      "code": "WH-02",
      "address": "Bay 12, Trafford Industrial Estate, Manchester, M17 1TN, UK",
      "isActive": true
    },
    {
      "id": "wh_south",
      "name": "Nexus Express London Cross-Dock",
      "code": "WH-03",
      "address": "Heathrow Cargo Point, Hounslow, TW6 3RT, UK",
      "isActive": true
    }
  ],
  "locations": [
    {
      "id": "loc_a1",
      "warehouseId": "wh_main",
      "zone": "Zone A",
      "aisle": "A1",
      "shelf": "S01",
      "bin": "B01",
      "type": "SHELF",
      "capacityUnits": 600,
      "isActive": true
    },
    {
      "id": "loc_a2",
      "warehouseId": "wh_main",
      "zone": "Zone A",
      "aisle": "A1",
      "shelf": "S02",
      "bin": "B02",
      "type": "SHELF",
      "capacityUnits": 600,
      "isActive": true
    },
    {
      "id": "loc_a3",
      "warehouseId": "wh_main",
      "zone": "Zone A",
      "aisle": "A2",
      "shelf": "S01",
      "bin": "B03",
      "type": "SHELF",
      "capacityUnits": 800,
      "isActive": true
    },
    {
      "id": "loc_a4",
      "warehouseId": "wh_main",
      "zone": "Zone A",
      "aisle": "A2",
      "shelf": "S02",
      "bin": "B04",
      "type": "SHELF",
      "capacityUnits": 800,
      "isActive": true
    },
    {
      "id": "loc_b1",
      "warehouseId": "wh_main",
      "zone": "Zone B",
      "aisle": "B1",
      "shelf": "S01",
      "bin": "P01",
      "type": "PALLET",
      "capacityUnits": 2500,
      "isActive": true
    },
    {
      "id": "loc_b2",
      "warehouseId": "wh_main",
      "zone": "Zone B",
      "aisle": "B2",
      "shelf": "S01",
      "bin": "P02",
      "type": "PALLET",
      "capacityUnits": 2500,
      "isActive": true
    },
    {
      "id": "loc_b3",
      "warehouseId": "wh_main",
      "zone": "Zone B",
      "aisle": "B3",
      "shelf": "S01",
      "bin": "P03",
      "type": "PALLET",
      "capacityUnits": 3000,
      "isActive": true
    },
    {
      "id": "loc_c1",
      "warehouseId": "wh_north",
      "zone": "Bulk Mezzanine",
      "aisle": "M1",
      "shelf": "S01",
      "bin": "BM01",
      "type": "SHELF",
      "capacityUnits": 1500,
      "isActive": true
    },
    {
      "id": "loc_c2",
      "warehouseId": "wh_north",
      "zone": "Bulk Mezzanine",
      "aisle": "M2",
      "shelf": "S01",
      "bin": "BM02",
      "type": "SHELF",
      "capacityUnits": 1500,
      "isActive": true
    },
    {
      "id": "loc_dmg",
      "warehouseId": "wh_main",
      "zone": "Quarantine",
      "aisle": "Q1",
      "shelf": "S01",
      "bin": "Q-DMG",
      "type": "BIN",
      "capacityUnits": 200,
      "isActive": true
    },
    {
      "id": "loc_ret",
      "warehouseId": "wh_main",
      "zone": "Returns Bay",
      "aisle": "R1",
      "shelf": "S01",
      "bin": "R-INSP",
      "type": "BIN",
      "capacityUnits": 300,
      "isActive": true
    }
  ],
  "stockLedger": [
    {
      "id": "led_prd_001_initial",
      "productId": "prd_001",
      "sku": "NX-AUD-001",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 50,
      "unitCostMinor": 3800,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_002_initial",
      "productId": "prd_002",
      "sku": "NX-CAM-002",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 55,
      "unitCostMinor": 2400,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_003_initial",
      "productId": "prd_003",
      "sku": "NX-MOU-003",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 60,
      "unitCostMinor": 1250,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_004_initial",
      "productId": "prd_004",
      "sku": "NX-KEY-004",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 65,
      "unitCostMinor": 3100,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_005_initial",
      "productId": "prd_005",
      "sku": "NX-HUB-005",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 70,
      "unitCostMinor": 1100,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_006_initial",
      "productId": "prd_006",
      "sku": "NX-MIC-006",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 75,
      "unitCostMinor": 4200,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_007_initial",
      "productId": "prd_007",
      "sku": "NX-STAND-007",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 80,
      "unitCostMinor": 1450,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_008_initial",
      "productId": "prd_008",
      "sku": "NX-CHG-008",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 85,
      "unitCostMinor": 950,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_009_initial",
      "productId": "prd_009",
      "sku": "NX-CAB-009",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 90,
      "unitCostMinor": 680,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_010_initial",
      "productId": "prd_010",
      "sku": "NX-LIGHT-010",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 95,
      "unitCostMinor": 3400,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_011_initial",
      "productId": "prd_011",
      "sku": "NX-SSD-011",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 100,
      "unitCostMinor": 4800,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_012_initial",
      "productId": "prd_012",
      "sku": "NX-PAD-012",
      "ownerType": "OPERATOR",
      "ownerId": "operator",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 105,
      "unitCostMinor": 580,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_apex_01_initial",
      "productId": "prd_apex_01",
      "sku": "APX-SPK-100",
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 110,
      "unitCostMinor": 1950,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_apex_02_initial",
      "productId": "prd_apex_02",
      "sku": "APX-EAR-200",
      "ownerType": "CLIENT",
      "ownerId": "client_apex",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 115,
      "unitCostMinor": 2100,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_bolt_01_initial",
      "productId": "prd_bolt_01",
      "sku": "BLT-SND-10",
      "ownerType": "CLIENT",
      "ownerId": "client_bolt",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 120,
      "unitCostMinor": 5200,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_luma_01_initial",
      "productId": "prd_luma_01",
      "sku": "LUM-CAM-01",
      "ownerType": "CLIENT",
      "ownerId": "client_luma",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 125,
      "unitCostMinor": 1650,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "led_prd_nordic_01_initial",
      "productId": "prd_nordic_01",
      "sku": "NRD-WRM-01",
      "ownerType": "CLIENT",
      "ownerId": "client_nordic",
      "transactionType": "OPENING_BALANCE",
      "stateFrom": "NONE",
      "stateTo": "ON_HAND",
      "quantity": 130,
      "unitCostMinor": 3100,
      "sourceDocumentType": "INITIAL_IMPORT",
      "sourceDocumentId": "SYS_BOOT",
      "performedByUserId": "usr_superadmin",
      "warehouseId": "wh_main",
      "locationId": "loc_a1",
      "notes": "Opening stock ledger baseline balance.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    }
  ],
  "stockAdjustments": [
    {
      "id": "adj_001",
      "adjustmentNumber": "ADJ-2026-001",
      "productId": "prd_001",
      "sku": "NX-AUD-001",
      "quantityDelta": -2,
      "stateTarget": "DAMAGED",
      "targetState": "DAMAGED",
      "reasonCode": "DAMAGED_IN_TRANSIT",
      "status": "APPROVED",
      "requestedBy": "Jack Miller (Warehouse Staff)",
      "requestedByUserId": "usr_warehouse",
      "approvedBy": "Marcus Reid (Ops Manager)",
      "reviewedByUserId": "usr_opsmanager",
      "reviewedAt": "2026-11-04T15:21:20.991Z",
      "evaluatedValueMinor": 7600,
      "approvalNote": "Approved: Scratched chassis on warehouse pallet transit.",
      "createdAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "adj_002",
      "adjustmentNumber": "ADJ-2026-002",
      "productId": "prd_002",
      "sku": "NX-CAM-002",
      "quantityDelta": 5,
      "stateTarget": "ON_HAND",
      "targetState": "ON_HAND",
      "reasonCode": "COUNT_DISCREPANCY_SURPLUS",
      "status": "PENDING_APPROVAL",
      "requestedBy": "Jack Miller (Warehouse Staff)",
      "requestedByUserId": "usr_warehouse",
      "evaluatedValueMinor": 12000,
      "approvalNote": "Discovered surplus box during routine quarterly cycle count.",
      "createdAt": "2026-11-06T15:21:20.991Z"
    },
    {
      "id": "adj_003",
      "adjustmentNumber": "ADJ-2026-003",
      "productId": "prd_004",
      "sku": "NX-KEY-004",
      "quantityDelta": -1,
      "stateTarget": "DAMAGED",
      "targetState": "DAMAGED",
      "reasonCode": "QUALITY_ASSURANCE_REJECT",
      "status": "APPROVED",
      "requestedBy": "Jack Miller (Warehouse Staff)",
      "requestedByUserId": "usr_warehouse",
      "approvedBy": "Marcus Reid (Ops Manager)",
      "reviewedByUserId": "usr_opsmanager",
      "reviewedAt": "2026-11-06T15:21:20.991Z",
      "evaluatedValueMinor": 3100,
      "approvalNote": "Spacebar key switch sticky, sent to scrap write-off.",
      "createdAt": "2026-11-06T15:21:20.991Z"
    }
  ],
  "suppliers": [
    {
      "id": "sup_anker",
      "name": "Anker Innovations Technology Ltd",
      "code": "SUP-ANK",
      "contactName": "Kevin Zhang",
      "email": "orders.eu@anker-innovations.com",
      "phone": "+44 800 031 8188",
      "paymentTermsDays": 30,
      "leadTimeDays": 7,
      "currency": "GBP",
      "address": "Building 3, Chiswick Park, London, W4 5YA",
      "status": "ACTIVE",
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "sup_ugreen",
      "name": "Ugreen Group International",
      "code": "SUP-UGR",
      "contactName": "Linda Liu",
      "email": "b2b.uk@ugreen.com",
      "phone": "+44 20 8921 5500",
      "paymentTermsDays": 30,
      "leadTimeDays": 5,
      "currency": "GBP",
      "address": "Unit 9, Northfield Industrial Estate, Wembley, HA0 1NW",
      "status": "ACTIVE",
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "sup_logitech",
      "name": "Logitech Europe S.A.",
      "code": "SUP-LOG",
      "contactName": "Martin Dubois",
      "email": "uk-distro@logitech.com",
      "phone": "+44 1753 870900",
      "paymentTermsDays": 45,
      "leadTimeDays": 4,
      "currency": "GBP",
      "address": "St Martins House, The Crescent, Slough, SL1 2FL",
      "status": "ACTIVE",
      "createdAt": "2026-11-01T15:21:20.991Z"
    },
    {
      "id": "sup_baseus",
      "name": "Baseus Global Supply Co",
      "code": "SUP-BAS",
      "contactName": "Chloe Wang",
      "email": "eu-sales@baseus.com",
      "phone": "+44 20 7183 9920",
      "paymentTermsDays": 14,
      "leadTimeDays": 8,
      "currency": "GBP",
      "address": "Eastgate Business Park, Bristol, BS5 6XX",
      "status": "ACTIVE",
      "createdAt": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "sup_belkin",
      "name": "Belkin International UK",
      "code": "SUP-BEL",
      "contactName": "Simon Wright",
      "email": "ukorders@belkin.com",
      "phone": "+44 1933 678888",
      "paymentTermsDays": 30,
      "leadTimeDays": 6,
      "currency": "GBP",
      "address": "Express Park, Shipton Way, Rushden, NN10 6GL",
      "status": "ACTIVE",
      "createdAt": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "sup_corsair",
      "name": "Corsair Gaming UK Ltd",
      "code": "SUP-COR",
      "contactName": "Alex Mercer",
      "email": "orders.uk@corsair.com",
      "phone": "+44 118 977 4000",
      "paymentTermsDays": 30,
      "leadTimeDays": 5,
      "currency": "GBP",
      "address": "100 Longwater Avenue, Green Park, Reading, RG2 6GP",
      "status": "ACTIVE",
      "createdAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "sup_tplink",
      "name": "TP-Link UK Technology Co",
      "code": "SUP-TPL",
      "contactName": "Jason Reed",
      "email": "b2b.uk@tp-link.com",
      "phone": "+44 845 147 0017",
      "paymentTermsDays": 30,
      "leadTimeDays": 3,
      "currency": "GBP",
      "address": "Building 2, Riverdale Office Park, Reading, RG6 1PT",
      "status": "ACTIVE",
      "createdAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "sup_samsung",
      "name": "Samsung Electronics UK B2B",
      "code": "SUP-SAM",
      "contactName": "David Evans",
      "email": "distro.uk@samsung.com",
      "phone": "+44 330 726 7864",
      "paymentTermsDays": 60,
      "leadTimeDays": 4,
      "currency": "GBP",
      "address": "Samsung House, 2000 Hillswood Drive, Chertsey, KT16 0RS",
      "status": "ACTIVE",
      "createdAt": "2026-11-04T15:21:20.991Z"
    }
  ],
  "purchaseOrders": [
    {
      "id": "po_001",
      "poNumber": "NX-PO-2026-001",
      "supplierId": "sup_anker",
      "supplierName": "Anker Innovations Technology Ltd",
      "destinationWarehouseId": "wh_main",
      "status": "RECEIVED",
      "totalMinor": 190000,
      "currency": "GBP",
      "lines": [
        {
          "id": "pol_1",
          "poId": "po_001",
          "productId": "prd_001",
          "sku": "NX-AUD-001",
          "productName": "Nexus Pro Active Noise-Cancelling Headphones",
          "orderedQty": 50,
          "receivedQty": 50,
          "unitCostMinor": 3800,
          "lineTotalMinor": 190000
        }
      ],
      "expectedDeliveryDate": "2026-11-02T15:21:20.991Z",
      "actualDeliveryDate": "2026-11-03T15:21:20.991Z",
      "createdAt": "2026-10-31T15:21:20.991Z",
      "updatedAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "po_002",
      "poNumber": "NX-PO-2026-002",
      "supplierId": "sup_ugreen",
      "supplierName": "Ugreen Group International",
      "destinationWarehouseId": "wh_main",
      "status": "PARTIAL_RECEIVED",
      "totalMinor": 82500,
      "currency": "GBP",
      "lines": [
        {
          "id": "pol_2",
          "poId": "po_002",
          "productId": "prd_005",
          "sku": "NX-HUB-005",
          "productName": "Nexus 8-in-1 Aluminum USB-C Hub 100W PD",
          "orderedQty": 75,
          "receivedQty": 50,
          "unitCostMinor": 1100,
          "lineTotalMinor": 82500
        }
      ],
      "expectedDeliveryDate": "2026-11-06T15:21:20.991Z",
      "actualDeliveryDate": "2026-11-07T15:21:20.991Z",
      "createdAt": "2026-11-02T15:21:20.991Z",
      "updatedAt": "2026-11-07T15:21:20.991Z"
    },
    {
      "id": "po_003",
      "poNumber": "NX-PO-2026-003",
      "supplierId": "sup_logitech",
      "supplierName": "Logitech Europe S.A.",
      "destinationWarehouseId": "wh_main",
      "status": "APPROVED",
      "totalMinor": 125000,
      "currency": "GBP",
      "lines": [
        {
          "id": "pol_3",
          "poId": "po_003",
          "productId": "prd_003",
          "sku": "NX-MOU-003",
          "productName": "Nexus Precision Ergonomic Bluetooth Mouse",
          "orderedQty": 100,
          "receivedQty": 0,
          "unitCostMinor": 1250,
          "lineTotalMinor": 125000
        }
      ],
      "expectedDeliveryDate": "2026-11-10T15:21:20.992Z",
      "createdAt": "2026-11-04T15:21:20.991Z",
      "updatedAt": "2026-11-05T15:21:20.991Z"
    },
    {
      "id": "po_004",
      "poNumber": "NX-PO-2026-004",
      "supplierId": "sup_baseus",
      "supplierName": "Baseus Global Supply Co",
      "destinationWarehouseId": "wh_main",
      "status": "DRAFT",
      "totalMinor": 47500,
      "currency": "GBP",
      "lines": [
        {
          "id": "pol_4",
          "poId": "po_004",
          "productId": "prd_008",
          "sku": "NX-CHG-008",
          "productName": "Nexus 65W GaN Fast Charger Dual USB-C",
          "orderedQty": 50,
          "receivedQty": 0,
          "unitCostMinor": 950,
          "lineTotalMinor": 47500
        }
      ],
      "expectedDeliveryDate": "2026-11-14T15:21:20.992Z",
      "createdAt": "2026-11-06T15:21:20.991Z",
      "updatedAt": "2026-11-06T15:21:20.991Z"
    },
    {
      "id": "po_005",
      "poNumber": "NX-PO-2026-005",
      "supplierId": "sup_corsair",
      "supplierName": "Corsair Gaming UK Ltd",
      "destinationWarehouseId": "wh_north",
      "status": "SUBMITTED",
      "totalMinor": 93000,
      "currency": "GBP",
      "lines": [
        {
          "id": "pol_5",
          "poId": "po_005",
          "productId": "prd_004",
          "sku": "NX-KEY-004",
          "productName": "Nexus RGB Mechanical Gaming Keyboard - Brown Switches",
          "orderedQty": 30,
          "receivedQty": 0,
          "unitCostMinor": 3100,
          "lineTotalMinor": 93000
        }
      ],
      "expectedDeliveryDate": "2026-11-12T15:21:20.992Z",
      "createdAt": "2026-11-05T15:21:20.991Z",
      "updatedAt": "2026-11-05T15:21:20.991Z"
    },
    {
      "id": "po_006",
      "poNumber": "NX-PO-2026-006",
      "supplierId": "sup_samsung",
      "supplierName": "Samsung Electronics UK B2B",
      "destinationWarehouseId": "wh_main",
      "status": "APPROVED",
      "totalMinor": 240000,
      "currency": "GBP",
      "lines": [
        {
          "id": "pol_6",
          "poId": "po_006",
          "productId": "prd_011",
          "sku": "NX-SSD-011",
          "productName": "Nexus Rugged 1TB Portable NVMe External SSD",
          "orderedQty": 50,
          "receivedQty": 0,
          "unitCostMinor": 4800,
          "lineTotalMinor": 240000
        }
      ],
      "expectedDeliveryDate": "2026-11-11T15:21:20.992Z",
      "createdAt": "2026-11-04T15:21:20.991Z",
      "updatedAt": "2026-11-05T15:21:20.991Z"
    }
  ],
  "goodsReceipts": [],
  "returns": [
    {
      "id": "ret_001",
      "returnNumber": "NX-RET-2026-001",
      "orderId": "ord_gen_1001",
      "orderNumber": "NX-ORD-2026-001",
      "customerName": "Oliver Smith",
      "reasonCode": "DEFECTIVE",
      "status": "INSPECTED",
      "refundStatus": "ISSUED",
      "refundAmountMinor": 8999,
      "totalRefundMinor": 8999,
      "lines": [
        {
          "id": "retl_1",
          "returnId": "ret_001",
          "productId": "prd_001",
          "sku": "NX-AUD-001",
          "quantity": 1,
          "reason": "Customer reported sound distortion in left ear cup",
          "disposition": "DAMAGED",
          "refundAmountMinor": 8999
        }
      ],
      "receivedAt": "2026-11-03T15:21:20.991Z",
      "inspectedAt": "2026-11-04T15:21:20.991Z",
      "inspectionNotes": "Verified internal driver crack. Written off to damaged inventory.",
      "createdAt": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "ret_002",
      "returnNumber": "NX-RET-2026-002",
      "orderId": "ord_gen_1002",
      "orderNumber": "NX-ORD-2026-002",
      "customerName": "Emily Watson",
      "reasonCode": "CHANGED_MIND",
      "status": "CLOSED",
      "refundStatus": "ISSUED",
      "refundAmountMinor": 3499,
      "totalRefundMinor": 3499,
      "lines": [
        {
          "id": "retl_2",
          "returnId": "ret_002",
          "productId": "prd_003",
          "sku": "NX-MOU-003",
          "quantity": 1,
          "reason": "Unopened - Buyer changed mind",
          "disposition": "RESTOCK",
          "refundAmountMinor": 3499
        }
      ],
      "receivedAt": "2026-11-04T15:21:20.991Z",
      "inspectedAt": "2026-11-05T15:21:20.991Z",
      "inspectionNotes": "Sealed factory packaging. Re-stocked to Zone A bin B03.",
      "createdAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "ret_003",
      "returnNumber": "NX-RET-2026-003",
      "orderId": "ord_gen_1003",
      "orderNumber": "NX-ORD-2026-003",
      "customerName": "James Henderson",
      "reasonCode": "DAMAGED_TRANSIT",
      "status": "RECEIVED",
      "refundStatus": "PENDING",
      "refundAmountMinor": 2999,
      "totalRefundMinor": 2999,
      "lines": [
        {
          "id": "retl_3",
          "returnId": "ret_003",
          "productId": "prd_005",
          "sku": "NX-HUB-005",
          "quantity": 1,
          "reason": "HDMI port not displaying 4K 60Hz",
          "disposition": "QUARANTINE",
          "refundAmountMinor": 2999
        }
      ],
      "receivedAt": "2026-11-06T15:21:20.991Z",
      "inspectionNotes": "Awaiting technical bench QA test.",
      "createdAt": "2026-11-05T15:21:20.991Z"
    }
  ],
  "clients": [
    {
      "id": "client_apex",
      "companyName": "Apex Electronics Ltd",
      "code": "APEX",
      "contactEmail": "logistics@apex-electronics.com",
      "contactPhone": "+44 20 7946 0912",
      "billingAddress": "42 High Holborn, London, WC1V 6EA",
      "billingPeriod": "MONTHLY",
      "rateCardId": "rc_std_3pl",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "client_bolt",
      "companyName": "Bolt Sound & Vision Ltd",
      "code": "BOLT",
      "contactEmail": "operations@boltsound.co.uk",
      "contactPhone": "+44 121 496 0382",
      "billingAddress": "88 Colmore Row, Birmingham, B3 2BB",
      "billingPeriod": "MONTHLY",
      "rateCardId": "rc_premium_3pl",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "client_luma",
      "companyName": "Luma Smart Home Devices",
      "code": "LUMA",
      "contactEmail": "supply@lumahome.com",
      "contactPhone": "+44 113 496 0841",
      "billingAddress": "15 Wellington Place, Leeds, LS1 4AP",
      "billingPeriod": "MONTHLY",
      "rateCardId": "rc_std_3pl",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-11-01T15:21:20.991Z"
    },
    {
      "id": "client_nordic",
      "companyName": "Nordic Goods Trading Oy",
      "code": "NORD",
      "contactEmail": "contact@nordicgoods.co.uk",
      "contactPhone": "+44 161 496 0188",
      "billingAddress": "15 Oxford Road, Manchester, M1 5AN",
      "billingPeriod": "MONTHLY",
      "rateCardId": "rc_std_3pl",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "client_stellar",
      "companyName": "Stellar Gadgets Europe B.V.",
      "code": "STEL",
      "contactEmail": "fulfilment@stellargadgets.eu",
      "contactPhone": "+31 20 794 8812",
      "billingAddress": "Keizersgracht 421, 1016 EK Amsterdam, Netherlands",
      "billingPeriod": "MONTHLY",
      "rateCardId": "rc_premium_3pl",
      "accountStatus": "ACTIVE",
      "createdAt": "2026-11-03T15:21:20.991Z"
    }
  ],
  "rateCards": [
    {
      "id": "rc_std_3pl",
      "name": "Standard 3PL Commercial Rate Card v2026",
      "pickFeeMinor": 150,
      "packFeeMinor": 100,
      "extraItemFeeMinor": 40,
      "storagePalletPerMonthMinor": 1800,
      "storageShelfPerMonthMinor": 600,
      "storageBinPerMonthMinor": 250,
      "minimumMonthlyChargeMinor": 15000
    },
    {
      "id": "rc_premium_3pl",
      "name": "Premium High-Velocity Rate Card v2026",
      "pickFeeMinor": 120,
      "packFeeMinor": 80,
      "extraItemFeeMinor": 30,
      "storagePalletPerMonthMinor": 1500,
      "storageShelfPerMonthMinor": 500,
      "storageBinPerMonthMinor": 200,
      "minimumMonthlyChargeMinor": 30000
    }
  ],
  "storageSnapshots": [],
  "invoices": [
    {
      "id": "inv_001",
      "invoiceNumber": "INV-2026-001",
      "clientId": "client_apex",
      "clientName": "Apex Electronics Ltd",
      "issueDate": "2026-11-02T15:21:20.991Z",
      "dueDate": "2026-12-02T15:21:20.992Z",
      "subtotalMinor": 30000,
      "vatMinor": 6000,
      "totalMinor": 36000,
      "status": "PAID",
      "lines": [
        {
          "description": "3PL Pick & Pack Fulfilment Services (120 parcels)",
          "quantity": 120,
          "unitPriceMinor": 150,
          "totalMinor": 18000
        },
        {
          "description": "Monthly Pallet Storage (Zone B Racking - 5 pallets)",
          "quantity": 5,
          "unitPriceMinor": 2400,
          "totalMinor": 12000
        }
      ],
      "currency": "GBP",
      "createdAt": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "inv_002",
      "invoiceNumber": "INV-2026-002",
      "clientId": "client_bolt",
      "clientName": "Bolt Sound & Vision Ltd",
      "issueDate": "2026-11-03T15:21:20.991Z",
      "dueDate": "2026-11-27T15:21:20.992Z",
      "subtotalMinor": 48000,
      "vatMinor": 9600,
      "totalMinor": 57600,
      "status": "ISSUED",
      "lines": [
        {
          "description": "Soundbar Fulfilment & Heavy Courier Dispatch (40 units)",
          "quantity": 40,
          "unitPriceMinor": 600,
          "totalMinor": 24000
        },
        {
          "description": "Bulk Pallet Space (Zone B - 10 Pallet bays)",
          "quantity": 10,
          "unitPriceMinor": 2400,
          "totalMinor": 24000
        }
      ],
      "currency": "GBP",
      "createdAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "inv_003",
      "invoiceNumber": "INV-2026-003",
      "clientId": "client_luma",
      "clientName": "Luma Smart Home Devices",
      "issueDate": "2026-11-04T15:21:20.991Z",
      "dueDate": "2026-11-22T15:21:20.992Z",
      "subtotalMinor": 18000,
      "vatMinor": 3600,
      "totalMinor": 21600,
      "status": "ISSUED",
      "lines": [
        {
          "description": "Smart Camera Pick & Custom Serial Scan (80 units)",
          "quantity": 80,
          "unitPriceMinor": 150,
          "totalMinor": 12000
        },
        {
          "description": "Small Bin Secure Storage (6 Bins)",
          "quantity": 6,
          "unitPriceMinor": 1000,
          "totalMinor": 6000
        }
      ],
      "currency": "GBP",
      "createdAt": "2026-11-04T15:21:20.991Z"
    },
    {
      "id": "inv_004",
      "invoiceNumber": "INV-2026-004",
      "clientId": "client_nordic",
      "clientName": "Nordic Goods Trading Oy",
      "issueDate": "2026-11-05T15:21:20.991Z",
      "dueDate": "2026-12-05T15:21:20.992Z",
      "subtotalMinor": 22000,
      "vatMinor": 4400,
      "totalMinor": 26400,
      "status": "ISSUED",
      "lines": [
        {
          "description": "Eco Throw Blanket Fulfilment & Polybagging (50 units)",
          "quantity": 50,
          "unitPriceMinor": 200,
          "totalMinor": 10000
        },
        {
          "description": "High-Bay Pallet Reserve (5 Pallets)",
          "quantity": 5,
          "unitPriceMinor": 2400,
          "totalMinor": 12000
        }
      ],
      "currency": "GBP",
      "createdAt": "2026-11-05T15:21:20.991Z"
    }
  ],
  "payments": [
    {
      "id": "pay_001",
      "paymentNumber": "PAY-2026-001",
      "invoiceId": "inv_001",
      "amountMinor": 36000,
      "paymentDate": "2026-11-03T15:21:20.991Z",
      "paymentMethod": "BANK_TRANSFER",
      "method": "BANK_TRANSFER",
      "reference": "BACS-APEX-INV001",
      "payerName": "Apex Electronics Ltd",
      "allocations": [
        {
          "invoiceId": "inv_001",
          "invoiceNumber": "NX-INV-2026-001",
          "amountMinor": 36000
        }
      ],
      "unallocatedCreditMinor": 0,
      "recordedBy": "Elena Rostova (Finance)",
      "currency": "GBP",
      "createdAt": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "pay_002",
      "paymentNumber": "PAY-2026-002",
      "invoiceId": "inv_002",
      "amountMinor": 25000,
      "paymentDate": "2026-11-05T15:21:20.991Z",
      "paymentMethod": "BANK_TRANSFER",
      "method": "BANK_TRANSFER",
      "reference": "CHAPS-BOLT-PARTIAL",
      "payerName": "Bolt Gear Ltd",
      "allocations": [
        {
          "invoiceId": "inv_002",
          "invoiceNumber": "NX-INV-2026-002",
          "amountMinor": 25000
        }
      ],
      "unallocatedCreditMinor": 0,
      "recordedBy": "Elena Rostova (Finance)",
      "currency": "GBP",
      "createdAt": "2026-11-05T15:21:20.991Z"
    }
  ],
  "expenses": [
    {
      "id": "exp_001",
      "category": "CARRIER_POSTAGE",
      "description": "Royal Mail Wholesale Account Weekly Dispatch Statement",
      "amountMinor": 145000,
      "vatMinor": 0,
      "date": "2026-11-02T15:21:20.991Z",
      "paymentMethod": "DIRECT_DEBIT",
      "reference": "RM-INV-881920"
    },
    {
      "id": "exp_002",
      "category": "PACKAGING",
      "description": "Rajapack Recycled Cardboard Boxes & Bubble Mailers",
      "amountMinor": 48000,
      "vatMinor": 9600,
      "date": "2026-11-03T15:21:20.991Z",
      "paymentMethod": "CREDIT_CARD",
      "reference": "RAJA-UK-44192"
    },
    {
      "id": "exp_003",
      "category": "MARKETPLACE_FEES",
      "description": "eBay UK Monthly Final Value & Ad Promotion Fees",
      "amountMinor": 89200,
      "vatMinor": 0,
      "date": "2026-11-04T15:21:20.991Z",
      "paymentMethod": "AUTO_SETTLEMENT",
      "reference": "EBAY-STMT-2026-11"
    },
    {
      "id": "exp_004",
      "category": "FACILITIES",
      "description": "Milton Keynes Central Warehouse Unit 4 Power & Heating",
      "amountMinor": 65000,
      "vatMinor": 13000,
      "date": "2026-11-05T15:21:20.991Z",
      "paymentMethod": "DIRECT_DEBIT",
      "reference": "BRIT-GAS-COM-991"
    }
  ],
  "financialLedger": [
    {
      "id": "fled_01",
      "accountCode": "1200",
      "accountName": "Inventory Asset",
      "entryType": "DEBIT",
      "amountMinor": 580000,
      "referenceType": "PURCHASE_RECEIPT",
      "referenceId": "po_001",
      "timestamp": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "fled_02",
      "accountCode": "2100",
      "accountName": "Trade Accounts Payable",
      "entryType": "CREDIT",
      "amountMinor": 580000,
      "referenceType": "PURCHASE_RECEIPT",
      "referenceId": "po_001",
      "timestamp": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "fled_03",
      "accountCode": "1100",
      "accountName": "Accounts Receivable",
      "entryType": "DEBIT",
      "amountMinor": 36000,
      "referenceType": "3PL_INVOICE",
      "referenceId": "inv_001",
      "timestamp": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "fled_04",
      "accountCode": "4000",
      "accountName": "Fulfilment Revenue",
      "entryType": "CREDIT",
      "amountMinor": 30000,
      "referenceType": "3PL_INVOICE",
      "referenceId": "inv_001",
      "timestamp": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "fled_05",
      "accountCode": "2200",
      "accountName": "VAT Output Liability",
      "entryType": "CREDIT",
      "amountMinor": 6000,
      "referenceType": "3PL_INVOICE",
      "referenceId": "inv_001",
      "timestamp": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "fled_06",
      "accountCode": "1000",
      "accountName": "Barclays Operating Bank Account",
      "entryType": "DEBIT",
      "amountMinor": 36000,
      "referenceType": "CLIENT_PAYMENT",
      "referenceId": "pay_001",
      "timestamp": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "fled_07",
      "accountCode": "1100",
      "accountName": "Accounts Receivable",
      "entryType": "CREDIT",
      "amountMinor": 36000,
      "referenceType": "CLIENT_PAYMENT",
      "referenceId": "pay_001",
      "timestamp": "2026-11-03T15:21:20.991Z"
    }
  ],
  "auditLogs": [
    {
      "id": "aud_01",
      "actorId": "usr_superadmin",
      "actorName": "Sarah Jenkins",
      "action": "SYSTEM_BOOT",
      "entity": "SystemConfig",
      "entityId": "cfg_001",
      "notes": "Configured business currency GBP and VAT rate 20%",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "aud_02",
      "actorId": "usr_opsmanager",
      "actorName": "Marcus Reid",
      "action": "CONNECT_ACCOUNT",
      "entity": "MarketplaceAccount",
      "entityId": "mkt_ebay_uk",
      "notes": "Connected eBay UK production seller credentials.",
      "timestamp": "2026-10-31T15:21:20.991Z"
    },
    {
      "id": "aud_03",
      "actorId": "usr_opsmanager",
      "actorName": "Marcus Reid",
      "action": "APPROVE_PO",
      "entity": "PurchaseOrder",
      "entityId": "po_001",
      "notes": "Approved purchase order for Anker headphones £1,900.00",
      "timestamp": "2026-11-02T15:21:20.991Z"
    },
    {
      "id": "aud_04",
      "actorId": "usr_warehouse",
      "actorName": "Jack Miller",
      "action": "GOODS_RECEIPT",
      "entity": "GoodsReceipt",
      "entityId": "grn_001",
      "notes": "Completed full goods receipt for 50 units NX-AUD-001",
      "timestamp": "2026-11-03T15:21:20.991Z"
    },
    {
      "id": "aud_05",
      "actorId": "usr_opsmanager",
      "actorName": "Marcus Reid",
      "action": "APPROVE_ADJUSTMENT",
      "entity": "StockAdjustment",
      "entityId": "adj_001",
      "notes": "Approved -2 damaged adjustment for NX-AUD-001",
      "timestamp": "2026-11-04T15:21:20.991Z"
    }
  ],
  "notifications": [
    {
      "id": "not_01",
      "type": "LOW_STOCK",
      "severity": "WARNING",
      "title": "Low Stock Alert: NX-AUD-001",
      "message": "Nexus Pro Headphones available quantity is at or below the reorder threshold (15 units).",
      "isDismissed": false,
      "createdAt": "2026-11-06T15:21:20.991Z"
    },
    {
      "id": "not_02",
      "type": "STOCK_ADJUSTMENT",
      "severity": "INFO",
      "title": "Stock Adjustment Pending Review",
      "message": "Warehouse logged surplus +5 units on NX-CAM-002 requiring manager sign-off.",
      "isDismissed": false,
      "createdAt": "2026-11-06T15:21:20.991Z"
    },
    {
      "id": "not_03",
      "type": "EBAY_SYNC",
      "severity": "SUCCESS",
      "title": "eBay Multi-Account Sync Complete",
      "message": "3 new orders imported into pipeline. Duplicate prevention verified.",
      "isDismissed": false,
      "createdAt": "2026-11-07T14:21:20.991Z"
    }
  ],
  "config": {
    "baseCurrency": "GBP",
    "businessTimezone": "Europe/London",
    "defaultVatRatePercent": 20,
    "adjustmentApprovalThresholdValueMinor": 25000,
    "adjustmentApprovalThresholdQuantity": 10,
    "activeReleasePhase": "ALL",
    "allowNegativeStock": false,
    "autoSyncEnabled": true
  }
};

class ClientDatabaseManager {
  private data: ClientDatabaseState;

  constructor() {
    this.data = this.load();
  }

  private load(): ClientDatabaseState {
    let result: ClientDatabaseState;
    try {
      const isLocalStorageAvailable = typeof localStorage !== 'undefined';
      const stored = isLocalStorageAvailable
        ? (localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY))
        : null;
      if (stored) {
        result = JSON.parse(stored);
      } else {
        result = JSON.parse(JSON.stringify(SEED_DATA));
      }
    } catch (e) {
      console.warn('Failed to load client db from storage:', e);
      result = JSON.parse(JSON.stringify(SEED_DATA));
    }

    // Ensure orders collection exists and is populated
    if (!result.orders || result.orders.length === 0) {
      result.orders = JSON.parse(JSON.stringify(SEED_DATA.orders));
    }

    // Ensure all phase 1-5 collections exist
    if (!result.config) result.config = { ...SEED_DATA.config };
    result.config.activeReleasePhase = 'ALL';

    if (!result.payouts || result.payouts.length === 0) {
      result.payouts = [
        {
          id: 'pay_uk_01',
          payoutId: 'EP-2026-UK-081',
          marketplaceAccountId: 'mkt_ebay_uk',
          accountName: 'Nexus Tech Direct (UK)',
          totalSalesMinor: 489000,
          totalFeesMinor: 62592,
          refundsMinor: 8999,
          shippingAdjustmentsMinor: 1500,
          otherAdjustmentsMinor: 0,
          netPayoutMinor: 415909,
          currency: 'GBP',
          payoutDate: '2026-11-04T12:00:00.000Z',
          status: 'BANK_CONFIRMED',
          transactionId: 'TX-EBAY-UK-99201',
          bankDepositStatus: 'RECONCILED',
          bankReference: 'BARCLAYS-DEP-88419',
          orderIds: ['ord_gen_1001', 'ord_gen_1002', 'ord_gen_1003'],
          notes: 'Settled to Barclays UK Business Account. Reconciled with bank feed.',
        },
        {
          id: 'pay_uk_02',
          payoutId: 'EP-2026-UK-082',
          marketplaceAccountId: 'mkt_ebay_uk',
          accountName: 'Nexus Tech Direct (UK)',
          totalSalesMinor: 234050,
          totalFeesMinor: 29958,
          refundsMinor: 0,
          shippingAdjustmentsMinor: 0,
          otherAdjustmentsMinor: 0,
          netPayoutMinor: 204092,
          currency: 'GBP',
          payoutDate: '2026-11-06T12:00:00.000Z',
          status: 'PAID',
          transactionId: 'TX-EBAY-UK-99208',
          bankDepositStatus: 'CLEARED',
          bankReference: 'BARCLAYS-DEP-88502',
          orderIds: ['ord_gen_1004', 'ord_gen_1005'],
          notes: 'Dispatched from eBay Payments. Awaiting end-of-week ledger match.',
        },
        {
          id: 'pay_us_01',
          payoutId: 'EP-2026-US-041',
          marketplaceAccountId: 'mkt_ebay_us',
          accountName: 'Nexus Global Outlet (US)',
          totalSalesMinor: 493846,
          totalFeesMinor: 63212,
          refundsMinor: 9230,
          shippingAdjustmentsMinor: 0,
          otherAdjustmentsMinor: 0,
          netPayoutMinor: 421404,
          currency: 'USD',
          payoutDate: '2026-11-03T14:30:00.000Z',
          status: 'BANK_CONFIRMED',
          transactionId: 'TX-EBAY-US-41829',
          bankDepositStatus: 'RECONCILED',
          bankReference: 'CHASE-WIRE-55102',
          orderIds: ['ord_gen_1006', 'ord_gen_1007'],
          notes: 'International disbursement via Chase Commercial FX conversion.',
        },
        {
          id: 'pay_us_02',
          payoutId: 'EP-2026-US-042',
          marketplaceAccountId: 'mkt_ebay_us',
          accountName: 'Nexus Global Outlet (US)',
          totalSalesMinor: 244615,
          totalFeesMinor: 31310,
          refundsMinor: 0,
          shippingAdjustmentsMinor: 0,
          otherAdjustmentsMinor: 0,
          netPayoutMinor: 213305,
          currency: 'USD',
          payoutDate: '2026-11-08T15:00:00.000Z',
          status: 'PROCESSING',
          transactionId: 'TX-EBAY-US-41904',
          bankDepositStatus: 'PENDING',
          orderIds: ['ord_gen_1008'],
          notes: 'Processing batch payout in US Automated Clearing House (ACH).',
        },
        {
          id: 'pay_de_01',
          payoutId: 'EP-2026-DE-019',
          marketplaceAccountId: 'mkt_ebay_de',
          accountName: 'Nexus Tech Europe (DE)',
          totalSalesMinor: 329060,
          totalFeesMinor: 41132,
          refundsMinor: 0,
          shippingAdjustmentsMinor: 0,
          otherAdjustmentsMinor: 0,
          netPayoutMinor: 287928,
          currency: 'EUR',
          payoutDate: '2026-11-05T10:15:00.000Z',
          status: 'BANK_CONFIRMED',
          transactionId: 'TX-EBAY-DE-11029',
          bankDepositStatus: 'RECONCILED',
          bankReference: 'DEUTSCHE-SEPA-9931',
          orderIds: ['ord_gen_1009'],
          notes: 'SEPA Euro settlement completed to European treasury account.',
        },
        {
          id: 'pay_de_02',
          payoutId: 'EP-2026-DE-020',
          marketplaceAccountId: 'mkt_ebay_de',
          accountName: 'Nexus Tech Europe (DE)',
          totalSalesMinor: 121368,
          totalFeesMinor: 15171,
          refundsMinor: 0,
          shippingAdjustmentsMinor: 0,
          otherAdjustmentsMinor: 0,
          netPayoutMinor: 106197,
          currency: 'EUR',
          payoutDate: '2026-11-09T08:00:00.000Z',
          status: 'INITIATED',
          transactionId: 'TX-EBAY-DE-11088',
          bankDepositStatus: 'PENDING',
          orderIds: ['ord_gen_1010'],
          notes: 'eBay initiated payout transfer. Pending SEPA bank processing.',
        },
      ];
    }

    if (!result.reconciliations || result.reconciliations.length === 0) {
      result.reconciliations = [
        {
          id: 'rec_uk_nov',
          period: 'November 2026',
          marketplaceAccountId: 'mkt_ebay_uk',
          accountName: 'Nexus Tech Direct (UK)',
          expectedPayoutMinor: 620001,
          actualPayoutMinor: 620001,
          differenceMinor: 0,
          unmatchedTransactionsCount: 0,
          status: 'RECONCILED',
          lastReconciledAt: '2026-11-07T16:00:00.000Z',
          reconciledBy: 'Elena Rostova (Finance)',
          auditNotes: '100% verified against Barclays statement and eBay transaction report.',
          breakdown: {
            ordersGrossMinor: 723050,
            marketplaceFeesMinor: 92550,
            refundsMinor: 8999,
            shippingPostageMinor: 1500,
            bankConfirmedMinor: 620001,
          },
        },
        {
          id: 'rec_us_nov',
          period: 'November 2026',
          marketplaceAccountId: 'mkt_ebay_us',
          accountName: 'Nexus Global Outlet (US)',
          expectedPayoutMinor: 634709,
          actualPayoutMinor: 634709,
          differenceMinor: 0,
          unmatchedTransactionsCount: 0,
          status: 'RECONCILED',
          lastReconciledAt: '2026-11-07T16:15:00.000Z',
          reconciledBy: 'Elena Rostova (Finance)',
          auditNotes: 'Chase Wire transfer matched against US sales ledger.',
          breakdown: {
            ordersGrossMinor: 738461,
            marketplaceFeesMinor: 94522,
            refundsMinor: 9230,
            shippingPostageMinor: 0,
            bankConfirmedMinor: 634709,
          },
        },
        {
          id: 'rec_de_nov',
          period: 'November 2026',
          marketplaceAccountId: 'mkt_ebay_de',
          accountName: 'Nexus Tech Europe (DE)',
          expectedPayoutMinor: 394125,
          actualPayoutMinor: 287928,
          differenceMinor: 106197,
          unmatchedTransactionsCount: 1,
          status: 'IN_REVIEW',
          lastReconciledAt: '2026-11-09T07:00:00.000Z',
          reconciledBy: 'Elena Rostova (Finance)',
          auditNotes: 'EUR 1,242.50 (£1,061.97) initiated by eBay on Nov 9, awaiting final SEPA bank arrival.',
          breakdown: {
            ordersGrossMinor: 450428,
            marketplaceFeesMinor: 56303,
            refundsMinor: 0,
            shippingPostageMinor: 0,
            bankConfirmedMinor: 287928,
          },
        },
      ];
    }

    if (!result.packagingJobs || result.packagingJobs.length === 0) {
      result.packagingJobs = [
        {
          id: 'pkg_001',
          jobNumber: 'PKG-2026-001',
          clientId: 'client_apex',
          clientName: 'Apex Electronics Ltd',
          date: '2026-11-03T11:00:00.000Z',
          packagingType: 'CUSTOM_BOX',
          quantity: 120,
          materialCostMinor: 7200,
          serviceChargeMinor: 14400,
          totalChargeMinor: 21600,
          status: 'INVOICED',
          invoiceId: 'inv_001',
          orderNumber: 'NX-ORD-2026-001',
          performedBy: 'Jack Miller (Warehouse Staff)',
          notes: 'Double-walled carton with ESD electrostatic shielding bags.',
        },
        {
          id: 'pkg_002',
          jobNumber: 'PKG-2026-002',
          clientId: 'client_bolt',
          clientName: 'Bolt Gear Ltd',
          date: '2026-11-05T09:30:00.000Z',
          packagingType: 'PALLET_WRAP',
          quantity: 14,
          materialCostMinor: 3500,
          serviceChargeMinor: 10500,
          totalChargeMinor: 14000,
          status: 'INVOICED',
          invoiceId: 'inv_002',
          performedBy: 'Jack Miller (Warehouse Staff)',
          notes: 'Full pallet machine shrink-wrap & corner reinforcement brackets.',
        },
        {
          id: 'pkg_003',
          jobNumber: 'PKG-2026-003',
          clientId: 'client_zenith',
          clientName: 'Zenith Retail Partners',
          date: '2026-11-06T14:15:00.000Z',
          packagingType: 'BUBBLE_MAILER',
          quantity: 85,
          materialCostMinor: 2550,
          serviceChargeMinor: 6800,
          totalChargeMinor: 9350,
          status: 'COMPLETED',
          performedBy: 'Jack Miller (Warehouse Staff)',
          notes: 'Eco-recycled bubble mailers with tamper-evident security tape.',
        },
        {
          id: 'pkg_004',
          jobNumber: 'PKG-2026-004',
          clientId: 'client_cloud',
          clientName: 'CloudLogix Direct',
          date: '2026-11-08T16:00:00.000Z',
          packagingType: 'FRAGILE_PREP',
          quantity: 45,
          materialCostMinor: 4050,
          serviceChargeMinor: 9000,
          totalChargeMinor: 13050,
          status: 'IN_PROGRESS',
          performedBy: 'Jack Miller (Warehouse Staff)',
          notes: 'Suspended air foam packaging for delicate camera sensors.',
        },
      ];
    }

    if (!result.shippingJobs || result.shippingJobs.length === 0) {
      result.shippingJobs = [
        {
          id: 'shp_001',
          dispatchId: 'DSP-2026-001',
          clientId: 'client_apex',
          clientName: 'Apex Electronics Ltd',
          date: '2026-11-03T16:30:00.000Z',
          carrier: 'Royal Mail',
          trackingNumber: 'GB491028114RM',
          serviceLevel: 'Tracked 24 with Signature',
          parcelWeightKg: 0.85,
          carrierCostMinor: 380,
          serviceChargeMinor: 650,
          totalChargeMinor: 1030,
          status: 'DELIVERED',
          invoiceId: 'inv_001',
          orderNumber: 'NX-ORD-2026-001',
          destination: 'Edinburgh, UK',
        },
        {
          id: 'shp_002',
          dispatchId: 'DSP-2026-002',
          clientId: 'client_bolt',
          clientName: 'Bolt Gear Ltd',
          date: '2026-11-05T17:00:00.000Z',
          carrier: 'DPD UK',
          trackingNumber: 'DPD-UK-8841029',
          serviceLevel: 'Next Day Express Courier',
          parcelWeightKg: 3.4,
          carrierCostMinor: 620,
          serviceChargeMinor: 1150,
          totalChargeMinor: 1770,
          status: 'IN_TRANSIT',
          invoiceId: 'inv_002',
          orderNumber: 'NX-ORD-2026-002',
          destination: 'Birmingham, UK',
        },
        {
          id: 'shp_003',
          dispatchId: 'DSP-2026-003',
          clientId: 'client_zenith',
          clientName: 'Zenith Retail Partners',
          date: '2026-11-06T18:00:00.000Z',
          carrier: 'DHL Express',
          trackingNumber: 'DHL-992019284',
          serviceLevel: 'Worldwide Air Express',
          parcelWeightKg: 1.2,
          carrierCostMinor: 1450,
          serviceChargeMinor: 2400,
          totalChargeMinor: 3850,
          status: 'DISPATCHED',
          orderNumber: 'NX-ORD-2026-003',
          destination: 'Dublin, Ireland',
        },
      ];
    }

    if (!result.dropshippingCalculations || result.dropshippingCalculations.length === 0) {
      result.dropshippingCalculations = [
        {
          id: 'ds_calc_001',
          productId: 'prd_001',
          sku: 'NX-AUD-001',
          productName: 'Nexus Pro Active Noise-Cancelling Headphones',
          supplierName: 'Anker Innovations Technology Ltd',
          purchaseCostMinor: 3800,
          supplierCostMinor: 3800,
          shippingCostMinor: 450,
          packagingCostMinor: 120,
          additionalExpensesMinor: 50,
          sellingPriceMinor: 8999,
          marketplaceFeePercent: 12.8,
          marketplaceFeeMinor: 1152,
          otherCostsMinor: 30,
          shippingOption: 'SHIPPING_INCLUDED',
          shippingChargedToCustomerMinor: 0,
          totalCostMinor: 4420,
          grossProfitMinor: 4579,
          marginPercent: 50.88,
          netProfitMinor: 3397,
          currency: 'GBP',
          updatedAt: '2026-11-07T14:30:00.000Z',
          updatedBy: 'Marcus Reid (Operations Manager)',
        },
        {
          id: 'ds_calc_002',
          productId: 'prd_004',
          sku: 'NX-KEY-004',
          productName: 'Nexus RGB Mechanical Gaming Keyboard - Brown Switches',
          supplierName: 'Shenzhen Foxconn Digital Supply',
          purchaseCostMinor: 3100,
          supplierCostMinor: 3100,
          shippingCostMinor: 550,
          packagingCostMinor: 180,
          additionalExpensesMinor: 75,
          sellingPriceMinor: 7499,
          marketplaceFeePercent: 12.8,
          marketplaceFeeMinor: 960,
          otherCostsMinor: 40,
          shippingOption: 'SHIPPING_EXCLUDED',
          shippingChargedToCustomerMinor: 499,
          totalCostMinor: 3355,
          grossProfitMinor: 4643,
          marginPercent: 58.05,
          netProfitMinor: 3643,
          currency: 'GBP',
          updatedAt: '2026-11-08T10:15:00.000Z',
          updatedBy: 'Marcus Reid (Operations Manager)',
        },
      ];
    }

    return result;
  }


  public save() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Failed to persist client db to localStorage:', e);
    }
  }

  public getData(): ClientDatabaseState {
    return this.data;
  }

  public reset() {
    this.data = JSON.parse(JSON.stringify(SEED_DATA));
    this.save();
  }
}

export const clientDb = new ClientDatabaseManager();

export async function handleClientDbRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const data = clientDb.getData();
  const [pathPart, queryPart] = endpoint.split('?');
  const params = new URLSearchParams(queryPart || '');
  const method = (options.method || 'GET').toUpperCase();
  let body: any = {};
  if (options.body) {
    if (typeof options.body === 'string') {
      try {
        body = JSON.parse(options.body);
      } catch (e) {
        body = {};
      }
    } else if (typeof options.body === 'object') {
      body = options.body;
    }
  }

  // Health check endpoint
  if (pathPart === '/api/health' || pathPart === '/health') {
    return {
      success: true,
      message: 'MultiAcc Backend Worker is running',
      platform: 'Cloudflare Workers',
    } as unknown as T;
  }

  // Extract and validate caller user identity from headers
  const headers = options.headers instanceof Headers
    ? options.headers
    : new Headers(options.headers || {});
  const userId = headers.get('x-user-id');
  let currentUser = userId ? data.users.find((u: any) => u.id === userId) : null;
  if (!currentUser) {
    currentUser = data.users[0]; // Baseline default identity
  }
  if (!currentUser.isActive) {
    const inactiveErr: any = new Error('Unauthorized: User account is inactive or disabled.');
    inactiveErr.status = 403;
    throw inactiveErr;
  }

  // 1. Auth
  if (pathPart === '/auth/users' || pathPart === '/users') {
    return { users: data.users } as unknown as T;
  }
  if (pathPart === '/auth/me' || pathPart === '/me') {
    return { user: currentUser } as unknown as T;
  }

  // 2. Dashboard
  if (pathPart === '/dashboard/kpis') {
    const validOrders = data.orders.filter((o) => o.status !== 'Cancelled');
    const pendingOrders = data.orders.filter((o) =>
      ['New', 'Confirmed', 'Allocated', 'Picked', 'Packed'].includes(o.status)
    );
    const revenueMinor = validOrders.reduce((sum, o) => sum + (o.totalMinor - o.taxMinor), 0);
    return {
      kpis: {
        totalOrders: validOrders.length,
        pendingOrders: pendingOrders.length,
        revenueMinor,
        lowStockItems: 1,
        totalStockUnits: 580,
        inventoryValueMinor: 690600,
        supplierPayablesMinor: 144000,
        clientReceivablesMinor: 36000,
        storageRevenueMinor: 21600,
        outstandingPaymentsMinor: 21600,
        currency: 'GBP',
        activePhase: 'ALL',
      },
      userRole: 'SUPER_ADMIN',
    } as unknown as T;
  }

  if (pathPart === '/dashboard/charts') {
    const statusCounts: Record<string, number> = {};
    for (const o of data.orders) {
      statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
    }
    const topSkus = data.products.slice(0, 5).map((p, idx) => ({
      sku: p.sku,
      name: p.name,
      units: 12 - idx * 2,
      revenue: (p.sellingPriceMinor * (12 - idx * 2)) / 100,
    }));
    return {
      trend: [
        { date: '11-01', orders: 2, revenue: 149.98 },
        { date: '11-02', orders: 3, revenue: 219.50 },
        { date: '11-03', orders: 5, revenue: 389.20 },
        { date: '11-04', orders: 4, revenue: 284.10 },
        { date: '11-05', orders: 6, revenue: 472.90 },
        { date: '11-06', orders: 5, revenue: 395.40 },
        { date: '11-07', orders: 7, revenue: 560.80 },
      ],
      statusCounts,
      stockByState: {
        available: 540,
        reserved: 35,
        onHand: 575,
        incoming: 120,
        damaged: 5,
        quarantined: 3,
      },
      topSkus,
    } as unknown as T;
  }

  // 3. Orders
  if (pathPart === '/orders') {
    if (method === 'POST') {
      const orderNumber = `NX-ORD-2026-${String(data.orders.length + 1).padStart(3, '0')}`;
      const newOrder: Order = {
        id: `ord_${Date.now()}`,
        orderNumber,
        salesSource: body.salesSource || 'MANUAL',
        ownerType: body.ownerType || 'OPERATOR',
        ownerId: body.ownerId || 'operator',
        customerName: body.customerName || 'Direct Client',
        customerEmail: body.customerEmail || 'orders@client.com',
        shippingAddress: body.shippingAddress || {
          name: body.customerName,
          street: '1 Commercial Road',
          city: 'London',
          postalCode: 'EC1A 1BB',
          country: 'GB',
        },
        status: 'New',
        paymentState: 'PAID',
        totalMinor: body.totalMinor || 4999,
        taxMinor: Math.round((body.totalMinor || 4999) * 0.2),
        shippingChargeMinor: 0,
        currency: 'GBP',
        lines: body.lines || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.orders.unshift(newOrder);
      clientDb.save();
      return { order: newOrder } as unknown as T;
    }

    let list = [...data.orders];
    const status = params.get('status');
    const accountId = params.get('accountId');
    const search = params.get('search');
    if (status && status !== 'ALL') {
      list = list.filter((o) => o.status === status);
    }
    if (accountId && accountId !== 'ALL') {
      list = list.filter((o) => o.marketplaceAccountId === accountId);
    }
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(s) ||
          (o.externalOrderId && o.externalOrderId.toLowerCase().includes(s)) ||
          o.customerName.toLowerCase().includes(s) ||
          (o.trackingNumber && o.trackingNumber.toLowerCase().includes(s)) ||
          (o.lines && o.lines.some((l: any) => l.sku?.toLowerCase().includes(s) || l.productName?.toLowerCase().includes(s)))
      );
    }
    return { orders: list } as unknown as T;
  }

  if (pathPart.startsWith('/orders/') && pathPart.endsWith('/transition')) {
    const orderId = pathPart.split('/')[2];
    const targetStatus = body.targetStatus as OrderStatus;
    const order = data.orders.find((o) => o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      const notFound: any = new Error(`Order ${orderId} not found`);
      notFound.status = 404;
      throw notFound;
    }
    order.status = targetStatus;
    if (body.carrier) order.carrier = body.carrier;
    if (body.trackingNumber) order.trackingNumber = body.trackingNumber;
    order.updatedAt = new Date().toISOString();
    clientDb.save();
    return { order } as unknown as T;
  }

  if (pathPart.startsWith('/orders/')) {
    const orderId = pathPart.split('/')[2];
    const order = data.orders.find((o) => o.id === orderId || o.orderNumber === orderId);

    if (method === 'PUT') {
      if (!order) {
        const notFound: any = new Error(`Order ${orderId} not found.`);
        notFound.status = 404;
        throw notFound;
      }

      // Role-based access control: Only Super Admin and Ops Manager can edit orders
      if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OPS_MANAGER') {
        const err: any = new Error('Unauthorized: Order editing requires Super Admin or Operations Manager privileges.');
        err.status = 403;
        throw err;
      }

      if (!body.reason && !body.editReason) {
        const err: any = new Error('Validation Error: A mandatory audit reason is required when editing an order.');
        err.status = 400;
        throw err;
      }

      // Update lines and recalculate totals if items provided
      if (body.items && Array.isArray(body.items)) {
        order.lines = body.items.map((item: any, idx: number) => {
          const matchedProd = data.products.find((p) => p.sku === item.sku);
          const unitPrice = item.unitPriceMinor !== undefined ? Number(item.unitPriceMinor) : (matchedProd?.sellingPriceMinor || 2000);
          const qty = Math.max(1, Number(item.quantity) || 1);
          const totalLinePrice = unitPrice * qty;
          const taxLine = Math.round(totalLinePrice * 0.2);
          return {
            id: `ordl_${order.id}_${idx + 1}`,
            orderId: order.id,
            productId: matchedProd?.id || 'prd_custom',
            sku: item.sku,
            productName: matchedProd?.name || `Item ${item.sku}`,
            quantity: qty,
            unitPriceMinor: unitPrice,
            taxAmountMinor: taxLine,
            totalPriceMinor: totalLinePrice,
            isBackordered: false,
            reservedQuantity: qty,
          };
        });

        const subtotal = order.lines.reduce((acc, l) => acc + l.totalPriceMinor, 0);
        const vat = Math.round(subtotal * 0.2);
        const shippingFee = body.shippingFeeMinor !== undefined ? Number(body.shippingFeeMinor) : (order.shippingChargeMinor || 0);

        order.totalMinor = subtotal + shippingFee;
        order.taxMinor = vat;
        order.shippingChargeMinor = shippingFee;
      } else if (body.shippingFeeMinor !== undefined) {
        const subtotal = order.lines.reduce((acc, l) => acc + l.totalPriceMinor, 0);
        order.shippingChargeMinor = Number(body.shippingFeeMinor);
        order.totalMinor = subtotal + order.shippingChargeMinor;
      }

      // Customer and shipping address fields
      if (body.customerName) order.customerName = body.customerName;
      if (body.customerEmail) order.customerEmail = body.customerEmail;
      if (body.shippingAddress) {
        order.shippingAddress = {
          ...order.shippingAddress,
          ...body.shippingAddress,
          name: body.customerName || order.shippingAddress?.name || body.shippingAddress.name,
        };
      }
      if (body.notes !== undefined) order.notes = body.notes;
      if (body.status) order.status = body.status;

      order.updatedAt = new Date().toISOString();

      // Record in order history
      const historyEntry = {
        id: `his_${Date.now()}`,
        orderId: order.id,
        fromStatus: order.status,
        toStatus: order.status,
        reason: body.reason || body.editReason || 'Order details amended by authorized administrator.',
        changedByUserId: currentUser.id,
        timestamp: new Date().toISOString(),
      };
      if (!data.orderHistories) data.orderHistories = [];
      data.orderHistories.unshift(historyEntry);

      // Record in audit log
      const auditEntry: AuditLogEntry = {
        id: `aud_${Date.now()}`,
        actorId: currentUser.id,
        actorName: currentUser.name,
        action: 'UPDATE',
        entity: 'ORDER',
        entityId: order.id,
        notes: `Order ${order.orderNumber} updated: ${body.reason || body.editReason || 'Admin modification'}. New Total: £${(order.totalMinor / 100).toFixed(2)}`,
        timestamp: new Date().toISOString(),
      };
      if (!data.auditLogs) data.auditLogs = [];
      data.auditLogs.unshift(auditEntry);

      clientDb.save();
      return { order } as unknown as T;
    }

    if (!order) {
      const notFound: any = new Error(`Order ${orderId} not found`);
      notFound.status = 404;
      throw notFound;
    }

    return {
      order,
      histories: (data.orderHistories || []).filter((h: any) => h.orderId === order.id || h.orderId === orderId),
    } as unknown as T;
  }


  // 4. Products
  if (pathPart === '/products') {
    if (method === 'POST') {
      if (currentUser.role === 'WAREHOUSE_STAFF' || currentUser.role === 'VIEWER') {
        const err: any = new Error('Unauthorized: Not authorized to create products');
        err.status = 403;
        throw err;
      }

      const newProd: Product = {
        id: `prd_${Date.now()}`,
        sku: body.sku,
        name: body.name,
        barcode: body.barcode,
        dimensions: { lengthCm: 10, widthCm: 10, heightCm: 10 },
        weightKg: 0.5,
        ownerType: body.ownerType || 'OPERATOR',
        ownerId: body.ownerId || 'operator',
        status: 'ACTIVE',
        costPriceMinor: body.costPriceMinor || 1000,
        sellingPriceMinor: body.sellingPriceMinor || 2999,
        lowStockThreshold: body.lowStockThreshold || 10,
        reorderLevel: body.reorderLevel || 30,
        category: body.category || 'General',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.products.unshift(newProd);
      clientDb.save();
      return { product: newProd } as unknown as T;
    }

    const isWarehouseStaff = currentUser.role === 'WAREHOUSE_STAFF';
    let productsList = [...data.products];
    if (currentUser.role === 'CLIENT_USER') {
      productsList = productsList.filter((p) => p.ownerId === currentUser.clientId);
    }

    const enhanced = productsList.map((p) => ({
      ...p,
      costPriceMinor: isWarehouseStaff ? 0 : p.costPriceMinor,
      sellingPriceMinor: isWarehouseStaff ? 0 : p.sellingPriceMinor,
      stockOnHand: 45,
      stockReserved: 4,
      stockAvailable: 41,
      stockIncoming: 20,
      stockDamaged: 1,
    }));
    return { products: enhanced } as unknown as T;
  }

  // 5. Inventory & Ledger
  if (pathPart === '/inventory/balances') {
    const balances = data.products.map((p) => ({
      productId: p.id,
      sku: p.sku,
      ownerId: p.ownerId,
      onHand: 45,
      reserved: 4,
      available: 41,
      incoming: 20,
      damaged: 1,
      quarantined: 0,
      missing: 0,
      totalStock: 46,
      weightedAverageCostMinor: p.costPriceMinor,
    }));
    return { balances } as unknown as T;
  }

  if (pathPart === '/inventory/ledger') {
    return { ledger: data.stockLedger } as unknown as T;
  }

  // 6. Stock Adjustments
  if (pathPart === '/stock/adjustments') {
    if (method === 'POST') {
      const newAdj: any = {
        id: `adj_${Date.now()}`,
        adjustmentNumber: `ADJ-2026-${String(data.stockAdjustments.length + 1).padStart(3, '0')}`,
        productId: body.productId,
        sku: body.sku,
        quantityDelta: body.quantityDelta,
        stateTarget: body.stateTarget || 'ON_HAND',
        reasonCode: body.reasonCode || 'COUNT_DISCREPANCY',
        status: 'APPROVED',
        requestedByUserId: 'usr_superadmin',
        reviewedByUserId: 'usr_opsmanager',
        reviewedAt: new Date().toISOString(),
        approvalNote: body.reasonNotes || 'Client-side adjustment approved.',
        createdAt: new Date().toISOString(),
      };
      data.stockAdjustments.unshift(newAdj);
      clientDb.save();
      return { adjustment: newAdj } as unknown as T;
    }
    return { adjustments: data.stockAdjustments } as unknown as T;
  }

  if (pathPart.includes('/stock/adjustments/') && pathPart.endsWith('/decision')) {
    const adjId = pathPart.split('/')[3];
    const adj = data.stockAdjustments.find((a: any) => a.id === adjId);
    if (!adj) {
      const notFound: any = new Error(`Stock adjustment ${adjId} not found`);
      notFound.status = 404;
      throw notFound;
    }
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'OPS_MANAGER') {
      const err: any = new Error('Unauthorized: Only Operations Managers or Super Admins can decide stock adjustments.');
      err.status = 403;
      throw err;
    }
    adj.status = body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    adj.approvalNote = body.approvalNote || body.reasonNotes;
    adj.reviewedByUserId = currentUser.id;
    adj.reviewedAt = new Date().toISOString();
    clientDb.save();
    return { adjustment: adj } as unknown as T;
  }

  // 7. eBay Accounts & Exceptions
  if (pathPart === '/ebay/accounts') {
    return { accounts: data.marketplaceAccounts, recentSyncs: [] } as unknown as T;
  }
  if (pathPart.includes('/ebay/accounts/') && pathPart.endsWith('/sync')) {
    return { imported: 3, skipped: 5, exceptions: 0 } as unknown as T;
  }
  if (pathPart.includes('/ebay/accounts/') && pathPart.endsWith('/connect')) {
    return { success: true, message: 'Connected to eBay Sandbox API' } as unknown as T;
  }
  if (pathPart === '/ebay/exceptions' || pathPart === '/exceptions') {
    return { exceptions: data.exceptions } as unknown as T;
  }
  if (pathPart.includes('/ebay/exceptions/') && pathPart.endsWith('/resolve')) {
    const excId = pathPart.split('/')[3];
    const exc = data.exceptions.find((e: any) => e.id === excId);
    if (exc) {
      exc.status = 'RESOLVED';
      clientDb.save();
      return { success: true, exception: exc } as unknown as T;
    }
  }

  // 8. Suppliers, Purchase Orders & Returns
  if (pathPart === '/suppliers') {
    return { suppliers: data.suppliers } as unknown as T;
  }
  if (pathPart === '/purchase-orders') {
    return { purchaseOrders: data.purchaseOrders, receipts: [] } as unknown as T;
  }
  if (pathPart.includes('/purchase-orders/') && pathPart.endsWith('/receive')) {
    const poId = pathPart.split('/')[2];
    const po = data.purchaseOrders.find((p: any) => p.id === poId);
    if (po) {
      po.status = 'RECEIVED';
      clientDb.save();
      return { success: true, purchaseOrder: po } as unknown as T;
    }
  }
  if (pathPart === '/returns') {
    return { returns: data.returns } as unknown as T;
  }
  if (pathPart.includes('/returns/') && pathPart.endsWith('/disposition')) {
    const retId = pathPart.split('/')[2];
    const ret = data.returns.find((r: any) => r.id === retId);
    if (ret) {
      ret.status = 'INSPECTED';
      clientDb.save();
      return { success: true, return: ret } as unknown as T;
    }
  }

  // 9. 3PL Clients
  if (pathPart === '/3pl/clients') {
    return { clients: data.clients, rateCards: data.rateCards } as unknown as T;
  }
  if (pathPart === '/3pl/storage-snapshots') {
    return { snapshots: [] } as unknown as T;
  }
  if (pathPart === '/3pl/billing-preview') {
    const client = data.clients.find((c: any) => c.id === body.clientId) || data.clients[0];
    return {
      client,
      period: { start: '2026-10-01', end: '2026-10-31' },
      totalEstimatedChargesMinor: 21600,
      estimatedStorageMinor: 18000,
      estimatedHandlingMinor: 3600,
    } as unknown as T;
  }

  // 10. Finance
  if (pathPart === '/finance/invoices') {
    return { invoices: data.invoices } as unknown as T;
  }
  if (pathPart.includes('/finance/invoices/') && pathPart.endsWith('/void')) {
    const invId = pathPart.split('/')[3];
    const inv = data.invoices.find((i: any) => i.id === invId);
    if (!inv) {
      const notFound: any = new Error(`Invoice ${invId} not found`);
      notFound.status = 404;
      throw notFound;
    }
    if (currentUser.role !== 'SUPER_ADMIN' && currentUser.role !== 'FINANCE_USER') {
      const err: any = new Error('Unauthorized: Only Finance Users or Super Admins can void invoices.');
      err.status = 403;
      throw err;
    }
    inv.status = 'VOID';
    inv.voidReason = body.reason || 'Voided by authorized administrator';
    clientDb.save();
    return { success: true, invoice: inv } as unknown as T;
  }
  if (pathPart === '/finance/payments') {
    if (method === 'POST') {
      const newPay: any = {
        id: `pay_${Date.now()}`,
        paymentNumber: `PAY-2026-${String(data.payments.length + 1).padStart(3, '0')}`,
        invoiceId: body.invoiceId || 'inv_001',
        amountMinor: body.amountMinor || 10000,
        paymentDate: new Date().toISOString(),
        method: body.method || 'BANK_TRANSFER',
        reference: body.reference || 'ONLINE-SETTLE',
        currency: 'GBP',
        createdAt: new Date().toISOString(),
      };
      data.payments.unshift(newPay);
      clientDb.save();
      return { payment: newPay } as unknown as T;
    }
    return { payments: data.payments } as unknown as T;
  }
  if (pathPart === '/finance/expenses') {
    return { expenses: data.expenses } as unknown as T;
  }
  if (pathPart === '/finance/ledger') {
    return { ledger: data.financialLedger } as unknown as T;
  }

  // 11. Reports (R-01 to R-14)
  if (pathPart.startsWith('/reports/')) {
    const reportId = pathPart.split('/')[2];
    const columns = ['Record ID', 'SKU / Reference', 'Units / Count', 'Amount (£)', 'Status', 'Timestamp'];
    const rows = [
      ['RPT-101', 'NX-AUD-001', '50', '£4,499.50', 'Verified', '2026-11-07'],
      ['RPT-102', 'NX-CAM-002', '32', '£1,919.68', 'Verified', '2026-11-06'],
      ['RPT-103', 'NX-HUB-005', '45', '£1,349.55', 'Verified', '2026-11-05'],
      ['RPT-104', 'APX-SPK-100', '28', '£1,399.72', 'Verified', '2026-11-04'],
    ];
    return {
      id: reportId,
      name: `Standard Report ${reportId}`,
      phase: 'P1',
      summary: {
        totalRecords: rows.length,
        totalRevenueGBP: '9,168.45',
        totalGrossProfitGBP: '3,842.20',
        varianceGBP: '0.00',
        variance: 0,
      },
      columns,
      data: rows,
    } as unknown as T;
  }

  // 12. Audit Logs & Notifications
  if (pathPart === '/audit-logs') {
    return { logs: data.auditLogs } as unknown as T;
  }
  if (pathPart === '/notifications') {
    return { notifications: data.notifications } as unknown as T;
  }
  if (pathPart.includes('/notifications/') && pathPart.endsWith('/dismiss')) {
    const notifId = pathPart.split('/')[2];
    const n = data.notifications.find((item) => item.id === notifId);
    if (n) {
      n.isDismissed = true;
      clientDb.save();
    }
    return { success: true } as unknown as T;
  }

  // 13. eBay Payouts & Reconciliation
  if (pathPart === '/payouts') {
    let list = data.payouts || [];
    const accountId = params.get('accountId');
    if (accountId && accountId !== 'ALL') {
      list = list.filter((p: any) => p.marketplaceAccountId === accountId);
    }
    const totalSalesMinor = list.reduce((sum: number, p: any) => sum + p.totalSalesMinor, 0);
    const totalFeesMinor = list.reduce((sum: number, p: any) => sum + p.totalFeesMinor, 0);
    const refundsMinor = list.reduce((sum: number, p: any) => sum + p.refundsMinor, 0);
    const netPayoutsMinor = list.reduce((sum: number, p: any) => sum + p.netPayoutMinor, 0);
    const confirmedMinor = list
      .filter((p: any) => p.status === 'BANK_CONFIRMED')
      .reduce((sum: number, p: any) => sum + p.netPayoutMinor, 0);
    const pendingDepositMinor = netPayoutsMinor - confirmedMinor;

    return {
      payouts: list,
      balances: {
        totalSalesMinor,
        totalFeesMinor,
        refundsMinor,
        netPayoutsMinor,
        confirmedMinor,
        pendingDepositMinor,
      },
    } as unknown as T;
  }

  if (pathPart.includes('/payouts/') && pathPart.endsWith('/confirm-deposit')) {
    const payoutId = pathPart.split('/')[2];
    const payout = (data.payouts || []).find((p: any) => p.id === payoutId);
    if (payout) {
      payout.status = 'BANK_CONFIRMED';
      payout.bankDepositStatus = 'RECONCILED';
      payout.bankReference = body.bankReference || 'DEP-VERIFIED';
      clientDb.save();
      return { success: true, payout } as unknown as T;
    }
    throw new Error(`Payout ${payoutId} not found`);
  }

  if (pathPart === '/reconciliation') {
    let list = data.reconciliations || [];
    const accountId = params.get('accountId');
    if (accountId && accountId !== 'ALL') {
      list = list.filter((r: any) => r.marketplaceAccountId === accountId);
    }
    return { reconciliations: list } as unknown as T;
  }

  // 14. Phase 3 Warehouse Services
  if (pathPart === '/warehouse-services/summary') {
    const clients = data.clients || [];
    const packagingJobs = data.packagingJobs || [];
    const shippingJobs = data.shippingJobs || [];

    const totalStorageCharges = 21600; // £216.00 mock baseline
    const totalPackagingCharges = packagingJobs.reduce((sum: number, j: any) => sum + j.totalChargeMinor, 0);
    const totalShippingCharges = shippingJobs.reduce((sum: number, j: any) => sum + j.totalChargeMinor, 0);
    const totalServiceCharges = totalStorageCharges + totalPackagingCharges + totalShippingCharges;
    const paidAmount = 35600;
    const outstandingBalance = totalServiceCharges - paidAmount;

    return {
      storage: {
        activeClients: clients.length,
        totalItemsStored: 580,
        utilizedBins: 11,
        totalStorageChargesMinor: totalStorageCharges,
      },
      packaging: {
        totalJobs: packagingJobs.length,
        totalUnitsPacked: packagingJobs.reduce((sum: number, j: any) => sum + j.quantity, 0),
        totalPackagingChargesMinor: totalPackagingCharges,
      },
      shipping: {
        totalDispatches: shippingJobs.length,
        totalCarrierCostMinor: shippingJobs.reduce((sum: number, j: any) => sum + j.carrierCostMinor, 0),
        totalShippingChargesMinor: totalShippingCharges,
      },
      billing: {
        totalServiceChargesMinor: totalServiceCharges,
        paidAmountMinor: paidAmount,
        outstandingBalanceMinor: Math.max(0, outstandingBalance),
      },
    } as unknown as T;
  }

  if (pathPart === '/warehouse-services/packaging') {
    if (method === 'POST') {
      const jobNumber = `PKG-2026-${String((data.packagingJobs || []).length + 1).padStart(3, '0')}`;
      const newJob = {
        id: `pkg_${Date.now()}`,
        jobNumber,
        clientId: body.clientId || 'client_apex',
        clientName: body.clientName || 'Apex Electronics Ltd',
        date: new Date().toISOString(),
        packagingType: body.packagingType || 'CUSTOM_BOX',
        quantity: body.quantity || 1,
        materialCostMinor: body.materialCostMinor || 500,
        serviceChargeMinor: body.serviceChargeMinor || 1000,
        totalChargeMinor: (body.materialCostMinor || 500) + (body.serviceChargeMinor || 1000),
        status: 'COMPLETED',
        orderNumber: body.orderNumber || undefined,
        performedBy: body.performedBy || 'Jack Miller (Warehouse Staff)',
        notes: body.notes || 'Warehouse service packaging recorded.',
      };
      if (!data.packagingJobs) data.packagingJobs = [];
      data.packagingJobs.unshift(newJob);
      clientDb.save();
      return { job: newJob } as unknown as T;
    }
    return { packagingJobs: data.packagingJobs || [] } as unknown as T;
  }

  if (pathPart === '/warehouse-services/shipping') {
    if (method === 'POST') {
      const dispatchId = `DSP-2026-${String((data.shippingJobs || []).length + 1).padStart(3, '0')}`;
      const newJob = {
        id: `shp_${Date.now()}`,
        dispatchId,
        clientId: body.clientId || 'client_apex',
        clientName: body.clientName || 'Apex Electronics Ltd',
        date: new Date().toISOString(),
        carrier: body.carrier || 'Royal Mail',
        trackingNumber: body.trackingNumber || `GB-${Date.now().toString().slice(-8)}RM`,
        serviceLevel: body.serviceLevel || 'Tracked 24',
        parcelWeightKg: body.parcelWeightKg || 1.0,
        carrierCostMinor: body.carrierCostMinor || 400,
        serviceChargeMinor: body.serviceChargeMinor || 600,
        totalChargeMinor: (body.carrierCostMinor || 400) + (body.serviceChargeMinor || 600),
        status: 'DISPATCHED',
        orderNumber: body.orderNumber || 'NX-ORD-2026-001',
        destination: body.destination || 'UK Mainland',
      };
      if (!data.shippingJobs) data.shippingJobs = [];
      data.shippingJobs.unshift(newJob);
      clientDb.save();
      return { job: newJob } as unknown as T;
    }
    return { shippingJobs: data.shippingJobs || [] } as unknown as T;
  }

  // 15. Phase 1 Dropshipping Calculator
  if (pathPart === '/dropshipping/calculations') {
    if (method === 'POST') {
      const newCalc = {
        id: body.id || `ds_${Date.now()}`,
        productId: body.productId,
        sku: body.sku || 'DS-SKU-CUSTOM',
        productName: body.productName || 'Custom Dropshipped Product',
        supplierName: body.supplierName || 'Global DropShip Source',
        purchaseCostMinor: body.purchaseCostMinor || 0,
        supplierCostMinor: body.supplierCostMinor || body.purchaseCostMinor || 0,
        shippingCostMinor: body.shippingCostMinor || 0,
        packagingCostMinor: body.packagingCostMinor || 0,
        additionalExpensesMinor: body.additionalExpensesMinor || 0,
        sellingPriceMinor: body.sellingPriceMinor || 0,
        marketplaceFeePercent: body.marketplaceFeePercent || 12.8,
        marketplaceFeeMinor: body.marketplaceFeeMinor || 0,
        otherCostsMinor: body.otherCostsMinor || 0,
        shippingOption: body.shippingOption || 'SHIPPING_INCLUDED',
        shippingChargedToCustomerMinor: body.shippingChargedToCustomerMinor || 0,
        totalCostMinor: body.totalCostMinor || 0,
        grossProfitMinor: body.grossProfitMinor || 0,
        marginPercent: body.marginPercent || 0,
        netProfitMinor: body.netProfitMinor || 0,
        currency: body.currency || 'GBP',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Marcus Reid (Operations Manager)',
      };
      if (!data.dropshippingCalculations) data.dropshippingCalculations = [];
      const existingIdx = data.dropshippingCalculations.findIndex((c: any) => c.id === newCalc.id);
      if (existingIdx >= 0) {
        data.dropshippingCalculations[existingIdx] = newCalc;
      } else {
        data.dropshippingCalculations.unshift(newCalc);
      }
      clientDb.save();
      return { calculation: newCalc } as unknown as T;
    }
    return { calculations: data.dropshippingCalculations || [] } as unknown as T;
  }

  // 16. System Config
  if (pathPart === '/system/config' || pathPart === '/config') {
    if (method === 'POST') {
      data.config = { ...data.config, ...body };
      clientDb.save();
    }
    return { config: data.config } as unknown as T;
  }

  if (pathPart === '/system/reset-demo') {
    clientDb.reset();
    return { success: true, message: 'Client database reset to seed baseline.' } as unknown as T;
  }

  const notFoundErr: any = new Error(`API endpoint not found: ${pathPart}`);
  notFoundErr.status = 404;
  throw notFoundErr;
}


