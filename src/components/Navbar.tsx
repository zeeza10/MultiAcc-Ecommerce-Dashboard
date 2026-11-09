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
  SlidersHorizontal,
} from 'lucide-react';
import { User, NotificationItem, SystemConfig } from '../types';

interface NavbarProps {
  currentUser: User;
  users: User[];
  onSwitchUser: (userId: string) => void;
  config: SystemConfig;
  onUpdateConfig: (cfg: Partial<SystemConfig>) => void;
  notifications: NotificationItem[];
  onDismissNotification: (id: string) => void;
  onNavigate: (tab: any) => void;
  onOpenNewAdjustment: () => void;
  onOpenNewOrder: () => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
  globalSearch: string;
  setGlobalSearch: (s: string) => void;
  selectedStoreId?: string;
  onStoreChange?: (storeId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  users,
  onSwitchUser,
  config,
  onUpdateConfig,
  notifications,
  onDismissNotification,
  onNavigate,
  onOpenNewAdjustment,
  onOpenNewOrder,
  onTriggerSync,
  isSyncing,
  globalSearch,
  setGlobalSearch,
  selectedStoreId = 'ALL',
  onStoreChange,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

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
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner: FR-OPS-01 demo mode clarity & active phase */}
      <div className="bg-slate-900 text-slate-200 px-4 py-1 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[11px] font-semibold tracking-wide border border-amber-500/40">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
            DEMO DATA MODE
          </span>
          <span className="text-slate-400 hidden sm:inline">
            eBay Sandbox & Local Append-Only Ledgers Active. All financial & inventory postings fully verified.
          </span>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Roadmap Phase:</span>
            <button
              onClick={() => setShowPhaseMenu(!showPhaseMenu)}
              className="font-medium text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1"
            >
              <span>{config.activeReleasePhase === 'ALL' ? 'All Phases Active (Full Suite)' : `Phase ${config.activeReleasePhase.replace('P', '')}`}</span>
              <SlidersHorizontal className="w-3 h-3 inline" />
            </button>
          </div>

          {showPhaseMenu && (
            <div className="absolute right-4 top-8 w-64 bg-white text-gray-900 rounded-lg shadow-xl border border-gray-200 p-2 z-50 text-xs">
              <div className="font-semibold text-gray-700 px-2 py-1 border-b border-gray-100 mb-1">
                Select Active Release Phase
              </div>
              {[
                { id: 'P1', label: 'Phase 1: Core Operations (Orders, eBay, Stock Ledger)' },
                { id: 'P2', label: 'Phase 2: Purchasing & Returns' },
                { id: 'P3', label: 'Phase 3: 3PL & Client Portal' },
                { id: 'P4', label: 'Phase 4: Finance, Profit & Ledgers' },
                { id: 'ALL', label: 'All Phases Unlocked (Full Enterprise Suite)' },
              ].map((phase) => (
                <button
                  key={phase.id}
                  onClick={() => {
                    onUpdateConfig({ activeReleasePhase: phase.id as any });
                    setShowPhaseMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-100 flex items-center justify-between ${
                    config.activeReleasePhase === phase.id ? 'bg-amber-50 text-amber-900 font-semibold' : ''
                  }`}
                >
                  <span>{phase.label}</span>
                  {config.activeReleasePhase === phase.id && <CheckCircle className="w-3.5 h-3.5 text-amber-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand / Logo */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onNavigate('dashboard')}>
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            N
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-gray-900 text-lg tracking-tight">NexusOps</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                v0.1
              </span>
            </div>
            <p className="text-[11px] text-gray-500 leading-none">E-Commerce & 3PL Operating Platform</p>
          </div>
        </div>

        {/* Global Search Bar (FR-SRCH-01) & Global Store Filter */}
        <div className="flex-1 max-w-lg items-center gap-2 hidden md:flex">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              placeholder="Global Search (Orders, SKUs, Tracking #, Buyers)..."
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-md focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div className="w-48 shrink-0">
            <select
              value={selectedStoreId}
              onChange={(e) => onStoreChange && onStoreChange(e.target.value)}
              title="Global Store Context Filter"
              className="w-full bg-slate-50 border border-slate-300 text-slate-700 font-medium text-xs rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="ALL">🏪 All Stores Combined</option>
              <option value="mkt_ebay_uk">🇬🇧 Nexus Tech Direct (UK)</option>
              <option value="mkt_ebay_us">🇺🇸 Nexus Global Outlet (US)</option>
              <option value="mkt_ebay_de">🇩🇪 Nexus Tech Europe (DE)</option>
            </select>
          </div>
        </div>


        {/* Action Controls & Role Switcher */}
        <div className="flex items-center space-x-3">
          {/* Quick Actions */}
          <button
            onClick={onTriggerSync}
            disabled={isSyncing}
            title="Poll eBay Accounts for New Orders"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-indigo-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync eBay'}</span>
          </button>

          {currentUser.role !== 'CLIENT_USER' && currentUser.role !== 'VIEWER' && (
            <div className="hidden sm:flex items-center space-x-2">
              <button
                onClick={onOpenNewAdjustment}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md hover:bg-indigo-100 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adjust Stock</span>
              </button>

              <button
                onClick={onOpenNewOrder}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Order</span>
              </button>
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

          {/* User Role Switcher Dropdown (SRS S4 & Acceptance Criteria) */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 pl-2 pr-3 py-1 rounded-md border border-gray-300 hover:border-gray-400 bg-gray-50 text-left focus:outline-none"
            >
              <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-xs">
                {currentUser.name.charAt(0)}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-semibold text-gray-900 leading-tight truncate max-w-[130px]">
                  {currentUser.name}
                </div>
                <div className="text-[10px] text-gray-500">{currentUser.role.replace('_', ' ')}</div>
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-50 text-xs">
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="font-bold text-gray-900">{currentUser.name}</div>
                  <div className="text-gray-500 text-[11px]">{currentUser.email}</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {getRoleBadge(currentUser.role)}
                    {currentUser.role === 'CLIENT_USER' && (
                      <span className="text-[11px] text-indigo-600 font-medium">Apex Electronics</span>
                    )}
                  </div>
                </div>

                <div className="px-3 py-1.5 bg-slate-50 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Test Role Switching (Permission & Isolation)
                </div>

                <div className="py-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        onSwitchUser(u.id);
                        setShowUserMenu(false);
                      }}
                      className={`w-full text-left px-3 py-2 hover:bg-indigo-50 flex items-center justify-between ${
                        u.id === currentUser.id ? 'bg-indigo-50/70 font-semibold' : ''
                      }`}
                    >
                      <div>
                        <div className="text-gray-900">{u.name}</div>
                        <div className="text-[11px] text-gray-500">{u.email}</div>
                      </div>
                      {u.id === currentUser.id && <CheckCircle className="w-4 h-4 text-indigo-600" />}
                    </button>
                  ))}
                </div>

                <div className="border-t border-gray-100 p-2 text-[11px] text-gray-500 bg-amber-50/50">
                  <span className="font-medium text-amber-800">Security Rule:</span> Client user queries are strictly isolated on the server (AT-07). Warehouse staff cannot see profit or cost fields.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
