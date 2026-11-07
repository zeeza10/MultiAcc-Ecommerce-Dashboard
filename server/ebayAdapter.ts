import { db } from './db';
import { engine } from './engine';
import {
  MarketplaceAccount,
  Order,
  OrderLine,
  ExceptionItem,
  SyncRun,
  OrderStatus,
} from './types';

export interface MarketplaceAdapter {
  connect(accountId: string): Promise<{ success: boolean; message: string }>;
  refreshToken(accountId: string): Promise<{ success: boolean; expiresAt: string }>;
  fetchOrders(accountId: string, since?: string): Promise<{ imported: number; skipped: number; exceptions: number }>;
  fetchOrder(accountId: string, externalOrderId: string): Promise<any>;
  fetchListings(accountId: string): Promise<any[]>;
  mapStatus(rawEbayStatus: string, paymentStatus?: string): OrderStatus;
}

export class EbayMarketplaceAdapter implements MarketplaceAdapter {
  public async connect(accountId: string): Promise<{ success: boolean; message: string }> {
    const raw = db.getRawData();
    const account = raw.marketplaceAccounts.find((a) => a.id === accountId);
    if (!account) return { success: false, message: 'Account not found' };

    account.authStatus = 'CONNECTED';
    account.tokenExpiresAt = new Date(Date.now() + 86400000 * 30).toISOString();
    account.lastSyncStatus = 'SUCCESS';
    account.lastSyncMessage = 'OAuth token renewed via RuName redirect flow (Sandbox/Production configured).';
    db.save();

    return {
      success: true,
      message: `Successfully connected to eBay account "${account.name}". Valid for 30 days.`,
    };
  }

  public async refreshToken(accountId: string): Promise<{ success: boolean; expiresAt: string }> {
    const raw = db.getRawData();
    const account = raw.marketplaceAccounts.find((a) => a.id === accountId);
    if (!account) throw new Error('Account not found');

    const newExpiry = new Date(Date.now() + 86400000 * 30).toISOString();
    account.tokenExpiresAt = newExpiry;
    account.authStatus = 'CONNECTED';
    db.save();
    return { success: true, expiresAt: newExpiry };
  }

  public mapStatus(rawEbayStatus: string, paymentStatus?: string): OrderStatus {
    const statusUpper = (rawEbayStatus || '').toUpperCase();
    const paymentUpper = (paymentStatus || '').toUpperCase();

    if (statusUpper === 'CANCELLED' || statusUpper === 'IN_CANCELLATION') {
      return 'Cancelled';
    }
    if (statusUpper === 'FULFILLED' || statusUpper === 'SHIPPED') {
      return 'Shipped';
    }
    if (statusUpper === 'DELIVERED') {
      return 'Delivered';
    }
    if (statusUpper === 'IN_PROGRESS' || statusUpper === 'PAID' || paymentUpper === 'PAID') {
      return 'Confirmed';
    }
    return 'New';
  }

  public async fetchOrder(accountId: string, externalOrderId: string): Promise<any> {
    const raw = db.getRawData();
    const existing = raw.orders.find(
      (o) => o.marketplaceAccountId === accountId && o.externalOrderId === externalOrderId
    );
    return existing ? existing.rawPayload : null;
  }

  public async fetchListings(accountId: string): Promise<any[]> {
    const raw = db.getRawData();
    return raw.skuMappings.filter((m) => m.marketplaceAccountId === accountId);
  }

