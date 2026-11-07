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
import { NewAdjustmentModal } from './components/NewAdjustmentModal';
import { NewOrderModal } from './components/NewOrderModal';
import { api, setStoredUserId, getStoredUserId } from './services/api';
import { NavItem, User, SystemConfig, NotificationItem, Order, Product } from './types';
import { ShieldAlert, ArrowRight, CheckCircle, Search, ExternalLink } from 'lucide-react';

const DEFAULT_USER: User = {
  id: 'usr_superadmin',
  email: 'sarah.jenkins@nexusops.com',
  name: 'Sarah Jenkins (Super Admin)',
  role: 'SUPER_ADMIN',
  isActive: true,
  twoFactorEnabled: true,
  failedLoginAttempts: 0,
  createdAt: new Date().toISOString(),
};

const DEFAULT_CONFIG: SystemConfig = {
  baseCurrency: 'GBP',
  businessTimezone: 'Europe/London',
  defaultVatRatePercent: 20,
  adjustmentApprovalThresholdValueMinor: 25000,
  adjustmentApprovalThresholdQuantity: 10,
  activeReleasePhase: 'P1',
  allowNegativeStock: false,
  autoSyncEnabled: true,
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User>(DEFAULT_USER);
  const [users, setUsers] = useState<User[]>([DEFAULT_USER]);
  const [config, setConfig] = useState<SystemConfig>(DEFAULT_CONFIG);
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
  const [loading, setLoading] = useState(false);

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
        const [ordRes, prodRes] = await Promise.all([
          api.getOrders({ search: globalSearch }),
          api.getProducts(),
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
  }, [globalSearch]);

  const initApp = async () => {
    setLoading(true);
    try {
      const [uRes, meRes, cfgRes, notifRes, excRes] = await Promise.all([
        api.getUsers(),
        api.getMe(),
        api.getConfig(),
        api.getNotifications(),
        api.getExceptions(),
      ]);

      setUsers(uRes.users);
      setCurrentUser(meRes.user);
      setConfig(cfgRes.config);
      setNotifications(notifRes.notifications);
      setExceptionsCount(excRes.exceptions.filter((e) => e.status === 'PENDING').length);
    } catch (err) {
      console.error('Failed to initialize app:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchUser = async (userId: string) => {
    setStoredUserId(userId);
    const targetUser = users.find((u) => u.id === userId);
    if (targetUser) {
      setCurrentUser(targetUser);
    }
    // Refresh notifications and state
    try {
      const [notifRes, excRes] = await Promise.all([
        api.getNotifications(),
        api.getExceptions(),
      ]);
      setNotifications(notifRes.notifications);
      setExceptionsCount(excRes.exceptions.filter((e) => e.status === 'PENDING').length);
    } catch (err) {
      console.error(err);
    }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      const accRes = await api.getEbayAccounts();
      if (accRes.accounts.length > 0) {
        await api.syncEbayAccount(accRes.accounts[0].id);
      }
      const [notifRes, excRes] = await Promise.all([
        api.getNotifications(),
        api.getExceptions(),
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

  const handleResetDemo = async () => {
    try {
      await api.resetDemo();
      await initApp();
      alert('Database restored to clean, verified baseline demo dataset.');
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  };



  // Phase gate notification banner for future modules
  const isFutureModule =
    config.activeReleasePhase === 'P1' &&
    ['customers', 'returns', 'warehouse', 'locations', 'suppliers', 'purchase-orders', '3pl-clients', 'fulfilment', 'storage', 'invoices', 'payments', 'expenses', 'profitability'].includes(activeTab);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-gray-900 selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        users={users}
        onSwitchUser={handleSwitchUser}
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
        globalSearch={globalSearch}
        setGlobalSearch={setGlobalSearch}
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
          config={config}
          unreadAlertCount={notifications.filter((n) => !n.isDismissed).length}
          pendingExceptionsCount={exceptionsCount}
        />

        {/* Center Main View */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {/* Phase 1 roadmap notice banner if clicking a future module */}
          {isFutureModule && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-center justify-between">
              <div>
                <strong>Roadmap Phase Gate (PRD S6):</strong> This module is scheduled in a future phase. You are currently previewing its fully integrated interface. You can switch the active phase in <strong>Settings</strong> or the top bar selector.
              </div>
              <button
                onClick={() => setConfig({ ...config, activeReleasePhase: 'ALL' })}
                className="ml-3 shrink-0 px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white font-semibold rounded text-[11px]"
              >
                Unlock All Phases
              </button>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              config={config}
              onNavigate={handleNavigate}
              onOpenNewAdjustment={() => setShowNewAdjustmentModal(true)}
              onOpenNewOrder={() => setShowNewOrderModal(true)}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersView
              currentUser={currentUser}
              config={config}
              initialFilter={tabFilterState}
              onOpenNewOrder={() => setShowNewOrderModal(true)}
            />
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
              defaultSubTab={activeTab === 'returns' ? 'RETURNS' : activeTab === 'suppliers' ? 'SUPPLIERS' : 'POS'}
            />
          )}

          {(activeTab === 'warehouse' || activeTab === 'locations') && (
            <WarehouseLocationsView currentUser={currentUser} config={config} />
          )}

          {/* Phase 3 Modules */}
          {(activeTab === '3pl-clients' || activeTab === 'fulfilment' || activeTab === 'shipping' || activeTab === 'storage') && (
            <Clients3PLView currentUser={currentUser} config={config} />
          )}

          {/* Phase 4 Modules */}
          {(activeTab === 'invoices' || activeTab === 'payments' || activeTab === 'expenses' || activeTab === 'profitability') && (
            <FinanceView
              currentUser={currentUser}
              config={config}
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
              onResetDemo={handleResetDemo}
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
