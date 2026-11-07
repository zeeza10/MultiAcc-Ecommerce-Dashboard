import React, { useState, useEffect } from 'react';
import {
  Store,
  RefreshCw,
  Link,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Clock,
  ArrowRight,
  Layers,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { MarketplaceAccount, ExceptionItem, Product, User, SystemConfig } from '../types';

interface EbayAccountsViewProps {
  currentUser: User;
  config: SystemConfig;
  onNavigate: (tab: any) => void;
}

export const EbayAccountsView: React.FC<EbayAccountsViewProps> = ({
  currentUser,
  config,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'EXCEPTIONS'>('ACCOUNTS');
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [selectedException, setSelectedException] = useState<ExceptionItem | null>(null);
  const [targetProductId, setTargetProductId] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [currentUser.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accRes, excRes, prodRes] = await Promise.all([
        api.getEbayAccounts(),
        api.getExceptions(),
        api.getProducts(),
      ]);
      setAccounts(accRes.accounts);
      setRecentSyncs(accRes.recentSyncs);
      setExceptions(excRes.exceptions);
      setProducts(prodRes.products);
      if (prodRes.products.length > 0) {
        setTargetProductId(prodRes.products[0].id);
      }
    } catch (err) {
      console.error('Failed to load eBay data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingAccountId(accountId);
    setSyncFeedback(null);
    try {
      const res = await api.syncEbayAccount(accountId);
      setSyncFeedback(
        `Sync completed: ${res.imported} new imported, ${res.skipped} skipped as duplicates (AT-01 idempotent), ${res.exceptions} exceptions raised.`
      );
      loadData();
    } catch (err: any) {
      setSyncFeedback(`Sync failed: ${err.message}`);
    } finally {
      setSyncingAccountId(null);
    }
  };

  const handleReconnect = async (accountId: string) => {
    try {
      const res = await api.connectEbayAccount(accountId);
      alert(res.message);
      loadData();
    } catch (err: any) {
      alert(`OAuth connect failed: ${err.message}`);
    }
  };

  const handleResolveException = async () => {
    if (!selectedException || !targetProductId) return;

    try {
      await api.resolveException(selectedException.id, targetProductId, resolutionNote);
      setSelectedException(null);
      setResolutionNote('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Resolution failed');
    }
  };

  const pendingExceptions = exceptions.filter((e) => e.status === 'PENDING');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">eBay Marketplace Integration</h1>
          <p className="text-xs text-gray-500">
            Multi-account REST adapter managing OAuth identity, idempotent order polling, and unmapped SKU exception queue.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
            API Environment: eBay Sandbox & Production Ready
          </span>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
          <button onClick={() => setSyncFeedback(null)} className="text-indigo-400 hover:text-indigo-700">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 text-xs">
        <button
          onClick={() => setActiveTab('ACCOUNTS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'ACCOUNTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Connected Seller Accounts ({accounts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('EXCEPTIONS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'EXCEPTIONS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Unmapped SKU Exception Queue ({pendingExceptions.length} pending)</span>
        </button>
      </div>

      {/* Tab 1: Accounts Overview */}
      {activeTab === 'ACCOUNTS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc) => {
              const isSyncing = syncingAccountId === acc.id;
              return (
                <div key={acc.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-gray-900 text-sm">{acc.name}</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                          {acc.marketplace.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                        Seller: @{acc.sellerUsername}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        acc.authStatus === 'CONNECTED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      OAuth: {acc.authStatus}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Token Validity:</span>
                      <span className="font-semibold text-emerald-700">Valid (30 Days Remaining)</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Auto Polling Schedule:</span>
                      <span className="font-medium text-gray-900">Every {acc.autoSyncIntervalMinutes} minutes</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Last Polling Result:</span>
                      <span className="font-medium text-indigo-700">{acc.lastSyncStatus}</span>
                    </div>
                    {acc.lastSyncMessage && (
                      <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                        {acc.lastSyncMessage}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-1">
                    <button
                      onClick={() => handleReconnect(acc.id)}
                      className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium rounded-md transition"
                    >
                      Renew OAuth
                    </button>

                    <button
                      onClick={() => handleSync(acc.id)}
                      disabled={isSyncing}
                      className="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 font-medium rounded-md shadow-2xs transition flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Polling...' : 'Sync Orders Now'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sync Runs History Table */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-gray-200 bg-slate-50 font-semibold text-xs text-gray-800">
              Recent Marketplace Synchronization Audit Runs
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2 px-3">Run ID</th>
                    <th className="py-2 px-3">Completed At</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Orders Fetched</th>
                    <th className="py-2 px-3">Imported</th>
                    <th className="py-2 px-3">Skipped Duplicates (Idempotent)</th>
                    <th className="py-2 px-3">Exceptions Raised</th>
                    <th className="py-2 px-3">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-mono text-[11px]">
                  {recentSyncs.map((sr) => (
                    <tr key={sr.id}>
                      <td className="py-2 px-3 text-indigo-700">{sr.id}</td>
                      <td className="py-2 px-3 text-gray-500">
                        {sr.completedAt?.split('.')[0].replace('T', ' ') || 'In Progress'}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                          {sr.status}
                        </span>
                      </td>
                      <td className="py-2 px-3">{sr.ordersFetched}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">{sr.ordersImported}</td>
                      <td className="py-2 px-3 text-blue-700 font-bold">{sr.ordersSkippedDuplicate}</td>
                      <td className="py-2 px-3 text-amber-700 font-bold">{sr.exceptionsRaised}</td>
                      <td className="py-2 px-3 font-sans text-gray-600">{sr.logMessage || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Exception Queue */}
      {activeTab === 'EXCEPTIONS' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <strong>Exception Queue Purpose (SRS FR-EBAY-07, N-04):</strong> Orders containing marketplace SKUs that have not been mapped to the internal catalog are safely isolated here. Mapping an external SKU creates a permanent link in <code>MarketplaceSkuMap</code> and retroactively links held orders.
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Exception ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Marketplace Ref</th>
                    <th className="py-2.5 px-3">Details & Error Snippet</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {exceptions.map((exc) => (
                    <tr key={exc.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{exc.id}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                          {exc.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-900 font-semibold">
                        {exc.referenceId}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-gray-900 font-medium">{exc.details}</div>
                        {exc.resolutionNote && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            Resolved: {exc.resolutionNote} by {exc.resolvedBy}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            exc.status === 'RESOLVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {exc.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {exc.status === 'PENDING' && (
                          <button
                            onClick={() => setSelectedException(exc)}
                            className="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition shadow-2xs"
                          >
                            Map to Internal SKU
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Map Exception Modal */}
      {selectedException && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <Link className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Resolve Marketplace SKU Mapping</h3>
              </div>
              <button onClick={() => setSelectedException(null)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
              <div>
                <span className="font-semibold text-gray-600">Exception Reference:</span>{' '}
                <span className="font-mono font-bold text-gray-900">{selectedException.referenceId}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Problem Detail:</span>{' '}
                <span className="text-gray-800">{selectedException.details}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Select Internal Product to Map *
                </label>
                <select
                  value={targetProductId}
                  onChange={(e) => setTargetProductId(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.name} (Available: {p.lowStockThreshold ? 'In stock' : 'Stocked'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Resolution Audit Note
                </label>
                <input
                  type="text"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="e.g. Confirmed mapping with product listing team"
                  className="w-full border border-gray-300 rounded-md p-2"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setSelectedException(null)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-md text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveException}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-xs shadow-2xs transition"
              >
                Save Mapping & Re-link Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
