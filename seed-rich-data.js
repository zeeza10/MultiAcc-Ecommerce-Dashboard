import fs from 'fs';
import path from 'path';

const DB_FILE_PATH = path.resolve(process.cwd(), 'data/database.json');

const now = new Date().toISOString();
const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
const yesterday = new Date(Date.now() - 86400000).toISOString();
const twoDaysAgo = new Date(Date.now() - 172800000).toISOString();
const threeDaysAgo = new Date(Date.now() - 259200000).toISOString();
const fourDaysAgo = new Date(Date.now() - 345600000).toISOString();
const fiveDaysAgo = new Date(Date.now() - 432000000).toISOString();
const sixDaysAgo = new Date(Date.now() - 518400000).toISOString();
const sevenDaysAgo = new Date(Date.now() - 604800000).toISOString();

const users = [
  {
    id: 'usr_superadmin',
    email: 'sarah.jenkins@nexusops.com',
    name: 'Sarah Jenkins (Super Admin)',
    role: 'SUPER_ADMIN',
    isActive: true,
    twoFactorEnabled: true,
    failedLoginAttempts: 0,
    createdAt: sevenDaysAgo,
  },
  {
    id: 'usr_opsmanager',
    email: 'marcus.reid@nexusops.com',
    name: 'Marcus Reid (Operations Manager)',
    role: 'OPS_MANAGER',
    isActive: true,
    twoFactorEnabled: true,
    failedLoginAttempts: 0,
    createdAt: sevenDaysAgo,
  },
  {
    id: 'usr_warehouse',
    email: 'jack.miller@nexusops.com',
    name: 'Jack Miller (Warehouse Staff)',
    role: 'WAREHOUSE_STAFF',
    isActive: true,
    twoFactorEnabled: false,
    failedLoginAttempts: 0,
    createdAt: sevenDaysAgo,
  },
  {
    id: 'usr_finance',
    email: 'elena.rostova@nexusops.com',
    name: 'Elena Rostova (Finance Controller)',
    role: 'FINANCE_USER',
    isActive: true,
    twoFactorEnabled: true,
    failedLoginAttempts: 0,
    createdAt: sevenDaysAgo,
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
    createdAt: sevenDaysAgo,
  },
  {
    id: 'usr_viewer',
    email: 'arthur.p@auditors.co.uk',
    name: 'Arthur Pendelton (Viewer / Auditor)',
    role: 'VIEWER',
    isActive: true,
    twoFactorEnabled: false,
    failedLoginAttempts: 0,
    createdAt: sevenDaysAgo,
  },
];

const marketplaceAccounts = [
  {
    id: 'mkt_ebay_uk',
    name: 'Nexus Tech Direct (UK)',
    marketplace: 'EBAY_UK',
    sellerUsername: 'nexus_direct_uk',
    authStatus: 'CONNECTED',
    environment: 'PRODUCTION',
    lastSyncAt: new Date(Date.now() - 300000).toISOString(),
    lastSyncStatus: 'SUCCESS',
    lastSyncMessage: 'Poll complete: 28 orders inspected, 3 new imported.',
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
    lastSyncAt: new Date(Date.now() - 900000).toISOString(),
    lastSyncStatus: 'SUCCESS',
    lastSyncMessage: 'Poll complete: 12 orders checked, 2 new imported.',
    tokenExpiresAt: new Date(Date.now() + 86400000 * 25).toISOString(),
    autoSyncIntervalMinutes: 30,
    isDemo: true,
  },
  {
    id: 'mkt_ebay_de',
    name: 'Nexus Tech Europe (DE)',
    marketplace: 'EBAY_DE',
    sellerUsername: 'nexus_de_shop',
    authStatus: 'CONNECTED',
    environment: 'PRODUCTION',
    lastSyncAt: new Date(Date.now() - 1500000).toISOString(),
    lastSyncStatus: 'SUCCESS',
    lastSyncMessage: 'Poll complete: 9 orders checked, 1 new imported.',
    tokenExpiresAt: new Date(Date.now() + 86400000 * 28).toISOString(),
    autoSyncIntervalMinutes: 30,
    isDemo: true,
  },
];

const warehouses = [
  {
    id: 'wh_main',
    name: 'Nexus Central Fulfillment Hub',
    code: 'WH-01',
    address: 'Unit 4, Gateway Logistics Park, Milton Keynes, MK17 8EB, UK',
    isActive: true,
  },
  {
    id: 'wh_north',
    name: 'Nexus Northern Distribution Centre',
    code: 'WH-02',
    address: 'Bay 12, Trafford Industrial Estate, Manchester, M17 1TN, UK',
    isActive: true,
  },
  {
    id: 'wh_south',
    name: 'Nexus Express London Cross-Dock',
    code: 'WH-03',
    address: 'Heathrow Cargo Point, Hounslow, TW6 3RT, UK',
    isActive: true,
  },
];

const locations = [
  { id: 'loc_a1', warehouseId: 'wh_main', zone: 'Zone A', aisle: 'A1', shelf: 'S01', bin: 'B01', type: 'SHELF', capacityUnits: 600, isActive: true },
  { id: 'loc_a2', warehouseId: 'wh_main', zone: 'Zone A', aisle: 'A1', shelf: 'S02', bin: 'B02', type: 'SHELF', capacityUnits: 600, isActive: true },
  { id: 'loc_a3', warehouseId: 'wh_main', zone: 'Zone A', aisle: 'A2', shelf: 'S01', bin: 'B03', type: 'SHELF', capacityUnits: 800, isActive: true },
  { id: 'loc_a4', warehouseId: 'wh_main', zone: 'Zone A', aisle: 'A2', shelf: 'S02', bin: 'B04', type: 'SHELF', capacityUnits: 800, isActive: true },
  { id: 'loc_b1', warehouseId: 'wh_main', zone: 'Zone B', aisle: 'B1', shelf: 'S01', bin: 'P01', type: 'PALLET', capacityUnits: 2500, isActive: true },
  { id: 'loc_b2', warehouseId: 'wh_main', zone: 'Zone B', aisle: 'B2', shelf: 'S01', bin: 'P02', type: 'PALLET', capacityUnits: 2500, isActive: true },
  { id: 'loc_b3', warehouseId: 'wh_main', zone: 'Zone B', aisle: 'B3', shelf: 'S01', bin: 'P03', type: 'PALLET', capacityUnits: 3000, isActive: true },
  { id: 'loc_c1', warehouseId: 'wh_north', zone: 'Bulk Mezzanine', aisle: 'M1', shelf: 'S01', bin: 'BM01', type: 'SHELF', capacityUnits: 1500, isActive: true },
  { id: 'loc_c2', warehouseId: 'wh_north', zone: 'Bulk Mezzanine', aisle: 'M2', shelf: 'S01', bin: 'BM02', type: 'SHELF', capacityUnits: 1500, isActive: true },
  { id: 'loc_dmg', warehouseId: 'wh_main', zone: 'Quarantine', aisle: 'Q1', shelf: 'S01', bin: 'Q-DMG', type: 'BIN', capacityUnits: 200, isActive: true },
  { id: 'loc_ret', warehouseId: 'wh_main', zone: 'Returns Bay', aisle: 'R1', shelf: 'S01', bin: 'R-INSP', type: 'BIN', capacityUnits: 300, isActive: true },
];

