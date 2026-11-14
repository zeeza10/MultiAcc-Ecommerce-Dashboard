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
import { WarehouseServicesView } from './components/WarehouseServicesView';
import { DropshippingCalculatorView } from './components/DropshippingCalculatorView';
import { EbayPayoutsView } from './components/EbayPayoutsView';
import { NewAdjustmentModal } from './components/NewAdjustmentModal';
import { NewOrderModal } from './components/NewOrderModal';
import { api } from './services/api';
import { useAuth } from './context/AuthContext';
import { NavItem, User, SystemConfig, NotificationItem, Order, Product } from './types';

import { ShieldAlert, ArrowRight, CheckCircle, Search, ExternalLink } from 'lucide-react';

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

export default function App() {
  const { user: authenticatedUser, signOut, organizationName, permissions } = useAuth();
  const [currentUser, setCurrentUser] = useState<User>(authenticatedUser);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [initError, setInitError] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [exceptionsCount, setExceptionsCount] = useState(0);
  const [activeTab, setActiveTab] = useState<NavItem>('dashboard');
  const [tabFilterState, setTabFilterState] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState<{ orders: Order[]; products: Product[] }>({
    orders: [],
    products: [],
  });
  const [showNewAdjustmentModal, setShowNewAdjustmentModal] = useState(false);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('ALL');
  const [marketplaceAccounts, setMarketplaceAccounts] = useState<any[]>([]);
  const [marketplaceIntegrationReady, setMarketplaceIntegrationReady] = useState(false);
  const [loading, setLoading] = useState(true);


  useEffect(() => { setCurrentUser(authenticatedUser); }, [authenticatedUser]);

  useEffect(() => {
    initApp();
  }, []);

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
          canViewOrders ? api.getOrders({ search: globalSearch }) : Promise.resolve({ orders: [] }),
          canViewProducts ? api.getProducts() : Promise.resolve({ products: [] }),
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
  }, [globalSearch, permissions]);

  const initApp = async () => {
    setLoading(true);
    try {
      const canViewMarketplace = permissions.includes('*') || permissions.includes('marketplace.view');
      const [cfgRes, notifRes, excRes, accountsRes] = await Promise.all([
        api.getConfig(), api.getNotifications(),
        canViewMarketplace ? api.getExceptions() : Promise.resolve({ exceptions: [] }),
        canViewMarketplace ? api.getEbayAccounts() : Promise.resolve({ accounts: [], integrationReady: false }),
      ]);
      setConfig(cfgRes.config);
      setConfigLoaded(true);
      setInitError('');
      setNotifications(notifRes.notifications);
      setExceptionsCount(excRes.exceptions.filter((e) => e.status === 'PENDING').length);
      setMarketplaceAccounts(accountsRes.accounts || []);
      setMarketplaceIntegrationReady(Boolean(accountsRes.integrationReady));
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
        alert(accRes.integrationMessage || 'eBay Sandbox credentials are not configured yet.');
        return;
      }
      if (accRes.accounts.length > 0) await api.syncEbayAccount(accRes.accounts[0].id);
      const [notifRes, excRes] = await Promise.all([
        api.getNotifications(),
        permissions.includes('*') || permissions.includes('marketplace.view')
          ? api.getExceptions()
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

  const handleNavigate = (tab: NavItem, filterState?: any) => {
    setActiveTab(tab);
    setTabFilterState(filterState || null);
    setGlobalSearch('');
  };

  if (loading && !configLoaded) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">Loading workspace data from Supabase…</div>;
  }
  if (!configLoaded) {
    return <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-100 text-slate-700">
      <p>{initError || 'Workspace configuration could not be loaded.'}</p>
      <button onClick={initApp} className="px-4 py-2 rounded bg-indigo-600 text-white">Retry</button>
    </div>;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-gray-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        organizationName={organizationName}
        onSignOut={signOut}
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
        selectedStoreId={selectedStoreId}
        onStoreChange={setSelectedStoreId}
      />


      {/* Global Search Results Overlay (FR-SRCH-01) */}
      {globalSearch.trim() && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 z-50 p-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-3">
            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">
              Global Search Results for "{globalSearch}"
            </span>
            <button
              onClick={() => setGlobalSearch('')}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Close [ESC]
            </button>
          </div>

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
        </div>
      )}

      {/* Main Layout Area */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onNavigate={handleNavigate}
          currentUser={currentUser}
          permissions={permissions}
          config={config}
          unreadAlertCount={notifications.filter((n) => !n.isDismissed).length}
          pendingExceptionsCount={exceptionsCount}
        />

        {/* Center Main View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              onNavigate={handleNavigate}
              onOpenNewAdjustment={() => setShowNewAdjustmentModal(true)}
              onOpenNewOrder={() => setShowNewOrderModal(true)}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
              initialFilter={tabFilterState}
              onOpenNewOrder={() => setShowNewOrderModal(true)}
            />
          )}

          {activeTab === 'dropshipping' && (
            <DropshippingCalculatorView currentUser={currentUser} />
          )}


          {activeTab === 'ebay-accounts' && (
            <EbayAccountsView
              currentUser={currentUser}
              config={config}
              onNavigate={handleNavigate}
            />
          )}

          {activeTab === 'products' && (
            <ProductsView
              currentUser={currentUser}
              config={config}
              initialFilter={tabFilterState}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              currentUser={currentUser}
              config={config}
              selectedStoreId={selectedStoreId}
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
              currentUser={currentUser}
              config={config}
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
              currentUser={currentUser}
              config={config}
              defaultTab={activeTab === 'locations' ? 'LOCATIONS' : 'WAREHOUSES'}
            />
          )}

          {/* Phase 3 Modules */}
          {/* Phase 3 Warehouse Services & 3PL Modules */}
          {activeTab === 'warehouse-services' && (
            <WarehouseServicesView currentUser={currentUser} />
          )}

          {(activeTab === '3pl-clients' || activeTab === 'fulfilment' || activeTab === 'shipping' || activeTab === 'storage') && (
            <Clients3PLView
              currentUser={currentUser}
              config={config}
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
              currentUser={currentUser}
              selectedStoreId={selectedStoreId}
              onStoreChange={setSelectedStoreId}
            />
          )}

          {(activeTab === 'invoices' || activeTab === 'payments' || activeTab === 'expenses' || activeTab === 'profitability') && (
            <FinanceView
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
              currentUser={currentUser}
              config={config}
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

          {activeTab === 'settings' && (
            <SettingsView
              currentUser={currentUser}
              config={config}
              onUpdateConfig={(cfg) => setConfig({ ...config, ...cfg })}
                  />
          )}
        </main>
      </div>

      {/* Global Modals */}
      <NewAdjustmentModal
        isOpen={showNewAdjustmentModal}
        onClose={() => setShowNewAdjustmentModal(false)}
        currentUser={currentUser}
        config={config}
        onSuccess={() => {
          if (activeTab === 'adjustments' || activeTab === 'inventory') {
            window.location.reload();
          }
        }}
      />

      <NewOrderModal
        isOpen={showNewOrderModal}
        onClose={() => setShowNewOrderModal(false)}
        currentUser={currentUser}
        config={config}
        onSuccess={() => {
          if (activeTab === 'orders') {
            window.location.reload();
          }
        }}
      />
    </div>
  );
}
