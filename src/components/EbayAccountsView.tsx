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
  Activity,
  ArrowRight,
  Layers,
  XCircle,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import { MarketplaceAccount, ExceptionItem, Product, User, SystemConfig } from '../types';

const getSyncStatusLabel = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
    case 'COMPLETED': return 'Synced successfully';
    case 'PARTIAL': return 'Partially synced';
    case 'FAILED': return 'Sync failed';
    case 'RUNNING': return 'Sync in progress';
    case 'NOT_SYNCED':
    case 'NEVER': return 'Not synced yet';
    default: return status || 'No sync recorded';
  }
};

const getSyncStatusClass = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
    case 'COMPLETED': return 'text-emerald-700';
    case 'PARTIAL': return 'text-amber-700';
    case 'FAILED': return 'text-rose-700';
    case 'RUNNING': return 'text-blue-700';
    default: return 'text-slate-600';
  }
};

const getIntegrationGuidance = (event: any) => {
  const code = `${event.errorCode || ''} ${event.providerCode || ''}`.toUpperCase();
  const status = Number(event.httpStatus || 0);
  if (status === 401 || status === 403 || /TOKEN|OAUTH|AUTHORIZATION|INVALID_GRANT/.test(code)) {
    return 'eBay authorization may have expired or lacks the required permission. Reconnect this seller account, then retry the sync.';
  }
  if (status === 429 || /RATE.?LIMIT/.test(code)) {
    return 'eBay is limiting requests. Wait for the next scheduled attempt before retrying.';
  }
  if (status >= 500) {
    return 'The eBay service returned a temporary server error. Keep the account connected and retry after a short delay.';
  }
  if (/SKU|PRODUCT|MAPPING/.test(code)) {
    return 'An eBay SKU could not be matched to the internal catalog. Review the Unmapped SKU Exception Queue; do not create a guessed mapping.';
  }
  if (event.retryable) {
    return 'The operation can be retried. Check the stage and provider response above, then use Retry Orders + Inventory.';
  }
  return 'Review the API operation, stage, error code and provider message above. If the cause is not clear, preserve this event for technical investigation before retrying.';
};

interface EbayAccountsViewProps {
  currentUser: User;
  config: SystemConfig;
  selectedStoreId: string;
  onNavigate: (tab: any) => void;
}