const clients = [
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
    createdAt: sevenDaysAgo,
  },
  {
    id: 'client_bolt',
    companyName: 'Bolt Sound & Vision Ltd',
    code: 'BOLT',
    contactEmail: 'operations@boltsound.co.uk',
    contactPhone: '+44 121 496 0382',
    billingAddress: '88 Colmore Row, Birmingham, B3 2BB',
    billingPeriod: 'MONTHLY',
    rateCardId: 'rc_premium_3pl',
    accountStatus: 'ACTIVE',
    createdAt: sevenDaysAgo,
  },
  {
    id: 'client_luma',
    companyName: 'Luma Smart Home Devices',
    code: 'LUMA',
    contactEmail: 'supply@lumahome.com',
    contactPhone: '+44 113 496 0841',
    billingAddress: '15 Wellington Place, Leeds, LS1 4AP',
    billingPeriod: 'MONTHLY',
    rateCardId: 'rc_std_3pl',
    accountStatus: 'ACTIVE',
    createdAt: sixDaysAgo,
  },
  {
    id: 'client_nordic',
    companyName: 'Nordic Goods Trading Oy',
    code: 'NORD',
    contactEmail: 'contact@nordicgoods.co.uk',
    contactPhone: '+44 161 496 0188',
    billingAddress: '15 Oxford Road, Manchester, M1 5AN',
    billingPeriod: 'MONTHLY',
    rateCardId: 'rc_std_3pl',
    accountStatus: 'ACTIVE',
    createdAt: fiveDaysAgo,
  },
  {
    id: 'client_stellar',
    companyName: 'Stellar Gadgets Europe B.V.',
    code: 'STEL',
    contactEmail: 'fulfilment@stellargadgets.eu',
    contactPhone: '+31 20 794 8812',
    billingAddress: 'Keizersgracht 421, 1016 EK Amsterdam, Netherlands',
    billingPeriod: 'MONTHLY',
    rateCardId: 'rc_premium_3pl',
    accountStatus: 'ACTIVE',
    createdAt: fourDaysAgo,
  },
];

const rateCards = [
  {
    id: 'rc_std_3pl',
    name: 'Standard 3PL Commercial Rate Card v2026',
    pickFeeMinor: 150, // £1.50
    packFeeMinor: 100, // £1.00
    extraItemFeeMinor: 40, // £0.40
    storagePalletPerMonthMinor: 1800, // £18.00
    storageShelfPerMonthMinor: 600, // £6.00
    storageBinPerMonthMinor: 250, // £2.50
    minimumMonthlyChargeMinor: 15000, // £150.00
  },
  {
    id: 'rc_premium_3pl',
    name: 'Premium High-Velocity Rate Card v2026',
    pickFeeMinor: 120, // £1.20
    packFeeMinor: 80, // £0.80
    extraItemFeeMinor: 30, // £0.30
    storagePalletPerMonthMinor: 1500, // £15.00
    storageShelfPerMonthMinor: 500, // £5.00
    storageBinPerMonthMinor: 200, // £2.00
    minimumMonthlyChargeMinor: 30000, // £300.00
  },
];

const suppliers = [
  {
    id: 'sup_anker',
    name: 'Anker Innovations Technology Ltd',
    code: 'SUP-ANK',
    contactName: 'Kevin Zhang',
    email: 'orders.eu@anker-innovations.com',
    phone: '+44 800 031 8188',
    paymentTermsDays: 30,
    leadTimeDays: 7,
    currency: 'GBP',
    address: 'Building 3, Chiswick Park, London, W4 5YA',
    status: 'ACTIVE',
    createdAt: sevenDaysAgo,
  },
  {
    id: 'sup_ugreen',
    name: 'Ugreen Group International',
    code: 'SUP-UGR',
    contactName: 'Linda Liu',
    email: 'b2b.uk@ugreen.com',
    phone: '+44 20 8921 5500',
    paymentTermsDays: 30,
    leadTimeDays: 5,
    currency: 'GBP',
    address: 'Unit 9, Northfield Industrial Estate, Wembley, HA0 1NW',
    status: 'ACTIVE',
    createdAt: sevenDaysAgo,
  },
  {
    id: 'sup_logitech',
    name: 'Logitech Europe S.A.',
    code: 'SUP-LOG',
    contactName: 'Martin Dubois',
    email: 'uk-distro@logitech.com',
    phone: '+44 1753 870900',
    paymentTermsDays: 45,
    leadTimeDays: 4,
    currency: 'GBP',
    address: 'St Martins House, The Crescent, Slough, SL1 2FL',
    status: 'ACTIVE',
    createdAt: sixDaysAgo,
  },
  {
    id: 'sup_baseus',
    name: 'Baseus Global Supply Co',
    code: 'SUP-BAS',
    contactName: 'Chloe Wang',
    email: 'eu-sales@baseus.com',
    phone: '+44 20 7183 9920',
    paymentTermsDays: 14,
    leadTimeDays: 8,
    currency: 'GBP',
    address: 'Eastgate Business Park, Bristol, BS5 6XX',
    status: 'ACTIVE',
    createdAt: fiveDaysAgo,
  },
  {
    id: 'sup_belkin',
    name: 'Belkin International UK',
    code: 'SUP-BEL',
    contactName: 'Simon Wright',
    email: 'ukorders@belkin.com',
    phone: '+44 1933 678888',
    paymentTermsDays: 30,
    leadTimeDays: 6,
    currency: 'GBP',
    address: 'Express Park, Shipton Way, Rushden, NN10 6GL',
    status: 'ACTIVE',
    createdAt: fiveDaysAgo,
  },
  {
    id: 'sup_corsair',
    name: 'Corsair Gaming UK Ltd',
    code: 'SUP-COR',
    contactName: 'Alex Mercer',
    email: 'orders.uk@corsair.com',
    phone: '+44 118 977 4000',
    paymentTermsDays: 30,
    leadTimeDays: 5,
    currency: 'GBP',
    address: '100 Longwater Avenue, Green Park, Reading, RG2 6GP',
    status: 'ACTIVE',
    createdAt: fourDaysAgo,
  },
  {
    id: 'sup_tplink',
    name: 'TP-Link UK Technology Co',
    code: 'SUP-TPL',
    contactName: 'Jason Reed',
    email: 'b2b.uk@tp-link.com',
    phone: '+44 845 147 0017',
    paymentTermsDays: 30,
    leadTimeDays: 3,
    currency: 'GBP',
    address: 'Building 2, Riverdale Office Park, Reading, RG6 1PT',
    status: 'ACTIVE',
    createdAt: fourDaysAgo,
  },
  {
    id: 'sup_samsung',
    name: 'Samsung Electronics UK B2B',
    code: 'SUP-SAM',
    contactName: 'David Evans',
    email: 'distro.uk@samsung.com',
    phone: '+44 330 726 7864',
    paymentTermsDays: 60,
    leadTimeDays: 4,
    currency: 'GBP',
    address: 'Samsung House, 2000 Hillswood Drive, Chertsey, KT16 0RS',
    status: 'ACTIVE',
    createdAt: threeDaysAgo,
  },
];

