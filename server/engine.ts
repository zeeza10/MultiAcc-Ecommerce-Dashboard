import { db } from './db';
import {
  Order,
  OrderStatus,
  StockBalance,
  StockLedgerEntry,
  StockAdjustment,
  StockState,
  AuditLogEntry,
  User,
  NotificationItem,
} from './types';

// Allowed canonical order status transitions per SRS S7.1
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  New: ['Confirmed', 'Cancelled'],
  Confirmed: ['Allocated', 'Cancelled'],
  Allocated: ['Picked', 'Cancelled'],
  Picked: ['Packed', 'Allocated', 'Cancelled'],
  Packed: ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Returned'],
  Delivered: ['Returned'],
  Cancelled: [],
  Returned: [],
};

export class EngineService {
  /**
   * Recalculates stock balances directly from the append-only stock ledger (FR-INV-03, S7.2).
   */
  public calculateBalances(targetSkuId?: string, targetOwnerId?: string): StockBalance[] {
    const raw = db.getRawData();
    const balanceMap = new Map<string, StockBalance>();

    // Initialize map from product catalog
    for (const prod of raw.products) {
      if (targetSkuId && prod.id !== targetSkuId && prod.sku !== targetSkuId) continue;
      if (targetOwnerId && prod.ownerId !== targetOwnerId) continue;

      balanceMap.set(prod.id, {
        productId: prod.id,
        sku: prod.sku,
        ownerId: prod.ownerId,
        onHand: 0,
        reserved: 0,
        available: 0,
        incoming: 0,
        damaged: 0,
        quarantined: 0,
        missing: 0,
        totalStock: 0,
        weightedAverageCostMinor: prod.costPriceMinor,
      });
    }

    // Tally from append-only stock ledger
    for (const entry of raw.stockLedger) {
      const balance = balanceMap.get(entry.skuId);
      if (!balance) continue;

      switch (entry.state) {
        case 'ON_HAND':
          balance.onHand += entry.qtyDelta;
          break;
        case 'RESERVED':
          balance.reserved += entry.qtyDelta;
          break;
        case 'INCOMING':
          balance.incoming += entry.qtyDelta;
          break;
        case 'DAMAGED':
          balance.damaged += entry.qtyDelta;
          break;
        case 'QUARANTINED':
          balance.quarantined += entry.qtyDelta;
          break;
        case 'MISSING':
          balance.missing += entry.qtyDelta;
          break;
      }
    }

    // Compute derived properties: Available = onHand - reserved; TotalStock = onHand + damaged + quarantined
    for (const balance of balanceMap.values()) {
      balance.available = Math.max(0, balance.onHand - balance.reserved);
      balance.totalStock = balance.onHand + balance.damaged + balance.quarantined;
    }

    return Array.from(balanceMap.values());
  }

