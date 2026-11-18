import React, { useState } from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Store,
  Users,
  RotateCcw,
  Package,
  Layers,
  Sliders,
  Warehouse,
  MapPin,
  Truck,
  FileText,
  CreditCard,
  Receipt,
  TrendingUp,
  BarChart3,
  Bell,
  History,
  Settings,
  Boxes,
  Lock,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { NavItem, User, SystemConfig } from '../types';

interface SidebarProps {
  activeTab: NavItem;
  onNavigate: (tab: NavItem) => void;
  currentUser: User;
  permissions: string[];
  config: SystemConfig;
  unreadAlertCount: number;
  pendingExceptionsCount: number;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavMenuItem {
  id: NavItem;
  label: string;
  icon: React.ElementType;
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  badge?: string | number;
  allowedRoles?: string[];
  permission?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  currentUser,
  permissions,
  config,
  unreadAlertCount,
  pendingExceptionsCount,
  isMobileOpen,
  onCloseMobile,
}) => {
  const currentPhase = config.activeReleasePhase;
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Effective permissions already combine role defaults with Super Admin's
  // user-specific GRANT/DENY overrides. Do not apply hard-coded role filters
  // here, otherwise an explicit user-level grant could never reveal a module.
  const isAllowedForRole = (item: NavMenuItem) => {
    if (item.allowedRoles && !item.allowedRoles.includes(currentUser.role)) return false;
    if (permissions.includes('*')) return true;
    if (item.permission && !permissions.includes(item.permission)) return false;
    return true;
  };

  const navGroups: { title: string; items: NavMenuItem[] }[] = [
    {
      title: 'Overview',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, phase: 'P1', permission: 'dashboard.view' }],
    },
    {
      title: 'Sales',
      items: [
        { id: 'orders', label: 'Orders', icon: ShoppingCart, phase: 'P1', permission: 'orders.view' },
        {
          id: 'ebay-accounts',
          label: 'eBay Accounts',
          icon: Store,
          phase: 'P1',
          badge: pendingExceptionsCount > 0 ? `${pendingExceptionsCount} Exc` : undefined,
          permission: 'marketplace.view',
        },
        { id: 'customers', label: 'Customers', icon: Users, phase: 'P2', permission: 'orders.view' },
        { id: 'returns', label: 'Returns', icon: RotateCcw, phase: 'P2', permission: 'returns.view' },
      ],
    },
    {
      title: 'Stock & Costing',
      items: [
        { id: 'products', label: 'Products & SKUs', icon: Package, phase: 'P1', permission: 'products.view' },
        { id: 'inventory', label: 'Inventory & Ledger', icon: Layers, phase: 'P1', permission: 'inventory.view' },
        { id: 'adjustments', label: 'Stock Adjustments', icon: Sliders, phase: 'P1', permission: 'inventory.adjust' },
        { id: 'dropshipping', label: 'Dropship Calculator', icon: TrendingUp, phase: 'P1', permission: 'products.view' },
        { id: 'warehouse', label: 'Warehouse Hub', icon: Warehouse, phase: 'P2', permission: 'inventory.view' },
        { id: 'locations', label: 'Locations & Bins', icon: MapPin, phase: 'P2', permission: 'inventory.view' },
      ],
    },
    {
      title: 'Buying & Receiving',
      items: [
        { id: 'suppliers', label: 'Suppliers', icon: Truck, phase: 'P2', permission: 'purchasing.view' },
        { id: 'purchase-orders', label: 'Purchase Orders', icon: Boxes, phase: 'P2', permission: 'purchasing.view' },
      ],
    },
    {
      title: 'Warehouse Services & 3PL',
      items: [
        { id: 'warehouse-services', label: 'Warehouse Services', icon: Boxes, phase: 'P3', permission: 'fulfilment.view' },
        { id: '3pl-clients', label: '3PL Clients', icon: Users, phase: 'P3', permission: 'fulfilment.view' },
        { id: 'fulfilment', label: 'Pick & Pack', icon: Package, phase: 'P3', permission: 'fulfilment.view' },
        { id: 'shipping', label: 'Shipping & Parcels', icon: Truck, phase: 'P1', permission: 'fulfilment.view' },
        { id: 'storage', label: 'Storage Billing', icon: Warehouse, phase: 'P3', permission: 'fulfilment.view' },
      ],
    },
    {
      title: 'Finance & Payouts',
      items: [
        { id: 'payouts', label: 'eBay Payouts & Treasury', icon: CreditCard, phase: 'P4', permission: 'finance.manage' },
        { id: 'reconciliation', label: 'Reconciliation', icon: Receipt, phase: 'P4', permission: 'finance.manage' },
        { id: 'invoices', label: 'Invoices', icon: FileText, phase: 'P4', permission: 'finance.view' },
        { id: 'payments', label: 'Payments', icon: CreditCard, phase: 'P4', permission: 'finance.view' },
        { id: 'expenses', label: 'Expenses', icon: Receipt, phase: 'P4', permission: 'finance.manage' },
        { id: 'profitability', label: 'Profitability', icon: TrendingUp, phase: 'P4', permission: 'finance.manage' },
      ],
    },
    {
      title: 'System & Reports',
      items: [
        { id: 'reports', label: 'Reports (14)', icon: BarChart3, phase: 'P1', permission: 'reports.view' },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: Bell,
          phase: 'P1',
          badge: unreadAlertCount > 0 ? unreadAlertCount : undefined,
          permission: 'dashboard.view',
        },
        { id: 'audit-log', label: 'Audit Log', icon: History, phase: 'P1', permission: 'audit.view' },
        { id: 'employee-access', label: 'Employees & Permissions', icon: Users, phase: 'P1', permission: 'users.manage', allowedRoles: ['SUPER_ADMIN'] },
        { id: 'settings', label: 'Settings', icon: Settings, phase: 'P1', permission: 'settings.manage' },
      ],
    },

  ];

  return (
    <>
      {isMobileOpen && <button type="button" aria-label="Close navigation overlay" onClick={onCloseMobile} className="fixed inset-x-0 top-14 bottom-0 z-40 bg-slate-950/40 backdrop-blur-[2px] lg:hidden" /> }
      <aside id="oria-mobile-navigation" aria-label="Primary navigation" className={`fixed left-0 top-14 bottom-0 z-50 flex ${isCollapsed ? "w-20" : "w-[min(86vw,320px)]"} flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl transition-[width,transform] duration-300 ease-out lg:sticky lg:top-0 lg:bottom-auto lg:z-20 lg:min-h-screen lg:translate-x-0 lg:shadow-none ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} ${isCollapsed ? "lg:w-16" : "lg:w-64"}`}>
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {!isCollapsed && <span>Navigation</span>}
        <button type="button" onClick={() => setIsCollapsed((value) => !value)} aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"} title={isCollapsed ? "Expand navigation" : "Collapse navigation"} className="ml-auto rounded-md p-2 text-gray-500 hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-2 py-3 space-y-5 text-xs">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isAllowedForRole);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              {!isCollapsed && <div className="px-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {group.title}
              </div>}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  const isFuturePhase = currentPhase === 'P1' && item.phase !== 'P1';

                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); onCloseMobile(); }}
                      title={isCollapsed ? item.label : undefined}
                      className={`w-full flex items-center ${isCollapsed ? "justify-center" : "justify-between"} ${isCollapsed ? "px-2 py-3" : "px-3 py-2"} rounded-md transition font-medium ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200/70 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <Icon className={`${isCollapsed ? "h-5 w-5" : "h-4 w-4"} shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                        {!isCollapsed && <span className="truncate">{item.label}</span>}
                      </div>

                      {!isCollapsed && <div className="flex items-center space-x-1 shrink-0">
                        {item.badge !== undefined && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                              isActive
                                ? 'bg-indigo-800 text-white'
                                : 'bg-rose-100 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}

                        {isFuturePhase && (
                          <span
                            title={`Scheduled in ${item.phase}. Available for preview or unlock in Settings.`}
                            className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                              isActive
                                ? 'bg-indigo-700 text-indigo-100'
                                : 'bg-slate-200 text-slate-600 border border-slate-300'
                            }`}
                          >
                            {item.phase}
                          </span>
                        )}
                      </div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Role and Isolation Footer */}
      <div className="p-3 border-t border-gray-200 bg-white/70 text-[11px] text-gray-500">
        <div className={`flex items-center ${isCollapsed ? "justify-center" : "space-x-1.5"} font-medium text-gray-700`} title={isCollapsed ? "Role Isolation Active" : undefined}>
          <Lock className="w-3.5 h-3.5 text-indigo-600" />
          {!isCollapsed && <span>Role Isolation Active</span>}
        </div>
        {!isCollapsed && <p className="mt-0.5 text-[10px] text-gray-400">
          Enforced server-side. Append-only ledgers active.
        </p>}
      </div>
      </aside>
    </>
  );
};