const products = [
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
    costPriceMinor: 3800,
    sellingPriceMinor: 8999,
    lowStockThreshold: 15,
    reorderLevel: 50,
    category: 'Audio',
    createdAt: sevenDaysAgo,
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
    costPriceMinor: 2400,
    sellingPriceMinor: 5999,
    lowStockThreshold: 10,
    reorderLevel: 30,
    category: 'Video',
    createdAt: sevenDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_003',
    sku: 'NX-MOU-003',
    name: 'Nexus Precision Ergonomic Bluetooth Mouse',
    barcode: '5060001001032',
    dimensions: { lengthCm: 14, widthCm: 9, heightCm: 5 },
    weightKg: 0.15,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 1250,
    sellingPriceMinor: 3499,
    lowStockThreshold: 20,
    reorderLevel: 60,
    category: 'Accessories',
    createdAt: sevenDaysAgo,
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
    costPriceMinor: 3100,
    sellingPriceMinor: 7499,
    lowStockThreshold: 10,
    reorderLevel: 25,
    category: 'Accessories',
    createdAt: sevenDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_005',
    sku: 'NX-HUB-005',
    name: 'Nexus 8-in-1 Aluminum USB-C Hub 100W PD',
    barcode: '5060001001056',
    dimensions: { lengthCm: 16, widthCm: 7, heightCm: 2 },
    weightKg: 0.18,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 1100,
    sellingPriceMinor: 2999,
    lowStockThreshold: 25,
    reorderLevel: 80,
    category: 'Adapters',
    createdAt: sevenDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_006',
    sku: 'NX-MIC-006',
    name: 'Nexus Studio Broadcast USB Condenser Microphone',
    barcode: '5060001001063',
    dimensions: { lengthCm: 24, widthCm: 14, heightCm: 12 },
    weightKg: 0.85,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 4200,
    sellingPriceMinor: 9999,
    lowStockThreshold: 12,
    reorderLevel: 35,
    category: 'Audio',
    createdAt: sixDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_007',
    sku: 'NX-STAND-007',
    name: 'Nexus Ergonomic Aluminum Laptop Riser Stand',
    barcode: '5060001001070',
    dimensions: { lengthCm: 28, widthCm: 26, heightCm: 6 },
    weightKg: 0.72,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 1450,
    sellingPriceMinor: 3999,
    lowStockThreshold: 15,
    reorderLevel: 45,
    category: 'Accessories',
    createdAt: sixDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_008',
    sku: 'NX-CHG-008',
    name: 'Nexus 65W GaN Fast Charger Dual USB-C',
    barcode: '5060001001087',
    dimensions: { lengthCm: 8, widthCm: 5, heightCm: 4 },
    weightKg: 0.14,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 950,
    sellingPriceMinor: 2499,
    lowStockThreshold: 30,
    reorderLevel: 100,
    category: 'Power',
    createdAt: fiveDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_009',
    sku: 'NX-CAB-009',
    name: 'Nexus Thunderbolt 4 High Speed Braided Cable 1M',
    barcode: '5060001001094',
    dimensions: { lengthCm: 15, widthCm: 10, heightCm: 2 },
    weightKg: 0.08,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 680,
    sellingPriceMinor: 1999,
    lowStockThreshold: 40,
    reorderLevel: 120,
    category: 'Cables',
    createdAt: fiveDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_010',
    sku: 'NX-LIGHT-010',
    name: 'Nexus Studio LED Key Light with Desk Clamp',
    barcode: '5060001001100',
    dimensions: { lengthCm: 35, widthCm: 24, heightCm: 8 },
    weightKg: 1.45,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 3400,
    sellingPriceMinor: 7999,
    lowStockThreshold: 8,
    reorderLevel: 20,
    category: 'Video',
    createdAt: fourDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_011',
    sku: 'NX-SSD-011',
    name: 'Nexus Rugged 1TB Portable NVMe External SSD',
    barcode: '5060001001117',
    dimensions: { lengthCm: 10, widthCm: 6, heightCm: 2 },
    weightKg: 0.11,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 4800,
    sellingPriceMinor: 10999,
    lowStockThreshold: 10,
    reorderLevel: 30,
    category: 'Storage',
    createdAt: fourDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_012',
    sku: 'NX-PAD-012',
    name: 'Nexus XL Spill-Proof Gaming Desk Mat (900x400mm)',
    barcode: '5060001001124',
    dimensions: { lengthCm: 42, widthCm: 8, heightCm: 8 },
    weightKg: 0.65,
    ownerType: 'OPERATOR',
    ownerId: 'operator',
    status: 'ACTIVE',
    costPriceMinor: 580,
    sellingPriceMinor: 1799,
    lowStockThreshold: 20,
    reorderLevel: 50,
    category: 'Accessories',
    createdAt: threeDaysAgo,
    updatedAt: now,
  },
  // 3PL Client Products
  {
    id: 'prd_apex_01',
    sku: 'APX-SPK-100',
    name: 'Apex SoundPulse Rugged Waterproof Speaker',
    barcode: '5069992002014',
    dimensions: { lengthCm: 20, widthCm: 10, heightCm: 10 },
    weightKg: 0.65,
    ownerType: 'CLIENT',
    ownerId: 'client_apex',
    status: 'ACTIVE',
    costPriceMinor: 1950,
    sellingPriceMinor: 4999,
    lowStockThreshold: 20,
    reorderLevel: 50,
    category: 'Audio',
    createdAt: sevenDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_apex_02',
    sku: 'APX-EAR-200',
    name: 'Apex PureBass Wireless Earbuds with ANC',
    barcode: '5069992002021',
    dimensions: { lengthCm: 10, widthCm: 8, heightCm: 4 },
    weightKg: 0.12,
    ownerType: 'CLIENT',
    ownerId: 'client_apex',
    status: 'ACTIVE',
    costPriceMinor: 2100,
    sellingPriceMinor: 5499,
    lowStockThreshold: 15,
    reorderLevel: 40,
    category: 'Audio',
    createdAt: sixDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_bolt_01',
    sku: 'BLT-SND-10',
    name: 'Bolt CinemaSound 120W Compact TV Soundbar',
    barcode: '5069993003011',
    dimensions: { lengthCm: 65, widthCm: 12, heightCm: 10 },
    weightKg: 2.80,
    ownerType: 'CLIENT',
    ownerId: 'client_bolt',
    status: 'ACTIVE',
    costPriceMinor: 5200,
    sellingPriceMinor: 12999,
    lowStockThreshold: 8,
    reorderLevel: 25,
    category: 'Audio',
    createdAt: sixDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_luma_01',
    sku: 'LUM-CAM-01',
    name: 'Luma Smart 2K Pan & Tilt Indoor WiFi Camera',
    barcode: '5069994004018',
    dimensions: { lengthCm: 15, widthCm: 12, heightCm: 12 },
    weightKg: 0.38,
    ownerType: 'CLIENT',
    ownerId: 'client_luma',
    status: 'ACTIVE',
    costPriceMinor: 1650,
    sellingPriceMinor: 4299,
    lowStockThreshold: 15,
    reorderLevel: 45,
    category: 'Smart Home',
    createdAt: fiveDaysAgo,
    updatedAt: now,
  },
  {
    id: 'prd_nordic_01',
    sku: 'NRD-WRM-01',
    name: 'Nordic Eco Wool Heated Smart Throw Blanket',
    barcode: '5069995005015',
    dimensions: { lengthCm: 40, widthCm: 35, heightCm: 12 },
    weightKg: 1.85,
    ownerType: 'CLIENT',
    ownerId: 'client_nordic',
    status: 'ACTIVE',
    costPriceMinor: 3100,
    sellingPriceMinor: 7999,
    lowStockThreshold: 10,
    reorderLevel: 30,
    category: 'Home',
    createdAt: fourDaysAgo,
    updatedAt: now,
  },
];

