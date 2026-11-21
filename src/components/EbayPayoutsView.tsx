import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ShieldCheck,
  RefreshCw,
  FileText,
  Search,
  Filter,
  Receipt,
  Download,
  Check,
} from 'lucide-react';
import { EbayPayout, FinancialReconciliation, User } from '../types';
import { api } from '../services/api';

interface EbayPayoutsViewProps {
  currentUser: User;
  selectedStoreId?: string;
  onStoreChange?: (storeId: string) => void;
}

const formatMoney = (minor: number, currency = 'GBP') => new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format((Number(minor) || 0) / 100);
const formatProviderAmount = (amount: any) => {
  const value = Number(amount && typeof amount === 'object' ? amount.value : amount);
  const unit = String(amount && typeof amount === 'object' ? amount.currency || 'GBP' : 'GBP').toUpperCase();
  if (!Number.isFinite(value)) return '—';
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: unit }).format(value); }
  catch { return `${unit} ${value.toFixed(2)}`; }
};

export const EbayPayoutsView: React.FC<EbayPayoutsViewProps> = ({
  currentUser,
  selectedStoreId = 'ALL',
  onStoreChange,
}) => {
  const [activeTab, setActiveTab] = useState<'payouts' | 'reconciliation' | 'ledger' | 'provider'>('payouts');
  const [storeFilter, setStoreFilter] = useState<string>(selectedStoreId);
  const [payouts, setPayouts] = useState<EbayPayout[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [currency, setCurrency] = useState('GBP');
  const [balances, setBalances] = useState<any>(null);
  const [reconciliations, setReconciliations] = useState<FinancialReconciliation[]>([]);
  const [providerPayouts, setProviderPayouts] = useState<any[]>([]);
  const [providerTransactions, setProviderTransactions] = useState<any[]>([]);
  const [providerSummaries, setProviderSummaries] = useState<any[]>([]);
  const [providerFinanceLastSyncedAt, setProviderFinanceLastSyncedAt] = useState<string | null>(null);
  const [providerFinanceError, setProviderFinanceError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const canManageFinance = currentUser.role === 'SUPER_ADMIN' || currentUser.role === 'FINANCE_USER';

  // Confirm Deposit Modal
  const [selectedPayoutForConfirm, setSelectedPayoutForConfirm] = useState<EbayPayout | null>(null);
  const [bankRefInput, setBankRefInput] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setStoreFilter(selectedStoreId);
  }, [selectedStoreId]);

  useEffect(() => {
    loadData();
  }, [storeFilter]);

  const loadData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [payoutRes, recRes, accountRes, ledgerRes, configRes] = await Promise.allSettled([
        api.getPayouts(storeFilter), api.getReconciliations(storeFilter),
        api.getEbayAccounts(), api.getFinancialLedger(storeFilter), api.getConfig(),
      ]);
      const failures: string[] = [];
      if (payoutRes.status === 'fulfilled') {
        setPayouts(payoutRes.value.payouts || []);
        setBalances(payoutRes.value.balances || null);
      } else failures.push('Internal payout records could not be loaded.');
      if (recRes.status === 'fulfilled') setReconciliations(recRes.value.reconciliations || []);
      else failures.push('Reconciliation records could not be loaded.');
      if (ledgerRes.status === 'fulfilled') setLedger(ledgerRes.value.ledger || []);
      else failures.push('Financial ledger could not be loaded.');
      const accounts = accountRes.status === 'fulfilled' ? accountRes.value.accounts || [] : [];
      if (accountRes.status === 'rejected') failures.push('Connected eBay seller accounts could not be loaded.');
      const connectedProductionAccounts = accounts.filter((account: any) =>
        account.environment === 'PRODUCTION' && !account.isDemo &&
        account.authStatus === 'CONNECTED' &&
        (storeFilter === 'ALL' || account.id === storeFilter)
      );
      setAccounts(accounts);
      const providerResults = await Promise.allSettled(connectedProductionAccounts.map(async (account: any) => ({
        accountId: account.id,
        accountName: account.name || account.sellerUsername || 'eBay Seller',
        ...(await api.getEbayFinances(account.id)),
      })));
      const providerData = providerResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      setProviderPayouts(providerData.flatMap(item => (item.payouts || []).map((row: any) => ({ ...row, accountId: item.accountId, accountName: item.accountName }))));
      setProviderTransactions(providerData.flatMap(item => (item.transactions || []).map((row: any) => ({ ...row, accountId: item.accountId, accountName: item.accountName }))));
      setProviderSummaries(providerData.flatMap(item => (item.summaries || []).map((row: any) => ({ ...row, accountId: item.accountId, accountName: item.accountName }))));
      const syncDates = providerData.map(item => item.lastSyncedAt).filter(Boolean).sort();
      setProviderFinanceLastSyncedAt(syncDates.length ? syncDates[syncDates.length - 1] : null);
      const providerFailures = providerResults.some(result => result.status === 'rejected');
      setProviderFinanceError(providerFailures ? 'Some connected seller finance feeds could not be read. Check marketplace.view permission and seller sync status.' : '');
      if (providerFailures) failures.push('Some eBay provider finance feeds could not be loaded.');
      if (configRes.status === 'fulfilled') {
        setCurrency(String(configRes.value.config?.baseCurrency || (payoutRes.status === 'fulfilled' ? payoutRes.value.payouts?.[0]?.currency : undefined) || 'GBP').toUpperCase());
      } else failures.push('Workspace currency settings could not be loaded.');
      if (failures.length) setLoadError(failures.join(' '));
    } catch (err) {
      console.error('Failed to load eBay payouts data:', err);
      setLoadError(err instanceof Error ? err.message : 'Payout and reconciliation data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayoutForConfirm) return;
    try {
      setConfirming(true);
      await api.confirmPayoutDeposit(
        selectedPayoutForConfirm.id,
        bankRefInput || `BANK-CONFIRMED-${Date.now().toString().slice(-6)}`
      );
      setSelectedPayoutForConfirm(null);
      setBankRefInput('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm deposit');
    } finally {
      setConfirming(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'BANK_CONFIRMED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20">
            Bank Confirmed
          </span>
        );
      case 'PAID':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-500/20">
            Disbursed
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-500/20">
            Processing ACH/SEPA
          </span>
        );
      case 'INITIATED':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Initiated
          </span>
        );
    }
  };

  const ledgerByAccount = Object.values(ledger.reduce((groups: Record<string, any>, entry: any) => {
    const key = String(entry.accountId);
    const current = groups[key] || { accountId: key, accountName: entry.accountName, debitMinor: 0, creditMinor: 0, sources: [] as string[] };
    current.debitMinor += Number(entry.debitMinor || 0);
    current.creditMinor += Number(entry.creditMinor || 0);
    if (entry.sourceType && !current.sources.includes(entry.sourceType)) current.sources.push(entry.sourceType);
    groups[key] = current;
    return groups;
  }, {}));
  const ledgerTotals = ledger.reduce((totals: { debitMinor: number; creditMinor: number }, entry: any) => ({
    debitMinor: totals.debitMinor + Number(entry.debitMinor || 0),
    creditMinor: totals.creditMinor + Number(entry.creditMinor || 0),
  }), { debitMinor: 0, creditMinor: 0 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Phase 4 • Treasury & Payouts
            </span>
            <span className="text-xs text-slate-400 font-medium">Multi-Store Financial Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            eBay Payout Management & Financial Reconciliation
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Store-wise payout auditing, bank deposit clearance, variance discrepancy detection, and double-entry accounting.
          </p>
        </div>

        {/* Global Store Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Store Account:</span>
          <select
            value={storeFilter}
            onChange={(e) => {
              setStoreFilter(e.target.value);
              if (onStoreChange) onStoreChange(e.target.value);
            }}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-medium shadow-xs"
          >
            <option value="ALL">All Stores Combined</option>
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} ({account.marketplace})</option>)}
          </select>
        </div>
      </div>

      {/* KPI Balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Gross Marketplace Sales</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            {formatMoney(balances?.totalSalesMinor ?? 0, currency)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Total sales processed across eBay channels
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">eBay Fees & Deductions</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 font-mono">
            -{formatMoney(balances?.totalFeesMinor ?? 0, currency)}
          </div>
          <div className="text-xs text-rose-500/80 mt-2">
            Final value fees, promo listings, insertion
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Bank Cleared & Settled</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
            {formatMoney(balances?.confirmedMinor ?? 0, currency)}
          </div>
          <div className="text-xs text-emerald-600/80 mt-2">
            Confirmed deposits recorded in the workspace database
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Pending Deposits</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
            {formatMoney(balances?.pendingDepositMinor ?? 0, currency)}
          </div>
          <div className="text-xs text-amber-500/80 mt-2">
            Awaiting bank clearing & SEPA/ACH settlement
          </div>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <div>
            <p className="font-semibold">Payout and reconciliation data could not be loaded</p>
            <p className="mt-1 text-xs">{loadError}</p>
          </div>
          <button type="button" onClick={loadData} className="shrink-0 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-rose-100">Retry</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-6 text-sm">
          <button
            onClick={() => setActiveTab('payouts')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'payouts'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>A. Store Payouts History</span>
          </button>

          <button
            onClick={() => setActiveTab('reconciliation')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'reconciliation'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>B. Financial Reconciliation Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'ledger'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>C. Double-Entry Journal Audit</span>
          </button>
          <button
            onClick={() => setActiveTab('provider')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'provider'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>D. eBay API Source Feed ({providerPayouts.length}/{providerTransactions.length})</span>
          </button>
        </nav>
      </div>

      {/* Tab A: Store Payouts */}
      {activeTab === 'payouts' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              eBay Settlement Payouts & Bank Confirmations
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Payout batches imported from eBay Managed Payments API with transaction references and bank deposit status.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12">#</th>
                    <th className="py-2.5 px-3">Payout ID</th>
                    <th className="py-2.5 px-3">Store Account</th>
                    <th className="py-2.5 px-3">Date Disbursed</th>
                    <th className="py-2.5 px-3 text-right">Gross Sales</th>
                    <th className="py-2.5 px-3 text-right">Fees Deducted</th>
                    <th className="py-2.5 px-3 text-right">Net Payout</th>
                    <th className="py-2.5 px-3">eBay Status</th>
                    <th className="py-2.5 px-3">Bank Deposit</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {payouts.map((p, index) => (
                    <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {p.payoutId}
                        <div className="text-[10px] text-slate-400 font-mono">Tx: {p.transactionId}</div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">
                        {p.accountName}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-500 text-[11px]">
                        {p.payoutDate.split('T')[0]}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 font-medium">
                        {formatMoney(p.totalSalesMinor, p.currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-rose-500">
                        -{formatMoney(p.totalFeesMinor, p.currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {formatMoney(p.netPayoutMinor, p.currency)}
                      </td>
                      <td className="py-3 px-3">{getStatusBadge(p.status)}</td>
                      <td className="py-3 px-3">
                        {p.bankDepositStatus === 'RECONCILED' ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-mono">{p.bankReference || 'Cleared'}</span>
                          </span>
                        ) : p.bankDepositStatus === 'CLEARED' ? (
                          <span className="text-blue-500 font-medium text-[11px]">Cleared (Unmatched)</span>
                        ) : (
                          <span className="text-amber-500 font-medium text-[11px]">Pending Deposit</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {canManageFinance && p.status !== 'BANK_CONFIRMED' ? (
                          <button
                            onClick={() => {
                              setSelectedPayoutForConfirm(p);
                              setBankRefInput(`DEP-${p.currency}-${Date.now().toString().slice(-5)}`);
                            }}
                            className="px-2.5 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-500/20 rounded hover:bg-emerald-100 transition"
                          >
                            Confirm Deposit
                          </button>
                        ) : (
                          <span className="text-slate-400 text-[11px] italic">Reconciled</span>
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

      {/* Tab B: Financial Reconciliation */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Automated Variance Detection & Ledger Reconciliation
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Comparing expected payouts from sales order ledgers against actual disbursements reported by eBay banking interfaces.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12">#</th><th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3">Store Account</th>
                    <th className="py-2.5 px-3 text-right">Expected Payout</th>
                    <th className="py-2.5 px-3 text-right">Actual Payout</th>
                    <th className="py-2.5 px-3 text-right">Variance / Diff</th>
                    <th className="py-2.5 px-3 text-center">Unmatched Tx</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Audit Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {reconciliations.map((r, index) => (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td><td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">{r.period}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">{r.accountName}</td>
                      <td className="py-3 px-3 text-right font-mono font-medium">
                        {formatMoney(r.expectedPayoutMinor, currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium">
                        {formatMoney(r.actualPayoutMinor, currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {r.differenceMinor === 0 ? (
                          <span className="text-emerald-500">{formatMoney(0, currency)}</span>
                        ) : (
                          <span className="text-amber-500">{formatMoney(r.differenceMinor, currency)}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-bold">{r.unmatchedTransactionsCount}</td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            r.status === 'RECONCILED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px] max-w-xs truncate" title={r.auditNotes}>
                        {r.auditNotes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab C: Double-Entry Journal Audit */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">General Ledger Double-Entry Audit Trail</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Posted journal balances calculated from the workspace database.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr><th className="py-2.5 px-3 w-12">#</th><th className="py-2.5 px-3">Account Code</th><th className="py-2.5 px-3">Account Description</th><th className="py-2.5 px-3 text-right">Debit ({currency})</th><th className="py-2.5 px-3 text-right">Credit ({currency})</th><th className="py-2.5 px-3">Transaction Source</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {ledgerByAccount.map((entry, index) => (
                    <tr key={entry.accountId}>
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td><td className="py-3 px-3 font-mono font-semibold">{entry.accountId}</td>
                      <td className="py-3 px-3">{entry.accountName}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatMoney(entry.debitMinor, currency)}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatMoney(entry.creditMinor, currency)}</td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">{entry.sources.join(', ') || '—'}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 dark:bg-slate-800/40 font-bold">
                    <td colSpan={3} className="py-3 px-3 text-right">Trial Balance Total:</td>
                    <td className="py-3 px-3 text-right font-mono">{formatMoney(ledgerTotals.debitMinor, currency)}</td>
                    <td className="py-3 px-3 text-right font-mono">{formatMoney(ledgerTotals.creditMinor, currency)}</td>
                    <td className={ledgerTotals.debitMinor === ledgerTotals.creditMinor ? "py-3 px-3 text-emerald-600" : "py-3 px-3 text-rose-600"}>{ledgerTotals.debitMinor === ledgerTotals.creditMinor ? 'BALANCED' : 'OUT OF BALANCE'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {/* Tab D: Read-only eBay provider finance snapshots */}
      {activeTab === 'provider' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-indigo-100 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">eBay Finance API — Source Records</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Read-only provider payouts, transactions and summaries. These records are not posted into invoices, expenses or the accounting ledger automatically.</p>
                <p className="mt-1 text-[10px] text-slate-400">{providerFinanceLastSyncedAt ? `Latest source sync: ${new Date(providerFinanceLastSyncedAt).toLocaleString()}` : 'No eBay finance sync timestamp available for the selected connected sellers.'}</p>
              </div>
              <button type="button" onClick={() => void loadData()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh source records
              </button>
            </div>
            {providerFinanceError && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{providerFinanceError}</div>}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[10px] text-slate-500">eBay payouts</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{providerPayouts.length}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[10px] text-slate-500">eBay transactions</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{providerTransactions.length}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[10px] text-slate-500">Finance summaries</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{providerSummaries.length}</p></div>
              <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800"><p className="text-[10px] text-slate-500">Connected seller feeds</p><p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{new Set([...providerPayouts, ...providerTransactions, ...providerSummaries].map(row => row.accountId)).size}</p></div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h4 className="mb-3 text-xs font-semibold text-slate-900 dark:text-slate-100">Provider Payout Records</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-2">Payout ID</th><th className="px-3 py-2">Seller</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Transactions</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {providerPayouts.length ? providerPayouts.map((row, index) => <tr key={row.id || row.payoutId || index}><td className="px-3 py-2 font-mono">{row.payoutId || row.id || '—'}</td><td className="px-3 py-2">{row.accountName}</td><td className="px-3 py-2 whitespace-nowrap">{row.payoutDate ? new Date(row.payoutDate).toLocaleDateString() : '—'}</td><td className="px-3 py-2 text-right tabular-nums">{formatProviderAmount(row.amount)}</td><td className="px-3 py-2">{row.payoutStatus || '—'}</td><td className="px-3 py-2 text-right tabular-nums">{row.transactionCount ?? '—'}</td></tr>) : <tr><td colSpan={6} className="px-3 py-8 text-center text-xs text-slate-500">No eBay provider payout snapshots found for the selected connected Production sellers.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h4 className="mb-3 text-xs font-semibold text-slate-900 dark:text-slate-100">Provider Transaction Records</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="px-3 py-2">Transaction ID</th><th className="px-3 py-2">Seller</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Fee</th><th className="px-3 py-2">Order / Payout</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {providerTransactions.length ? providerTransactions.map((row, index) => <tr key={row.id || row.transactionId || index}><td className="px-3 py-2 font-mono">{row.transactionId || row.id || '—'}</td><td className="px-3 py-2">{row.accountName}</td><td className="px-3 py-2 whitespace-nowrap">{row.transactionDate ? new Date(row.transactionDate).toLocaleDateString() : '—'}</td><td className="px-3 py-2">{String(row.transactionType || '—').replaceAll('_', ' ')}</td><td className="px-3 py-2 text-right tabular-nums">{formatProviderAmount(row.amount)}</td><td className="px-3 py-2 text-right tabular-nums">{row.totalFeeAmount ? formatProviderAmount(row.totalFeeAmount) : '—'}</td><td className="px-3 py-2">{row.orderId || row.payoutId || '—'}</td></tr>) : <tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-500">No eBay provider transaction snapshots found for the selected connected Production sellers.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Deposit Modal */}
      {selectedPayoutForConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 text-slate-100 shadow-2xl">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Confirm Bank Deposit Settlement
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Match payout <span className="text-indigo-400 font-mono">{selectedPayoutForConfirm.payoutId}</span> to your treasury bank feed.
            </p>

            <form onSubmit={handleConfirmDeposit} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Net Payout Amount:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {formatMoney(selectedPayoutForConfirm.netPayoutMinor, selectedPayoutForConfirm.currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Store Account:</span>
                  <span className="text-slate-200">{selectedPayoutForConfirm.accountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">eBay Tx ID:</span>
                  <span className="font-mono text-slate-300">{selectedPayoutForConfirm.transactionId}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Bank Statement Reference / Wire ID</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BARCLAYS-DEP-88419 or CHASE-99201"
                  value={bankRefInput}
                  onChange={(e) => setBankRefInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  This reference confirms bank deposit reconciliation in the immutable audit log.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedPayoutForConfirm(null)}
                  disabled={confirming}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={confirming}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-md shadow-emerald-600/20"
                >
                  {confirming ? 'Confirming...' : 'Verify & Post Deposit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
