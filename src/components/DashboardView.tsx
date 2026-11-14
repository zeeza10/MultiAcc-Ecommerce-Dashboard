import React, { useState, useEffect } from 'react';
import {
  ShoppingCart,
  Clock,
  PoundSterling,
  AlertTriangle,
  Package,
  CircleDollarSign,
  Receipt,
  Building,
  Archive,
  AlertCircle,
  TrendingUp,
  ArrowUpRight,
  ArrowRight,
  Filter,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../services/api';
import { SystemConfig, User } from '../types';

interface DashboardViewProps {
  currentUser: User;
  config: SystemConfig;
  selectedStoreId: string;
  onNavigate: (tab: any, filterState?: any) => void;
  onOpenNewAdjustment: () => void;
  onOpenNewOrder: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  config,
  selectedStoreId,
  onNavigate,
  onOpenNewAdjustment,
  onOpenNewOrder,
}) => {
  const [period, setPeriod] = useState('30D');
  const [kpis, setKpis] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [period, selectedStoreId, currentUser.id]);

  const loadDashboardData = async () => {
    setLoading(true);
    setKpis(null);
    setCharts(null);
    setExceptions([]);
    try {
      const results = await Promise.allSettled([
        api.getKPIs(period, selectedStoreId),
        api.getCharts(selectedStoreId),
        api.getExceptions(),
      ]);

      if (results[0].status === 'fulfilled' && results[0].value?.kpis) {
        setKpis(results[0].value.kpis);
      }
      if (results[1].status === 'fulfilled' && results[1].value) {
        setCharts(results[1].value);
      }
      if (results[2].status === 'fulfilled' && results[2].value?.exceptions) {
        setExceptions(results[2].value.exceptions.filter((e: any) => e.status === 'PENDING'));
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatMoney = (amountMinor: number | null) => amountMinor == null ? '—' : new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: kpis?.currency || config.baseCurrency || 'GBP',
    }).format((Number(amountMinor) || 0) / 100);

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Operations Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {currentUser.role === 'CLIENT_USER'
              ? 'Your client inventory and orders visibility.'
              : 'Workspace overview from your connected operational records.'}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
    

          <div className="flex items-center space-x-1 bg-white border border-gray-300 rounded-md p-0.5 text-xs shadow-2xs">
            {['7D', '30D', '90D', 'YTD'].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded font-medium transition ${
                  period === p ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Exception Queue Alert Banner (FR-EBAY-07, N-04) */}
      {exceptions.length > 0 && currentUser.role !== 'CLIENT_USER' && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 flex items-start justify-between gap-3 shadow-2xs">
          <div className="flex items-start space-x-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                Exception Queue Action Required ({exceptions.length} pending unmapped item{exceptions.length > 1 ? 's' : ''})
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Orders have arrived with external marketplace SKUs not yet mapped to internal catalog items. These order lines are held safely in the exception queue.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('ebay-accounts')}
            className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 rounded-md shadow-2xs transition flex items-center gap-1"
          >
            <span>Resolve Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 10 KPI Cards (SRS Section 8.3 & Section 9) */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Operational & Financial Performance Indicators
          </span>
          <span className="text-[11px] text-gray-500">Click any card to drill down into filtered source records</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* 1. Total Orders */}
          <div
            onClick={() => onNavigate('orders')}
            className="bg-white border border-gray-200 hover:border-indigo-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">1. Total Orders</span>
              <ShoppingCart className="w-4 h-4 text-indigo-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? kpis.totalOrders : '...'}
            </div>
            <div className="mt-1 flex items-center text-[11px] text-emerald-600">
              <TrendingUp className="w-3 h-3 mr-0.5" />
              <span>Created in {period} (excl. cancelled)</span>
            </div>
          </div>

          {/* 2. Pending Orders */}
          <div
            onClick={() => onNavigate('orders', { status: 'PENDING_GROUP' })}
            className="bg-white border border-gray-200 hover:border-amber-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">2. Pending Orders</span>
              <Clock className="w-4 h-4 text-amber-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? kpis.pendingOrders : '...'}
            </div>
            <div className="mt-1 text-[11px] text-amber-700">
              <span>New, Confirmed, Picked, Packed</span>
            </div>
          </div>

          {/* 3. Revenue */}
          <div
            onClick={() => onNavigate('orders')}
            className="bg-white border border-gray-200 hover:border-emerald-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">3. Revenue (Net)</span>
              <PoundSterling className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? formatMoney(kpis.revenueMinor) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>Item totals excl. tax</span>
            </div>
          </div>

          {/* 4. Low Stock Items */}
          <div
            onClick={() => onNavigate('products', { filter: 'LOW_STOCK' })}
            className="bg-white border border-gray-200 hover:border-rose-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">4. Low Stock SKUs</span>
              <AlertTriangle className="w-4 h-4 text-rose-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? (kpis.lowStockItems == null ? '—' : kpis.lowStockItems) : '...'}
            </div>
            <div className="mt-1 text-[11px] text-rose-700 font-medium">
              <span>{kpis?.storeScoped ? 'Store-allocated products at reorder threshold' : 'At or below reorder threshold'}</span>
            </div>
          </div>

          {/* 5. Total Stock Units */}
          <div
            onClick={() => onNavigate('inventory')}
            className="bg-white border border-gray-200 hover:border-blue-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">5. Total Stock Units</span>
              <Package className="w-4 h-4 text-blue-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? (kpis.totalStockUnits == null ? '—' : kpis.totalStockUnits) : '...'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>{kpis?.storeScoped ? 'Allocated units reserved for this store' : 'On hand + damaged + quarantine'}</span>
            </div>
          </div>

          {/* 6. Inventory Value */}
          <div
            onClick={() => onNavigate('reports', { reportId: 'R-07' })}
            className="bg-white border border-gray-200 hover:border-indigo-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">6. Inventory Value</span>
              <CircleDollarSign className="w-4 h-4 text-indigo-500 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? formatMoney(kpis.inventoryValueMinor) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>{kpis?.storeScoped ? 'Allocated units × product cost' : 'Weighted avg cost valuation'}</span>
            </div>
          </div>

          {/* 7. Supplier Payables */}
          <div
            onClick={() => onNavigate('purchase-orders')}
            className="bg-white border border-gray-200 hover:border-indigo-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">{kpis?.storeScoped ? '7. Net Marketplace Payout' : '7. Supplier Payables'}</span>
              <Receipt className="w-4 h-4 text-purple-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? formatMoney(kpis.storeScoped ? kpis.netPayoutMinor : kpis.supplierPayablesMinor) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>{kpis?.storeScoped ? `${kpis.payoutCount || 0} payout records from this store` : 'Unpaid PO receipts / GRNI'}</span>
            </div>
          </div>

          {/* 8. Client Receivables */}
          <div
            onClick={() => onNavigate('invoices')}
            className="bg-white border border-gray-200 hover:border-indigo-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">{kpis?.storeScoped ? '8. Marketplace Fees' : '8. Client Receivables'}</span>
              <Building className="w-4 h-4 text-blue-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? formatMoney(kpis.storeScoped ? kpis.marketplaceFeesMinor : kpis.clientReceivablesMinor) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>{kpis?.storeScoped ? 'Fees recorded in marketplace payouts' : 'Unpaid issued 3PL invoices'}</span>
            </div>
          </div>

          {/* 9. Storage Revenue */}
          <div
            onClick={() => onNavigate('storage')}
            className="bg-white border border-gray-200 hover:border-indigo-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">{kpis?.storeScoped ? '9. Marketplace Refunds' : '9. Storage Revenue'}</span>
              <Archive className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? formatMoney(kpis.storeScoped ? kpis.marketplaceRefundsMinor : kpis.storageRevenueMinor) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>{kpis?.storeScoped ? 'Refunds recorded in marketplace payouts' : 'Storage charges billed'}</span>
            </div>
          </div>

          {/* 10. Outstanding Payments */}
          <div
            onClick={() => onNavigate('reports', { reportId: 'R-12' })}
            className="bg-white border border-gray-200 hover:border-rose-400 rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs"
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium">{kpis?.storeScoped ? '10. Store Allocated Expenses' : '10. Overdue Balances'}</span>
              <AlertCircle className="w-4 h-4 text-rose-600 group-hover:scale-110 transition" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              {kpis ? formatMoney(kpis.storeScoped ? kpis.storeAllocatedExpensesMinor : kpis.outstandingPaymentsMinor) : '—'}
            </div>
            <div className="mt-1 text-[11px] text-rose-700">
              <span>{kpis?.storeScoped ? 'Only expenses explicitly allocated to this store' : 'Receivables past due date'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Charts Section (FR-DASH-02) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Chart 1: Orders and Revenue Trend */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Daily Order Flow & Revenue</h3>
              <p className="text-[11px] text-gray-500">7-day order and revenue history{selectedStoreId !== 'ALL' ? ' for the selected store' : ' across all stores'}</p>
            </div>
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Live Ledger</span>
          </div>

          {charts?.trend?.length > 0 && (
            <div className="h-48 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-gray-100">
              {charts.trend.map((point: any, idx: number) => {
                const heightPercent = Math.min(100, Math.max(15, (point.revenue / 250) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div className="text-[10px] font-bold text-indigo-700 opacity-0 group-hover:opacity-100 transition">
                      {formatMoney(Math.round(point.revenue * 100))}
                    </div>
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="w-full max-w-[36px] bg-indigo-600 group-hover:bg-indigo-500 rounded-t-sm transition-all"
                    ></div>
                    <div className="text-[10px] text-gray-500 font-mono">{point.date}</div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-500 mt-2 px-1">
            <span>Bars indicate daily net revenue</span>
            <span className="font-semibold text-gray-700">Calculated directly from confirmed order totals</span>
          </div>
        </div>

        {/* Chart 2: Order Pipeline Status Distribution */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Canonical Order Status Pipeline</h3>
              <p className="text-[11px] text-gray-500">Live order state breakdown according to SRS S7.1</p>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
            >
              <span>Manage</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {charts?.statusCounts && (
            <div className="space-y-2.5 pt-2">
              {[
                { label: 'New', color: 'bg-slate-400' },
                { label: 'Confirmed', color: 'bg-blue-500' },
                { label: 'Allocated', color: 'bg-indigo-500' },
                { label: 'Picked', color: 'bg-amber-500' },
                { label: 'Packed', color: 'bg-purple-500' },
                { label: 'Shipped', color: 'bg-emerald-500' },
                { label: 'Delivered', color: 'bg-teal-500' },
              ].map((st) => {
                const count = charts.statusCounts[st.label] || 0;
                const total = Math.max(1, Object.values(charts.statusCounts as Record<string, number>).reduce((a, b) => a + b, 0));
                const pct = Math.round((count / total) * 100);

                return (
                  <div key={st.label} className="text-xs">
                    <div className="flex justify-between text-gray-700 mb-0.5">
                      <span className="font-medium">{st.label}</span>
                      <span className="font-mono text-gray-500">
                        {count} orders ({pct}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-full rounded-full ${st.color}`} style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Chart 3: Stock State Distribution */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Warehouse Stock Breakdown</h3>
              <p className="text-[11px] text-gray-500">{selectedStoreId === 'ALL' ? 'Physical warehouse stock from ledger states' : 'Stock allocated to the selected marketplace store'}</p>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
            >
              <span>View Ledger</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {charts?.stockByState && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-[11px] font-semibold text-emerald-800">Available (Sellable)</div>
                <div className="text-xl font-bold text-emerald-900 mt-1">{charts.stockByState.available}</div>
                <div className="text-[10px] text-emerald-700">On-hand minus reserved</div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                <div className="text-[11px] font-semibold text-indigo-800">Reserved</div>
                <div className="text-xl font-bold text-indigo-900 mt-1">{charts.stockByState.reserved}</div>
                <div className="text-[10px] text-indigo-700">Committed to confirmed orders</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] font-semibold text-slate-800">Total On Hand</div>
                <div className="text-xl font-bold text-slate-900 mt-1">{charts.stockByState.onHand}</div>
                <div className="text-[10px] text-slate-600">Physically in warehouse</div>
              </div>

              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <div className="text-[11px] font-semibold text-blue-800">Incoming (POs)</div>
                <div className="text-xl font-bold text-blue-900 mt-1">{charts.stockByState.incoming}</div>
                <div className="text-[10px] text-blue-700">On approved purchase orders</div>
              </div>

              <div className="p-3 rounded-lg bg-rose-50 border border-rose-100">
                <div className="text-[11px] font-semibold text-rose-800">Damaged</div>
                <div className="text-xl font-bold text-rose-900 mt-1">{charts.stockByState.damaged}</div>
                <div className="text-[10px] text-rose-700">Awaiting return/write-off</div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
                <div className="text-[11px] font-semibold text-amber-800">Quarantined</div>
                <div className="text-xl font-bold text-amber-900 mt-1">{charts.stockByState.quarantined}</div>
                <div className="text-[10px] text-amber-700">Pending QA inspection</div>
              </div>
            </div>
          )}
        </div>

        {/* Chart 4: Top Selling SKUs */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-gray-900">Top Selling SKUs</h3>
              <p className="text-[11px] text-gray-500">Highest volume product movers across all channels</p>
            </div>
            <button
              onClick={() => onNavigate('products')}
              className="text-xs text-indigo-600 hover:underline flex items-center gap-0.5"
            >
              <span>Catalog</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {charts?.topSkus && charts.topSkus.length > 0 ? (
              charts.topSkus.map((skuItem: any, idx: number) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px]">
                      {idx + 1}
                    </span>
                    <div>
                      <div className="font-semibold text-gray-900">{skuItem.sku}</div>
                      <div className="text-gray-500 text-[11px] truncate max-w-[200px]">{skuItem.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">{skuItem.units} units</div>
                    <div className="text-[11px] text-emerald-600 font-medium">{formatMoney(Math.round(skuItem.revenue * 100))}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-gray-400">No sales recorded yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Action Shortcuts Banner (FR-DASH-04) */}
      <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-bold text-slate-800 uppercase tracking-wide">Quick Operations:</span>
          <span className="text-slate-600">Perform standard daily actions directly without leaving overview.</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={onOpenNewAdjustment}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 font-medium rounded-md shadow-2xs transition"
          >
            + New Stock Adjustment
          </button>
          <button
            onClick={() => onNavigate('orders', { status: 'Confirmed' })}
            className="px-3 py-1.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 font-medium rounded-md shadow-2xs transition"
          >
            Review Confirmed Orders
          </button>
          <button
            onClick={() => onNavigate('reports', { reportId: 'R-14' })}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md shadow-2xs transition"
          >
            Verify System Reconciliation (R-14)
          </button>
        </div>
      </div>
    </div>
  );
};