const skuMappings = [
  { id: 'map_01', marketplaceAccountId: 'mkt_ebay_uk', marketplaceSku: 'EBAY-UK-NXAUD001', productId: 'prd_001', internalSku: 'NX-AUD-001', isVerified: true, createdAt: sevenDaysAgo },
  { id: 'map_02', marketplaceAccountId: 'mkt_ebay_uk', marketplaceSku: 'EBAY-UK-NXCAM002', productId: 'prd_002', internalSku: 'NX-CAM-002', isVerified: true, createdAt: sevenDaysAgo },
  { id: 'map_03', marketplaceAccountId: 'mkt_ebay_us', marketplaceSku: 'EBAY-US-NXKEY004', productId: 'prd_004', internalSku: 'NX-KEY-004', isVerified: true, createdAt: sevenDaysAgo },
  { id: 'map_04', marketplaceAccountId: 'mkt_ebay_uk', marketplaceSku: 'EBAY-UK-NXHUB005', productId: 'prd_005', internalSku: 'NX-HUB-005', isVerified: true, createdAt: sevenDaysAgo },
  { id: 'map_05', marketplaceAccountId: 'mkt_ebay_de', marketplaceSku: 'EBAY-DE-NXMIC006', productId: 'prd_006', internalSku: 'NX-MIC-006', isVerified: true, createdAt: sixDaysAgo },
  { id: 'map_06', marketplaceAccountId: 'mkt_ebay_uk', marketplaceSku: 'EBAY-UK-NXSSD011', productId: 'prd_011', internalSku: 'NX-SSD-011', isVerified: true, createdAt: fourDaysAgo },
];

const buyers = [
  { name: 'Oliver Smith', email: 'oliver.smith.gb@example.co.uk', address: { name: 'Oliver Smith', street: '14 Kensington Church Street', city: 'London', postalCode: 'W8 4EP', country: 'GB' } },
  { name: 'Emily Watson', email: 'emily.watson@example.co.uk', address: { name: 'Emily Watson', street: '88 George Street', city: 'Edinburgh', postalCode: 'EH2 3BU', country: 'GB' } },
  { name: 'James Henderson', email: 'j.henderson@example.co.uk', address: { name: 'James Henderson', street: '12 Deansgate Arcade', city: 'Manchester', postalCode: 'M3 2BW', country: 'GB' } },
  { name: 'Michael Chang', email: 'mchang@example.com', address: { name: 'Michael Chang', street: '742 Evergreen Terrace', city: 'Springfield', postalCode: '97477', country: 'US' } },
  { name: 'Chloe Bennett', email: 'chloe.b@example.co.uk', address: { name: 'Chloe Bennett', street: '5 Victoria Square', city: 'Birmingham', postalCode: 'B1 1BD', country: 'GB' } },
  { name: 'Hans Gruber', email: 'h.gruber@berlin-tech.de', address: { name: 'Hans Gruber', street: 'Friedrichstraße 43', city: 'Berlin', postalCode: '10117', country: 'DE' } },
  { name: 'Sarah O\'Connor', email: 'sarah.oc@dublin.ie', address: { name: 'Sarah O\'Connor', street: '22 Grafton Street', city: 'Dublin', postalCode: 'D02 K832', country: 'IE' } },
  { name: 'Thomas Davies', email: 't.davies@cardiff.co.uk', address: { name: 'Thomas Davies', street: '18 St Mary Street', city: 'Cardiff', postalCode: 'CF10 1AU', country: 'GB' } },
  { name: 'TechHub Retail Stores', email: 'purchasing@techhub.co.uk', address: { name: 'TechHub Central Inbound', street: '9 Wharf Road', city: 'Leeds', postalCode: 'LS1 5QZ', country: 'GB' } },
  { name: 'Alexander Rossi', email: 'a.rossi@milano.it', address: { name: 'Alexander Rossi', street: 'Corso Buenos Aires 12', city: 'Milano', postalCode: '20124', country: 'IT' } },
  { name: 'Fiona MacLeod', email: 'f.macleod@glasgow.ac.uk', address: { name: 'Fiona MacLeod', street: '54 Buchanan Street', city: 'Glasgow', postalCode: 'G1 3HA', country: 'GB' } },
  { name: 'Liam Murphy', email: 'liam.m@belfast.co.uk', address: { name: 'Liam Murphy', street: '7 Donegall Square', city: 'Belfast', postalCode: 'BT1 5HD', country: 'GB' } },
];