  /**
   * Transitions an order according to the canonical state machine, handling reservations and stock deductions.
   */
  public changeOrderStatus(
    orderId: string,
    targetStatus: OrderStatus,
    actor: User,
    options?: { carrier?: string; trackingNumber?: string; note?: string }
  ): { success: boolean; order?: Order; error?: string } {
    const raw = db.getRawData();
    const order = raw.orders.find((o) => o.id === orderId);

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // Role check: 3PL client cannot change orders; warehouse staff can update workflow states but not cancel or approve adjustments
    if (actor.role === 'CLIENT_USER') {
      return { success: false, error: 'Client users do not have permission to transition order statuses.' };
    }

    if (actor.role === 'WAREHOUSE_STAFF' && targetStatus === 'Cancelled') {
      return { success: false, error: 'Warehouse staff cannot cancel orders. Operations Manager required.' };
    }

    const currentStatus = order.status;
    const allowed = ALLOWED_TRANSITIONS[currentStatus];

    if (!allowed || !allowed.includes(targetStatus)) {
      return {
        success: false,
        error: `Invalid transition from "${currentStatus}" to "${targetStatus}". Allowed next statuses: ${allowed.join(', ') || 'None (Terminal)'}.`,
      };
    }

    const now = new Date().toISOString();
    const beforeSnapshot = JSON.parse(JSON.stringify(order));

    // Handle state specific business logic
    if (targetStatus === 'Confirmed' || targetStatus === 'Allocated') {
      // Allocate stock & check availability (Decision table 7.3, FR-ORD-04)
      const balances = this.calculateBalances();
      for (const line of order.lines) {
        const bal = balances.find((b) => b.productId === line.productId);
        const avail = bal ? bal.available : 0;

        if (avail >= line.quantity) {
          line.reservedQuantity = line.quantity;
          line.isBackordered = false;

          // Record reservation in stock ledger
          raw.stockLedger.push({
            id: `stk_res_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            skuId: line.productId,
            sku: line.sku,
            productName: line.productName,
            locationId: raw.locations[0]?.id || 'loc_def',
            locationCode: 'Zone A / A1 / S01 / B01',
            ownerType: order.ownerType,
            ownerId: order.ownerId,
            qtyDelta: line.quantity,
            state: 'RESERVED',
            sourceType: 'ORDER_RESERVE',
            sourceId: order.id,
            note: `Reservation for Order ${order.orderNumber}`,
            createdBy: actor.email,
            createdAt: now,
          });
        } else {
          // Insufficient stock: mark Backordered (AT-03, FR-ORD-05)
          line.reservedQuantity = avail;
          line.isBackordered = true;
          // Raise notification
          raw.notifications.unshift({
            id: `notif_bo_${Date.now()}`,
            type: 'LOW_STOCK',
            title: `Order Line Backordered: ${line.sku}`,
            message: `Order ${order.orderNumber} requires ${line.quantity} of ${line.sku}, but only ${avail} available. Line flagged as backordered.`,
            severity: 'WARNING',
            referenceUrl: `/sales/orders`,
            isRead: false,
            isDismissed: false,
            createdAt: now,
          });
        }
      }
    } else if (targetStatus === 'Cancelled') {
      // Cancellation releases reservations (FR-ORD-07)
      for (const line of order.lines) {
        if (line.reservedQuantity > 0) {
          raw.stockLedger.push({
            id: `stk_rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            skuId: line.productId,
            sku: line.sku,
            productName: line.productName,
            locationId: raw.locations[0]?.id || 'loc_def',
            locationCode: 'Zone A / A1 / S01 / B01',
            ownerType: order.ownerType,
            ownerId: order.ownerId,
            qtyDelta: -line.reservedQuantity,
            state: 'RESERVED',
            sourceType: 'ORDER_CANCEL',
            sourceId: order.id,
            note: `Release reservation due to cancellation of Order ${order.orderNumber}`,
            createdBy: actor.email,
            createdAt: now,
          });
          line.reservedQuantity = 0;
        }
      }
    } else if (targetStatus === 'Shipped') {
      // Dispatch order: deduct stock exactly once and recognize COGS (FR-SHIP-03, AT-04)
      if (options?.carrier) order.carrier = options.carrier;
      if (options?.trackingNumber) order.trackingNumber = options.trackingNumber;

      for (const line of order.lines) {
        // Release reservation delta
        if (line.reservedQuantity > 0) {
          raw.stockLedger.push({
            id: `stk_rel_ship_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            skuId: line.productId,
            sku: line.sku,
            productName: line.productName,
            locationId: raw.locations[0]?.id || 'loc_def',
            locationCode: 'Zone A / A1 / S01 / B01',
            ownerType: order.ownerType,
            ownerId: order.ownerId,
            qtyDelta: -line.reservedQuantity,
            state: 'RESERVED',
            sourceType: 'ORDER_DISPATCH',
            sourceId: order.id,
            note: `Clear reservation on dispatch for Order ${order.orderNumber}`,
            createdBy: actor.email,
            createdAt: now,
          });
        }

        // Deduct from ON_HAND
        const prod = raw.products.find((p) => p.id === line.productId);
        const costPrice = prod ? prod.costPriceMinor : 0;

        raw.stockLedger.push({
          id: `stk_ded_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          skuId: line.productId,
          sku: line.sku,
          productName: line.productName,
          locationId: raw.locations[0]?.id || 'loc_def',
          locationCode: 'Zone A / A1 / S01 / B01',
          ownerType: order.ownerType,
          ownerId: order.ownerId,
          qtyDelta: -line.quantity,
          state: 'ON_HAND',
          sourceType: 'ORDER_DISPATCH',
          sourceId: order.id,
          unitCostMinor: costPrice,
          note: `Physical dispatch deduction for Order ${order.orderNumber}`,
          createdBy: actor.email,
          createdAt: now,
        });

        // Double-entry financial posting: Debit COGS, Credit Inventory Asset (Table 12.2)
        const cogsTotalMinor = costPrice * line.quantity;
        if (cogsTotalMinor > 0) {
          raw.financialLedger.push({
            id: `fin_cogs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            accountId: '5000',
            accountName: 'Cost of Goods Sold (COGS)',
            debitMinor: cogsTotalMinor,
            creditMinor: 0,
            sourceType: 'SHIPMENT',
            sourceId: order.id,
            note: `COGS recognized for Order ${order.orderNumber} (${line.quantity}x ${line.sku})`,
            createdAt: now,
          });

          raw.financialLedger.push({
            id: `fin_asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            accountId: '1300',
            accountName: 'Inventory Asset',
            debitMinor: 0,
            creditMinor: cogsTotalMinor,
            sourceType: 'SHIPMENT',
            sourceId: order.id,
            note: `Inventory relief for Order ${order.orderNumber}`,
            createdAt: now,
          });
        }
      }
    }

    order.status = targetStatus;
    order.updatedAt = now;

    // Record status history
    raw.orderHistories.push({
      id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      orderId: order.id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      changedBy: actor.name || actor.email,
      note: options?.note || `Status updated to ${targetStatus}`,
      timestamp: now,
    });

    // Record audit log
    raw.auditLogs.unshift({
      id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      actorId: actor.id,
      actorName: actor.name,
      action: 'UPDATE',
      entity: 'Order',
      entityId: order.id,
      beforeSnapshot,
      afterSnapshot: JSON.parse(JSON.stringify(order)),
      notes: `Order status moved from ${currentStatus} to ${targetStatus}`,
      timestamp: now,
    });

    db.save();
    return { success: true, order };
  }

  /**
   * Submits a stock adjustment with threshold logic (FR-ADJ-01 to 05, S6.4).
   */
  public submitAdjustment(
    productId: string,
    locationId: string,
    quantityDelta: number,
    targetState: StockState,
    reasonCode: 'damage' | 'loss' | 'found' | 'count_correction' | 'quarantine' | 'write_off',
    note: string,
    actor: User
  ): { success: boolean; adjustment?: StockAdjustment; error?: string } {
    const raw = db.getRawData();
    const product = raw.products.find((p) => p.id === productId);

    if (!product) {
      return { success: false, error: 'Product not found' };
    }

    // Role check: Finance users cannot modify stock (Matrix S4)
    if (actor.role === 'FINANCE_USER' || actor.role === 'CLIENT_USER' || actor.role === 'VIEWER') {
      return { success: false, error: 'User role is not authorized to create stock adjustments.' };
    }

    const valueMinor = Math.abs(quantityDelta) * product.costPriceMinor;
    const exceedsThreshold =
      Math.abs(quantityDelta) > raw.config.adjustmentApprovalThresholdQuantity ||
      valueMinor > raw.config.adjustmentApprovalThresholdValueMinor;

    const now = new Date().toISOString();
    const adjNumber = `ADJ-${new Date().getFullYear()}-${String(raw.stockAdjustments.length + 1).padStart(3, '0')}`;

    const adjustment: StockAdjustment = {
      id: `adj_${Date.now()}`,
      adjustmentNumber: adjNumber,
      productId: product.id,
      sku: product.sku,
      locationId: locationId || raw.locations[0]?.id || 'loc_def',
      quantityDelta,
      targetState,
      reasonCode,
      note,
      requestedBy: actor.email,
      requiresApproval: exceedsThreshold,
      status: exceedsThreshold ? 'PENDING_APPROVAL' : 'APPROVED',
      evaluatedValueMinor: valueMinor,
      createdAt: now,
      updatedAt: now,
    };

    if (!exceedsThreshold) {
      // Auto-post directly to ledger (append-only)
      adjustment.approvedBy = 'System (Auto-approved under threshold)';
      adjustment.approvalNote = `Delta (${quantityDelta} units, £${(valueMinor / 100).toFixed(2)}) is within manager threshold.`;

      raw.stockLedger.push({
        id: `stk_adj_${Date.now()}`,
        skuId: product.id,
        sku: product.sku,
        productName: product.name,
        locationId: adjustment.locationId,
        locationCode: raw.locations.find((l) => l.id === adjustment.locationId)?.bin || 'Zone A / A1 / S01 / B01',
        ownerType: product.ownerType,
        ownerId: product.ownerId,
        qtyDelta: quantityDelta,
        state: targetState,
        sourceType: 'ADJUSTMENT',
        sourceId: adjustment.id,
        unitCostMinor: product.costPriceMinor,
        note: `Approved adjustment ${adjNumber}: ${reasonCode} - ${note}`,
        createdBy: actor.email,
        createdAt: now,
      });
    } else {
      // Create alert for manager approval (N-06)
      raw.notifications.unshift({
        id: `notif_adj_${Date.now()}`,
        type: 'ADJUSTMENT_AWAITING_APPROVAL',
        title: `Adjustment Needs Approval: ${adjNumber}`,
        message: `${actor.name} requested adjustment of ${quantityDelta > 0 ? '+' : ''}${quantityDelta} ${product.sku} (Value: £${(valueMinor / 100).toFixed(2)}). Exceeds automatic limits.`,
        severity: 'INFO',
        referenceUrl: '/stock/adjustments',
        isRead: false,
        isDismissed: false,
        createdAt: now,
      });
    }

    raw.stockAdjustments.unshift(adjustment);

    // Audit
    raw.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      actorId: actor.id,
      actorName: actor.name,
      action: 'CREATE',
      entity: 'StockAdjustment',
      entityId: adjustment.id,
      afterSnapshot: JSON.parse(JSON.stringify(adjustment)),
      notes: `Submitted adjustment ${adjNumber} (${adjustment.status})`,
      timestamp: now,
    });

