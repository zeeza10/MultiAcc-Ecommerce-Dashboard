import React, { useState } from 'react';
import {
  Search,
  Bell,
  RefreshCw,
  Plus,
  ShieldCheck,
  Building,
  UserCheck,
  AlertTriangle,
  CheckCircle,
  ExternalLink,
  Menu,
  X,
  Moon,
  Sun,
} from 'lucide-react';
import { User, NotificationItem, SystemConfig } from '../types';

interface NavbarProps {
  currentUser: User;
  organizationName: string;
  onSignOut: () => void;
  config: SystemConfig;
  onUpdateConfig: (cfg: Partial<SystemConfig>) => void;
  notifications: NotificationItem[];
  onDismissNotification: (id: string) => void;
  onNavigate: (tab: any) => void;
  onOpenNewAdjustment: () => void;
  onOpenNewOrder: () => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
  canSyncEbay: boolean;
  marketplaceAccounts: any[];
  canAdjustStock: boolean;
  canCreateOrder: boolean;
  canManageSettings: boolean;
  globalSearch: string;
  setGlobalSearch: (s: string) => void;
  selectedStoreId?: string;
  selectedEnvironment: 'DEMO' | 'SANDBOX' | 'PRODUCTION';
  onEnvironmentChange: (environment: 'DEMO' | 'SANDBOX' | 'PRODUCTION') => void;
  onStoreChange?: (storeId: string) => void;
  onOpenNavigation: () => void;
  onSearchOpen: () => void;
  searchDropdown?: React.ReactNode;
  isMobileNavigationOpen: boolean;
  isDarkTheme: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  organizationName,
  onSignOut,
  config,
  onUpdateConfig,
  notifications,
  onDismissNotification,
  onNavigate,
  onOpenNewAdjustment,
  onOpenNewOrder,
  onTriggerSync,
  isSyncing,
  canSyncEbay,
  marketplaceAccounts,
  canAdjustStock,
  canCreateOrder,
  canManageSettings,
  globalSearch,
  setGlobalSearch,
  selectedStoreId = 'ALL',
  selectedEnvironment,
  onEnvironmentChange,
  onStoreChange,
  onOpenNavigation,
  onSearchOpen,
  searchDropdown,
  isMobileNavigationOpen,
  isDarkTheme,
  onToggleTheme,
}) => {

  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showPhaseMenu, setShowPhaseMenu] = useState(false);

  const unreadNotifications = notifications.filter((n) => !n.isDismissed);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 border border-purple-200">Super Admin</span>;
      case 'OPS_MANAGER':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">Ops Manager</span>;
      case 'WAREHOUSE_STAFF':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">Warehouse Staff</span>;
      case 'FINANCE_USER':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Finance User</span>;
      case 'CLIENT_USER':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">3PL Client User</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">Viewer</span>;
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white shadow-sm">
      {/* Main Navigation Bar */}
      <div className="mx-auto flex min-h-14 w-full max-w-none flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:px-5 xl:flex-nowrap xl:gap-x-3 xl:px-4">
        {/* Brand / Logo */}
        <div className="flex min-w-0 shrink-0 items-center space-x-2 sm:space-x-3 cursor-pointer" onClick={() => onNavigate('dashboard')}>
          <button type="button" onClick={(event) => { event.stopPropagation(); onOpenNavigation(); }} aria-label={isMobileNavigationOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={isMobileNavigationOpen} aria-controls="oria-mobile-navigation" className="lg:hidden mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500">{isMobileNavigationOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            O
          </div>
          <div>
            <div className="flex min-w-0 items-center space-x-2">
              <span className="whitespace-nowrap font-bold text-gray-900 text-lg tracking-tight">Oria Future</span>
            </div>
          </div>
        </div>

        {/* Global Search Bar (FR-SRCH-01) & Global Store Filter */}
        <div className="relative z-20 order-3 flex w-full min-w-0 flex-wrap items-center justify-end gap-2 xl:order-none xl:w-[420px] xl:flex-none xl:flex-nowrap">
          <div className="relative z-20 min-w-0 w-full flex-1 max-w-md xl:w-[220px] xl:flex-none xl:max-w-[220px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onFocus={onSearchOpen}
              onClick={onSearchOpen}
              placeholder="Global Search (Orders, SKUs, Tracking #, Buyers)..."
              className="h-9 w-full rounded-full border border-slate-200 bg-slate-50 pl-9 pr-4 text-[13px] text-slate-700 shadow-sm transition placeholder:text-slate-400 hover:border-slate-300 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            {searchDropdown}
          </div>

          <div className="w-48 shrink-0 xl:w-[190px]">
            <select
              value={selectedStoreId}
              onChange={(e) => {
                const accountId = e.target.value;
                if (accountId === 'ALL') {
                  onStoreChange && onStoreChange('ALL');
                  return;
                }
                const account = marketplaceAccounts.find((item) => item.id === accountId);
                if (account) {
                  onEnvironmentChange(account.isDemo ? 'DEMO' : account.environment);
                }
                onStoreChange && onStoreChange(accountId);
              }}
              aria-label="Marketplace and seller account"
              title="Select marketplace account by environment"
              className="w-full bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">All Marketplace Accounts</option>
              {marketplaceAccounts.some((account) => account.isDemo) && (
                <optgroup label="DEMO ACCOUNTS">
                  {marketplaceAccounts.filter((account) => account.isDemo).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} ({account.marketplace})</option>
                  ))}
                </optgroup>
              )}
              {marketplaceAccounts.some((account) => !account.isDemo && account.environment === 'SANDBOX') && (
                <optgroup label="SANDBOX ACCOUNTS">
                  {marketplaceAccounts.filter((account) => !account.isDemo && account.environment === 'SANDBOX').map((account) => (
                    <option key={account.id} value={account.id}>{account.name} ({account.marketplace})</option>
                  ))}
                </optgroup>
              )}
              {marketplaceAccounts.some((account) => !account.isDemo && account.environment === 'PRODUCTION') && (
                <optgroup label="PRODUCTION ACCOUNTS">
                  {marketplaceAccounts.filter((account) => !account.isDemo && account.environment === 'PRODUCTION').map((account) => (
                    <option key={account.id} value={account.id}>{account.name} ({account.marketplace})</option>
                  ))}
                </optgroup>
              )}
              {marketplaceAccounts.length === 0 && <option value="ALL" disabled>No marketplace accounts available</option>}
            </select>
          </div>
        </div>


        {/* Action Controls & Role Switcher */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 sm:gap-2 xl:flex-nowrap xl:gap-2">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-pressed={isDarkTheme}
            title={isDarkTheme ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-slate-600 transition hover:bg-slate-100 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {isDarkTheme ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
          {/* Quick Actions */}
          {canSyncEbay && <button
            onClick={onTriggerSync}
            disabled={isSyncing}
            title="Poll eBay Accounts for New Orders"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync eBay'}</span>
          </button>}

          {(canAdjustStock || canCreateOrder) && (
            <div className="hidden sm:flex items-center space-x-2">
              {canAdjustStock && <button
                onClick={onOpenNewAdjustment}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adjust Stock</span>
              </button>}

              {canCreateOrder && <button
                onClick={onOpenNewOrder}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Order</span>
              </button>}
            </div>
          )}

          {/* Notifications Center Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifMenu(!showNotifMenu)}
              className="relative p-2 text-gray-500 hover:text-gray-700 rounded-md hover:bg-gray-100 focus:outline-none"
              title="System Alerts & Exception Queue"
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {unreadNotifications.length}
                </span>
              )}
            </button>

            {showNotifMenu && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    In-App Alerts ({unreadNotifications.length})
                  </span>
                  <button
                    onClick={() => {
                      onNavigate('notifications');
                      setShowNotifMenu(false);
                    }}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View All
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {unreadNotifications.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500">No active alerts. All operations nominal.</div>
                  ) : (
                    unreadNotifications.map((n) => (
                      <div key={n.id} className="p-3 hover:bg-gray-50 text-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-gray-900">{n.title}</span>
                          <button
                            onClick={() => onDismissNotification(n.id)}
                            className="text-[10px] text-gray-400 hover:text-gray-600"
                          >
                            Dismiss
                          </button>
                        </div>
                        <p className="text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                        {n.referenceUrl && (
                          <button
                            onClick={() => {
                              setShowNotifMenu(false);
                              onNavigate(n.referenceUrl?.replace('/', '') || 'dashboard');
                            }}
                            className="mt-1 text-[11px] text-indigo-600 hover:underline font-medium flex items-center gap-1"
                          >
                            <span>Inspect record</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex max-w-full shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 sm:gap-2 sm:px-3">
            <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-xs">{currentUser.name.charAt(0).toUpperCase()}</div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-semibold text-gray-900">{currentUser.name}</div>
              <div className="text-[10px] text-gray-500">{currentUser.email}</div>
            </div>
            <span className="hidden sm:inline-flex">{getRoleBadge(currentUser.role)}</span>
            <button onClick={onSignOut} className="ml-0.5 rounded-md px-1.5 sm:px-2 py-1 text-[11px] sm:text-xs font-semibold text-slate-600 hover:bg-slate-200">Sign out</button>
          </div>
        </div>
      </div>
    </header>
  );
};