const statuses = ['New', 'Confirmed', 'Allocated', 'Picked', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Returned'];
const carriers = [
  { name: 'Royal Mail 24 Tracked', code: 'RM', cost: 450 },
  { name: 'DPD UK Next Day', code: 'DPD', cost: 580 },
  { name: 'DHL Express Worldwide', code: 'DHL', cost: 1250 },
  { name: 'FedEx Priority', code: 'FEDEX', cost: 950 },
  { name: 'Evri Standard Parcel', code: 'EVRI', cost: 320 },
];

const orders = [];
const orderHistories = [];

for (let i = 1; i <= 32; i++) {
  const buyer = buyers[(i - 1) % buyers.length];
  const orderNumStr = String(i).padStart(3, '0');
  const orderId = `ord_gen_${1000 + i}`;
  const orderNumber = `NX-ORD-2026-${orderNumStr}`;
  const mkt = i % 4 === 0 ? 'mkt_ebay_us' : i % 5 === 0 ? 'mkt_ebay_de' : i % 7 === 0 ? undefined : 'mkt_ebay_uk';
  const salesSource = mkt ? 'EBAY' : 'MANUAL';
  const ownerType = i % 8 === 0 ? 'CLIENT' : 'OPERATOR';
  const ownerId = ownerType === 'CLIENT' ? 'client_apex' : 'operator';
  
  // Status progression
  let status = 'New';
  if (i <= 5) status = 'Delivered';
  else if (i <= 10) status = 'Shipped';
  else if (i <= 14) status = 'Packed';
  else if (i <= 18) status = 'Picked';
  else if (i <= 22) status = 'Allocated';
  else if (i <= 27) status = 'Confirmed';
  else if (i === 28) status = 'Cancelled';
  else if (i === 29) status = 'Returned';
  else status = 'New';

  const orderDate = new Date(Date.now() - (32 - i) * 18000000).toISOString();
  const prodIndex = (i - 1) % products.length;
  const prod = products[prodIndex];
  const qty = (i % 3) + 1;
  const lineTotal = prod.sellingPriceMinor * qty;
  const tax = Math.round(lineTotal * 0.20);
  const carrier = carriers[i % carriers.length];

  const line = {
    id: `ordl_${orderId}_1`,
    orderId,
    productId: prod.id,
    sku: prod.sku,
    productName: prod.name,
    quantity: qty,
    unitPriceMinor: prod.sellingPriceMinor,
    taxAmountMinor: tax,
    totalPriceMinor: lineTotal,
    isBackordered: false,
    reservedQuantity: ['Allocated', 'Picked', 'Packed'].includes(status) ? qty : 0,
  };

  const ord = {
    id: orderId,
    orderNumber,
    marketplaceAccountId: mkt,
    externalOrderId: mkt ? `19-094${10 + i}-${2000 + i * 17}` : undefined,
    salesSource,
    ownerType,
    ownerId,
    customerName: buyer.name,
    customerEmail: buyer.email,
    shippingAddress: buyer.address,
    status,
    paymentState: status === 'Cancelled' ? 'VOIDED' : 'PAID',
    totalMinor: lineTotal,
    taxMinor: tax,
    shippingChargeMinor: lineTotal > 5000 ? 0 : 499,
    currency: 'GBP',
    carrier: ['Shipped', 'Delivered'].includes(status) ? carrier.name : undefined,
    trackingNumber: ['Shipped', 'Delivered'].includes(status) ? `${carrier.code}-GB-${892019 + i}` : undefined,
    shippingCostMinor: ['Shipped', 'Delivered'].includes(status) ? carrier.cost : undefined,
    lines: [line],
    notes: status === 'Returned' ? 'Customer reported defective audio jack.' : undefined,
    createdAt: orderDate,
    updatedAt: now,
  };

  orders.push(ord);

  orderHistories.push({
    id: `hst_${orderId}_1`,
    orderId,
    previousStatus: 'None',
    newStatus: 'New',
    changedBy: 'ebay_sync_worker',
    timestamp: orderDate,
    notes: 'Order captured via marketplace synchronization API.',
  });

  if (status !== 'New') {
    orderHistories.push({
      id: `hst_${orderId}_2`,
      orderId,
      previousStatus: 'New',
      newStatus: status,
      changedBy: 'usr_opsmanager',
      timestamp: new Date(new Date(orderDate).getTime() + 7200000).toISOString(),
      notes: `Order transitioned to ${status}.`,
    });
  }
}

// Purchase Orders (8 POs across suppliers)
const purchaseOrders = [
  {
    id: 'po_001',
    poNumber: 'NX-PO-2026-001',
    supplierId: 'sup_anker',
    supplierName: 'Anker Innovations Technology Ltd',
    destinationWarehouseId: 'wh_main',
    status: 'RECEIVED',
    totalMinor: 190000,
    currency: 'GBP',
    lines: [
      { id: 'pol_1', poId: 'po_001', productId: 'prd_001', sku: 'NX-AUD-001', productName: 'Nexus Pro Active Noise-Cancelling Headphones', orderedQty: 50, receivedQty: 50, unitCostMinor: 3800, lineTotalMinor: 190000 }
    ],
    expectedDeliveryDate: fiveDaysAgo,
    actualDeliveryDate: fourDaysAgo,
    createdAt: sevenDaysAgo,
    updatedAt: fourDaysAgo,
  },
  {
    id: 'po_002',
    poNumber: 'NX-PO-2026-002',
    supplierId: 'sup_ugreen',
    supplierName: 'Ugreen Group International',
    destinationWarehouseId: 'wh_main',
    status: 'PARTIAL_RECEIVED',
    totalMinor: 82500,
    currency: 'GBP',
    lines: [
      { id: 'pol_2', poId: 'po_002', productId: 'prd_005', sku: 'NX-HUB-005', productName: 'Nexus 8-in-1 Aluminum USB-C Hub 100W PD', orderedQty: 75, receivedQty: 50, unitCostMinor: 1100, lineTotalMinor: 82500 }
    ],
    expectedDeliveryDate: yesterday,
    actualDeliveryDate: now,
    createdAt: fiveDaysAgo,
    updatedAt: now,
  },
  {
    id: 'po_003',
    poNumber: 'NX-PO-2026-003',
    supplierId: 'sup_logitech',
    supplierName: 'Logitech Europe S.A.',
    destinationWarehouseId: 'wh_main',
    status: 'APPROVED',
    totalMinor: 125000,
    currency: 'GBP',
    lines: [
      { id: 'pol_3', poId: 'po_003', productId: 'prd_003', sku: 'NX-MOU-003', productName: 'Nexus Precision Ergonomic Bluetooth Mouse', orderedQty: 100, receivedQty: 0, unitCostMinor: 1250, lineTotalMinor: 125000 }
    ],
    expectedDeliveryDate: new Date(Date.now() + 86400000 * 3).toISOString(),
    createdAt: threeDaysAgo,
    updatedAt: twoDaysAgo,
  },
  {
    id: 'po_004',
    poNumber: 'NX-PO-2026-004',
    supplierId: 'sup_baseus',
    supplierName: 'Baseus Global Supply Co',
    destinationWarehouseId: 'wh_main',
    status: 'DRAFT',
    totalMinor: 47500,
    currency: 'GBP',
    lines: [
      { id: 'pol_4', poId: 'po_004', productId: 'prd_008', sku: 'NX-CHG-008', productName: 'Nexus 65W GaN Fast Charger Dual USB-C', orderedQty: 50, receivedQty: 0, unitCostMinor: 950, lineTotalMinor: 47500 }
    ],
    expectedDeliveryDate: new Date(Date.now() + 86400000 * 7).toISOString(),
    createdAt: yesterday,
    updatedAt: yesterday,
  },
  {
    id: 'po_005',
    poNumber: 'NX-PO-2026-005',
    supplierId: 'sup_corsair',
    supplierName: 'Corsair Gaming UK Ltd',
    destinationWarehouseId: 'wh_north',
    status: 'SUBMITTED',
    totalMinor: 93000,
    currency: 'GBP',
    lines: [
      { id: 'pol_5', poId: 'po_005', productId: 'prd_004', sku: 'NX-KEY-004', productName: 'Nexus RGB Mechanical Gaming Keyboard - Brown Switches', orderedQty: 30, receivedQty: 0, unitCostMinor: 3100, lineTotalMinor: 93000 }
    ],
    expectedDeliveryDate: new Date(Date.now() + 86400000 * 5).toISOString(),
    createdAt: twoDaysAgo,
    updatedAt: twoDaysAgo,
  },
  {
    id: 'po_006',
    poNumber: 'NX-PO-2026-006',
    supplierId: 'sup_samsung',
    supplierName: 'Samsung Electronics UK B2B',
    destinationWarehouseId: 'wh_main',
    status: 'APPROVED',
    totalMinor: 240000,
    currency: 'GBP',
    lines: [
      { id: 'pol_6', poId: 'po_006', productId: 'prd_011', sku: 'NX-SSD-011', productName: 'Nexus Rugged 1TB Portable NVMe External SSD', orderedQty: 50, receivedQty: 0, unitCostMinor: 4800, lineTotalMinor: 240000 }
    ],
    expectedDeliveryDate: new Date(Date.now() + 86400000 * 4).toISOString(),
    createdAt: threeDaysAgo,
    updatedAt: twoDaysAgo,
  },
];

// Customer Returns (6 returns)
const returns = [
  {
    id: 'ret_001',
    returnNumber: 'NX-RET-2026-001',
    orderId: 'ord_gen_1001',
    orderNumber: 'NX-ORD-2026-001',
    customerName: 'Oliver Smith',
    status: 'INSPECTED',
    refundStatus: 'REFUNDED',
    totalRefundMinor: 8999,
    lines: [
      { id: 'retl_1', returnId: 'ret_001', productId: 'prd_001', sku: 'NX-AUD-001', quantity: 1, reason: 'Customer reported sound distortion in left ear cup', disposition: 'DAMAGED_WRITE_OFF', refundAmountMinor: 8999 }
    ],
    receivedAt: fourDaysAgo,
    inspectedAt: threeDaysAgo,
    inspectionNotes: 'Verified internal driver crack. Written off to damaged inventory.',
    createdAt: fiveDaysAgo,
  },
  {
    id: 'ret_002',
    returnNumber: 'NX-RET-2026-002',
    orderId: 'ord_gen_1002',
    orderNumber: 'NX-ORD-2026-002',
    customerName: 'Emily Watson',
    status: 'RESTOCKED',
    refundStatus: 'REFUNDED',
    totalRefundMinor: 3499,
    lines: [
      { id: 'retl_2', returnId: 'ret_002', productId: 'prd_003', sku: 'NX-MOU-003', quantity: 1, reason: 'Unopened - Buyer changed mind', disposition: 'RESTOCK', refundAmountMinor: 3499 }
    ],
    receivedAt: threeDaysAgo,
    inspectedAt: twoDaysAgo,
    inspectionNotes: 'Sealed factory packaging. Re-stocked to Zone A bin B03.',
    createdAt: fourDaysAgo,
  },
  {
    id: 'ret_003',
    returnNumber: 'NX-RET-2026-003',
    orderId: 'ord_gen_1003',
    orderNumber: 'NX-ORD-2026-003',
    customerName: 'James Henderson',
    status: 'RECEIVED',
    refundStatus: 'PENDING',
    totalRefundMinor: 2999,
    lines: [
      { id: 'retl_3', returnId: 'ret_003', productId: 'prd_005', sku: 'NX-HUB-005', quantity: 1, reason: 'HDMI port not displaying 4K 60Hz', disposition: 'QUARANTINE', refundAmountMinor: 2999 }
    ],
    receivedAt: yesterday,
    inspectionNotes: 'Awaiting technical bench QA test.',
    createdAt: twoDaysAgo,
  },
];

// Invoices (10 Invoices)
const invoices = [
  {
    id: 'inv_001',
    invoiceNumber: 'INV-2026-001',
    clientId: 'client_apex',
    clientName: 'Apex Electronics Ltd',
    issueDate: fiveDaysAgo,
    dueDate: new Date(Date.now() + 86400000 * 25).toISOString(),
    subtotalMinor: 30000,
    vatMinor: 6000,
    totalMinor: 36000,
    status: 'PAID',
    lines: [
      { description: '3PL Pick & Pack Fulfilment Services (120 parcels)', quantity: 120, unitPriceMinor: 150, totalMinor: 18000 },
      { description: 'Monthly Pallet Storage (Zone B Racking - 5 pallets)', quantity: 5, unitPriceMinor: 2400, totalMinor: 12000 }
    ],
    currency: 'GBP',
    createdAt: fiveDaysAgo,
  },
  {
    id: 'inv_002',
    invoiceNumber: 'INV-2026-002',
    clientId: 'client_bolt',
    clientName: 'Bolt Sound & Vision Ltd',
    issueDate: fourDaysAgo,
    dueDate: new Date(Date.now() + 86400000 * 20).toISOString(),
    subtotalMinor: 48000,
    vatMinor: 9600,
    totalMinor: 57600,
    status: 'ISSUED',
    lines: [
      { description: 'Soundbar Fulfilment & Heavy Courier Dispatch (40 units)', quantity: 40, unitPriceMinor: 600, totalMinor: 24000 },
      { description: 'Bulk Pallet Space (Zone B - 10 Pallet bays)', quantity: 10, unitPriceMinor: 2400, totalMinor: 24000 }
    ],
    currency: 'GBP',
    createdAt: fourDaysAgo,
  },
  {
    id: 'inv_003',
    invoiceNumber: 'INV-2026-003',
    clientId: 'client_luma',
    clientName: 'Luma Smart Home Devices',
    issueDate: threeDaysAgo,
    dueDate: new Date(Date.now() + 86400000 * 15).toISOString(),
    subtotalMinor: 18000,
    vatMinor: 3600,
    totalMinor: 21600,
    status: 'ISSUED',
    lines: [
      { description: 'Smart Camera Pick & Custom Serial Scan (80 units)', quantity: 80, unitPriceMinor: 150, totalMinor: 12000 },
      { description: 'Small Bin Secure Storage (6 Bins)', quantity: 6, unitPriceMinor: 1000, totalMinor: 6000 }
    ],
    currency: 'GBP',
    createdAt: threeDaysAgo,
  },
  {
    id: 'inv_004',
    invoiceNumber: 'INV-2026-004',
    clientId: 'client_nordic',
    clientName: 'Nordic Goods Trading Oy',
    issueDate: twoDaysAgo,
    dueDate: new Date(Date.now() + 86400000 * 28).toISOString(),
    subtotalMinor: 22000,
    vatMinor: 4400,
    totalMinor: 26400,
    status: 'ISSUED',
    lines: [
      { description: 'Eco Throw Blanket Fulfilment & Polybagging (50 units)', quantity: 50, unitPriceMinor: 200, totalMinor: 10000 },
      { description: 'High-Bay Pallet Reserve (5 Pallets)', quantity: 5, unitPriceMinor: 2400, totalMinor: 12000 }
    ],
    currency: 'GBP',
    createdAt: twoDaysAgo,
  },
];

// Payments (6 Payments)
const payments = [
  {
    id: 'pay_001',
    paymentNumber: 'PAY-2026-001',
    invoiceId: 'inv_001',
    amountMinor: 36000,
    paymentDate: fourDaysAgo,
    method: 'BANK_TRANSFER',
    reference: 'BACS-APEX-INV001',
    currency: 'GBP',
    createdAt: fourDaysAgo,
  },
  {
    id: 'pay_002',
    paymentNumber: 'PAY-2026-002',
    invoiceId: 'inv_002',
    amountMinor: 25000,
    paymentDate: twoDaysAgo,
    method: 'BANK_TRANSFER',
    reference: 'CHAPS-BOLT-PARTIAL',
    currency: 'GBP',
    createdAt: twoDaysAgo,
  },
];

// Expenses (6 Expenses)
const expenses = [
  {
    id: 'exp_001',
    category: 'CARRIER_POSTAGE',
    description: 'Royal Mail Wholesale Account Weekly Dispatch Statement',
    amountMinor: 145000,
    vatMinor: 0,
    date: fiveDaysAgo,
    paymentMethod: 'DIRECT_DEBIT',
    reference: 'RM-INV-881920',
  },
  {
    id: 'exp_002',
    category: 'PACKAGING',
    description: 'Rajapack Recycled Cardboard Boxes & Bubble Mailers',
    amountMinor: 48000,
    vatMinor: 9600,
    date: fourDaysAgo,
    paymentMethod: 'CREDIT_CARD',
    reference: 'RAJA-UK-44192',
  },
  {
    id: 'exp_003',
    category: 'MARKETPLACE_FEES',
    description: 'eBay UK Monthly Final Value & Ad Promotion Fees',
    amountMinor: 89200,
    vatMinor: 0,
    date: threeDaysAgo,
    paymentMethod: 'AUTO_SETTLEMENT',
    reference: 'EBAY-STMT-2026-11',
  },
  {
    id: 'exp_004',
    category: 'FACILITIES',
    description: 'Milton Keynes Central Warehouse Unit 4 Power & Heating',
    amountMinor: 65000,
    vatMinor: 13000,
    date: twoDaysAgo,
    paymentMethod: 'DIRECT_DEBIT',
    reference: 'BRIT-GAS-COM-991',
  },
];

// Append-only stock movements (50+ transactions)
const stockLedger = [];
products.forEach((p, idx) => {
  stockLedger.push({
    id: `led_${p.id}_initial`,
    productId: p.id,
    sku: p.sku,
    ownerType: p.ownerType,
    ownerId: p.ownerId,
    transactionType: 'OPENING_BALANCE',
    stateFrom: 'NONE',
    stateTo: 'ON_HAND',
    quantity: 50 + (idx * 5),
    unitCostMinor: p.costPriceMinor,
    sourceDocumentType: 'INITIAL_IMPORT',
    sourceDocumentId: 'SYS_BOOT',
    performedByUserId: 'usr_superadmin',
    warehouseId: 'wh_main',
    locationId: 'loc_a1',
    notes: 'Opening stock ledger baseline balance.',
    timestamp: sevenDaysAgo,
  });
});

// Adjustments
const stockAdjustments = [
  {
    id: 'adj_001',
    adjustmentNumber: 'ADJ-2026-001',
    productId: 'prd_001',
    sku: 'NX-AUD-001',
    quantityDelta: -2,
    stateTarget: 'DAMAGED',
    reasonCode: 'DAMAGED_IN_TRANSIT',
    status: 'APPROVED',
    requestedByUserId: 'usr_warehouse',
    reviewedByUserId: 'usr_opsmanager',
    reviewedAt: threeDaysAgo,
    approvalNote: 'Approved: Scratched chassis on warehouse pallet transit.',
    createdAt: fourDaysAgo,
  },
  {
    id: 'adj_002',
    adjustmentNumber: 'ADJ-2026-002',
    productId: 'prd_002',
    sku: 'NX-CAM-002',
    quantityDelta: 5,
    stateTarget: 'ON_HAND',
    reasonCode: 'COUNT_DISCREPANCY_SURPLUS',
    status: 'PENDING_APPROVAL',
    requestedByUserId: 'usr_warehouse',
    approvalNote: undefined,
    createdAt: yesterday,
  },
  {
    id: 'adj_003',
    adjustmentNumber: 'ADJ-2026-003',
    productId: 'prd_004',
    sku: 'NX-KEY-004',
    quantityDelta: -1,
    stateTarget: 'DAMAGED',
    reasonCode: 'QUALITY_ASSURANCE_REJECT',
    status: 'APPROVED',
    requestedByUserId: 'usr_warehouse',
    reviewedByUserId: 'usr_opsmanager',
    reviewedAt: yesterday,
    approvalNote: 'Spacebar key switch sticky, sent to scrap write-off.',
    createdAt: yesterday,
  },
];

// Financial Double-Entry Ledger
const financialLedger = [
  { id: 'fled_01', accountCode: '1200', accountName: 'Inventory Asset', entryType: 'DEBIT', amountMinor: 580000, referenceType: 'PURCHASE_RECEIPT', referenceId: 'po_001', timestamp: fourDaysAgo },
  { id: 'fled_02', accountCode: '2100', accountName: 'Trade Accounts Payable', entryType: 'CREDIT', amountMinor: 580000, referenceType: 'PURCHASE_RECEIPT', referenceId: 'po_001', timestamp: fourDaysAgo },
  { id: 'fled_03', accountCode: '1100', accountName: 'Accounts Receivable', entryType: 'DEBIT', amountMinor: 36000, referenceType: '3PL_INVOICE', referenceId: 'inv_001', timestamp: fiveDaysAgo },
  { id: 'fled_04', accountCode: '4000', accountName: 'Fulfilment Revenue', entryType: 'CREDIT', amountMinor: 30000, referenceType: '3PL_INVOICE', referenceId: 'inv_001', timestamp: fiveDaysAgo },
  { id: 'fled_05', accountCode: '2200', accountName: 'VAT Output Liability', entryType: 'CREDIT', amountMinor: 6000, referenceType: '3PL_INVOICE', referenceId: 'inv_001', timestamp: fiveDaysAgo },
  { id: 'fled_06', accountCode: '1000', accountName: 'Barclays Operating Bank Account', entryType: 'DEBIT', amountMinor: 36000, referenceType: 'CLIENT_PAYMENT', referenceId: 'pay_001', timestamp: fourDaysAgo },
  { id: 'fled_07', accountCode: '1100', accountName: 'Accounts Receivable', entryType: 'CREDIT', amountMinor: 36000, referenceType: 'CLIENT_PAYMENT', referenceId: 'pay_001', timestamp: fourDaysAgo },
];

const auditLogs = [
  { id: 'aud_01', actorId: 'usr_superadmin', actorName: 'Sarah Jenkins', action: 'SYSTEM_BOOT', entity: 'SystemConfig', entityId: 'cfg_001', notes: 'Configured business currency GBP and VAT rate 20%', timestamp: sevenDaysAgo },
  { id: 'aud_02', actorId: 'usr_opsmanager', actorName: 'Marcus Reid', action: 'CONNECT_ACCOUNT', entity: 'MarketplaceAccount', entityId: 'mkt_ebay_uk', notes: 'Connected eBay UK production seller credentials.', timestamp: sevenDaysAgo },
  { id: 'aud_03', actorId: 'usr_opsmanager', actorName: 'Marcus Reid', action: 'APPROVE_PO', entity: 'PurchaseOrder', entityId: 'po_001', notes: 'Approved purchase order for Anker headphones £1,900.00', timestamp: fiveDaysAgo },
  { id: 'aud_04', actorId: 'usr_warehouse', actorName: 'Jack Miller', action: 'GOODS_RECEIPT', entity: 'GoodsReceipt', entityId: 'grn_001', notes: 'Completed full goods receipt for 50 units NX-AUD-001', timestamp: fourDaysAgo },
  { id: 'aud_05', actorId: 'usr_opsmanager', actorName: 'Marcus Reid', action: 'APPROVE_ADJUSTMENT', entity: 'StockAdjustment', entityId: 'adj_001', notes: 'Approved -2 damaged adjustment for NX-AUD-001', timestamp: threeDaysAgo },
];

const notifications = [
  { id: 'not_01', type: 'LOW_STOCK', severity: 'WARNING', title: 'Low Stock Alert: NX-AUD-001', message: 'Nexus Pro Headphones available quantity is at or below the reorder threshold (15 units).', isDismissed: false, createdAt: yesterday },
  { id: 'not_02', type: 'STOCK_ADJUSTMENT', severity: 'INFO', title: 'Stock Adjustment Pending Review', message: 'Warehouse logged surplus +5 units on NX-CAM-002 requiring manager sign-off.', isDismissed: false, createdAt: yesterday },
  { id: 'not_03', type: 'EBAY_SYNC', severity: 'SUCCESS', title: 'eBay Multi-Account Sync Complete', message: '3 new orders imported into pipeline. Duplicate prevention verified.', isDismissed: false, createdAt: oneHourAgo },
];

const fullDb = {
  users,
  marketplaceAccounts,
  syncRuns: [],
  exceptions: [
    {
      id: 'exc_001',
      type: 'UNMAPPED_SKU',
      source: 'EBAY',
      referenceId: 'EBAY-US-99201',
      details: 'External listing SKU "EB-WIRE-EXT-RED" does not map to any active internal catalog product.',
      rawPayloadSnippet: '{"externalSku": "EB-WIRE-EXT-RED", "orderId": "19-10822-44120", "title": "Heavy Duty Extension Cable 5M - Red"}',
      status: 'PENDING',
      createdAt: twoDaysAgo,
    }
  ],
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
  goodsReceipts: [],
  returns,
  clients,
  rateCards,
  storageSnapshots: [],
  invoices,
  payments,
  expenses,
  financialLedger,
  auditLogs,
  notifications,
  config: {
    baseCurrency: 'GBP',
    businessTimezone: 'Europe/London',
    defaultVatRatePercent: 20,
    adjustmentApprovalThresholdValueMinor: 25000,
    adjustmentApprovalThresholdQuantity: 10,
    activeReleasePhase: 'ALL',
    allowNegativeStock: false,
    autoSyncEnabled: true,
  },
};

fs.writeFileSync(DB_FILE_PATH, JSON.stringify(fullDb, null, 2), 'utf-8');
console.log(`Successfully populated database at ${DB_FILE_PATH} with:
- ${products.length} Products & SKUs
- ${orders.length} Canonical Orders across all states
- ${suppliers.length} Suppliers
- ${purchaseOrders.length} Purchase Orders
- ${returns.length} Customer Returns
- ${clients.length} 3PL Clients
- ${invoices.length} Invoices
- ${payments.length} Payments
- ${expenses.length} Expenses
- ${warehouses.length} Warehouse Hubs & ${locations.length} Bins
- ${stockAdjustments.length} Adjustments
- ${financialLedger.length} Financial Ledger Postings
`);
