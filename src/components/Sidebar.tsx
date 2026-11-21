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
  ordersCount: number;
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
  unreadAlertCount,
  pendingExceptionsCount,
  ordersCount,
  isMobileOpen,
  onCloseMobile,
}) => {
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
        { id: 'orders', label: 'Orders', icon: ShoppingCart, phase: 'P1', badge: ordersCount, permission: 'orders.view' },
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
      title: 'eBay Marketplace',
      items: [
        { id: 'ebay-active-listings', label: 'eBay Active Listings', icon: Package, phase: 'P2', permission: 'marketplace.view' },
        { id: 'ebay-seller-account', label: 'eBay Seller Account', icon: Store, phase: 'P2', permission: 'marketplace.view' },
        { id: 'ebay-returns', label: 'eBay Returns', icon: RotateCcw, phase: 'P2', permission: 'marketplace.view' },
        { id: 'ebay-analytics', label: 'eBay Analytics', icon: BarChart3, phase: 'P2', permission: 'marketplace.view' },
        { id: 'ebay-finances', label: 'eBay Finances', icon: CreditCard, phase: 'P2', permission: 'marketplace.view' },
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
      <aside id="oria-mobile-navigation" aria-label="Primary navigation" className={`fixed left-0 top-14 bottom-0 z-50 flex h-[calc(100dvh-3.5rem)] max-h-[calc(100dvh-3.5rem)] ${isCollapsed ? "w-20" : "w-[min(86vw,320px)]"} min-h-0 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white shadow-2xl transition-[width,transform] duration-200 ease-out lg:sticky lg:top-0 lg:bottom-auto lg:z-20 lg:h-full lg:max-h-full lg:min-h-0 lg:translate-x-0 lg:shadow-none ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} ${isCollapsed ? "lg:w-16 lg:flex-[0_0_4rem]" : "lg:w-64 lg:flex-[0_0_16rem]"}`}>
      <div className="hidden lg:flex h-12 shrink-0 items-center justify-center border-b border-slate-200 bg-slate-50 px-2 py-2">
        <button type="button" onClick={() => setIsCollapsed((value) => !value)} aria-label={isCollapsed ? "Expand navigation" : "Collapse navigation"} title={isCollapsed ? "Expand navigation" : "Collapse navigation"} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-200 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500">
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className={`flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-scroll overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] py-3 space-y-4 sm:space-y-5 text-xs ${isCollapsed ? "px-1.5" : "px-2.5 sm:px-3 lg:px-2"}`}>
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isAllowedForRole);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} className="min-w-0">
              {!isCollapsed && <div className="px-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {group.title}
              </div>}
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.id}
                      onClick={() => { onNavigate(item.id); onCloseMobile(); }}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={item.label}
                      aria-current={isActive ? "page" : undefined}
                      className={`w-full min-w-0 min-h-10 flex items-center ${isCollapsed ? "justify-center px-0 py-2" : "justify-between px-3 py-2"} rounded-lg transition-colors duration-150 font-medium ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200/70 hover:text-gray-900'
                      }`}
                    >
                      <div className={`flex min-w-0 items-center ${isCollapsed ? "justify-center" : "gap-2.5"}`}>
                        <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-gray-500"}`} />
                        {!isCollapsed && <span className="min-w-0 truncate text-left">{item.label}</span>}
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

                      </div>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      </aside>
    </>
  );
};
