import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { OrdersView } from './components/OrdersView';
import { ProductsView } from './components/ProductsView';
import { InventoryView } from './components/InventoryView';
import { AdjustmentsView } from './components/AdjustmentsView';
import { EbayAccountsView } from './components/EbayAccountsView';
import { BuyingReturnsView } from './components/BuyingReturnsView';
import { WarehouseLocationsView } from './components/WarehouseLocationsView';
import { Clients3PLView } from './components/Clients3PLView';
import { FinanceView } from './components/FinanceView';
import { ReportsView } from './components/ReportsView';
import { NotificationsView } from './components/NotificationsView';
import { AuditLogView } from './components/AuditLogView';
import { SettingsView } from './components/SettingsView';
import { EmployeeAccessView } from './components/EmployeeAccessView';
import { WarehouseServicesView } from './components/WarehouseServicesView';
import { DropshippingCalculatorView } from './components/DropshippingCalculatorView';
import { EbayPayoutsView } from './components/EbayPayoutsView';
import { NewAdjustmentModal } from './components/NewAdjustmentModal';
import { NewOrderModal } from './components/NewOrderModal';
import { api } from './services/api';
import { API_LOADING_EVENT } from './services/loadingEvents';
import { useAuth } from './context/AuthContext';
import { NavItem, User, SystemConfig, NotificationItem, Order, Product } from './types';

import { ShieldAlert, ArrowRight, CheckCircle, Search, ExternalLink, LoaderCircle } from 'lucide-react';

const DEFAULT_CONFIG: SystemConfig = {
  baseCurrency: 'GBP',
  businessTimezone: 'Europe/London',
  defaultVatRatePercent: 20,
  adjustmentApprovalThresholdValueMinor: 25000,
  adjustmentApprovalThresholdQuantity: 10,
  activeReleasePhase: 'ALL',
  allowNegativeStock: false,
  autoSyncEnabled: true,
};

const NAV_ITEMS: NavItem[] = [
  'dashboard', 'orders', 'ebay-accounts', 'ebay-active-listings', 'ebay-seller-account',
  'ebay-returns', 'ebay-analytics', 'ebay-finances', 'customers', 'returns', 'products',
  'inventory', 'adjustments', 'dropshipping', 'warehouse', 'locations',
  'warehouse-services', 'suppliers', 'purchase-orders', '3pl-clients',
  'fulfilment', 'shipping', 'storage', 'invoices', 'payments', 'expenses',
  'payouts', 'reconciliation', 'profitability', 'reports', 'notifications',
  'audit-log', 'settings', 'employee-access',
];

const EBAY_MODULE_SECTIONS: Partial<Record<NavItem, 'LISTINGS' | 'SELLER_ACCOUNT' | 'RETURNS' | 'ANALYTICS' | 'FINANCES'>> = {
  'ebay-active-listings': 'LISTINGS',
  'ebay-seller-account': 'SELLER_ACCOUNT',
  'ebay-returns': 'RETURNS',
  'ebay-analytics': 'ANALYTICS',
  'ebay-finances': 'FINANCES',
};