export const EbayAccountsView: React.FC<EbayAccountsViewProps> = ({
  currentUser,
  config,
  selectedStoreId,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'EVENTS' | 'EXCEPTIONS'>('ACCOUNTS');
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<any[]>([]);
  const [integrationEvents, setIntegrationEvents] = useState<any[]>([]);
  const [integrationReady, setIntegrationReady] = useState(false);
  const [productionOAuthEnabled, setProductionOAuthEnabled] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState('Live eBay OAuth and order synchronization are not enabled yet.');
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [expandedListingsAccountId, setExpandedListingsAccountId] = useState<string | null>(null);
  const [listingSnapshots, setListingSnapshots] = useState<Record<string, any[]>>({});
  const [listingTotals, setListingTotals] = useState<Record<string, number>>({});
  const [listingLoadingAccountId, setListingLoadingAccountId] = useState<string | null>(null);
  const [selectedException, setSelectedException] = useState<ExceptionItem | null>(null);
  const [targetProductId, setTargetProductId] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [newAccountName, setNewAccountName] = useState('');
  const [newMarketplace, setNewMarketplace] = useState<'EBAY_UK' | 'EBAY_US' | 'EBAY_DE'>('EBAY_UK');
  const newEnvironment = 'PRODUCTION' as const;
  const [accountSaving, setAccountSaving] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [integrationConfig, setIntegrationConfig] = useState<any>(null);
  const credentialEnvironment = 'PRODUCTION' as const;
  const [clientIdInput, setClientIdInput] = useState('');
  const [clientSecretInput, setClientSecretInput] = useState('');
  const [ruNameInput, setRuNameInput] = useState('');
  const [credentialSaving, setCredentialSaving] = useState(false);

  useEffect(() => {
    setSelectedException(null);
    setResolutionNote('');
    loadData();
  }, [currentUser.id, selectedStoreId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accRes, excRes, prodRes, eventRes] = await Promise.all([
        api.getEbayAccounts(selectedStoreId),
        api.getExceptions(selectedStoreId),
        api.getProducts(selectedStoreId, 'PRODUCTION'),
        api.getEbayIntegrationEvents(selectedStoreId),
      ]);
      const liveAccounts = (accRes.accounts || []).filter((account: any) => !account.isDemo && account.environment === 'PRODUCTION');
      const liveAccountIds = new Set(liveAccounts.map((account: any) => account.id));
      const isLiveAccountRecord = (record: any) => liveAccountIds.has(record.accountId || record.marketplaceAccountId);
      setAccounts(liveAccounts);
      setIntegrationReady(accRes.integrationReady);
      setProductionOAuthEnabled(accRes.productionOAuthEnabled);
      setIntegrationMessage(accRes.integrationMessage);
      if (currentUser.role === 'SUPER_ADMIN') {
        try { setIntegrationConfig(await api.getEbayIntegrationConfig()); } catch { setIntegrationConfig(null); }
      }
      setRecentSyncs((accRes.recentSyncs || []).filter(isLiveAccountRecord));
      setIntegrationEvents((eventRes.events || []).filter(isLiveAccountRecord));
      setExceptions((excRes.exceptions || []).filter(isLiveAccountRecord));
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
    setSyncResult(null);
    try {
      const res = await api.syncEbayAccount(accountId);
      setSyncResult(res);
      setListingSnapshots(current => { const next = { ...current }; delete next[accountId]; return next; });
      setListingTotals(current => { const next = { ...current }; delete next[accountId]; return next; });
      void loadData();
    } catch (err: any) {
      setSyncResult({
        status: 'FAILED',
        orders: { status: 'FAILED', fetched: 0, imported: 0, skipped: 0, exceptions: 0, error: { code: 'SYNC_REQUEST_FAILED', message: err?.message || 'The sync request could not be completed.', stage: 'SYNC_REQUEST', httpStatus: null } },
        inventory: { status: 'FAILED', fetched: 0, offersFetched: 0, error: { code: 'SYNC_REQUEST_FAILED', message: 'Inventory sync was not completed because the sync request failed.', stage: 'SYNC_REQUEST', httpStatus: null } },
      });
      void loadData();
    } finally {
      window.dispatchEvent(new Event('oria-orders-updated'));
      setSyncingAccountId(null);
    }
  };

  const handleToggleListings = async (accountId: string) => {
    if (expandedListingsAccountId === accountId) {
      setExpandedListingsAccountId(null);
      return;
    }
    setExpandedListingsAccountId(accountId);
    if (listingSnapshots[accountId]) return;
    setListingLoadingAccountId(accountId);
    try {
      const result = await api.getEbayListings(accountId, 100, 0);
      setListingSnapshots(current => ({ ...current, [accountId]: result.listings }));
      setListingTotals(current => ({ ...current, [accountId]: result.total }));
    } catch (err: any) {
      setSyncFeedback(`Could not load seller listings: ${err.message}`);
      setExpandedListingsAccountId(null);
    } finally {
      setListingLoadingAccountId(null);
    }
  };

  const handleReconnect = async (accountId: string) => {
    try {
      const res = await api.connectEbayAccount(accountId);
      window.location.assign(res.authorizationUrl);
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


  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) return;
    setAccountSaving(true);
    try {
      await api.createEbayAccount({ name: newAccountName.trim(), marketplace: newMarketplace, environment: newEnvironment });
      setNewAccountName('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Could not add the eBay seller account.');
    } finally {
      setAccountSaving(false);
    }
  };

  const handleDeleteAccount = async (account: MarketplaceAccount) => {
    if (currentUser.role !== 'SUPER_ADMIN') {
      alert('Only a Super Admin can delete a marketplace account.');
      return;
    }
    const typedName = window.prompt(
      `Super Admin verification required. Type the exact account name to delete: ${account.name}`
    );
    if (typedName === null) return;
    if (typedName.trim() !== account.name) {
      alert('Account name did not match. Nothing was deleted.');
      return;
    }
    if (!window.confirm(`Permanently delete the unused marketplace account "${account.name}"? Linked or connected accounts cannot be deleted.`)) return;

    setDeletingAccountId(account.id);
    try {
      await api.deleteEbayAccount(account.id, typedName.trim());
      setSyncFeedback(`Marketplace account "${account.name}" was deleted.`);
      await loadData();
      window.dispatchEvent(new Event('oria-marketplace-accounts-updated'));
    } catch (err: any) {
      alert(err.message || 'The marketplace account could not be deleted safely.');
    } finally {
      setDeletingAccountId(null);
    }
  };

  const handleSaveCredentials = async () => {
    if (!clientIdInput.trim() || !clientSecretInput.trim() || !ruNameInput.trim()) return;
    const current = integrationConfig?.environments?.find((item: any) => item.environment === credentialEnvironment);
    setCredentialSaving(true);
    try {
      await api.saveEbayIntegrationConfig({
        environment: credentialEnvironment,
        clientId: clientIdInput.trim(),
        clientSecret: clientSecretInput.trim(),
        ruName: ruNameInput.trim(),
        expectedVersion: current?.credentialVersion || 0,
      });
      setClientIdInput('');
      setClientSecretInput('');
      setRuNameInput('');
      setIntegrationConfig(await api.getEbayIntegrationConfig());
      await loadData();
      alert('eBay verified the application keypair and the credentials were securely saved. Seller authorization is still pending and must be completed separately.');
    } catch (err: any) {
      alert(err.message || 'Could not save eBay credentials.');
    } finally {
      setCredentialSaving(false);
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
            Connect each seller once, then automatically import orders, inventory items and Inventory API listing offers, prices and quantities.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
            Read-only mode — OAuth setup pending
          </span>
        </div>
      </div>

      {!integrationReady && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs">
          <div className="font-semibold mb-1">Live eBay integration is not enabled</div>
          <p>{integrationMessage}</p>
          <p className="mt-1">Existing account statuses are database records only; they do not confirm a live eBay OAuth connection.</p>
        </div>
      )}

      {currentUser.role === 'SUPER_ADMIN' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="font-semibold text-sm text-slate-900">eBay Developer Application Credentials</div>
          <p className="text-xs text-slate-600">Credentials are first verified directly with the selected eBay environment, then encrypted in the Worker before storage. They are never returned to the browser. Seller authorization is a separate step; saving app credentials does not connect a seller account. Do not paste these values into chat or GitHub.</p>
          <p className="text-xs text-amber-700">Shared platform credentials can only be viewed by explicitly allowlisted platform owners. Saving also requires a completed authenticator MFA step-up (AAL2); a workspace Super Admin role alone is not sufficient.</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input value={clientIdInput} onChange={e => setClientIdInput(e.target.value)} placeholder="App ID / Client ID" className="border rounded-md p-2 text-xs" autoComplete="off" />
            <input value={clientSecretInput} onChange={e => setClientSecretInput(e.target.value)} placeholder="Cert ID / Client Secret" type="password" className="border rounded-md p-2 text-xs" autoComplete="new-password" />
            <input value={ruNameInput} onChange={e => setRuNameInput(e.target.value)} placeholder="OAuth RuName" className="border rounded-md p-2 text-xs" autoComplete="off" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {integrationConfig?.environments?.filter((item: any) => item.environment === 'PRODUCTION').map((item: any) => `Production: ${item.configured ? `${item.clientIdMasked} (${item.credentialsVerified ? 'verified' : 'NOT VERIFIED — replace and verify'})` : 'not configured'}`).join(' · ') || 'Production credentials are not configured.'}
            </span>
            <button onClick={handleSaveCredentials} disabled={credentialSaving || !clientIdInput.trim() || !clientSecretInput.trim() || !ruNameInput.trim()} className="px-3 py-2 rounded-md bg-slate-900 text-white text-xs disabled:opacity-50">
              {credentialSaving ? 'Saving securely…' : 'Verify & Save Credentials'}
            </button>
          </div>
          {integrationConfig && !integrationConfig.encryptionReady && <p className="text-xs text-rose-700">Worker encryption secret is not configured. Add the eBay token-encryption secret in Cloudflare Worker settings before saving.</p>}
          {integrationConfig && !integrationConfig.productionOAuthEnabled && <p className="text-xs text-amber-700">Production OAuth remains locked until eBay activates the Production keyset and Marketplace Account Deletion compliance is verified.</p>}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="font-semibold text-sm text-slate-900">Add eBay Seller Account</div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input value={newAccountName} onChange={e => setNewAccountName(e.target.value)} placeholder="Account label (e.g. UK Store 1)" className="border rounded-md p-2 text-xs" maxLength={120} />
          <select value={newMarketplace} onChange={e => setNewMarketplace(e.target.value as any)} className="border rounded-md p-2 text-xs">
            <option value="EBAY_UK">eBay United Kingdom</option><option value="EBAY_US">eBay United States</option><option value="EBAY_DE">eBay Germany</option>
          </select>
          <button onClick={handleCreateAccount} disabled={accountSaving || !newAccountName.trim()} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-xs disabled:opacity-50">{accountSaving ? 'Adding…' : 'Add Seller Account'}</button>
        </div>
        <p className="text-[11px] text-slate-500">Only live Production seller accounts are available in this workspace. After OAuth connects a seller, the first sync starts automatically on the next scheduled run (within about 5 minutes).</p>
      </div>

      {syncFeedback && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{syncFeedback}</span>
          </div>
          <button onClick={() => setSyncFeedback(null)} className="text-indigo-400 hover:text-indigo-700">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}
      {syncResult && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Latest sync results</h3>
              <p className="text-[11px] text-slate-500">Orders and inventory are reported independently. A problem in one does not hide successful data from the other.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-bold rounded px-2 py-1 ${syncResult.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : syncResult.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>{syncResult.status}</span>
              <button onClick={() => setSyncResult(null)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss sync results"><XCircle className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">Orders</span>
                <span className={`text-[10px] font-bold ${syncResult.orders?.status === 'SUCCESS' ? 'text-emerald-700' : syncResult.orders?.status === 'PARTIAL' ? 'text-amber-700' : 'text-rose-700'}`}>{syncResult.orders?.status || 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">Fetched: {syncResult.orders?.fetched ?? 0} · Imported: {syncResult.orders?.imported ?? 0} · Duplicates: {syncResult.orders?.skipped ?? 0} · SKU exceptions: {syncResult.orders?.exceptions ?? 0}{syncResult.orders?.pagesPending ? ' · More order pages pending' : ''}</p>
              {syncResult.orders?.error && <p className="text-[11px] text-rose-700 break-words">Stage: {syncResult.orders.error.stage}{syncResult.orders.error.httpStatus ? ` · HTTP ${syncResult.orders.error.httpStatus}` : ''} · {syncResult.orders.error.code}: {syncResult.orders.error.message}</p>}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">Inventory & Listings</span>
                <span className={`text-[10px] font-bold ${syncResult.inventory?.status === 'SUCCESS' ? 'text-emerald-700' : syncResult.inventory?.status === 'PARTIAL' ? 'text-amber-700' : 'text-rose-700'}`}>{syncResult.inventory?.status || 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">Inventory items: {syncResult.inventory?.fetched ?? 0} · Listing offers: {syncResult.inventory?.offersFetched ?? 0}{syncResult.inventory?.pagesPending ? ' · More pages pending' : ''}</p>
              {syncResult.inventory?.error && <p className="text-[11px] text-rose-700 break-words">Stage: {syncResult.inventory.error.stage}{syncResult.inventory.error.httpStatus ? ` · HTTP ${syncResult.inventory.error.httpStatus}` : ''} · {syncResult.inventory.error.code}: {syncResult.inventory.error.message}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 text-xs">
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
          onClick={() => setActiveTab('EVENTS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'EVENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Integration Events &amp; Sync Logs ({integrationEvents.length})</span>
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
                      eBay authorization: {acc.authStatus === 'CONNECTED' ? 'Connected (saved authorization)' : acc.authStatus}
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs space-y-1">
                    <div className="flex justify-between text-gray-600">
                      <span>Recorded token expiry:</span>
                      <span className="font-semibold text-gray-700">{acc.tokenExpiresAt ? 'Stored expiry recorded (not live-verified)' : 'No token expiry recorded'}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Auto Polling Schedule:</span>
                      <span className="font-medium text-gray-900">Every {acc.autoSyncIntervalMinutes} minutes</span>
                    </div>
                    <div className="flex justify-between text-gray-600 gap-3">
                      <span>Last Sync Result:</span>
                      <span className={`font-semibold text-right ${getSyncStatusClass(acc.lastSyncStatus)}`}>{getSyncStatusLabel(acc.lastSyncStatus)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">“Connected” confirms a saved eBay authorization. A successful API sync is tracked separately in this result and the sync history below.</p>
                    {acc.lastSyncMessage && (
                      <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                        {acc.lastSyncMessage}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end flex-wrap gap-2 pt-1">
                    {currentUser.role === 'SUPER_ADMIN' && (
                      <button
                        onClick={() => handleDeleteAccount(acc)}
                        disabled={deletingAccountId === acc.id || acc.authStatus === 'CONNECTED'}
                        title={acc.authStatus === 'CONNECTED' ? 'Disconnect the eBay authorization before deletion.' : 'Super Admin only — delete an unused account'}
                        className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 font-medium rounded-md transition inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {deletingAccountId === acc.id ? 'Deleting…' : 'Delete Account'}
                      </button>
                    )}
                    <button
                      onClick={() => handleReconnect(acc.id)
                      disabled={!integrationReady || (acc.environment === 'PRODUCTION' && !productionOAuthEnabled)}
                      title={!integrationReady ? integrationMessage : acc.environment === 'PRODUCTION' && !productionOAuthEnabled ? 'Production keyset is not yet activated by eBay.' : undefined}
                      className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {acc.authStatus === 'CONNECTED' ? 'Reconnect eBay Account' : 'Connect eBay Account'}
                    </button>

                    <button
                      onClick={() => handleSync(acc.id)}
                      disabled={!integrationReady || acc.authStatus !== 'CONNECTED' || isSyncing}
                      className="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 font-medium rounded-md shadow-2xs transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>{isSyncing ? 'Syncing...' : acc.authStatus !== 'CONNECTED' ? 'Connect first' : integrationReady ? 'Sync Orders + Inventory' : 'Sync unavailable'}</span>
                    </button>
                  </div>
                  {acc.authStatus === 'CONNECTED' && (
                    <div className="pt-2 border-t border-gray-100">
                      <button onClick={() => handleToggleListings(acc.id)} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900">
                        {expandedListingsAccountId === acc.id ? 'Hide synced listings' : `View synced listings (${listingTotals[acc.id] ?? 'load'})`}
                      </button>
                      {expandedListingsAccountId === acc.id && (
                        <div className="mt-3 overflow-x-auto">
                          {listingLoadingAccountId === acc.id ? (
                            <p className="text-xs text-slate-500 py-3">Loading seller inventory and listings…</p>
                          ) : (
                            <table className="w-full text-left text-[11px]">
                              <thead className="bg-slate-50 text-slate-600">
                                <tr><th className="p-2">SKU</th><th className="p-2">Product</th><th className="p-2">Listing</th><th className="p-2">Inventory Qty</th><th className="p-2">Offer Qty / Price</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(listingSnapshots[acc.id] || []).map((listing: any) => (
                                  <tr key={listing.sku}>
                                    <td className="p-2 font-mono">{listing.sku}</td>
                                    <td className="p-2 min-w-40">{listing.title || '—'}</td>
                                    <td className="p-2">{listing.listingStatus}</td>
                                    <td className="p-2 tabular-nums">{listing.inventoryQuantity ?? '—'}</td>
                                    <td className="p-2">
                                      {listing.offers?.length ? listing.offers.map((offer: any) => (
                                        <div key={offer.offerId || offer.listingId || listing.sku}>
                                          {offer.availableQuantity ?? '—'} / {offer.pricingSummary?.price?.value ? `${offer.pricingSummary.price.currency || ''} ${offer.pricingSummary.price.value}` : '—'}
                                        </div>
                                      )) : 'No offer'}
                                    </td>
                                  </tr>
                                ))}
                                {!(listingSnapshots[acc.id] || []).length && (
                                  <tr><td colSpan={5} className="p-3 text-center text-slate-500">No synced inventory yet. Use “Sync Orders + Inventory” after connecting. The first automatic sync also starts on the next scheduled run (within about 5 minutes).</td></tr>
                                )}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${sr.status === 'COMPLETED' || sr.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : sr.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : sr.status === 'RUNNING' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>
                          {sr.status === 'COMPLETED' ? 'Synced' : sr.status === 'PARTIAL' ? 'Partially synced' : sr.status === 'RUNNING' ? 'In progress' : sr.status === 'FAILED' ? 'Failed' : sr.status}
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

      {/* Integration Events & Sync Logs */}
      {activeTab === 'EVENTS' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Integration Events &amp; Sync Logs</h3>
              <p className="text-xs text-slate-500">Seller-scoped API failures, provider responses and scheduled retry timing.</p>
            </div>
            <button onClick={loadData} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh logs
            </button>
          </div>
          {integrationEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <Activity className="mx-auto mb-2 h-7 w-7 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">No integration events found</p>
              <p className="mt-1 text-xs text-slate-500">New sync failures and integration events will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {integrationEvents.map((event: any) => {
                const eventAccount = accounts.find(account => account.id === event.accountId);
                const retrying = Boolean(event.accountId && syncingAccountId === event.accountId);
                return (
                  <article key={event.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900">{event.accountName}</span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{event.eventType}</span>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${event.severity === 'ERROR' || event.severity === 'CRITICAL' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'}`}>{event.severity}</span>
                        </div>
                        <p className="mt-1 break-words text-xs text-slate-700">{event.message}</p>
                        <p className="mt-1 text-[11px] text-indigo-800"><strong>Recommended next step:</strong> {getIntegrationGuidance(event)}</p>
                      </div>
                      <span className="shrink-0 text-[11px] text-slate-500">{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="text-slate-500">API / Operation</dt><dd className="mt-0.5 break-all font-mono text-slate-800">{event.apiName || '—'}</dd></div>
                      <div><dt className="text-slate-500">HTTP Status</dt><dd className="mt-0.5 font-semibold text-slate-800">{event.httpStatus ?? 'Not recorded'}</dd></div>
                      <div><dt className="text-slate-500">eBay Error Code</dt><dd className="mt-0.5 font-mono text-slate-800">{event.providerCode || event.errorCode || '—'}</dd></div>
                      <div><dt className="text-slate-500">Next scheduled sync</dt><dd className="mt-0.5 text-slate-800">{event.nextSyncAt ? (new Date(event.nextSyncAt).getTime() <= Date.now() ? 'Due now' : new Date(event.nextSyncAt).toLocaleString()) : 'Not scheduled'}</dd></div>
                    </dl>
                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                      {eventAccount && event.retryable && (
                        <button onClick={() => handleSync(event.accountId)} disabled={retrying || !integrationReady || eventAccount.authStatus !== 'CONNECTED'} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} /> {retrying ? 'Retrying sync…' : 'Retry Orders + Inventory'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
