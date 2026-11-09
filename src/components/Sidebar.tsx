import React from 'react';
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
} from 'lucide-react';
import { NavItem, User, SystemConfig } from '../types';

interface SidebarProps {
  activeTab: NavItem;
  onNavigate: (tab: NavItem) => void;
  currentUser: User;
  config: SystemConfig;
  unreadAlertCount: number;
  pendingExceptionsCount: number;
}

interface NavMenuItem {
  id: NavItem;
  label: string;
  icon: React.ElementType;
  phase: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  badge?: string | number;
  allowedRoles?: string[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onNavigate,
  currentUser,
  config,
  unreadAlertCount,
  pendingExceptionsCount,
}) => {
  const currentPhase = config.activeReleasePhase;

  // Filter items allowed for this user role per SRS Matrix S4
  const isAllowedForRole = (item: NavMenuItem) => {
    if (currentUser.role === 'SUPER_ADMIN') return true;

    if (currentUser.role === 'CLIENT_USER') {
      const clientAllowed: NavItem[] = [
        'dashboard',
        'orders',
        'products',
        'inventory',
        '3pl-clients',
        'fulfilment',
        'shipping',
        'invoices',
        'payments',
        'profitability',
        'reports',
        'notifications',
      ];
      return clientAllowed.includes(item.id);
    }

    if (currentUser.role === 'WAREHOUSE_STAFF') {
      const warehouseForbidden: NavItem[] = [
        'ebay-accounts',
        'invoices',
        'payments',
        'expenses',
        'profitability',
        'settings',
      ];
      return !warehouseForbidden.includes(item.id);
    }

    if (currentUser.role === 'FINANCE_USER') {
      const financeForbidden: NavItem[] = ['warehouse', 'locations', 'adjustments'];
      return !financeForbidden.includes(item.id);
    }

    return true;
  };

  const navGroups: { title: string; items: NavMenuItem[] }[] = [
    {
      title: 'Overview',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, phase: 'P1' }],
    },
    {
      title: 'Sales',
      items: [
        { id: 'orders', label: 'Orders', icon: ShoppingCart, phase: 'P1' },
        {
          id: 'ebay-accounts',
          label: 'eBay Accounts',
          icon: Store,
          phase: 'P1',
          badge: pendingExceptionsCount > 0 ? `${pendingExceptionsCount} Exc` : undefined,
        },
        { id: 'customers', label: 'Customers', icon: Users, phase: 'P2' },
        { id: 'returns', label: 'Returns', icon: RotateCcw, phase: 'P2' },
      ],
    },
    {
      title: 'Stock & Costing',
      items: [
        { id: 'products', label: 'Products & SKUs', icon: Package, phase: 'P1' },
        { id: 'inventory', label: 'Inventory & Ledger', icon: Layers, phase: 'P1' },
        { id: 'adjustments', label: 'Stock Adjustments', icon: Sliders, phase: 'P1' },
        { id: 'dropshipping', label: 'Dropship Calculator', icon: TrendingUp, phase: 'P1' },
        { id: 'warehouse', label: 'Warehouse Hub', icon: Warehouse, phase: 'P2' },
        { id: 'locations', label: 'Locations & Bins', icon: MapPin, phase: 'P2' },
      ],
    },
    {
      title: 'Buying & Receiving',
      items: [
        { id: 'suppliers', label: 'Suppliers', icon: Truck, phase: 'P2' },
        { id: 'purchase-orders', label: 'Purchase Orders', icon: Boxes, phase: 'P2' },
      ],
    },
    {
      title: 'Warehouse Services & 3PL',
      items: [
        { id: 'warehouse-services', label: 'Warehouse Services', icon: Boxes, phase: 'P3' },
        { id: '3pl-clients', label: '3PL Clients', icon: Users, phase: 'P3' },
        { id: 'fulfilment', label: 'Pick & Pack', icon: Package, phase: 'P3' },
        { id: 'shipping', label: 'Shipping & Parcels', icon: Truck, phase: 'P1' },
        { id: 'storage', label: 'Storage Billing', icon: Warehouse, phase: 'P3' },
      ],
    },
    {
      title: 'Finance & Payouts',
      items: [
        { id: 'payouts', label: 'eBay Payouts & Treasury', icon: CreditCard, phase: 'P4' },
        { id: 'reconciliation', label: 'Reconciliation', icon: Receipt, phase: 'P4' },
        { id: 'invoices', label: 'Invoices', icon: FileText, phase: 'P4' },
        { id: 'payments', label: 'Payments', icon: CreditCard, phase: 'P4' },
        { id: 'expenses', label: 'Expenses', icon: Receipt, phase: 'P4' },
        { id: 'profitability', label: 'Profitability', icon: TrendingUp, phase: 'P4' },
      ],
    },
    {
      title: 'System & Reports',
      items: [
        { id: 'reports', label: 'Reports (14)', icon: BarChart3, phase: 'P1' },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: Bell,
          phase: 'P1',
          badge: unreadAlertCount > 0 ? unreadAlertCount : undefined,
        },
        { id: 'audit-log', label: 'Audit Log', icon: History, phase: 'P1' },
        { id: 'settings', label: 'Settings', icon: Settings, phase: 'P1' },
      ],
    },

  ];

  return (
    <aside className="w-64 bg-slate-50 border-r border-gray-200 flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      <div className="p-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center justify-between border-b border-gray-200">
        <span>Operations Menu</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-mono">
          {currentUser.role === 'CLIENT_USER' ? '3PL Portal' : 'Nexus ERP'}
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-5 text-xs">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(isAllowedForRole);
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title}>
              <div className="px-3 pb-1 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                {group.title}
              </div>
              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.icon;
                  const isFuturePhase = currentPhase === 'P1' && item.phase !== 'P1';

                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition font-medium ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-gray-700 hover:bg-gray-200/70 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-gray-500'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
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
                      </div>
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
        <div className="flex items-center space-x-1.5 font-medium text-gray-700">
          <Lock className="w-3.5 h-3.5 text-indigo-600" />
          <span>Role Isolation Active</span>
        </div>
        <p className="mt-0.5 text-[10px] text-gray-400">
          Enforced server-side. Append-only ledgers active.
        </p>
      </div>
    </aside>
  );
};