const readWorkspacePreference = <T,>(organizationId: string, key: string, fallback: T): T => {
  try {
    const value = window.localStorage.getItem(`oriafuture:${organizationId}:${key}`);
    return value === null ? fallback : JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

export default function App() {
  const { user: authenticatedUser, organizationId, signOut, organizationName, permissions } = useAuth();
  const [currentUser, setCurrentUser] = useState<User>(authenticatedUser);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [initError, setInitError] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [exceptionsCount, setExceptionsCount] = useState(0);
  const [ordersCount, setOrdersCount] = useState(0);
  const [activeTab, setActiveTab] = useState<NavItem>(() => {
    const saved = readWorkspacePreference<string>(organizationId, 'active-tab', 'dashboard');
    return NAV_ITEMS.includes(saved as NavItem) ? saved as NavItem : 'dashboard';
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [tabFilterState, setTabFilterState] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingApiRequests, setPendingApiRequests] = useState(0);
  const [isDarkTheme, setIsDarkTheme] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem('oriafuture:theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [globalSearch, setGlobalSearch] = useState('');
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);

  useEffect(() => {
    const closeSearchOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsGlobalSearchOpen(false);
    };
    window.addEventListener('keydown', closeSearchOnEscape);
    return () => window.removeEventListener('keydown', closeSearchOnEscape);
  }, []);
  const [searchResults, setSearchResults] = useState<{ orders: Order[]; products: Product[] }>({
    orders: [],
    products: [],
  });
  const [showNewAdjustmentModal, setShowNewAdjustmentModal] = useState(false);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string>(() =>
    readWorkspacePreference<string>(organizationId, 'selected-store', 'ALL')
  );
  // Production-only workspace: legacy Demo/Sandbox preferences are intentionally ignored.
  const [selectedEnvironment, setSelectedEnvironment] = useState<'DEMO' | 'SANDBOX' | 'PRODUCTION'>('PRODUCTION');
  useEffect(() => { setSelectedEnvironment('PRODUCTION'); }, []);
  const [marketplaceAccounts, setMarketplaceAccounts] = useState<any[]>([]);
  const [marketplaceIntegrationReady, setMarketplaceIntegrationReady] = useState(false);
  const [loading, setLoading] = useState(true);


  useEffect(() => { setCurrentUser(authenticatedUser); }, [authenticatedUser]);

  // Keep the notification bell current while the workspace is open. Only live eBay order alerts are returned by the API.
  useEffect(() => {
    let active = true;
    const refreshNotifications = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const result = await api.getNotifications();
        if (active) setNotifications(result.notifications);
      } catch (error) {
        console.error('Failed to refresh live eBay notifications:', error);
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'visible') void refreshNotifications(); };
    const onWindowFocus = () => { void refreshNotifications(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onWindowFocus);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onWindowFocus);
    };
  }, [organizationId]);

  // Apply one application-wide theme at the document root and persist the choice.
  useEffect(() => {
    document.documentElement.dataset.theme = isDarkTheme ? 'dark' : 'light';
    document.documentElement.style.colorScheme = isDarkTheme ? 'dark' : 'light';
    try {
      window.localStorage.setItem('oriafuture:theme', isDarkTheme ? 'dark' : 'light');
    } catch {
      // The theme remains active for this session when storage is unavailable.
    }
  }, [isDarkTheme]);

  // One shared loading signal covers API activity across every module and tab.
  // A counter (rather than a boolean) keeps parallel requests from hiding the
  // indicator before the slowest request has completed.
  useEffect(() => {
    const handleApiLoading = (event: Event) => {
      const delta = (event as CustomEvent<{ delta?: number }>).detail?.delta ?? 0;
      setPendingApiRequests((current) => Math.max(0, current + delta));
    };
    window.addEventListener(API_LOADING_EVENT, handleApiLoading);
    return () => window.removeEventListener(API_LOADING_EVENT, handleApiLoading);
  }, []);

  // Persist navigation context per organization so a resumed browser session
  // returns to the same module and marketplace store.
  useEffect(() => {
    window.localStorage.setItem(`oriafuture:${organizationId}:active-tab`, JSON.stringify(activeTab));
  }, [activeTab, organizationId]);

  useEffect(() => {
    window.localStorage.setItem(`oriafuture:${organizationId}:selected-store`, JSON.stringify(selectedStoreId));
  }, [selectedStoreId, organizationId]);

  useEffect(() => {
    window.localStorage.setItem(`oriafuture:${organizationId}:selected-environment`, JSON.stringify(selectedEnvironment));
  }, [selectedEnvironment, organizationId]);

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    let active = true;
    const canViewOrders = permissions.includes('*') || permissions.includes('orders.view');
    if (!canViewOrders) {
      setOrdersCount(0);
      return () => { active = false; };
    }
    const refreshOrderCount = () => {
      api.getOrderCount(selectedStoreId, selectedEnvironment)
        .then((result) => { if (active) setOrdersCount(result.count); })
        .catch((error) => {
          console.error('Failed to load sidebar order count:', error);
          if (active) setOrdersCount(0);
        });
    };
    refreshOrderCount();
    window.addEventListener('oria-orders-updated', refreshOrderCount);
    return () => {
      active = false;
      window.removeEventListener('oria-orders-updated', refreshOrderCount);
    };
  }, [permissions, selectedStoreId, selectedEnvironment]);

  useEffect(() => {
    if (!globalSearch.trim()) {
      setSearchResults({ orders: [], products: [] });
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const canViewOrders = permissions.includes('*') || permissions.includes('orders.view');
        const canViewProducts = permissions.includes('*') || permissions.includes('products.view');
        const [ordRes, prodRes] = await Promise.all([
          canViewOrders ? api.getOrders({ search: globalSearch, accountId: selectedStoreId, environment: selectedEnvironment }) : Promise.resolve({ orders: [] }),
          canViewProducts ? api.getProducts(selectedStoreId, selectedEnvironment) : Promise.resolve({ products: [] }),
        ]);
        const s = globalSearch.toLowerCase();
        const matchedProds = prodRes.products.filter(
          (p) => p.sku.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)
        );
        setSearchResults({
          orders: ordRes.orders.slice(0, 5),
          products: matchedProds.slice(0, 5),
        });
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [globalSearch, permissions, selectedStoreId, selectedEnvironment]);

  const initApp = async () => {
    setLoading(true);
    try {
      const canViewMarketplace = permissions.includes('*') || permissions.includes('marketplace.view');
      const [cfgRes, notifRes, accountsRes] = await Promise.all([
        api.getConfig(),
        api.getNotifications(),
        canViewMarketplace ? api.getEbayAccounts() : Promise.resolve({ accounts: [], integrationReady: false }),
      ]);
      const accounts = (accountsRes.accounts || []).filter((account) => !account.isDemo && account.environment === 'PRODUCTION');
      const selectedAccount = accounts.find((account) => account.id === selectedStoreId);
      const selectedAccountMatchesEnvironment = Boolean(selectedAccount && !selectedAccount.isDemo && selectedAccount.environment === 'PRODUCTION');
      const savedAccountIsAvailable = selectedStoreId === 'ALL' || selectedAccountMatchesEnvironment;
      const activeAccountId = savedAccountIsAvailable ? selectedStoreId : 'ALL';
      setConfig(cfgRes.config);
      setConfigLoaded(true);
      setInitError('');
      setNotifications(notifRes.notifications);
      setMarketplaceAccounts(accounts);
      setMarketplaceIntegrationReady(Boolean(accountsRes.integrationReady));
      setSelectedEnvironment('PRODUCTION');
      if (!savedAccountIsAvailable) setSelectedStoreId('ALL');
      const excRes = canViewMarketplace && activeAccountId
        ? await api.getExceptions(activeAccountId)
        : { exceptions: [] };
      setExceptionsCount(excRes.exceptions.filter((e) => e.status === 'PENDING').length);
    } catch (err: any) {
      console.error('Failed to initialize app:', err);
      setInitError(err.message || 'Workspace data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const handleTriggerSync = async () => {
    if (!permissions.includes('*') && !permissions.includes('marketplace.manage')) return;
    setIsSyncing(true);
    try {
      const accRes = await api.getEbayAccounts();
      if (!accRes.integrationReady) {
        alert(accRes.integrationMessage || 'eBay Production credentials are not configured yet.');
        return;
      }
      const selectedAccount = accRes.accounts.find((account) => account.id === selectedStoreId);
      if (!selectedAccount) {
        alert('Select one seller account before synchronizing.');
        return;
      }
      if (selectedAccount.isDemo) {
        alert('Only live Production seller accounts can be synchronized from this workspace.');
        return;
      }
      if (selectedAccount.authStatus !== 'CONNECTED') {
        alert('The selected seller account is not connected. Connect it before synchronizing.');
        return;
      }
      await api.syncEbayAccount(selectedAccount.id);
      const [notifRes, excRes] = await Promise.all([
        api.getNotifications(),
        permissions.includes('*') || permissions.includes('marketplace.view')
          ? api.getExceptions(selectedAccount.id)
          : Promise.resolve({ exceptions: [] }),
      ]);
      setNotifications(notifRes.notifications);
      setExceptionsCount(excRes.exceptions.filter((e) => e.status === 'PENDING').length);
      alert('eBay order synchronization completed. Idempotent check verified.');
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSignOut = async () => {
    // Detach this browser's push endpoint before ending the authenticated session.
    try {
      const registration = await navigator.serviceWorker?.getRegistration('/');
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        try {
          await api.removePushSubscription(subscription.endpoint);
        } finally {
          await subscription.unsubscribe();
        }
      }
    } catch (error) {
      console.error('Could not clean up this device push subscription during sign out:', error);
    }
    await signOut();
  };

  const handleNavigate = (tab: NavItem, filterState?: any) => {
    setActiveTab(tab);
    setTabFilterState(filterState || null);
    setGlobalSearch('');
  };

  const searchDropdown = isGlobalSearchOpen ? (
        <div className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-[60vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              {globalSearch.trim() ? `Search results for "${globalSearch}"` : "Quick search"}
            </span>
            <button
              onClick={() => setIsGlobalSearchOpen(false)}
              className="rounded-md px-2 py-1 text-xs text-gray-400 hover:bg-slate-100 hover:text-gray-700"
            >
              Close
            </button>
          </div>

          {globalSearch.trim() ? (
          <div className="space-y-4 text-xs">
            {/* Orders matches */}
            <div>
              <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1.5">
                Orders ({searchResults.orders.length})
              </div>
              {searchResults.orders.length === 0 ? (
                <div className="text-gray-400 text-[11px] italic">No matching orders</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {searchResults.orders.map((o) => (
                    <div
                      key={o.id}
                      onClick={() => {
                        handleNavigate('orders');
                        setGlobalSearch('');
                        setIsGlobalSearchOpen(false);
                      }}
                      className="py-2 px-2 hover:bg-indigo-50 rounded cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-indigo-700">{o.orderNumber}</span>
                        <span className="text-gray-600 ml-2">{o.customerName}</span>
                        {o.trackingNumber && (
                          <span className="text-gray-400 ml-2 font-mono">[{o.trackingNumber}]</span>
                        )}
                      </div>
                      <span className="font-semibold text-gray-900">£{(o.totalMinor / 100).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Catalog matches */}
            <div>
              <div className="font-semibold text-gray-500 uppercase tracking-wider text-[10px] mb-1.5">
                Products & SKUs ({searchResults.products.length})
              </div>
              {searchResults.products.length === 0 ? (
                <div className="text-gray-400 text-[11px] italic">No matching catalog SKUs</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {searchResults.products.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        handleNavigate('products');
                        setGlobalSearch('');
                        setIsGlobalSearchOpen(false);
                      }}
                      className="py-2 px-2 hover:bg-indigo-50 rounded cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <span className="font-bold text-gray-900 font-mono">{p.sku}</span>
                        <span className="text-gray-600 ml-2">{p.name}</span>
                      </div>
                      <span className="text-gray-500">{p.category}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          ) : (
            <p className="px-2 py-4 text-center text-xs text-slate-500">Search orders, products, SKUs, or tracking numbers.</p>
          )}
        </div>
  ) : null;

  if (loading && !configLoaded) {
    return (
      <div className="workspace-loading min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-100 text-slate-600" role="status" aria-live="polite">
        <LoaderCircle className="h-9 w-9 animate-spin text-indigo-600" aria-hidden="true" />
        <span className="text-sm font-medium">Loading your Oria Future workspace…</span>
      </div>
    );
  }
  if (!configLoaded) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700">
      <p>{initError || 'Workspace configuration could not be loaded.'}</p>
      <button onClick={initApp} className="px-4 py-2 rounded bg-indigo-600 text-white">Retry</button>
    </div>;
  }

  return (
    <div className="h-screen overflow-hidden bg-slate-100 flex flex-col font-sans text-gray-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        organizationName={organizationName}
        onSignOut={handleSignOut}
        config={config}
        onUpdateConfig={(cfg) => setConfig({ ...config, ...cfg })}
        notifications={notifications}
        onDismissNotification={async (id) => {
          await api.dismissNotification(id);
          setNotifications(notifications.filter((n) => n.id !== id));
        }}
        onNavigate={handleNavigate}
        onOpenNewAdjustment={() => setShowNewAdjustmentModal(true)}
        onOpenNewOrder={() => setShowNewOrderModal(true)}
        onTriggerSync={handleTriggerSync}
        isSyncing={isSyncing}
        canSyncEbay={(permissions.includes('*') || permissions.includes('marketplace.manage')) && marketplaceIntegrationReady}
        marketplaceAccounts={marketplaceAccounts}
        canAdjustStock={permissions.includes('*') || permissions.includes('inventory.adjust')}
        canCreateOrder={permissions.includes('*') || permissions.includes('orders.create')}
        canManageSettings={permissions.includes('*') || permissions.includes('settings.manage')}
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
        onSearchOpen={() => setIsGlobalSearchOpen(true)}
        searchDropdown={searchDropdown}
        selectedStoreId={selectedStoreId}
        selectedEnvironment={selectedEnvironment}
        onEnvironmentChange={setSelectedEnvironment}
        onStoreChange={setSelectedStoreId}
        onOpenNavigation={() => setIsMobileSidebarOpen((open) => !open)}
        isMobileNavigationOpen={isMobileSidebarOpen}
        isDarkTheme={isDarkTheme}
        onToggleTheme={() => setIsDarkTheme((current) => !current)}
      />


      {/* Main Layout Area */}
      <div className="flex-1 min-h-0 flex w-full max-w-none mx-auto overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onNavigate={handleNavigate}
          currentUser={currentUser}
          permissions={permissions}
          config={config}
          unreadAlertCount={notifications.filter((n) => !n.isDismissed).length}
          pendingExceptionsCount={exceptionsCount}
          ordersCount={ordersCount}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Center Main View */}
        <main aria-busy={pendingApiRequests > 0} className="relative flex-1 min-w-0 min-h-0 p-4 sm:p-6 lg:p-8 overflow-y-auto overscroll-contain">
          {pendingApiRequests > 0 && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden" role="status" aria-live="polite" aria-label="Updating data">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-indigo-600" />
              <span className="sr-only">{pendingApiRequests} requests in progress</span>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <DashboardView
              key={`dashboard:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              selectedEnvironment={selectedEnvironment}
              onNavigate={handleNavigate}
              onOpenNewAdjustment={() => setShowNewAdjustmentModal(true)}
              onOpenNewOrder={() => setShowNewOrderModal(true)}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              key={`orders:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              selectedEnvironment={selectedEnvironment}
              initialFilter={tabFilterState}
              onOpenNewOrder={() => setShowNewOrderModal(true)}
            />
          )}

          {activeTab === 'dropshipping' && (
            <DropshippingCalculatorView key={`dropshipping:${selectedStoreId}`} currentUser={currentUser} selectedStoreId={selectedStoreId} />
          )}


          {(activeTab === 'ebay-accounts' || Boolean(EBAY_MODULE_SECTIONS[activeTab])) && (
            <EbayAccountsView
              key={`ebay-accounts:${selectedStoreId}:${activeTab}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              onNavigate={handleNavigate}
              initialSection={EBAY_MODULE_SECTIONS[activeTab] || null}
            />
          )}

          {activeTab === 'products' && (
            <ProductsView
              key={`products:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              selectedEnvironment={selectedEnvironment}
              initialFilter={tabFilterState}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              key={`inventory:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              selectedEnvironment={selectedEnvironment}
              onOpenNewAdjustment={() => setShowNewAdjustmentModal(true)}
            />
          )}

          {activeTab === 'adjustments' && (
            <AdjustmentsView
              currentUser={currentUser}
              config={config}
              onOpenNewAdjustment={() => setShowNewAdjustmentModal(true)}
            />
          )}

          {/* Phase 2 Modules */}
          {(activeTab === 'suppliers' || activeTab === 'purchase-orders' || activeTab === 'returns' || activeTab === 'customers') && (
            <BuyingReturnsView
              key={`buying-returns:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              defaultSubTab={
                activeTab === 'returns'
                  ? 'RETURNS'
                  : activeTab === 'suppliers'
                  ? 'SUPPLIERS'
                  : activeTab === 'customers'
                  ? 'CUSTOMERS'
                  : 'POS'
              }
            />
          )}

          {(activeTab === 'warehouse' || activeTab === 'locations') && (
            <WarehouseLocationsView
              key={`warehouse:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              defaultTab={activeTab === 'locations' ? 'LOCATIONS' : 'WAREHOUSES'}
            />
          )}

          {/* Phase 3 Modules */}
          {/* Phase 3 Warehouse Services & 3PL Modules */}
          {activeTab === 'warehouse-services' && (
            <WarehouseServicesView key={`warehouse-services:${selectedStoreId}`} currentUser={currentUser} selectedStoreId={selectedStoreId} />
          )}

          {(activeTab === '3pl-clients' || activeTab === 'fulfilment' || activeTab === 'shipping' || activeTab === 'storage') && (
            <Clients3PLView
              key={`3pl:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              defaultSubTab={
                activeTab === 'fulfilment'
                  ? 'FULFILMENT'
                  : activeTab === 'shipping'
                  ? 'SHIPPING'
                  : activeTab === 'storage'
                  ? 'STORAGE'
                  : 'CLIENTS'
              }
            />
          )}

          {/* Phase 4 Payouts & Finance Modules */}
          {(activeTab === 'payouts' || activeTab === 'reconciliation') && (permissions.includes('*') || permissions.includes('finance.manage')) && (
            <EbayPayoutsView
              key={`payouts:${selectedStoreId}`}
              currentUser={currentUser}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
            />
          )}

          {(activeTab === 'invoices' || activeTab === 'payments' || activeTab === 'expenses' || activeTab === 'profitability') && (
            <FinanceView
              key={`finance:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              defaultTab={
                activeTab === 'payments'
                  ? 'PAYMENTS'
                  : activeTab === 'expenses'
                  ? 'EXPENSES'
                  : activeTab === 'profitability'
                  ? 'PROFIT'
                  : 'INVOICES'
              }
            />
          )}


          {/* Phase 1 & 5 System Modules */}
          {activeTab === 'reports' && (
            <ReportsView
              key={`reports:${selectedStoreId}`}
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              initialReportId={tabFilterState?.reportId || 'R-01'}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationsView
              currentUser={currentUser}
              config={config}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'audit-log' && (
            <AuditLogView currentUser={currentUser} config={config} />
          )}

          {activeTab === 'employee-access' && <EmployeeAccessView />}

          {activeTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              config={config}
              onUpdateConfig={(cfg) => setConfig({ ...config, ...cfg })}
                  />
          )}
        </main>
      </div>

      <footer className="flex h-8 shrink-0 items-center justify-center border-t border-slate-200 bg-white/80 px-3 text-[10px] font-medium tracking-wide text-slate-500">
        Oria Future <span className="mx-1.5 text-slate-300">·</span> Beta Version 1.0
      </footer>

      {/* Global Modals */}
      <NewAdjustmentModal
        isOpen={showNewAdjustmentModal}
        onClose={() => setShowNewAdjustmentModal(false)}
        currentUser={currentUser}
        config={config}
        selectedStoreId={selectedStoreId}
        onSuccess={() => {
          window.dispatchEvent(new Event('oria-inventory-updated'));
        }}
      />

      <NewOrderModal
        isOpen={showNewOrderModal}
        onClose={() => setShowNewOrderModal(false)}
        currentUser={currentUser}
        config={config}
        selectedStoreId={selectedStoreId}
        selectedEnvironment={selectedEnvironment}
        onSuccess={() => {
          window.dispatchEvent(new Event('oria-orders-updated'));
        }}
      />
    </div>
  );
}
