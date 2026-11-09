import React, { useState, useEffect } from 'react';
import {
  Boxes,
  PackageCheck,
  Truck,
  Receipt,
  Plus,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  FileText,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  Search,
} from 'lucide-react';
import {
  WarehousePackagingJob,
  WarehouseShippingJob,
  Client3PL,
  User,
} from '../types';
import { api } from '../services/api';

interface WarehouseServicesViewProps {
  currentUser: User;
}

export const WarehouseServicesView: React.FC<WarehouseServicesViewProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'storage' | 'packaging' | 'shipping' | 'billing'>('storage');
  const [summary, setSummary] = useState<any>(null);
  const [packagingJobs, setPackagingJobs] = useState<WarehousePackagingJob[]>([]);
  const [shippingJobs, setShippingJobs] = useState<WarehouseShippingJob[]>([]);
  const [clients, setClients] = useState<Client3PL[]>([]);
  const [loading, setLoading] = useState(true);

  // New Job Modals
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showShpModal, setShowShpModal] = useState(false);

  // Form states for Packaging Job
  const [pkgClientId, setPkgClientId] = useState('');
  const [pkgType, setPkgType] = useState<'CUSTOM_BOX' | 'BUBBLE_MAILER' | 'PALLET_WRAP' | 'FRAGILE_PREP'>('CUSTOM_BOX');
  const [pkgQty, setPkgQty] = useState(50);
  const [pkgMaterialCost, setPkgMaterialCost] = useState('25.00');
  const [pkgServiceCharge, setPkgServiceCharge] = useState('60.00');
  const [pkgOrderNumber, setPkgOrderNumber] = useState('');
  const [pkgNotes, setPkgNotes] = useState('');

  // Form states for Shipping Job
  const [shpClientId, setShpClientId] = useState('');
  const [shpCarrier, setShpCarrier] = useState('Royal Mail');
  const [shpTracking, setShpTracking] = useState('');
  const [shpServiceLevel, setShpServiceLevel] = useState('Tracked 24');
  const [shpWeight, setShpWeight] = useState('1.2');
  const [shpCarrierCost, setShpCarrierCost] = useState('4.20');
  const [shpServiceCharge, setShpServiceCharge] = useState('7.50');
  const [shpDestination, setShpDestination] = useState('Manchester, UK');
  const [shpOrderNumber, setShpOrderNumber] = useState('NX-ORD-2026-001');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, pkgRes, shpRes, clientRes] = await Promise.all([
        api.getWarehouseServicesSummary(),
        api.getPackagingJobs(),
        api.getShippingJobs(),
        api.get3PLClients(),
      ]);
      setSummary(sumRes);
      setPackagingJobs(pkgRes.packagingJobs);
      setShippingJobs(shpRes.shippingJobs);
      setClients(clientRes.clients || []);
      if (clientRes.clients && clientRes.clients.length > 0) {
        setPkgClientId(clientRes.clients[0].id);
        setShpClientId(clientRes.clients[0].id);
      }
    } catch (err) {
      console.error('Failed to load warehouse services data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePackagingJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === pkgClientId);
    try {
      const matCostMinor = Math.round(parseFloat(pkgMaterialCost) * 100) || 0;
      const srvChargeMinor = Math.round(parseFloat(pkgServiceCharge) * 100) || 0;
      await api.createPackagingJob({
        clientId: pkgClientId,
        clientName: client?.companyName || '3PL Partner',
        packagingType: pkgType,
        quantity: pkgQty,
        materialCostMinor: matCostMinor,
        serviceChargeMinor: srvChargeMinor,
        totalChargeMinor: matCostMinor + srvChargeMinor,
        orderNumber: pkgOrderNumber || undefined,
        notes: pkgNotes,
        performedBy: currentUser.name,
      });
      setShowPkgModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record packaging job');
    }
  };

  const handleCreateShippingJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === shpClientId);
    try {
      const carCostMinor = Math.round(parseFloat(shpCarrierCost) * 100) || 0;
      const srvChargeMinor = Math.round(parseFloat(shpServiceCharge) * 100) || 0;
      await api.createShippingJob({
        clientId: shpClientId,
        clientName: client?.companyName || '3PL Partner',
        carrier: shpCarrier,
        trackingNumber: shpTracking || `GB-${Date.now().toString().slice(-8)}TRK`,
        serviceLevel: shpServiceLevel,
        parcelWeightKg: parseFloat(shpWeight) || 1.0,
        carrierCostMinor: carCostMinor,
        serviceChargeMinor: srvChargeMinor,
        totalChargeMinor: carCostMinor + srvChargeMinor,
        destination: shpDestination,
        orderNumber: shpOrderNumber,
      });
      setShowShpModal(false);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to record shipping job');
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Phase 3 • Warehouse Services
            </span>
            <span className="text-xs text-slate-400 font-medium">Dedicated Operational Workflow</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            Warehouse Services & 3PL Operations
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dedicated multi-tenant storage, packaging, outbound dispatch, and client service billing engine.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowPkgModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
          >
            <PackageCheck className="w-4 h-4 text-indigo-500" />
            <span>Record Packaging Job</span>
          </button>
          <button
            onClick={() => setShowShpModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow-xs shadow-indigo-600/20"
          >
            <Truck className="w-4 h-4" />
            <span>Record Outbound Dispatch</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Storage Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            £{((summary?.storage?.totalStorageChargesMinor || 21600) / 100).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{summary?.storage?.activeClients || 5} Active 3PL Clients Stored</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Packaging Charges</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
              <PackageCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            £{((summary?.packaging?.totalPackagingChargesMinor || 58000) / 100).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 mt-2">
            <span>{summary?.packaging?.totalUnitsPacked || 264} units packaged & wrapped</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Dispatch Charges</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 font-mono">
            £{((summary?.shipping?.totalShippingChargesMinor || 6650) / 100).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{shippingJobs.length} Outbound dispatches verified</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Outstanding Balance</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 font-mono">
            £{((summary?.billing?.outstandingBalanceMinor || 21600) / 100).toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <span>Paid: £{((summary?.billing?.paidAmountMinor || 35600) / 100).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex space-x-6 text-sm">
          <button
            onClick={() => setActiveTab('storage')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'storage'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>A. Storage Services</span>
          </button>

          <button
            onClick={() => setActiveTab('packaging')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'packaging'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            <span>B. Packaging Services</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-semibold">
              {packagingJobs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('shipping')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'shipping'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>C. Shipping & Dispatch Services</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-semibold">
              {shippingJobs.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('billing')}
            className={`pb-3 font-medium flex items-center gap-2 border-b-2 transition ${
              activeTab === 'billing'
                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>D. Client Billing Ledger</span>
          </button>
        </nav>
      </div>

      {/* Tab A: Storage Services */}
      {activeTab === 'storage' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Multi-Client Segregated Storage Inventory
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Client inventory is quarantined and separated by client code with granular shelf, bin, and pallet location allocations.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Client SKUs</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">5 Active SKUs</div>
                <div className="text-[11px] text-slate-500 mt-1">Apex, Bolt, Luma, Nordic Eco</div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Physical Stock Status</div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">540 Avail / 35 Rsv</div>
                <div className="text-[11px] text-slate-500 mt-1">5 Damaged in quarantine bin</div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Monthly Storage Rate</div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">£0.35 - £1.20</div>
                <div className="text-[11px] text-slate-500 mt-1">Per cubic meter / pallet per day</div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3">SKU & Product</th>
                    <th className="py-2.5 px-3">Location Bins</th>
                    <th className="py-2.5 px-3 text-center">Available</th>
                    <th className="py-2.5 px-3 text-center">Reserved</th>
                    <th className="py-2.5 px-3 text-center">Damaged</th>
                    <th className="py-2.5 px-3 text-right">Est. Storage Fee</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Apex Electronics Ltd</td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-indigo-600 dark:text-indigo-400">APX-SPK-100</div>
                      <div className="text-[11px] text-slate-500">Apex SoundPulse Rugged Waterproof Speaker</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">A-01-02, B-02-01</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">142</td>
                    <td className="py-3 px-3 text-center text-amber-600 font-medium">8</td>
                    <td className="py-3 px-3 text-center text-rose-500">2</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">£52.50 / mo</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Apex Electronics Ltd</td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-indigo-600 dark:text-indigo-400">APX-EAR-200</div>
                      <div className="text-[11px] text-slate-500">Apex PureBass Wireless Earbuds with ANC</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">A-02-01</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">88</td>
                    <td className="py-3 px-3 text-center text-amber-600 font-medium">12</td>
                    <td className="py-3 px-3 text-center text-rose-500">0</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">£35.00 / mo</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Bolt Gear Ltd</td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-indigo-600 dark:text-indigo-400">BLT-SND-10</div>
                      <div className="text-[11px] text-slate-500">Bolt CinemaSound 120W Compact TV Soundbar</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">PALLET-P04</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">54</td>
                    <td className="py-3 px-3 text-center text-amber-600 font-medium">6</td>
                    <td className="py-3 px-3 text-center text-rose-500">1</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">£72.00 / mo</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Luma Smart Home</td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-indigo-600 dark:text-indigo-400">LUM-CAM-01</div>
                      <div className="text-[11px] text-slate-500">Luma Smart 2K Pan & Tilt Indoor WiFi Camera</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">C-01-01</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">110</td>
                    <td className="py-3 px-3 text-center text-amber-600 font-medium">4</td>
                    <td className="py-3 px-3 text-center text-rose-500">0</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">£28.00 / mo</td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Nordic Eco Living</td>
                    <td className="py-3 px-3">
                      <div className="font-mono font-medium text-indigo-600 dark:text-indigo-400">NRD-WRM-01</div>
                      <div className="text-[11px] text-slate-500">Nordic Eco Wool Heated Smart Throw Blanket</div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px]">PALLET-P08</td>
                    <td className="py-3 px-3 text-center font-bold text-emerald-600">65</td>
                    <td className="py-3 px-3 text-center text-amber-600 font-medium">5</td>
                    <td className="py-3 px-3 text-center text-rose-500">2</td>
                    <td className="py-3 px-3 text-right font-mono font-medium">£48.50 / mo</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab B: Packaging Services */}
      {activeTab === 'packaging' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Value-Add Packaging Services Ledger
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tracking packaging jobs, material consumption, staff labor, and client billable rates.
                </p>
              </div>
              <button
                onClick={() => setShowPkgModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Packaging Record</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Job ID</th>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3">Service Type</th>
                    <th className="py-2.5 px-3 text-center">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Material Cost</th>
                    <th className="py-2.5 px-3 text-right">Service Charge</th>
                    <th className="py-2.5 px-3 text-right">Total Charge</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Staff Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {packagingJobs.map((j) => (
                    <tr key={j.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {j.jobNumber}
                        {j.orderNumber && (
                          <div className="text-[10px] text-slate-400 font-mono">Ref: {j.orderNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">{j.clientName}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/20">
                          {j.packagingType.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center font-bold">{j.quantity}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        £{(j.materialCostMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        £{(j.serviceChargeMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        £{(j.totalChargeMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            j.status === 'INVOICED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                          }`}
                        >
                          {j.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-[11px]">{j.performedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab C: Shipping Services */}
      {activeTab === 'shipping' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Client Outbound Dispatch & Courier Management
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Carrier dispatch records, tracking integrations, carrier postage costs, and client shipping billable rates.
                </p>
              </div>
              <button
                onClick={() => setShowShpModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Dispatch Job</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Dispatch ID</th>
                    <th className="py-2.5 px-3">Client</th>
                    <th className="py-2.5 px-3">Carrier & Tracking</th>
                    <th className="py-2.5 px-3">Destination</th>
                    <th className="py-2.5 px-3 text-right">Carrier Cost</th>
                    <th className="py-2.5 px-3 text-right">Service Margin</th>
                    <th className="py-2.5 px-3 text-right">Client Invoiced</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {shippingJobs.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {s.dispatchId}
                        <div className="text-[10px] text-slate-400 font-mono">Order: {s.orderNumber}</div>
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">{s.clientName}</td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                          <Truck className="w-3 h-3 text-emerald-500" />
                          <span>{s.carrier} ({s.serviceLevel})</span>
                        </div>
                        <div className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400">
                          {s.trackingNumber}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-500">{s.destination}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        £{(s.carrierCostMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                        £{(s.serviceChargeMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        £{(s.totalChargeMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            s.status === 'DELIVERED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                              : 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400'
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab D: Client Billing Dashboard */}
      {activeTab === 'billing' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Client-Wise Billing & Settlement Matrix
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Comprehensive statement of services rendered (Storage, Packaging, Dispatch) with outstanding ledger balances.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Client Company</th>
                    <th className="py-2.5 px-3">Account Code</th>
                    <th className="py-2.5 px-3 text-right">Storage Charges</th>
                    <th className="py-2.5 px-3 text-right">Packaging Charges</th>
                    <th className="py-2.5 px-3 text-right">Shipping Charges</th>
                    <th className="py-2.5 px-3 text-right">Total Charges</th>
                    <th className="py-2.5 px-3 text-right">Paid Amount</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Apex Electronics Ltd</td>
                    <td className="py-3 px-3 font-mono text-slate-500">CLI-APEX-01</td>
                    <td className="py-3 px-3 text-right font-mono">£87.50</td>
                    <td className="py-3 px-3 text-right font-mono">£216.00</td>
                    <td className="py-3 px-3 text-right font-mono">£10.30</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">£313.80</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">£313.80</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">£0.00</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                        SETTLED
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Bolt Gear Ltd</td>
                    <td className="py-3 px-3 font-mono text-slate-500">CLI-BOLT-02</td>
                    <td className="py-3 px-3 text-right font-mono">£72.00</td>
                    <td className="py-3 px-3 text-right font-mono">£140.00</td>
                    <td className="py-3 px-3 text-right font-mono">£17.70</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">£229.70</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">£150.00</td>
                    <td className="py-3 px-3 text-right font-mono text-amber-600 font-bold">£79.70</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        PARTIAL
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">Zenith Retail Partners</td>
                    <td className="py-3 px-3 font-mono text-slate-500">CLI-ZEN-03</td>
                    <td className="py-3 px-3 text-right font-mono">£60.00</td>
                    <td className="py-3 px-3 text-right font-mono">£93.50</td>
                    <td className="py-3 px-3 text-right font-mono">£38.50</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">£192.00</td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 font-semibold">£100.00</td>
                    <td className="py-3 px-3 text-right font-mono text-amber-600 font-bold">£92.00</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        PARTIAL
                      </span>
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">CloudLogix Direct</td>
                    <td className="py-3 px-3 font-mono text-slate-500">CLI-CLOUD-04</td>
                    <td className="py-3 px-3 text-right font-mono">£45.00</td>
                    <td className="py-3 px-3 text-right font-mono">£130.50</td>
                    <td className="py-3 px-3 text-right font-mono">£0.00</td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">£175.50</td>
                    <td className="py-3 px-3 text-right font-mono text-slate-400">£0.00</td>
                    <td className="py-3 px-3 text-right font-mono text-rose-600 font-bold">£175.50</td>
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400">
                        DUE
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Record Packaging Job */}
      {showPkgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-slate-100 shadow-2xl">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              <PackageCheck className="w-5 h-5 text-indigo-400" />
              Record Warehouse Packaging Job
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Enter billable packaging services, materials used, and client assignment.
            </p>

            <form onSubmit={handleCreatePackagingJob} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">3PL Client</label>
                <select
                  value={pkgClientId}
                  onChange={(e) => setPkgClientId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.code})
                    </option>
                  ))}

                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Packaging Type</label>
                  <select
                    value={pkgType}
                    onChange={(e: any) => setPkgType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  >
                    <option value="CUSTOM_BOX">Custom Double Box</option>
                    <option value="BUBBLE_MAILER">Bubble Mailer Pack</option>
                    <option value="PALLET_WRAP">Full Pallet Wrap</option>
                    <option value="FRAGILE_PREP">Fragile Prep Foam</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Units / Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={pkgQty}
                    onChange={(e) => setPkgQty(parseInt(e.target.value) || 1)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Material Cost (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pkgMaterialCost}
                    onChange={(e) => setPkgMaterialCost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Service Fee (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={pkgServiceCharge}
                    onChange={(e) => setPkgServiceCharge(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Order Reference (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. NX-ORD-2026-001"
                  value={pkgOrderNumber}
                  onChange={(e) => setPkgOrderNumber(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes / Description</label>
                <textarea
                  rows={2}
                  placeholder="Special instructions or materials details..."
                  value={pkgNotes}
                  onChange={(e) => setPkgNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPkgModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-md shadow-indigo-600/20"
                >
                  Save Packaging Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Shipping Job */}
      {showShpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 text-slate-100 shadow-2xl">
            <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
              <Truck className="w-5 h-5 text-indigo-400" />
              Record Client Outbound Dispatch
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Record carrier dispatch, parcel weight, tracking details, and client service fees.
            </p>

            <form onSubmit={handleCreateShippingJob} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">3PL Client</label>
                <select
                  value={shpClientId}
                  onChange={(e) => setShpClientId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName} ({c.code})
                    </option>
                  ))}

                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Carrier</label>
                  <select
                    value={shpCarrier}
                    onChange={(e) => setShpCarrier(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  >
                    <option value="Royal Mail">Royal Mail</option>
                    <option value="DPD UK">DPD UK</option>
                    <option value="DHL Express">DHL Express</option>
                    <option value="Evri">Evri Parcel</option>
                    <option value="FedEx">FedEx</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Service Level</label>
                  <input
                    type="text"
                    value={shpServiceLevel}
                    onChange={(e) => setShpServiceLevel(e.target.value)}
                    placeholder="e.g. Tracked 24"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Tracking Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. GB491028114RM"
                    value={shpTracking}
                    onChange={(e) => setShpTracking(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Parcel Weight (kg)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={shpWeight}
                    onChange={(e) => setShpWeight(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Carrier Cost (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={shpCarrierCost}
                    onChange={(e) => setShpCarrierCost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Service Handling Fee (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={shpServiceCharge}
                    onChange={(e) => setShpServiceCharge(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Destination</label>
                  <input
                    type="text"
                    value={shpDestination}
                    onChange={(e) => setShpDestination(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Order Ref</label>
                  <input
                    type="text"
                    value={shpOrderNumber}
                    onChange={(e) => setShpOrderNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowShpModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-md shadow-indigo-600/20"
                >
                  Save Dispatch Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
