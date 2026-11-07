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
import { MarketplaceAccount, SystemConfig, User } from '../types';

interface DashboardViewProps {
  currentUser: User;
  config: SystemConfig;
  onNavigate: (tab: any, filterState?: any) => void;
  onOpenNewAdjustment: () => void;
  onOpenNewOrder: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  config,
  onNavigate,
  onOpenNewAdjustment,
  onOpenNewOrder,
}) => {
  const [period, setPeriod] = useState('30D');
  const [selectedAccount, setSelectedAccount] = useState('ALL');
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [kpis, setKpis] = useState<any>(null);
  const [charts, setCharts] = useState<any>(null);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [period, selectedAccount, currentUser.id]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [kpiRes, chartRes, accRes, excRes] = await Promise.all([
        api.getKPIs(period, selectedAccount),
        api.getCharts(),
        api.getEbayAccounts(),
        api.getExceptions(),
      ]);

      setKpis(kpiRes.kpis);
      setCharts(chartRes);
      setAccounts(accRes.accounts);
      setExceptions(excRes.exceptions.filter((e) => e.status === 'PENDING'));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const isFullPhases = config.activeReleasePhase !== 'P1';

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Operations Dashboard</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {currentUser.role === 'CLIENT_USER'
              ? 'Apex Electronics Ltd - Client Inventory & Orders Visibility'
              : 'Enterprise overview: eBay synchronizations, inventory ledger, and order pipeline.'}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {currentUser.role !== 'CLIENT_USER' && (
            <div className="flex items-center space-x-1.5 bg-white border border-gray-300 rounded-md px-2.5 py-1 text-xs shadow-2xs">
              <span className="text-gray-400 font-medium">Channel:</span>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="bg-transparent font-medium text-gray-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Marketplace Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.marketplace.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          )}

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
              £{kpis ? (kpis.revenueMinor / 100).toFixed(2) : '0.00'}
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
              {kpis ? kpis.lowStockItems : '...'}
            </div>
            <div className="mt-1 text-[11px] text-rose-700 font-medium">
              <span>At or below reorder threshold</span>
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
              {kpis ? kpis.totalStockUnits : '...'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>On hand + damaged + quarantine</span>
            </div>
          </div>

          {/* 6. Inventory Value (P2) */}
          <div
            onClick={() => onNavigate('reports', { reportId: 'R-07' })}
            className={`border rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs ${
              isFullPhases
                ? 'bg-white border-gray-200 hover:border-indigo-400'
                : 'bg-slate-50 border-dashed border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium flex items-center gap-1">
                6. Inventory Value
                {!isFullPhases && <span className="text-[9px] font-bold px-1 rounded bg-slate-200 text-slate-700">P2</span>}
              </span>
              <CircleDollarSign className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              £{kpis ? (kpis.inventoryValueMinor / 100).toFixed(2) : '0.00'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>Weighted avg cost valuation</span>
            </div>
          </div>

          {/* 7. Supplier Payables (P4) */}
          <div
            onClick={() => onNavigate('purchase-orders')}
            className={`border rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs ${
              isFullPhases
                ? 'bg-white border-gray-200 hover:border-indigo-400'
                : 'bg-slate-50 border-dashed border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium flex items-center gap-1">
                7. Supplier Payables
                {!isFullPhases && <span className="text-[9px] font-bold px-1 rounded bg-slate-200 text-slate-700">P4</span>}
              </span>
              <Receipt className="w-4 h-4 text-purple-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              £{kpis ? (kpis.supplierPayablesMinor / 100).toFixed(2) : '0.00'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>Unpaid PO receipts / GRNI</span>
            </div>
          </div>

          {/* 8. Client Receivables (P4) */}
          <div
            onClick={() => onNavigate('invoices')}
            className={`border rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs ${
              isFullPhases
                ? 'bg-white border-gray-200 hover:border-indigo-400'
                : 'bg-slate-50 border-dashed border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium flex items-center gap-1">
                8. Client Receivables
                {!isFullPhases && <span className="text-[9px] font-bold px-1 rounded bg-slate-200 text-slate-700">P4</span>}
              </span>
              <Building className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              £{kpis ? (kpis.clientReceivablesMinor / 100).toFixed(2) : '0.00'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>Unpaid issued 3PL invoices</span>
            </div>
          </div>

          {/* 9. Storage Revenue (P4) */}
          <div
            onClick={() => onNavigate('storage')}
            className={`border rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs ${
              isFullPhases
                ? 'bg-white border-gray-200 hover:border-indigo-400'
                : 'bg-slate-50 border-dashed border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium flex items-center gap-1">
                9. Storage Revenue
                {!isFullPhases && <span className="text-[9px] font-bold px-1 rounded bg-slate-200 text-slate-700">P4</span>}
              </span>
              <Archive className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              £{kpis ? (kpis.storageRevenueMinor / 100).toFixed(2) : '0.00'}
            </div>
            <div className="mt-1 text-[11px] text-gray-500">
              <span>Storage charges billed</span>
            </div>
          </div>

          {/* 10. Outstanding Payments (P4) */}
          <div
            onClick={() => onNavigate('reports', { reportId: 'R-12' })}
            className={`border rounded-lg p-3.5 shadow-2xs cursor-pointer transition group hover:shadow-xs ${
              isFullPhases
                ? 'bg-white border-gray-200 hover:border-rose-400'
                : 'bg-slate-50 border-dashed border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between text-gray-500">
              <span className="text-xs font-medium flex items-center gap-1">
                10. Overdue Balances
                {!isFullPhases && <span className="text-[9px] font-bold px-1 rounded bg-slate-200 text-slate-700">P4</span>}
              </span>
              <AlertCircle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gray-900">
              £{kpis ? (kpis.outstandingPaymentsMinor / 100).toFixed(2) : '0.00'}
            </div>
            <div className="mt-1 text-[11px] text-rose-700">
              <span>Receivables past due date</span>
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
              <p className="text-[11px] text-gray-500">7-day performance history from eBay & Direct channels</p>
            </div>
            <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">Live Ledger</span>
          </div>

          {charts?.trend && (
            <div className="h-48 flex items-end justify-between gap-3 pt-6 pb-2 px-2 border-b border-gray-100">
              {charts.trend.map((point: any, idx: number) => {
                const heightPercent = Math.min(100, Math.max(15, (point.revenue / 250) * 100));
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                    <div className="text-[10px] font-bold text-indigo-700 opacity-0 group-hover:opacity-100 transition">
                      £{point.revenue.toFixed(0)}
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
              <p className="text-[11px] text-gray-500">Units partitioned across ledger stock states (S7.2)</p>
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
                    <div className="text-[11px] text-emerald-600 font-medium">£{skuItem.revenue.toFixed(2)}</div>
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
