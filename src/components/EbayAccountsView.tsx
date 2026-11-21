import React, { useState, useEffect } from 'react';
import {
  Store,
  RefreshCw,
  Link,
  AlertTriangle,
  Activity,
  XCircle,
  Trash2,
} from 'lucide-react';
import { api } from '../services/api';
import {
  MarketplaceAccount,
  ExceptionItem,
  Product,
  User,
  SystemConfig,
} from '../types';

const getSyncStatusLabel = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
    case 'COMPLETED':
      return 'Synced successfully';
    case 'PARTIAL':
      return 'Partially synced';
    case 'FAILED':
      return 'Sync failed';
    case 'RUNNING':
      return 'Sync in progress';
    case 'NOT_SYNCED':
    case 'NEVER':
      return 'Not synced yet';
    default:
      return status || 'No sync recorded';
  }
};

const getSyncStatusClass = (status?: string) => {
  switch ((status || '').toUpperCase()) {
    case 'SUCCESS':
    case 'COMPLETED':
      return 'text-emerald-700';
    case 'PARTIAL':
      return 'text-amber-700';
    case 'FAILED':
      return 'text-rose-700';
    case 'RUNNING':
      return 'text-blue-700';
    default:
      return 'text-slate-600';
  }
};

const getIntegrationGuidance = (event: any) => {
  const code = `${event.errorCode || ''} ${event.providerCode || ''}`.toUpperCase();
  const status = Number(event.httpStatus || 0);

  if (
    status === 401 ||
    status === 403 ||
    /TOKEN|OAUTH|AUTHORIZATION|INVALID_GRANT/.test(code)
  ) {
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

  return 'Review the API operation, stage, error code and provider message above. Preserve this event for technical investigation before retrying.';
};

type EbayModuleSection = 'LISTINGS' | 'RETURNS' | 'ANALYTICS' | 'FINANCES';

interface EbayAccountsViewProps {
  currentUser: User;
  config: SystemConfig;
  selectedStoreId: string;
  onNavigate: (tab: any) => void;
  initialSection?: EbayModuleSection | null;
}

export const EbayAccountsView: React.FC<EbayAccountsViewProps> = ({
  currentUser,
  config,
  selectedStoreId,
  onNavigate,
  initialSection = null,
}) => {
  const [activeTab, setActiveTab] = useState<'ACCOUNTS' | 'EVENTS' | 'EXCEPTIONS'>('ACCOUNTS');

  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [recentSyncs, setRecentSyncs] = useState<any[]>([]);
  const [integrationEvents, setIntegrationEvents] = useState<any[]>([]);
  const [integrationReady, setIntegrationReady] = useState(false);
  const [productionOAuthEnabled, setProductionOAuthEnabled] = useState(false);

  const [integrationMessage, setIntegrationMessage] = useState(
    'Live eBay OAuth and order synchronization are not enabled yet.'
  );

  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<any>(null);

  const [expandedListingsAccountId, setExpandedListingsAccountId] = useState<string | null>(null);
  const [listingSnapshots, setListingSnapshots] = useState<Record<string, any[]>>({});
  const [listingTotals, setListingTotals] = useState<Record<string, number>>({});
  const [listingLoadingAccountId, setListingLoadingAccountId] = useState<string | null>(null);
  const [expandedSellerAccountId, setExpandedSellerAccountId] = useState<string | null>(null);
  const [sellerAccountSnapshots, setSellerAccountSnapshots] = useState<Record<string, any[]>>({});
  const [sellerAccountLoadingId, setSellerAccountLoadingId] = useState<string | null>(null);
  const [expandedReturnsAccountId, setExpandedReturnsAccountId] = useState<string | null>(null);
  const [returnsByAccount, setReturnsByAccount] = useState<Record<string, any[]>>({});
  const [returnsLoadingId, setReturnsLoadingId] = useState<string | null>(null);
  const [expandedAnalyticsAccountId, setExpandedAnalyticsAccountId] = useState<string | null>(null);
  const [analyticsByAccount, setAnalyticsByAccount] = useState<Record<string, any[]>>({});
  const [analyticsLoadingId, setAnalyticsLoadingId] = useState<string | null>(null);
  const [expandedFinanceAccountId, setExpandedFinanceAccountId] = useState<string | null>(null);
  const [financesByAccount, setFinancesByAccount] = useState<Record<string, any>>({});
  const [financeLoadingId, setFinanceLoadingId] = useState<string | null>(null);

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
    void loadData();
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

      const liveAccounts = (accRes.accounts || []).filter(
        (account: any) =>
          !account.isDemo && account.environment === 'PRODUCTION'
      );

      const liveAccountIds = new Set(
        liveAccounts.map((account: any) => account.id)
      );

      const isLiveAccountRecord = (record: any) =>
        liveAccountIds.has(record.accountId || record.marketplaceAccountId);

      setAccounts(liveAccounts);
      setIntegrationReady(accRes.integrationReady);
      setProductionOAuthEnabled(accRes.productionOAuthEnabled);
      setIntegrationMessage(accRes.integrationMessage);

      if (currentUser.role === 'SUPER_ADMIN') {
        try {
          setIntegrationConfig(await api.getEbayIntegrationConfig());
        } catch {
          setIntegrationConfig(null);
        }
      }

      setRecentSyncs((accRes.recentSyncs || []).filter(isLiveAccountRecord));
      setIntegrationEvents((eventRes.events || []).filter(isLiveAccountRecord));
      setExceptions((excRes.exceptions || []).filter(isLiveAccountRecord));

      setProducts(prodRes.products || []);

      if (prodRes.products?.length > 0) {
        setTargetProductId(prodRes.products[0].id);
      } else {
        setTargetProductId('');
      }
    } catch (err) {
      console.error('Failed to load eBay data:', err);
      setSyncFeedback('Could not load eBay integration data. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async (accountId: string) => {
    setSyncingAccountId(accountId);
    setSyncFeedback(null);
    setSyncResult(null);

    try {
      let res: any;
      try {
        res = await api.syncEbayAccount(accountId);
      } catch (error: any) {
        const message = error?.message || 'The orders and inventory sync request could not be completed.';
        res = {
          status: 'FAILED',
          orders: {
            status: 'FAILED',
            fetched: 0,
            imported: 0,
            skipped: 0,
            exceptions: 0,
            error: { code: 'SYNC_REQUEST_FAILED', message, stage: 'SYNC_REQUEST', httpStatus: null },
          },
          inventory: {
            status: 'FAILED',
            fetched: 0,
            offersFetched: 0,
            error: { code: 'SYNC_REQUEST_FAILED', message: 'Inventory sync was not completed because the orders sync request failed.', stage: 'SYNC_REQUEST', httpStatus: null },
          },
        };
      }
      let activeListings: any = null;
      let activeListingsError = '';
      let sellerAccount: any = null;
      let sellerAccountError = '';
      let ebayReturns: any = null;
      let ebayReturnsError = '';
      let ebayAnalytics: any = null;
      let ebayAnalyticsError = '';
      let ebayFinances: any = null;
      let ebayFinancesError = '';
      try { activeListings = await api.syncEbayActiveListings(accountId); }
      catch (error: any) { activeListingsError = error?.message || 'Trading API active listings sync failed.'; }
      try { sellerAccount = await api.syncEbaySellerAccount(accountId); }
      catch (error: any) { sellerAccountError = error?.message || 'Seller account settings sync failed.'; }
      try { ebayReturns = await api.syncEbayReturns(accountId); }
      catch (error: any) { ebayReturnsError = error?.message || 'eBay Returns sync failed.'; }
      try { ebayAnalytics = await api.syncEbayAnalytics(accountId); }
      catch (error: any) { ebayAnalyticsError = error?.message || 'eBay Analytics sync failed.'; }
      try { ebayFinances = await api.syncEbayFinances(accountId); }
      catch (error: any) { ebayFinancesError = error?.message || 'eBay Finances sync failed.'; }
      const moduleFailureCount = [
        activeListingsError,
        sellerAccountError,
        ebayReturnsError,
        ebayAnalyticsError,
        ebayFinancesError,
      ].filter(Boolean).length;
      const overallStatus = res.status === 'FAILED' && moduleFailureCount === 5
        ? 'FAILED'
        : (res.status !== 'SUCCESS' || moduleFailureCount > 0 ? 'PARTIAL' : 'SUCCESS');
      setSyncResult({
        ...res,
        status: overallStatus,
        activeListings, activeListingsError,
        sellerAccount, sellerAccountError,
        ebayReturns, ebayReturnsError,
        ebayAnalytics, ebayAnalyticsError,
        ebayFinances, ebayFinancesError,
      });

      setListingSnapshots(current => {
        const next = { ...current };
        delete next[accountId];
        return next;
      });

      setListingTotals(current => {
        const next = { ...current };
        delete next[accountId];
        return next;
      });

      await loadData();
    } catch (err: any) {
      setSyncResult({
        status: 'FAILED',
        orders: {
          status: 'FAILED',
          fetched: 0,
          imported: 0,
          skipped: 0,
          exceptions: 0,
          error: {
            code: 'SYNC_REQUEST_FAILED',
            message: err?.message || 'The sync request could not be completed.',
            stage: 'SYNC_REQUEST',
            httpStatus: null,
          },
        },
        inventory: {
          status: 'FAILED',
          fetched: 0,
          offersFetched: 0,
          error: {
            code: 'SYNC_REQUEST_FAILED',
            message: 'Inventory sync was not completed because the sync request failed.',
            stage: 'SYNC_REQUEST',
            httpStatus: null,
          },
        },
      });

      await loadData();
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

      setListingSnapshots(current => ({
        ...current,
        [accountId]: [...(result.listings || []), ...(result.tradingListings || [])],
      }));

      setListingTotals(current => ({
        ...current,
        [accountId]: result.total || 0,
      }));
    } catch (err: any) {
      setSyncFeedback(`Could not load seller listings: ${err.message}`);
      setExpandedListingsAccountId(null);
    } finally {
      setListingLoadingAccountId(null);
    }
  };

  const handleToggleSellerAccount = async (accountId: string) => {
    if (expandedSellerAccountId === accountId) { setExpandedSellerAccountId(null); return; }
    setExpandedSellerAccountId(accountId);
    if (sellerAccountSnapshots[accountId]) return;
    setSellerAccountLoadingId(accountId);
    try {
      const result = await api.getEbaySellerAccount(accountId);
      setSellerAccountSnapshots(current => ({ ...current, [accountId]: result.resources || [] }));
    } catch (err: any) {
      setSyncFeedback(`Could not load seller account settings: ${err.message}`);
      setExpandedSellerAccountId(null);
    } finally { setSellerAccountLoadingId(null); }
  };

  const handleToggleReturns = async (accountId: string) => {
    if (expandedReturnsAccountId === accountId) { setExpandedReturnsAccountId(null); return; }
    setExpandedReturnsAccountId(accountId);
    if (returnsByAccount[accountId]) return;
    setReturnsLoadingId(accountId);
    try {
      const result = await api.getEbayReturns(accountId);
      setReturnsByAccount(current => ({ ...current, [accountId]: result.returns || [] }));
    } catch (err: any) {
      setSyncFeedback(`Could not load eBay returns: ${err.message}`);
      setExpandedReturnsAccountId(null);
    } finally { setReturnsLoadingId(null); }
  };

  const handleToggleAnalytics = async (accountId: string) => {
    if (expandedAnalyticsAccountId === accountId) { setExpandedAnalyticsAccountId(null); return; }
    setExpandedAnalyticsAccountId(accountId);
    if (analyticsByAccount[accountId]) return;
    setAnalyticsLoadingId(accountId);
    try {
      const result = await api.getEbayAnalytics(accountId);
      setAnalyticsByAccount(current => ({ ...current, [accountId]: result.resources || [] }));
    } catch (err: any) {
      setSyncFeedback(`Could not load eBay Analytics: ${err.message}`);
      setExpandedAnalyticsAccountId(null);
    } finally { setAnalyticsLoadingId(null); }
  };

  const handleToggleFinance = async (accountId: string) => {
    if (expandedFinanceAccountId === accountId) { setExpandedFinanceAccountId(null); return; }
    setExpandedFinanceAccountId(accountId);
    if (financesByAccount[accountId]) return;
    setFinanceLoadingId(accountId);
    try {
      const result = await api.getEbayFinances(accountId);
      setFinancesByAccount(current => ({ ...current, [accountId]: result }));
    } catch (err: any) {
      setSyncFeedback(`Could not load eBay Finances: ${err.message}`);
      setExpandedFinanceAccountId(null);
    } finally { setFinanceLoadingId(null); }
  };

  useEffect(() => {
    if (!initialSection) return;
    const account = (selectedStoreId !== 'ALL' ? accounts.find(item => item.id === selectedStoreId && item.authStatus === 'CONNECTED') : null)
      || (selectedStoreId === 'ALL' ? accounts.find(item => item.authStatus === 'CONNECTED') : null);
    if (!account) return;

    const accountId = account.id;
    const loadFailure = (label: string, error: any) => {
      setSyncFeedback(`Could not load eBay ${label}: ${error?.message || 'Request failed.'}`);
    };

    if (initialSection === 'LISTINGS') {
      setExpandedListingsAccountId(accountId);
      if (!listingSnapshots[accountId]) {
        setListingLoadingAccountId(accountId);
        void api.getEbayListings(accountId, 100, 0).then(result => {
          setListingSnapshots(current => ({ ...current, [accountId]: [...(result.listings || []), ...(result.tradingListings || [])] }));
          setListingTotals(current => ({ ...current, [accountId]: result.total || 0 }));
        }).catch(error => loadFailure('Active Listings', error)).finally(() => setListingLoadingAccountId(null));
      }
    } else if (initialSection === 'RETURNS') {
      setExpandedReturnsAccountId(accountId);
      if (!returnsByAccount[accountId]) {
        setReturnsLoadingId(accountId);
        void api.getEbayReturns(accountId).then(result => {
          setReturnsByAccount(current => ({ ...current, [accountId]: result.returns || [] }));
        }).catch(error => loadFailure('Returns', error)).finally(() => setReturnsLoadingId(null));
      }
    } else if (initialSection === 'ANALYTICS') {
      setExpandedAnalyticsAccountId(accountId);
      if (!analyticsByAccount[accountId]) {
        setAnalyticsLoadingId(accountId);
        void api.getEbayAnalytics(accountId).then(result => {
          setAnalyticsByAccount(current => ({ ...current, [accountId]: result.resources || [] }));
        }).catch(error => loadFailure('Analytics', error)).finally(() => setAnalyticsLoadingId(null));
      }
    } else if (initialSection === 'FINANCES') {
      setExpandedFinanceAccountId(accountId);
      if (!financesByAccount[accountId]) {
        setFinanceLoadingId(accountId);
        void api.getEbayFinances(accountId).then(result => {
          setFinancesByAccount(current => ({ ...current, [accountId]: result }));
        }).catch(error => loadFailure('Finances', error)).finally(() => setFinanceLoadingId(null));
      }
    }
  }, [initialSection, accounts, selectedStoreId, listingSnapshots, sellerAccountSnapshots, returnsByAccount, analyticsByAccount, financesByAccount]);

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
      await api.resolveException(
        selectedException.id,
        targetProductId,
        resolutionNote
      );

      setSelectedException(null);
      setResolutionNote('');

      await loadData();
    } catch (err: any) {
      alert(err.message || 'Resolution failed');
    }
  };

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) return;

    setAccountSaving(true);

    try {
      await api.createEbayAccount({
        name: newAccountName.trim(),
        marketplace: newMarketplace,
        environment: newEnvironment,
      });

      setNewAccountName('');
      await loadData();
      window.dispatchEvent(new Event('oria-marketplace-accounts-updated'));
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

    if (account.authStatus === 'CONNECTED') {
      alert('Disconnect the eBay authorization before deleting this account.');
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

    const confirmed = window.confirm(
      `Permanently delete the unused marketplace account "${account.name}"? Linked accounts or accounts with business history cannot be deleted.`
    );

    if (!confirmed) return;

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
    if (
      !clientIdInput.trim() ||
      !clientSecretInput.trim() ||
      !ruNameInput.trim()
    ) {
      return;
    }

    const current = integrationConfig?.environments?.find(
      (item: any) => item.environment === credentialEnvironment
    );

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

      alert(
        'eBay verified the application keypair and the credentials were securely saved. Seller authorization is still pending and must be completed separately.'
      );
    } catch (err: any) {
      alert(err.message || 'Could not save eBay credentials.');
    } finally {
      setCredentialSaving(false);
    }
  };

  const pendingExceptions = exceptions.filter(
    exception => exception.status === 'PENDING'
  );
  const moduleAccountId = selectedStoreId !== 'ALL'
    ? selectedStoreId
    : accounts.find(account => account.authStatus === 'CONNECTED')?.id;


  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            {initialSection === 'LISTINGS' ? 'Listings' : initialSection === 'RETURNS' ? 'Returns' : initialSection === 'ANALYTICS' ? 'Analytics' : initialSection === 'FINANCES' ? 'Finances' : 'eBay Accounts'}
          </h1>

          <p className="text-xs text-gray-500">
            {initialSection ? 'Production data for the selected seller account.' : 'Manage connected eBay seller accounts and marketplace integration.'}
          </p>
        </div>

        {!initialSection && <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-semibold">
            {integrationReady
              ? productionOAuthEnabled
                ? 'Production integration enabled'
                : 'Production OAuth activation pending'
              : 'Integration unavailable'}
          </span>
        </div>}
      </div>

      {!initialSection && !integrationReady && (
        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs">
          <div className="font-semibold mb-1">
            Live eBay integration is not enabled
          </div>
          <p>{integrationMessage}</p>
          <p className="mt-1">
            Existing account statuses are database records only; they do not confirm a live eBay OAuth connection.
          </p>
        </div>
      )}

      {!initialSection && currentUser.role === 'SUPER_ADMIN' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="font-semibold text-sm text-slate-900">
            eBay Developer Application Credentials
          </div>

          <p className="text-xs text-slate-600">
            Credentials are first verified directly with the selected eBay environment, then encrypted in the Worker before storage. They are never returned to the browser. Seller authorization is a separate step; saving app credentials does not connect a seller account. Do not paste these values into chat or GitHub.
          </p>

          <p className="text-xs text-amber-700">
            Shared platform credentials can only be viewed by explicitly allowlisted platform owners. Saving also requires a completed authenticator MFA step-up (AAL2); a workspace Super Admin role alone is not sufficient.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={clientIdInput}
              onChange={event => setClientIdInput(event.target.value)}
              placeholder="App ID / Client ID"
              className="border rounded-md p-2 text-xs"
              autoComplete="off"
            />

            <input
              value={clientSecretInput}
              onChange={event => setClientSecretInput(event.target.value)}
              placeholder="Cert ID / Client Secret"
              type="password"
              className="border rounded-md p-2 text-xs"
              autoComplete="new-password"
            />

            <input
              value={ruNameInput}
              onChange={event => setRuNameInput(event.target.value)}
              placeholder="OAuth RuName"
              className="border rounded-md p-2 text-xs"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {integrationConfig?.environments
                ?.filter((item: any) => item.environment === 'PRODUCTION')
                .map((item: any) =>
                  `Production: ${item.configured
                    ? `${item.clientIdMasked} (${item.credentialsVerified ? 'verified' : 'NOT VERIFIED — replace and verify'})`
                    : 'not configured'}`
                )
                .join(' · ') || 'Production credentials are not configured.'}
            </span>

            <button
              onClick={handleSaveCredentials}
              disabled={
                credentialSaving ||
                !clientIdInput.trim() ||
                !clientSecretInput.trim() ||
                !ruNameInput.trim()
              }
              className="px-3 py-2 rounded-md bg-slate-900 text-white text-xs disabled:opacity-50"
            >
              {credentialSaving ? 'Saving securely…' : 'Verify & Save Credentials'}
            </button>
          </div>

          {integrationConfig && !integrationConfig.encryptionReady && (
            <p className="text-xs text-rose-700">
              Worker encryption secret is not configured. Add the eBay token-encryption secret in Cloudflare Worker settings before saving.
            </p>
          )}

          {integrationConfig && !integrationConfig.productionOAuthEnabled && (
            <p className="text-xs text-amber-700">
              Production OAuth remains locked until eBay activates the Production keyset and Marketplace Account Deletion compliance is verified.
            </p>
          )}
        </div>
      )}

      {!initialSection && <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="font-semibold text-sm text-slate-900">
          Add eBay Seller Account
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            value={newAccountName}
            onChange={event => setNewAccountName(event.target.value)}
            placeholder="Account label (e.g. UK Store 1)"
            className="border rounded-md p-2 text-xs"
            maxLength={120}
          />

          <select
            value={newMarketplace}
            onChange={event => setNewMarketplace(event.target.value as any)}
            className="border rounded-md p-2 text-xs"
          >
            <option value="EBAY_UK">eBay United Kingdom</option>
            <option value="EBAY_US">eBay United States</option>
            <option value="EBAY_DE">eBay Germany</option>
          </select>

          <button
            onClick={handleCreateAccount}
            disabled={accountSaving || !newAccountName.trim()}
            className="px-3 py-2 rounded-md bg-indigo-600 text-white text-xs disabled:opacity-50"
          >
            {accountSaving ? 'Adding…' : 'Add Seller Account'}
          </button>
        </div>

        <p className="text-[11px] text-slate-500">
          Only live Production seller accounts are available in this workspace. After OAuth connects a seller, the first sync starts automatically on the next scheduled run (within about 5 minutes).
        </p>
      </div>}

      {syncFeedback && (
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-900 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{syncFeedback}</span>
          </div>

          <button
            onClick={() => setSyncFeedback(null)}
            className="text-indigo-400 hover:text-indigo-700"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {!initialSection && syncResult && (
        <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Latest sync results
              </h3>
              <p className="text-[11px] text-slate-500">
                Orders and inventory are reported independently. A problem in one does not hide successful data from the other.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-[10px] font-bold rounded px-2 py-1 ${
                  syncResult.status === 'SUCCESS'
                    ? 'bg-emerald-100 text-emerald-800'
                    : syncResult.status === 'PARTIAL'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                }`}
              >
                {syncResult.status}
              </span>

              <button
                onClick={() => setSyncResult(null)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Dismiss sync results"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">Orders</span>
                <span className="text-[10px] font-bold">
                  {syncResult.orders?.status || 'NOT RUN'}
                </span>
              </div>

              <p className="text-[11px] text-slate-600">
                Fetched: {syncResult.orders?.fetched ?? 0}
                {' · '}Imported: {syncResult.orders?.imported ?? 0}
                {' · '}Duplicates: {syncResult.orders?.skipped ?? 0}
                {' · '}Order exceptions: {syncResult.orders?.exceptions ?? 0}
                {syncResult.orders?.pagesPending ? ' · More order pages pending' : ''}
              </p>

              {syncResult.orders?.error && (
                <p className="text-[11px] text-rose-700 break-words">
                  Stage: {syncResult.orders.error.stage}
                  {syncResult.orders.error.httpStatus
                    ? ` · HTTP ${syncResult.orders.error.httpStatus}`
                    : ''}
                  {' · '}{syncResult.orders.error.code}: {syncResult.orders.error.message}
                </p>
              )}
            </div>

            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">Active Listings (Trading API)</span>
                <span className="text-[10px] font-bold">{syncResult.activeListingsError ? 'FAILED' : syncResult.activeListings ? (syncResult.activeListings.pagesPending ? 'PARTIAL' : 'SUCCESS') : 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Retrieved: {syncResult.activeListings?.fetched ?? 0}
                {' · '}Provider total: {syncResult.activeListings?.totalEntries ?? '—'}
                {' · '}Pages: {syncResult.activeListings?.pagesFetched ?? 0}
                {syncResult.activeListings?.pagesPending ? ' · More pages pending' : ''}
              </p>
              {syncResult.activeListingsError && <p className="text-[11px] text-rose-700">{syncResult.activeListingsError}</p>}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">Seller Account & Policies</span>
                <span className="text-[10px] font-bold">{syncResult.sellerAccountError ? 'FAILED' : syncResult.sellerAccount ? (syncResult.sellerAccount.failed?.length ? 'PARTIAL' : 'SUCCESS') : 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Read-only resources stored: {syncResult.sellerAccount?.synced?.length ?? 0}
                {' · '}Failed: {syncResult.sellerAccount?.failed?.length ?? 0}
              </p>
              {syncResult.sellerAccountError && <p className="text-[11px] text-rose-700">{syncResult.sellerAccountError}</p>}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">eBay Returns</span>
                <span className="text-[10px] font-bold">{syncResult.ebayReturnsError ? 'RECONNECT / FAILED' : syncResult.ebayReturns ? (syncResult.ebayReturns.pagesPending ? 'PARTIAL' : 'SUCCESS') : 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Imported: {syncResult.ebayReturns?.fetched ?? 0}
                {' · '}Provider total: {syncResult.ebayReturns?.totalEntries ?? '—'}
                {' · '}Pages: {syncResult.ebayReturns?.pagesFetched ?? 0}
              </p>
              {syncResult.ebayReturnsError && <p className="text-[11px] text-rose-700">{syncResult.ebayReturnsError}</p>}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">eBay Analytics</span>
                <span className="text-[10px] font-bold">{syncResult.ebayAnalyticsError ? 'RECONNECT / FAILED' : syncResult.ebayAnalytics ? (syncResult.ebayAnalytics.failed?.length ? 'PARTIAL' : 'SUCCESS') : 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Resources stored: {syncResult.ebayAnalytics?.synced?.length ?? 0}
                {' · '}Failed: {syncResult.ebayAnalytics?.failed?.length ?? 0}
              </p>
              {syncResult.ebayAnalyticsError && <p className="text-[11px] text-rose-700">{syncResult.ebayAnalyticsError}</p>}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">eBay Finances (Signed API)</span>
                <span className="text-[10px] font-bold">{syncResult.ebayFinancesError ? 'RECONNECT / FAILED' : syncResult.ebayFinances ? (syncResult.ebayFinances.failed?.length ? 'PARTIAL' : 'SUCCESS') : 'NOT RUN'}</span>
              </div>
              <p className="text-[11px] text-slate-600">
                Payouts: {syncResult.ebayFinances?.payouts ?? 0}
                {' · '}Transactions: {syncResult.ebayFinances?.transactions ?? 0}
                {syncResult.ebayFinances?.pagesPending ? ' · More pages pending' : ''}
                {' · '}Failed: {syncResult.ebayFinances?.failed?.length ?? 0}
              </p>
              {syncResult.ebayFinancesError && <p className="text-[11px] text-rose-700">{syncResult.ebayFinancesError}</p>}
            </div>
            <div className="rounded-md border border-slate-200 p-3 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-900">
                  Inventory & Listings
                </span>
                <span className="text-[10px] font-bold">
                  {syncResult.inventory?.status || 'NOT RUN'}
                </span>
              </div>

              <p className="text-[11px] text-slate-600">
                Inventory items: {syncResult.inventory?.fetched ?? 0}
                {' · '}Listing offers: {syncResult.inventory?.offersFetched ?? 0}
                {syncResult.inventory?.pagesPending ? ' · More pages pending' : ''}
              </p>

              {syncResult.inventory?.error && (
                <p className="text-[11px] text-rose-700 break-words">
                  Stage: {syncResult.inventory.error.stage}
                  {syncResult.inventory.error.httpStatus
                    ? ` · HTTP ${syncResult.inventory.error.httpStatus}`
                    : ''}
                  {' · '}{syncResult.inventory.error.code}: {syncResult.inventory.error.message}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {!initialSection && <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 text-xs">
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
          <span>eBay Order Exception Queue ({pendingExceptions.length} pending)</span>
        </button>
      </div>}

      {(initialSection || activeTab === 'ACCOUNTS') && (
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-lg border p-6 text-center text-xs text-slate-500">
              Loading Production marketplace accounts…
            </div>
          ) : (initialSection ? !moduleAccountId || !accounts.some(acc => acc.id === moduleAccountId) : accounts.length === 0) ? (
            <div className="bg-white rounded-lg border border-dashed p-8 text-center">
              <Store className="mx-auto mb-2 h-7 w-7 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">
                No Production seller accounts found
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {initialSection ? 'Select a connected seller account from the workspace selector to view this module.' : 'Add a Production seller account to get started.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(initialSection ? accounts.filter(acc => acc.id === moduleAccountId) : accounts).map((acc, index) => {
                const isSyncing = syncingAccountId === acc.id;

                return (
                  <div
                    key={acc.id}
                    className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[10px] font-mono text-gray-400">
                        #{index + 1}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="font-bold text-gray-900 text-sm">
                            {acc.name}
                          </span>

                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                            {acc.marketplace.replace('_', ' ')}
                          </span>
                        </div>

                        <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                          Seller: @{acc.sellerUsername}
                        </div>
                      </div>

                      <span
                        className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                          acc.authStatus === 'CONNECTED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        eBay authorization: {acc.authStatus === 'CONNECTED'
                          ? 'Connected (saved authorization)'
                          : acc.authStatus}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-xs space-y-1">
                      <div className="flex justify-between text-gray-600">
                        <span>Recorded token expiry:</span>
                        <span className="font-semibold text-gray-700">
                          {acc.tokenExpiresAt
                            ? 'Stored expiry recorded (not live-verified)'
                            : 'No token expiry recorded'}
                        </span>
                      </div>

                      <div className="flex justify-between text-gray-600">
                        <span>Auto Polling Schedule:</span>
                        <span className="font-medium text-gray-900">
                          Every {acc.autoSyncIntervalMinutes} minutes
                        </span>
                      </div>

                      <div className="flex justify-between text-gray-600 gap-3">
                        <span>Last Sync Result:</span>
                        <span className={`font-semibold text-right ${getSyncStatusClass(acc.lastSyncStatus)}`}>
                          {getSyncStatusLabel(acc.lastSyncStatus)}
                        </span>
                      </div>

                      <p className="text-[10px] text-slate-500">
                        “Connected” confirms a saved eBay authorization. A successful API sync is tracked separately.
                      </p>

                      {acc.lastSyncMessage && (
                        <div className="text-[11px] text-gray-500 pt-1 border-t border-gray-200">
                          {acc.lastSyncMessage}
                        </div>
                      )}
                    </div>

                    {!initialSection && <div className="flex items-center justify-end flex-wrap gap-2 pt-1">
                      {currentUser.role === 'SUPER_ADMIN' && (
                        <button
                          onClick={() => handleDeleteAccount(acc)}
                          disabled={
                            deletingAccountId === acc.id ||
                            acc.authStatus === 'CONNECTED'
                          }
                          title={
                            acc.authStatus === 'CONNECTED'
                              ? 'Disconnect the eBay authorization before deletion.'
                              : 'Super Admin only — delete an unused account'
                          }
                          className="px-3 py-1.5 text-xs text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 font-medium rounded-md transition inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {deletingAccountId === acc.id ? 'Deleting…' : 'Delete Account'}
                        </button>
                      )}

                      <button
                        onClick={() => handleReconnect(acc.id)}
                        disabled={
                          !integrationReady ||
                          (acc.environment === 'PRODUCTION' && !productionOAuthEnabled)
                        }
                        title={
                          !integrationReady
                            ? integrationMessage
                            : acc.environment === 'PRODUCTION' && !productionOAuthEnabled
                              ? 'Production keyset is not yet activated by eBay.'
                              : undefined
                        }
                        className="px-3 py-1.5 text-xs text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 font-medium rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {acc.authStatus === 'CONNECTED'
                          ? 'Reconnect eBay Account'
                          : 'Connect eBay Account'}
                      </button>

                      <button
                        onClick={() => handleSync(acc.id)}
                        disabled={
                          !integrationReady ||
                          !productionOAuthEnabled ||
                          acc.authStatus !== 'CONNECTED' ||
                          isSyncing
                        }
                        className="px-3 py-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 font-medium rounded-md shadow-2xs transition flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>
                          {isSyncing
                            ? 'Syncing...'
                            : acc.authStatus !== 'CONNECTED'
                              ? 'Connect first'
                              : integrationReady && productionOAuthEnabled
                                ? 'Sync All Production Data'
                                : 'Sync unavailable'}
                        </span>
                      </button>
                    </div>}

                    {acc.authStatus === 'CONNECTED' && (
                      <div className="pt-2 border-t border-gray-100">
                        {!initialSection && <div className="flex flex-wrap items-center gap-4">
                          <button
                            onClick={() => handleToggleReturns(acc.id)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                            {expandedReturnsAccountId === acc.id ? 'Hide eBay Returns' : 'View eBay Returns'}
                          </button>
                          <button
                            onClick={() => handleToggleFinance(acc.id)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                            {expandedFinanceAccountId === acc.id ? 'Hide Finances' : 'View Finances'}
                          </button>
                          <button
                            onClick={() => handleToggleAnalytics(acc.id)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                            {expandedAnalyticsAccountId === acc.id ? 'Hide Analytics' : 'View Analytics'}
                          </button>
                          <button
                            onClick={() => handleToggleSellerAccount(acc.id)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                            {expandedSellerAccountId === acc.id ? 'Hide Seller Account Settings' : 'View Seller Account Settings'}
                          </button>
                          <button
                            onClick={() => handleToggleListings(acc.id)}
                            className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                          >
                          {expandedListingsAccountId === acc.id
                            ? 'Hide Sync Listings'
                            : `View Sync Listings (${listingTotals[acc.id] ?? 'Load'})`}
                        </button>
                        </div>}

                        {expandedReturnsAccountId === acc.id && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold text-slate-800">Production eBay Returns</div>
                            {returnsLoadingId === acc.id ? (
                              <p className="text-xs text-slate-500">Loading eBay returns…</p>
                            ) : (returnsByAccount[acc.id] || []).length === 0 ? (
                              <p className="text-xs text-slate-500">No synchronized return records are available. Run Sync Production Data to import returns.</p>
                            ) : (
                              <div className="space-y-2">
                                {(returnsByAccount[acc.id] || []).map((ret: any) => (
                                  <div key={ret.returnId} className="rounded border border-slate-200 bg-white p-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                                    <div><div className="text-[10px] text-slate-500">Return ID</div><div className="text-xs font-mono text-slate-800">{ret.returnId}</div></div>
                                    <div><div className="text-[10px] text-slate-500">Order / Item</div><div className="text-xs text-slate-800">{ret.orderId || '—'} / {ret.itemId || '—'}</div></div>
                                    <div><div className="text-[10px] text-slate-500">Status / Reason</div><div className="text-xs text-slate-800">{ret.status || ret.state || '—'} · {ret.reason || '—'}</div></div>
                                    <div><div className="text-[10px] text-slate-500">Requested</div><div className="text-xs text-slate-800">{ret.creationDate ? new Date(ret.creationDate).toLocaleString() : '—'}</div></div>
                                    <div><div className="text-[10px] text-slate-500">Seller response due</div><div className="text-xs text-slate-800">{ret.sellerResponseDue ? new Date(ret.sellerResponseDue).toLocaleString() : '—'}</div></div>
                                    <div><div className="text-[10px] text-slate-500">Seller actions / estimated refund</div><div className="text-xs text-slate-800">{Array.isArray(ret.sellerActionTypes) ? ret.sellerActionTypes.join(', ') : '—'} · {ret.estimatedRefund?.value ?? ret.actualRefund?.value ?? '—'} {ret.estimatedRefund?.currency ?? ret.actualRefund?.currency ?? ''}</div></div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {expandedFinanceAccountId === acc.id && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                            <div className="text-xs font-semibold text-slate-800">Production eBay Financial Data</div>
                            {financeLoadingId === acc.id ? (
                              <p className="text-xs text-slate-500">Loading finance records…</p>
                            ) : !financesByAccount[acc.id] ? (
                              <p className="text-xs text-slate-500">No synchronized finance data is available. Reconnect the seller account to grant the Finance permission, then run Sync Production Data.</p>
                            ) : (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {(financesByAccount[acc.id].summaries || []).map((summary: any) => (
                                    <div key={summary.key} className="rounded border border-slate-200 bg-white p-2">
                                      <div className="text-[11px] font-semibold text-slate-800">{String(summary.key).replaceAll('_', ' ')}</div>
                                      <div className="text-[10px] text-slate-500">Provider summary received · {summary.syncedAt ? new Date(summary.syncedAt).toLocaleString() : '—'}</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs font-semibold text-slate-800">Payouts ({financesByAccount[acc.id].payouts?.length || 0})</div>
                                <div className="space-y-1">
                                  {(financesByAccount[acc.id].payouts || []).map((payout: any) => (
                                    <div key={payout.payoutId || payout.id} className="rounded border border-slate-200 bg-white p-2 flex flex-wrap justify-between gap-2 text-xs">
                                      <span className="font-mono">{payout.payoutId || payout.id}</span>
                                      <span>{payout.payoutStatus || '—'}</span>
                                      <span>{payout.amount?.value ?? '—'} {payout.amount?.currency ?? ''}</span>
                                      <span>{payout.payoutDate ? new Date(payout.payoutDate).toLocaleDateString() : '—'}</span>
                                    </div>
                                  ))}
                                </div>
                                <div className="text-xs font-semibold text-slate-800">Transactions ({financesByAccount[acc.id].transactions?.length || 0})</div>
                                <div className="space-y-1 max-h-64 overflow-auto">
                                  {(financesByAccount[acc.id].transactions || []).map((transaction: any) => (
                                    <div key={transaction.transactionId || transaction.id} className="rounded border border-slate-200 bg-white p-2 grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
                                      <span className="font-mono">{transaction.transactionId || transaction.id}</span>
                                      <span>{transaction.transactionType || '—'}</span>
                                      <span>{transaction.amount?.value ?? '—'} {transaction.amount?.currency ?? ''}</span>
                                      <span>{transaction.transactionDate ? new Date(transaction.transactionDate).toLocaleString() : '—'}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                        {expandedAnalyticsAccountId === acc.id && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold text-slate-800">Production eBay Analytics</div>
                            {analyticsLoadingId === acc.id ? (
                              <p className="text-xs text-slate-500">Loading analytics…</p>
                            ) : (analyticsByAccount[acc.id] || []).length === 0 ? (
                              <p className="text-xs text-slate-500">No synchronized analytics are available. Reconnect the seller account to grant the Analytics read-only permission, then run Sync Production Data.</p>
                            ) : (
                              <div className="space-y-2">
                                {(analyticsByAccount[acc.id] || []).map((resource: any) => {
                                  const snapshot = resource.snapshot || {};
                                  const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
                                  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
                                  const summary = resource.type === 'ANALYTICS_SELLER_STANDARDS'
                                    ? [snapshot.sellerLevel, snapshot.rating, snapshot.program, snapshot.cycle].filter(Boolean).join(' · ')
                                    : resource.type === 'ANALYTICS_CUSTOMER_SERVICE'
                                      ? [snapshot.rating, snapshot.metricType, snapshot.evaluationType, snapshot.metric?.value ?? snapshot.metric?.metricValue].filter(value => value !== null && value !== undefined && value !== '').join(' · ')
                                      : `${records.length} daily traffic record(s)`;
                                  return (
                                    <div key={resource.type + resource.key} className="rounded border border-slate-200 bg-white p-2">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                          <div className="text-[11px] font-semibold text-slate-800">{String(resource.type).replaceAll('_', ' ')}</div>
                                          <div className="text-[11px] text-slate-600">{resource.key}</div>
                                        </div>
                                        <div className="text-[10px] text-slate-400">Synced: {resource.syncedAt ? new Date(resource.syncedAt).toLocaleString() : '—'}</div>
                                      </div>
                                      {summary && <div className="mt-1 text-[11px] text-slate-600">{summary}</div>}
                                      {resource.type === 'ANALYTICS_TRAFFIC' && records.length > 0 && (
                                        <div className="mt-2 overflow-x-auto">
                                          <table className="min-w-full text-left text-[10px]">
                                            <thead className="bg-slate-50 text-slate-600">
                                              <tr>
                                                <th className="p-1.5">Date</th>
                                                {metrics.map((metric: any, metricIndex: number) => (
                                                  <th key={metric.key || metricIndex} className="p-1.5 whitespace-nowrap">{metric.localizedName || metric.key || `Metric ${metricIndex + 1}`}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                              {records.map((record: any, recordIndex: number) => (
                                                <tr key={recordIndex}>
                                                  <td className="p-1.5 whitespace-nowrap">{record.dimensionValues?.[0]?.value ?? record.dimensionValues?.[0] ?? '—'}</td>
                                                  {(record.metricValues || []).map((value: any, metricIndex: number) => (
                                                    <td key={metricIndex} className="p-1.5 tabular-nums">{typeof value === 'object' && value !== null ? value.value ?? '—' : value}</td>
                                                  ))}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {expandedSellerAccountId === acc.id && (
                          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                            <div className="text-xs font-semibold text-slate-800">Production Seller Account Data</div>
                            {sellerAccountLoadingId === acc.id ? (
                              <p className="text-xs text-slate-500">Loading seller account settings…</p>
                            ) : (sellerAccountSnapshots[acc.id] || []).length === 0 ? (
                              <p className="text-xs text-slate-500">No synchronized seller settings are available yet. Run Sync Production Data to retrieve them.</p>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {(sellerAccountSnapshots[acc.id] || []).map((resource: any) => {
                                  const data = resource.snapshot || {};
                                  const collection = Array.isArray(data.policies) ? data.policies : [];
                                  const policyNames = Array.isArray(collection) ? collection.map((policy: any) => policy.name).filter((name: any) => typeof name === 'string') : [];
                                  const label = String(resource.type || '').replaceAll('_', ' ').toLowerCase();
                                  const summary = Array.isArray(collection)
                                    ? `${collection.length} policy record(s)`
                                    : resource.type === 'SELLER_PRIVILEGE'
                                      ? (data.sellerRegistrationCompleted === true ? 'Seller registration completed' : 'Registration status returned by eBay')
                                      : resource.type === 'SELLER_SUBSCRIPTION'
                                        ? `${Array.isArray(data.subscriptions) ? data.subscriptions.length : 0} subscription record(s)`
                                        : 'Latest provider settings retrieved';
                                  return (
                                    <div key={resource.type} className="rounded border border-slate-200 bg-white p-2">
                                      <div className="text-[11px] font-semibold text-slate-800 capitalize">{label}</div>
                                      <div className="text-[11px] text-slate-600">{summary}</div>
                                      {policyNames.length > 0 && <div className="mt-1 text-[10px] text-slate-500">{policyNames.slice(0, 6).join(' · ')}</div>}
                                      <div className="mt-1 text-[10px] text-slate-400">Synced: {resource.syncedAt ? new Date(resource.syncedAt).toLocaleString() : '—'}</div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {expandedListingsAccountId === acc.id && (
                          <div className="mt-3 overflow-x-auto">
                            {listingLoadingAccountId === acc.id ? (
                              <p className="text-xs text-slate-500 py-3">
                                Loading Production inventory and listings…
                              </p>
                            ) : (
                              <>
                                <div className="text-[11px] text-slate-500 mb-2">
                                  Total synced Production listings: {listingTotals[acc.id] ?? (listingSnapshots[acc.id] || []).length}
                                </div>

                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-slate-50 text-slate-600">
                                    <tr>
                                      <th className="p-2">#</th>
                                      <th className="p-2">SKU / Item ID</th>
                                      <th className="p-2">Product</th>
                                      <th className="p-2">Sync Status</th>
                                      <th className="p-2">eBay Listing Status</th>
                                      <th className="p-2">Inventory Qty</th>
                                      <th className="p-2">Offer Qty / Price</th>
                                    </tr>
                                  </thead>

                                  <tbody className="divide-y divide-slate-100">
                                    {(listingSnapshots[acc.id] || []).map((listing: any, listingIndex: number) => (
                                      <tr key={listing.offerId || listing.sku || listingIndex}>
                                        <td className="p-2">{listingIndex + 1}</td>
                                        <td className="p-2 font-mono">{listing.sku || listing.itemId || "—"}</td>
                                        <td className="p-2 min-w-40">{listing.title || '—'}</td>
                                        <td className="p-2">
                                          <span title={listing.syncError || undefined} className={`rounded px-1.5 py-0.5 font-semibold ${listing.syncStatus === 'PARTIAL' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                            {listing.syncStatus === 'PARTIAL' ? 'Partially synced' : 'Synced'}
                                          </span>
                                          {listing.syncError && (
                                            <div className="mt-1 max-w-xs whitespace-normal text-[10px] text-rose-700">
                                              {listing.syncError}
                                              {listing.syncErrorDetails && (
                                                <div className="mt-0.5 font-mono text-[9px]">
                                                  {listing.syncErrorDetails.stage || 'API'} · {listing.syncErrorDetails.errorCode || 'PROVIDER_ERROR'}
                                                  {listing.syncErrorDetails.httpStatus ? ` · HTTP ${listing.syncErrorDetails.httpStatus}` : ''}
                                                  {listing.syncErrorDetails.providerCode ? ` · eBay ${listing.syncErrorDetails.providerCode}` : ''}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </td>
                                        <td className="p-2">{listing.syncStatus === 'PARTIAL' ? 'Offer details unavailable' : listing.listingStatus === 'NOT_LISTED' ? 'Inventory synced — no active eBay offer' : listing.listingStatus}</td>
                                        <td className="p-2 tabular-nums">{listing.inventoryQuantity ?? '—'}</td>
                                        <td className="p-2">
                                          {listing.offers?.length
                                            ? listing.offers.map((offer: any) => (
                                                <div key={offer.offerId || offer.listingId || listing.sku}>
                                                  {offer.availableQuantity ?? '—'} /{' '}
                                                  {offer.pricingSummary?.price?.value
                                                    ? `${offer.pricingSummary.price.currency || ''} ${offer.pricingSummary.price.value}`
                                                    : '—'}
                                                </div>
                                              ))
                                            : listing.syncStatus === 'PARTIAL' ? 'Offer details unavailable' : 'No offer'}
                                        </td>
                                      </tr>
                                    ))}

                                    {!(listingSnapshots[acc.id] || []).length && (
                                      <tr>
                                        <td colSpan={7} className="p-3 text-center text-slate-500">
                                          No listing snapshots are available for this account yet. Last account status: {getSyncStatusLabel(acc.lastSyncStatus)}. {acc.lastSyncMessage || 'Run Sync All Production Data to retrieve the seller inventory.'}
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-gray-200 bg-slate-50 font-semibold text-xs text-gray-800 flex justify-between gap-2">
              <span>Recent Marketplace Synchronization Audit Runs</span>
              <span className="text-slate-500">Total: {recentSyncs.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold text-[11px]">
                  <tr>
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Run ID</th>
                    <th className="py-2 px-3">Completed At</th>
                    <th className="py-2 px-3">Status</th>
                    <th className="py-2 px-3">Orders Fetched</th>
                    <th className="py-2 px-3">Imported</th>
                    <th className="py-2 px-3">Skipped Duplicates</th>
                    <th className="py-2 px-3">Exceptions Raised</th>
                    <th className="py-2 px-3">Notes</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 text-gray-700 font-mono text-[11px]">
                  {recentSyncs.map((sr, index) => (
                    <tr key={sr.id}>
                      <td className="py-2 px-3">{index + 1}</td>
                      <td className="py-2 px-3 text-indigo-700">{sr.id}</td>
                      <td className="py-2 px-3 text-gray-500">
                        {sr.completedAt?.split('.')[0].replace('T', ' ') || 'In Progress'}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          sr.status === 'COMPLETED' || sr.status === 'SUCCESS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : sr.status === 'PARTIAL'
                              ? 'bg-amber-100 text-amber-800'
                              : sr.status === 'RUNNING'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-rose-100 text-rose-800'
                        }`}>
                          {sr.status === 'COMPLETED'
                            ? 'Synced'
                            : sr.status === 'PARTIAL'
                              ? 'Partially synced'
                              : sr.status === 'RUNNING'
                                ? 'In progress'
                                : sr.status === 'FAILED'
                                  ? 'Failed'
                                  : sr.status}
                        </span>
                      </td>
                      <td className="py-2 px-3">{sr.ordersFetched}</td>
                      <td className="py-2 px-3 font-bold text-gray-900">{sr.ordersImported}</td>
                      <td className="py-2 px-3 text-blue-700 font-bold">{sr.ordersSkippedDuplicate}</td>
                      <td className="py-2 px-3 text-amber-700 font-bold">{sr.exceptionsRaised}</td>
                      <td className="py-2 px-3 font-sans text-gray-600">{sr.logMessage || '—'}</td>
                    </tr>
                  ))}

                  {recentSyncs.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-5 text-center text-slate-500">
                        No synchronization runs recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'EVENTS' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Integration Events &amp; Sync Logs
              </h3>
              <p className="text-xs text-slate-500">
                Seller-scoped API failures, provider responses and scheduled retry timing.
              </p>
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh logs
            </button>
          </div>

          <div className="text-[11px] text-slate-500">
            Total events: {integrationEvents.length}
          </div>

          {integrationEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
              <Activity className="mx-auto mb-2 h-7 w-7 text-slate-400" />
              <p className="text-sm font-medium text-slate-700">
                No integration events found
              </p>
              <p className="mt-1 text-xs text-slate-500">
                New sync failures and integration events will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {integrationEvents.map((event: any, index: number) => {
                const eventAccount = accounts.find(
                  account => account.id === (event.accountId || event.marketplaceAccountId)
                );

                const retrying = Boolean(
                  eventAccount && syncingAccountId === eventAccount.id
                );

                return (
                  <article
                    key={event.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-slate-400">#{index + 1}</span>
                          <span className="text-xs font-semibold text-slate-900">
                            {event.accountName}
                          </span>
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            {event.eventType}
                          </span>
                          <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                            event.severity === 'ERROR' || event.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {event.severity}
                          </span>
                        </div>

                        <p className="mt-1 break-words text-xs text-slate-700">
                          {event.message}
                        </p>

                        <p className="mt-1 text-[11px] text-indigo-800">
                          <strong>Recommended next step:</strong> {getIntegrationGuidance(event)}
                        </p>
                      </div>

                      <span className="shrink-0 text-[11px] text-slate-500">
                        {event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-2 border-t border-slate-100 pt-3 text-[11px] sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-slate-500">API / Operation</dt>
                        <dd className="mt-0.5 break-all font-mono text-slate-800">
                          {event.apiName || '—'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500">HTTP Status</dt>
                        <dd className="mt-0.5 font-semibold text-slate-800">
                          {event.httpStatus ?? 'Not recorded'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500">eBay Error Code</dt>
                        <dd className="mt-0.5 font-mono text-slate-800">
                          {event.providerCode || event.errorCode || '—'}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-slate-500">Next scheduled sync</dt>
                        <dd className="mt-0.5 text-slate-800">
                          {event.nextSyncAt
                            ? new Date(event.nextSyncAt).getTime() <= Date.now()
                              ? 'Due now'
                              : new Date(event.nextSyncAt).toLocaleString()
                            : 'Not scheduled'}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                      {eventAccount && event.retryable && (
                        <button
                          onClick={() => handleSync(eventAccount.id)}
                          disabled={
                            retrying ||
                            !integrationReady ||
                            !productionOAuthEnabled ||
                            eventAccount.authStatus !== 'CONNECTED'
                          }
                          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
                          {retrying ? 'Retrying sync…' : 'Retry Orders + Inventory'}
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

      {activeTab === 'EXCEPTIONS' && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <strong>Exception Queue Purpose (SRS FR-EBAY-07, N-04):</strong>{' '}
            Unmapped SKUs and incomplete provider order lines are isolated here. Only an actual provider SKU can be mapped to an internal product; missing prices, quantities, titles or SKUs remain review exceptions and are never filled with guessed values.
          </div>

          <div className="text-[11px] text-slate-500">
            Total exceptions: {exceptions.length} · Pending: {pendingExceptions.length}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Exception ID</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Marketplace Ref</th>
                    <th className="py-2.5 px-3">Details &amp; Error Snippet</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {exceptions.map((exc, index) => (
                    <tr key={exc.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3">{index + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                        {exc.id}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                          {exc.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-900 font-semibold">
                        {exc.referenceId}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-gray-900 font-medium">
                          {exc.details}
                        </div>

                        {exc.resolutionNote && (
                          <div className="text-[11px] text-emerald-700 mt-0.5">
                            Resolved: {exc.resolutionNote} by {exc.resolvedBy}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          exc.status === 'RESOLVED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {exc.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {exc.status === 'PENDING' && exc.type === 'UNMAPPED_SKU' ? (
                          <button
                            onClick={() => setSelectedException(exc)}
                            className="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition shadow-2xs"
                          >
                            Map to Internal SKU
                          </button>
                        ) : exc.status === 'PENDING' ? (
                          <span className="text-[10px] text-amber-700 font-semibold">Provider data review</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}

                  {exceptions.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-5 text-center text-slate-500">
                        No pending marketplace exceptions.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {selectedException && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <Link className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Resolve Marketplace SKU Mapping
                </h3>
              </div>

              <button onClick={() => setSelectedException(null)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
              <div>
                <span className="font-semibold text-gray-600">Exception Reference:</span>{' '}
                <span className="font-mono font-bold text-gray-900">
                  {selectedException.referenceId}
                </span>
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
                  onChange={event => setTargetProductId(event.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white"
                >
                  {products.map(product => (
                    <option key={product.id} value={product.id}>
                      {product.sku} — {product.name}
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
                  onChange={event => setResolutionNote(event.target.value)}
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
                disabled={!targetProductId}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-xs shadow-2xs transition disabled:opacity-50"
              >
                Save Mapping &amp; Re-link Orders
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