    db.save();
    return { success: true, adjustment };
  }

  /**
   * Approves or rejects a pending stock adjustment. Enforces dual control: Requester cannot approve their own adjustment! (FR-ADJ-04, AT-05).
   */
  public processAdjustmentDecision(
    adjustmentId: string,
    decision: 'APPROVE' | 'REJECT',
    approver: User,
    approvalNote: string
  ): { success: boolean; adjustment?: StockAdjustment; error?: string } {
    const raw = db.getRawData();
    const adj = raw.stockAdjustments.find((a) => a.id === adjustmentId);

    if (!adj) {
      return { success: false, error: 'Adjustment not found' };
    }

    if (adj.status !== 'PENDING_APPROVAL') {
      return { success: false, error: `Adjustment is already ${adj.status}` };
    }

    // Role check: Only Ops Manager or Super Admin can approve
    if (approver.role !== 'OPS_MANAGER' && approver.role !== 'SUPER_ADMIN') {
      return { success: false, error: 'Only Operations Manager or Super Admin can approve stock adjustments.' };
    }

    // Dual-control rule: Requester cannot approve their own adjustment (FR-ADJ-04, A.4.2)
    if (adj.requestedBy.toLowerCase() === approver.email.toLowerCase()) {
      return {
        success: false,
        error: 'Separation of duties violation: The requester cannot approve their own stock adjustment.',
      };
    }

    const now = new Date().toISOString();
    const product = raw.products.find((p) => p.id === adj.productId);

    if (decision === 'APPROVE') {
      adj.status = 'APPROVED';
      adj.approvedBy = approver.name || approver.email;
      adj.approvalNote = approvalNote || 'Approved by Operations Manager';
      adj.updatedAt = now;

      // Post to append-only stock ledger (FR-ADJ-03)
      raw.stockLedger.push({
        id: `stk_adj_appr_${Date.now()}`,
        skuId: adj.productId,
        sku: adj.sku,
        productName: product?.name || adj.sku,
        locationId: adj.locationId,
        locationCode: raw.locations.find((l) => l.id === adj.locationId)?.bin || 'Zone A / A1 / S01 / B01',
        ownerType: product?.ownerType || 'OPERATOR',
        ownerId: product?.ownerId || 'operator',
        qtyDelta: adj.quantityDelta,
        state: adj.targetState,
        sourceType: 'ADJUSTMENT',
        sourceId: adj.id,
        unitCostMinor: product?.costPriceMinor || 0,
        note: `Manager approved adjustment ${adj.adjustmentNumber}: ${adj.reasonCode} - ${adj.note}`,
        createdBy: approver.email,
        createdAt: now,
      });
    } else {
      adj.status = 'REJECTED';
      adj.approvedBy = approver.name || approver.email;
      adj.approvalNote = approvalNote || 'Rejected by Manager';
      adj.updatedAt = now;
    }

    // Audit log
    raw.auditLogs.unshift({
      id: `aud_${Date.now()}`,
      actorId: approver.id,
      actorName: approver.name,
      action: decision === 'APPROVE' ? 'APPROVE' : 'REJECT',
      entity: 'StockAdjustment',
      entityId: adj.id,
      afterSnapshot: JSON.parse(JSON.stringify(adj)),
      notes: `Adjustment ${adj.adjustmentNumber} was ${adj.status} by ${approver.name}. Note: ${adj.approvalNote}`,
      timestamp: now,
    });

    db.save();
    return { success: true, adjustment: adj };
  }

  /**
   * Calculates the 10 Dashboard KPIs compliant with Section 8.3 & Section 9.
   */
  public calculateDashboardKPIs(period: string, accountId?: string, clientFilterId?: string) {
    const raw = db.getRawData();
    let orders = [...raw.orders];
    let balances = this.calculateBalances();

    // 3PL client isolation filter (FR-DASH-06, FR-AUTH-07)
    if (clientFilterId) {
      orders = orders.filter((o) => o.ownerId === clientFilterId);
      balances = balances.filter((b) => b.ownerId === clientFilterId);
    }

    if (accountId) {
      orders = orders.filter((o) => o.marketplaceAccountId === accountId);
    }

    // 1. Total Orders: Count created in period, excluding Cancelled
    const nonCancelledOrders = orders.filter((o) => o.status !== 'Cancelled');
    const totalOrdersCount = nonCancelledOrders.length;

    // 2. Pending Orders: Orders in New, Confirmed, Allocated, Picked, or Packed
    const pendingStatuses: OrderStatus[] = ['New', 'Confirmed', 'Allocated', 'Picked', 'Packed'];
    const pendingOrdersCount = orders.filter((o) => pendingStatuses.includes(o.status)).length;

    // 3. Revenue: Sum of order item totals excluding tax
    const totalRevenueMinor = nonCancelledOrders.reduce((acc, o) => {
      const netTotal = o.totalMinor - o.taxMinor;
      return acc + (netTotal > 0 ? netTotal : 0);
    }, 0);

    // 4. Low Stock Items: SKUs with Available at or below threshold
    const lowStockCount = balances.filter((b) => {
      const prod = raw.products.find((p) => p.id === b.productId);
      return prod && b.available <= prod.lowStockThreshold;
    }).length;

    // 5. Total Stock Units: On hand including Damaged and Quarantined
    const totalStockUnits = balances.reduce((acc, b) => acc + b.totalStock, 0);

    // 6. Inventory Value: On-hand quantity times weighted average cost (P2)
    const inventoryValueMinor = balances.reduce((acc, b) => {
      return acc + b.onHand * b.weightedAverageCostMinor;
    }, 0);

    // 7. Supplier Payables: Unpaid supplier invoice balances (P4)
    const supplierPayablesMinor = raw.purchaseOrders
      .filter((po) => po.status === 'PARTIALLY_RECEIVED' || po.status === 'RECEIVED')
      .reduce((acc, po) => acc + po.totalMinor, 0);

    // 8. Client Receivables: Unpaid client invoice balances (P4)
    let invoices = raw.invoices;
    if (clientFilterId) {
      invoices = invoices.filter((i) => i.recipientId === clientFilterId);
    }
    const clientReceivablesMinor = invoices
      .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
      .reduce((acc, i) => acc + (i.totalMinor - i.paidAmountMinor), 0);

    // 9. Storage Revenue: Storage charges invoiced in period (P4)
    const storageRevenueMinor = invoices
      .filter((i) => i.type === 'STORAGE' && i.status !== 'VOID')
      .reduce((acc, i) => acc + i.totalMinor, 0);

    // 10. Outstanding Payments: Receivables past due date (P4)
    const outstandingPaymentsMinor = invoices
      .filter((i) => i.status === 'OVERDUE')
      .reduce((acc, i) => acc + (i.totalMinor - i.paidAmountMinor), 0);

    return {
      totalOrders: totalOrdersCount,
      pendingOrders: pendingOrdersCount,
      revenueMinor: totalRevenueMinor,
      lowStockItems: lowStockCount,
      totalStockUnits,
      inventoryValueMinor,
      supplierPayablesMinor,
      clientReceivablesMinor,
      storageRevenueMinor,
      outstandingPaymentsMinor,
      currency: raw.config.baseCurrency,
      activePhase: raw.config.activeReleasePhase,
    };
  }

  /**
   * Complete Order Editing with validation, stock reservation adjustment, and immutable audit logs.
   */
  public editOrder(
    orderId: string,
    updateData: {
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      shippingAddress?: {
        name?: string;
        street?: string;
        city?: string;
        county?: string;
        postalCode?: string;
        country?: string;
      };
      shippingChargeMinor?: number;
      lines?: {
        productId: string;
        sku: string;
        productName: string;
        quantity: number;
        unitPriceMinor: number;
      }[];
      status?: OrderStatus;
      notes?: string;
      editReason: string;
    },
    actor: User
  ): { success: boolean; order?: Order; error?: string } {
    const raw = db.getRawData();
    const order = raw.orders.find((o) => o.id === orderId || o.orderNumber === orderId);

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    // Role check: Only Super Admin and Ops Manager can edit orders
    if (actor.role !== 'SUPER_ADMIN' && actor.role !== 'OPS_MANAGER') {
      return { success: false, error: 'Unauthorized: Order editing requires Super Admin or Operations Manager privileges.' };
    }

    if (!updateData.editReason || !updateData.editReason.trim()) {
      return { success: false, error: 'Validation Error: A mandatory audit reason is required when editing an order.' };
    }

    const isDispatched = order.status === 'Shipped' || order.status === 'Delivered';
    const isEditingLines = updateData.lines && updateData.lines.length > 0;
    const allowOverride = Boolean((updateData as any).allowOverride);

    // Dispatched / Delivered orders can only have line items edited if admin override is explicitly authorized
    if (isDispatched && isEditingLines && !allowOverride) {
      return {
        success: false,
        error: `Business Rule Violation: Order ${order.orderNumber} is already "${order.status}". Physical stock has already left the warehouse and COGS is posted. Enable admin override to authorize an adjustment entry.`,
      };
    }

    const now = new Date().toISOString();
    const beforeSnapshot = JSON.parse(JSON.stringify(order));
    const isReservedState = ['Confirmed', 'Allocated', 'Picked', 'Packed'].includes(order.status);

    // 1. Process line item changes and inventory reservations
    if (updateData.lines && updateData.lines.length > 0 && (!isDispatched || allowOverride)) {
      const balances = this.calculateBalances();
      const newLines: any[] = [];

      for (const reqLine of updateData.lines) {
        const prod = raw.products.find((p) => p.id === reqLine.productId || p.sku === reqLine.sku);
        if (!prod) {
          return { success: false, error: `Invalid line: Product SKU "${reqLine.sku}" does not exist in catalog.` };
        }

        const qty = Math.max(1, Number(reqLine.quantity) || 1);
        const unitPriceMinor = Math.max(0, Number(reqLine.unitPriceMinor) || prod.sellingPriceMinor);
        const taxAmountMinor = Math.round(unitPriceMinor * (raw.config.defaultVatRatePercent / 100));

        // Find existing line if any to calculate delta
        const existingLine = order.lines.find((l) => l.productId === prod.id || l.sku === prod.sku);
        const oldQty = existingLine ? existingLine.quantity : 0;
        const oldReserved = existingLine ? existingLine.reservedQuantity : 0;
        const delta = qty - oldQty;

        let reservedQuantity = oldReserved;
        let isBackordered = false;

        if (isReservedState) {
          if (delta > 0) {
            // Need to reserve additional units: check available
            const bal = balances.find((b) => b.productId === prod.id);
            const avail = bal ? bal.available : 0;

            if (delta > avail && !raw.config.allowNegativeStock) {
              return {
                success: false,
                error: `Stock Error for ${prod.sku}: Cannot increase quantity by +${delta}. Only ${avail} units are currently available in the warehouse without negative stock.`,
              };
            }

            // Reserve the delta in the stock ledger
            raw.stockLedger.push({
              id: `stk_res_edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              skuId: prod.id,
              sku: prod.sku,
              productName: prod.name,
              locationId: raw.locations[0]?.id || 'loc_def',
              locationCode: 'Zone A / A1 / S01 / B01',
              ownerType: order.ownerType,
              ownerId: order.ownerId,
              qtyDelta: delta,
              state: 'RESERVED',
              sourceType: 'ORDER_EDIT',
              sourceId: order.id,
              note: `Reservation increase (+${delta}) due to Order ${order.orderNumber} edit by ${actor.name}`,
              createdBy: actor.email,
              createdAt: now,
            });
            reservedQuantity = qty;
          } else if (delta < 0) {
            // Releasing units back to available
            const releaseDelta = Math.abs(delta);
            raw.stockLedger.push({
              id: `stk_rel_edit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              skuId: prod.id,
              sku: prod.sku,
              productName: prod.name,
              locationId: raw.locations[0]?.id || 'loc_def',
              locationCode: 'Zone A / A1 / S01 / B01',
              ownerType: order.ownerType,
              ownerId: order.ownerId,
              qtyDelta: -releaseDelta,
              state: 'RESERVED',
              sourceType: 'ORDER_EDIT',
              sourceId: order.id,
              note: `Reservation release (-${releaseDelta}) due to Order ${order.orderNumber} edit by ${actor.name}`,
              createdBy: actor.email,
              createdAt: now,
            });
            reservedQuantity = qty;
          }
        }

        newLines.push({
          id: existingLine ? existingLine.id : `ordl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId: order.id,
          productId: prod.id,
          sku: prod.sku,
          productName: prod.name,
          quantity: qty,
          unitPriceMinor,
          taxAmountMinor,
          totalPriceMinor: unitPriceMinor * qty,
          isBackordered,
          reservedQuantity,
        });
      }

      // If any old line was completely removed, release its full reservation
      if (isReservedState) {
        for (const oldLine of order.lines) {
          const stillPresent = newLines.some((nl) => nl.productId === oldLine.productId);
          if (!stillPresent && oldLine.reservedQuantity > 0) {
            raw.stockLedger.push({
              id: `stk_rel_rm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              skuId: oldLine.productId,
              sku: oldLine.sku,
              productName: oldLine.productName,
              locationId: raw.locations[0]?.id || 'loc_def',
              locationCode: 'Zone A / A1 / S01 / B01',
              ownerType: order.ownerType,
              ownerId: order.ownerId,
              qtyDelta: -oldLine.reservedQuantity,
              state: 'RESERVED',
              sourceType: 'ORDER_EDIT',
              sourceId: order.id,
              note: `Line ${oldLine.sku} removed during Order ${order.orderNumber} edit: released ${oldLine.reservedQuantity} reserved units`,
              createdBy: actor.email,
              createdAt: now,
            });
          }
        }
      }

      order.lines = newLines;
      const subtotalMinor = newLines.reduce((acc, l) => acc + l.totalPriceMinor, 0);
      const taxMinor = newLines.reduce((acc, l) => acc + l.taxAmountMinor, 0);
      const shippingChargeMinor =
        updateData.shippingChargeMinor !== undefined
          ? Math.max(0, updateData.shippingChargeMinor)
          : order.shippingChargeMinor || 0;

      order.totalMinor = subtotalMinor + shippingChargeMinor;
      order.taxMinor = taxMinor;
      order.shippingChargeMinor = shippingChargeMinor;
    } else if (updateData.shippingChargeMinor !== undefined && (!isDispatched || allowOverride)) {
      const shippingChargeMinor = Math.max(0, updateData.shippingChargeMinor);
      const subtotalMinor = order.lines.reduce((acc, l) => acc + l.totalPriceMinor, 0);
      order.shippingChargeMinor = shippingChargeMinor;
      order.totalMinor = subtotalMinor + shippingChargeMinor;
    }

    // 2. Update Customer Information
    if (updateData.customerName) order.customerName = updateData.customerName.trim();
    if (updateData.customerEmail) order.customerEmail = updateData.customerEmail.trim();

    // 3. Update Shipping Address
    if (updateData.shippingAddress) {
      order.shippingAddress = {
        name: updateData.shippingAddress.name || order.customerName,
        street: updateData.shippingAddress.street || order.shippingAddress.street,
        city: updateData.shippingAddress.city || order.shippingAddress.city,
        county: updateData.shippingAddress.county || order.shippingAddress.county,
        postalCode: updateData.shippingAddress.postalCode || order.shippingAddress.postalCode,
        country: updateData.shippingAddress.country || order.shippingAddress.country,
      };
    }

    // 4. Update Notes
    if (updateData.notes !== undefined) {
      order.notes = updateData.notes;
    }

    // 5. Update Status if permitted
    if (updateData.status && updateData.status !== order.status) {
      const allowed = ALLOWED_TRANSITIONS[order.status];
      if (allowOverride || (allowed && allowed.includes(updateData.status))) {
        order.status = updateData.status;
      }
    }

    order.updatedAt = now;

    // 6. Record in Order History
    raw.orderHistories.push({
      id: `hist_edit_${Date.now()}`,
      orderId: order.id,
      toStatus: order.status,
      changedBy: `${actor.name} (${actor.role})`,
      note: `Order modified: ${updateData.editReason}`,
      timestamp: now,
    });

    // 7. Immutable Audit Log
    raw.auditLogs.unshift({
      id: `aud_edit_${Date.now()}`,
      actorId: actor.id,
      actorName: actor.name,
      action: 'UPDATE',
      entity: 'Order',
      entityId: order.id,
      beforeSnapshot,
      afterSnapshot: JSON.parse(JSON.stringify(order)),
      notes: `Order ${order.orderNumber} updated. Reason: ${updateData.editReason}`,
      timestamp: now,
    });

    db.save();
    return { success: true, order };
  }
}

export const engine = new EngineService();

