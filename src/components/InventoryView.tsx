import React, { useState, useEffect } from 'react';
import {
  Layers,
  History,
  Download,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  ShieldCheck,
  Package,
} from 'lucide-react';
import { api } from '../services/api';
import { StockBalance, StockLedgerEntry, User, SystemConfig } from '../types';

interface InventoryViewProps {
  currentUser: User;
  config: SystemConfig;
  onOpenNewAdjustment: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  currentUser,
  config,
  onOpenNewAdjustment,
}) => {
  const [activeTab, setActiveTab] = useState<'BALANCES' | 'LEDGER'>('BALANCES');
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [ledger, setLedger] = useState<StockLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadInventoryData();
  }, [currentUser.id]);

  const loadInventoryData = async () => {
    setLoading(true);
    try {
      const [balRes, ledRes] = await Promise.all([
        api.getBalances(),
        api.getStockLedger(),
      ]);
      setBalances(balRes.balances);
      setLedger(ledRes.ledger);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = () => {
    if (activeTab === 'BALANCES') {
      const headers = ['SKU', 'Owner', 'Available', 'On Hand', 'Reserved', 'Incoming', 'Damaged', 'Quarantined', 'Total Stock'];
      const rows = balances.map((b) => [
        `"${b.sku}"`,
        `"${b.ownerId}"`,
        b.available,
        b.onHand,
        b.reserved,
        b.incoming,
        b.damaged,
        b.quarantined,
        b.totalStock,
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      downloadBlob(csvContent, 'Stock_Balances.csv');
    } else {
      const headers = ['Timestamp (UTC)', 'SKU', 'Location', 'Delta', 'State', 'Source Type', 'Doc Ref', 'Created By', 'Note'];
      const rows = ledger.map((l) => [
        `"${l.createdAt}"`,
        `"${l.sku}"`,
        `"${l.locationCode}"`,
        l.qtyDelta,
        `"${l.state}"`,
        `"${l.sourceType}"`,
        `"${l.sourceId}"`,
        `"${l.createdBy}"`,
        `"${(l.note || '').replace(/"/g, '""')}"`,
      ]);
      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      downloadBlob(csvContent, 'Stock_Ledger_Append_Only.csv');
    }
  };

  const downloadBlob = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename.replace('.csv', '')}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const filteredBalances = balances.filter(
    (b) => !search || b.sku.toLowerCase().includes(search.toLowerCase())
  );

  const filteredLedger = ledger.filter(
    (l) =>
      !search ||
      l.sku.toLowerCase().includes(search.toLowerCase()) ||
      l.sourceId.toLowerCase().includes(search.toLowerCase()) ||
      l.sourceType.toLowerCase().includes(search.toLowerCase()) ||
      (l.note && l.note.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Inventory & Stock Ledger</h1>
          <p className="text-xs text-gray-500">
            Append-only physical stock ledger ensuring 100% reconciliation between operational counts and ledger balances.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-2xs transition"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>Export {activeTab === 'BALANCES' ? 'Balances' : 'Ledger'}</span>
          </button>

          {currentUser.role !== 'CLIENT_USER' && currentUser.role !== 'FINANCE_USER' && currentUser.role !== 'VIEWER' && (
            <button
              onClick={onOpenNewAdjustment}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-2xs transition"
            >
              <span>+ Stock Adjustment</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 text-xs">
        <button
          onClick={() => setActiveTab('BALANCES')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'BALANCES'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Current Stock Balances ({balances.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'LEDGER'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Append-Only Stock Ledger ({ledger.length} entries)</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs flex items-center justify-between gap-3 text-xs">
        <div className="flex-1 max-w-md relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'BALANCES'
                ? 'Search SKU balances...'
                : 'Search movements by SKU, Document ID, Source Type, Note...'
            }
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-2 text-gray-500 text-[11px]">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Immutable Ledger Active (BR-01)</span>
        </div>
      </div>

      {/* Tab 1: Current Balances */}
      {activeTab === 'BALANCES' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">SKU Code</th>
                  <th className="py-2.5 px-3">Ownership</th>
                  <th className="py-2.5 px-3">Available (Sellable)</th>
                  <th className="py-2.5 px-3">On Hand (Physical)</th>
                  <th className="py-2.5 px-3">Reserved</th>
                  <th className="py-2.5 px-3">Incoming (PO)</th>
                  <th className="py-2.5 px-3">Damaged</th>
                  <th className="py-2.5 px-3">Quarantined</th>
                  <th className="py-2.5 px-3 text-right">Total Stock Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      Calculating ledger balances...
                    </td>
                  </tr>
                ) : filteredBalances.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500">
                      No stock balances recorded.
                    </td>
                  </tr>
                ) : (
                  filteredBalances.map((b) => (
                    <tr key={b.productId} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{b.sku}</td>
                      <td className="py-2.5 px-3 text-[11px]">
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            b.ownerId === 'operator'
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {b.ownerId === 'operator' ? 'Operator' : '3PL Apex'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                          {b.available}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{b.onHand}</td>
                      <td className="py-2.5 px-3 text-indigo-700 font-semibold">{b.reserved}</td>
                      <td className="py-2.5 px-3 text-blue-700 font-semibold">{b.incoming}</td>
                      <td className="py-2.5 px-3 text-rose-700">{b.damaged}</td>
                      <td className="py-2.5 px-3 text-amber-700">{b.quarantined}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-gray-900 font-mono">
                        {b.totalStock}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Append-Only Stock Movement Ledger */}
      {activeTab === 'LEDGER' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">SKU</th>
                  <th className="py-2.5 px-3">Warehouse Location</th>
                  <th className="py-2.5 px-3">Delta Units</th>
                  <th className="py-2.5 px-3">Stock State</th>
                  <th className="py-2.5 px-3">Source Type</th>
                  <th className="py-2.5 px-3">Source Document ID</th>
                  <th className="py-2.5 px-3">Recorded By</th>
                  <th className="py-2.5 px-3">Audit Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 font-mono text-[11px]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500 font-sans">
                      Loading ledger rows...
                    </td>
                  </tr>
                ) : filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-gray-500 font-sans">
                      No stock movements recorded.
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50 transition">
                      <td className="py-2 px-3 text-gray-500">
                        {row.createdAt.split('.')[0].replace('T', ' ')}
                      </td>
                      <td className="py-2 px-3 font-bold text-indigo-700">{row.sku}</td>
                      <td className="py-2 px-3 text-gray-600">{row.locationCode}</td>
                      <td className="py-2 px-3">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded ${
                            row.qtyDelta > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {row.qtyDelta > 0 ? `+${row.qtyDelta}` : row.qtyDelta}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-semibold text-gray-800">{row.state}</td>
                      <td className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 text-[10px] font-sans font-semibold">
                          {row.sourceType}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-900 font-semibold">{row.sourceId}</td>
                      <td className="py-2 px-3 text-gray-500">{row.createdBy}</td>
                      <td className="py-2 px-3 text-gray-600 font-sans">{row.note || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