  /**
   * Imports orders from eBay Sell Fulfillment API.
   * Enforces idempotency (FR-EBAY-04, AT-01).
   * Stores raw JSON payload for audit and traceability (FR-EBAY-05).
   * Routes unmapped SKUs to ExceptionItem queue (FR-EBAY-07, N-04).
   */
  public async fetchOrders(
    accountId: string,
    _since?: string
  ): Promise<{ imported: number; skipped: number; exceptions: number }> {
    const raw = db.getRawData();
    const account = raw.marketplaceAccounts.find((a) => a.id === accountId);
    if (!account) throw new Error('Account not found');

    const runId = `sync_${Date.now()}`;
    const startedAt = new Date().toISOString();

    // Simulated payload from eBay Sell Fulfillment API endpoint
    // In production, this issues an authorized GET /sell/fulfillment/v1/order?filter=creationdate:[since..]
    const incomingEbayOrders = [
      {
        orderId: '19-09412-88211', // Existing -> Should be skipped as duplicate (AT-01)
        creationDate: new Date(Date.now() - 3600000 * 48).toISOString(),
        orderPaymentStatus: 'PAID',
        orderFulfillmentStatus: 'FULFILLED',
        buyer: { username: 'oliver_smith_22', registrationAddress: { fullName: 'Oliver Smith', countryCode: 'GB' } },
        pricingSummary: { priceSubtotal: { value: '89.99', currency: 'GBP' } },
        lineItems: [
          {
            lineItemId: 'li_001',
            sku: 'EBAY-UK-NXAUD001',
            title: 'Nexus Pro Wireless ANC Headphones - Black',
            quantity: 1,
            lineItemCost: { value: '89.99', currency: 'GBP' },
          },
        ],
      },
      {
        orderId: `19-09499-${Math.floor(10000 + Math.random() * 90000)}`, // New order
        creationDate: new Date().toISOString(),
        orderPaymentStatus: 'PAID',
        orderFulfillmentStatus: 'NOT_STARTED',
        buyer: { username: `buyer_${Math.floor(Math.random() * 999)}`, registrationAddress: { fullName: 'Sophie Taylor', countryCode: 'GB' } },
        pricingSummary: { priceSubtotal: { value: '59.99', currency: 'GBP' } },
        shippingStep: {
          shipTo: {
            fullName: 'Sophie Taylor',
            contactAddress: {
              addressLine1: '27 Park Lane',
              city: 'Bristol',
              postalCode: 'BS1 5TR',
              countryCode: 'GB',
            },
          },
        },
        lineItems: [
          {
            lineItemId: 'li_new_01',
            sku: 'EBAY-UK-NXCAM002',
            title: 'Nexus 4K Ultra Wide Streaming Webcam HD',
            quantity: 1,
            lineItemCost: { value: '59.99', currency: 'GBP' },
          },
        ],
      },
      {
        orderId: `19-09555-${Math.floor(10000 + Math.random() * 90000)}`, // Order with UNMAPPED SKU
        creationDate: new Date().toISOString(),
        orderPaymentStatus: 'PAID',
        orderFulfillmentStatus: 'NOT_STARTED',
        buyer: { username: 'gamer_al_99', registrationAddress: { fullName: 'Alan Parker', countryCode: 'GB' } },
        pricingSummary: { priceSubtotal: { value: '18.99', currency: 'GBP' } },
        shippingStep: {
          shipTo: {
            fullName: 'Alan Parker',
            contactAddress: {
              addressLine1: '10 Station Road',
              city: 'Leeds',
              postalCode: 'LS2 8HE',
              countryCode: 'GB',
            },
          },
        },
        lineItems: [
          {
            lineItemId: 'li_unmapped_02',
            sku: 'EBAY-UNMAPPED-USB-CABLE',
            title: 'Braided Type-C Fast Charging Cable 2M',
            quantity: 1,
            lineItemCost: { value: '18.99', currency: 'GBP' },
          },
        ],
      },
    ];

    let importedCount = 0;
    let skippedCount = 0;
    let exceptionCount = 0;

    for (const rawEbay of incomingEbayOrders) {
      // Idempotency check: unique composite key (marketplaceAccountId, externalOrderId) (FR-EBAY-04, AT-01)
      const existing = raw.orders.find(
        (o) => o.marketplaceAccountId === account.id && o.externalOrderId === rawEbay.orderId
      );

      if (existing) {
        skippedCount++;
        continue;
      }

      // Process lines and match with catalog
      const lines: OrderLine[] = [];
      let hasUnmappedSku = false;

      for (const rawLine of rawEbay.lineItems) {
        // Find in MarketplaceSkuMap
        const mapping = raw.skuMappings.find(
          (m) => m.marketplaceAccountId === account.id && m.externalSku === rawLine.sku
        );

        let product = mapping ? raw.products.find((p) => p.id === mapping.productId) : null;
        if (!product) {
          // Direct fallback to SKU match
          product = raw.products.find((p) => p.sku === rawLine.sku) || null;
        }

        if (!product) {
          hasUnmappedSku = true;
          // Record in exception queue (FR-EBAY-07, N-04)
          const excId = `exc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          raw.exceptions.unshift({
            id: excId,
            type: 'UNMAPPED_SKU',
            source: 'EBAY',
            referenceId: rawEbay.orderId,
            details: `External listing SKU "${rawLine.sku}" on Order ${rawEbay.orderId} does not map to any active internal catalog product.`,
            rawPayloadSnippet: JSON.stringify(rawLine),
            status: 'PENDING',
            createdAt: new Date().toISOString(),
          });

          raw.notifications.unshift({
            id: `notif_exc_${Date.now()}`,
            type: 'UNMAPPED_SKU',
            title: `Unmapped SKU: ${rawLine.sku}`,
            message: `External listing SKU "${rawLine.sku}" on Order ${rawEbay.orderId} requires manual catalog mapping.`,
            severity: 'WARNING',
            referenceUrl: '/sales/ebay-accounts',
            isRead: false,
            isDismissed: false,
            createdAt: new Date().toISOString(),
          });

          exceptionCount++;
        }

        const unitPriceMinor = Math.round(parseFloat(rawLine.lineItemCost.value) * 100);
        lines.push({
          id: `ordl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId: '', // set after order creation
          productId: product ? product.id : 'UNMAPPED',
          sku: product ? product.sku : rawLine.sku,
          productName: product ? product.name : rawLine.title,
          quantity: rawLine.quantity,
          unitPriceMinor,
          taxAmountMinor: Math.round(unitPriceMinor * 0.2), // provisional 20% VAT
          totalPriceMinor: unitPriceMinor * rawLine.quantity,
          isBackordered: false,
          reservedQuantity: 0,
        });
      }

      const totalMinor = lines.reduce((acc, l) => acc + l.totalPriceMinor, 0);
      const taxMinor = lines.reduce((acc, l) => acc + l.taxAmountMinor, 0);
      const initialStatus = this.mapStatus(rawEbay.orderFulfillmentStatus, rawEbay.orderPaymentStatus);

      const orderNumber = `NX-ORD-2026-${String(raw.orders.length + 1).padStart(3, '0')}`;
      const newOrder: Order = {
        id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderNumber,
        marketplaceAccountId: account.id,
        externalOrderId: rawEbay.orderId,
        salesSource: 'EBAY',
        ownerType: 'OPERATOR',
        ownerId: 'operator',
        customerName: rawEbay.shippingStep?.shipTo?.fullName || rawEbay.buyer.registrationAddress.fullName || 'eBay Buyer',
        customerEmail: `${rawEbay.buyer.username}@marketplace.ebay.com`,
        shippingAddress: {
          name: rawEbay.shippingStep?.shipTo?.fullName || 'Valued Buyer',
          street: rawEbay.shippingStep?.shipTo?.contactAddress?.addressLine1 || 'High Street',
          city: rawEbay.shippingStep?.shipTo?.contactAddress?.city || 'London',
          postalCode: rawEbay.shippingStep?.shipTo?.contactAddress?.postalCode || 'EC1A 1BB',
          country: rawEbay.shippingStep?.shipTo?.contactAddress?.countryCode || 'GB',
        },
        status: hasUnmappedSku ? 'New' : initialStatus,
        paymentState: rawEbay.orderPaymentStatus === 'PAID' ? 'PAID' : 'PENDING',
        totalMinor,
        taxMinor,
        shippingChargeMinor: 0,
        currency: rawEbay.pricingSummary.priceSubtotal.currency || 'GBP',
        lines,
        rawPayload: rawEbay, // Traceability (FR-EBAY-05)
        notes: hasUnmappedSku ? 'Contains unmapped external line items awaiting mapping.' : undefined,
        createdAt: rawEbay.creationDate,
        updatedAt: new Date().toISOString(),
      };

      lines.forEach((l) => (l.orderId = newOrder.id));
      raw.orders.unshift(newOrder);

      // Status history
      raw.orderHistories.push({
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderId: newOrder.id,
        toStatus: newOrder.status,
        changedBy: `eBay Sync (${account.name})`,
        note: `Imported via Sell Fulfillment API. Idempotent key: ${account.id}/${rawEbay.orderId}`,
        timestamp: new Date().toISOString(),
      });

      // If Confirmed and fully mapped, attempt inventory allocation
      if (!hasUnmappedSku && newOrder.status === 'Confirmed') {
        const actor: any = {
          id: 'system_sync',
          email: 'sync@nexusops.com',
          name: 'System Sync Engine',
          role: 'OPS_MANAGER',
        };
        engine.changeOrderStatus(newOrder.id, 'Confirmed', actor);
      }

      importedCount++;
    }

    const completedAt = new Date().toISOString();
    const syncRun: SyncRun = {
      id: runId,
      accountId: account.id,
      startedAt,
      completedAt,
      status: exceptionCount > 0 ? 'COMPLETED' : 'COMPLETED',
      ordersFetched: incomingEbayOrders.length,
      ordersImported: importedCount,
      ordersSkippedDuplicate: skippedCount,
      exceptionsRaised: exceptionCount,
      logMessage: `Imported ${importedCount} new order(s), skipped ${skippedCount} duplicate(s), raised ${exceptionCount} exception(s).`,
    };

    raw.syncRuns.unshift(syncRun);
    account.lastSyncAt = completedAt;
    account.lastSyncStatus = exceptionCount > 0 ? 'PARTIAL' : 'SUCCESS';
    account.lastSyncMessage = syncRun.logMessage;

    db.save();
    return { imported: importedCount, skipped: skippedCount, exceptions: exceptionCount };
  }
}

export const ebayAdapter = new EbayMarketplaceAdapter();
