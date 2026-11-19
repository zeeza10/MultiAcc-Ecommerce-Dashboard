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
  RateCard,
  User,
} from '../types';
import { api } from '../services/api';

interface WarehouseServicesViewProps {
  currentUser: User;
  selectedStoreId: string;
}

export const WarehouseServicesView: React.FC<WarehouseServicesViewProps> = ({ currentUser, selectedStoreId }) => {
  const canManageFulfilment = currentUser.role !== 'CLIENT_USER' && currentUser.role !== 'VIEWER';
  const [activeTab, setActiveTab] = useState<'storage' | 'packaging' | 'shipping' | 'billing'>('storage');
  const [summary, setSummary] = useState<any>(null);
  const [packagingJobs, setPackagingJobs] = useState<WarehousePackagingJob[]>([]);
  const [shippingJobs, setShippingJobs] = useState<WarehouseShippingJob[]>([]);
  const [clients, setClients] = useState<Client3PL[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [storageSnapshots, setStorageSnapshots] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [stockLedger, setStockLedger] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [currency, setCurrency] = useState('GBP');
  const [loading, setLoading] = useState(true);

  // New Job Modals
  const [showPkgModal, setShowPkgModal] = useState(false);
  const [showShpModal, setShowShpModal] = useState(false);

  // Form states for Packaging Job
  const [pkgClientId, setPkgClientId] = useState('');
  const [pkgType, setPkgType] = useState<'CUSTOM_BOX' | 'BUBBLE_MAILER' | 'PALLET_WRAP' | 'FRAGILE_PREP'>('CUSTOM_BOX');
  const [pkgQty, setPkgQty] = useState(1);
  const [pkgMaterialCost, setPkgMaterialCost] = useState('');
  const [pkgOrderNumber, setPkgOrderNumber] = useState('');
  const [pkgNotes, setPkgNotes] = useState('');

  // Form states for Shipping Job
  const [shpClientId, setShpClientId] = useState('');
  const [shpCarrier, setShpCarrier] = useState('');
  const [shpTracking, setShpTracking] = useState('');
  const [shpServiceLevel, setShpServiceLevel] = useState('');
  const [shpWeight, setShpWeight] = useState('');
  const [shpCarrierCost, setShpCarrierCost] = useState('');
  const [shpServiceCharge, setShpServiceCharge] = useState('');
  const [shpDestination, setShpDestination] = useState('');
  const [shpOrderNumber, setShpOrderNumber] = useState('');

  useEffect(() => {
    loadData();
  }, [currentUser.id, selectedStoreId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sumRes, pkgRes, shpRes, clientRes, storageRes, productRes, balanceRes, ledgerRes, invoiceRes, configRes] = await Promise.all([
        api.getWarehouseServicesSummary(selectedStoreId), api.getPackagingJobs(selectedStoreId), api.getShippingJobs(selectedStoreId), api.get3PLClients(selectedStoreId),
        api.getStorageSnapshots(selectedStoreId), api.getProducts(selectedStoreId), api.getBalances(selectedStoreId), api.getStockLedger(selectedStoreId), api.getInvoices(selectedStoreId), api.getConfig(),
      ]);
      setSummary(sumRes.summary || sumRes);
      setPackagingJobs(pkgRes.packagingJobs || []);
      setShippingJobs(shpRes.shippingJobs || []);
      setClients(clientRes.clients || []);
      setPkgClientId((current) => clientRes.clients.some((client) => client.id === current) ? current : (clientRes.clients[0]?.id || ''));
      setShpClientId((current) => clientRes.clients.some((client) => client.id === current) ? current : (clientRes.clients[0]?.id || ''));
      setRateCards(clientRes.rateCards || []);
      setStorageSnapshots(storageRes.snapshots || []);
      setProducts(productRes.products || []);
      setBalances(balanceRes.balances || []);
      setStockLedger(ledgerRes.ledger || []);
      setInvoices(invoiceRes.invoices || []);
      setCurrency(String(configRes.config?.baseCurrency || 'GBP').toUpperCase());
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

  const formatMoney = (minor: number, currencyCode = currency) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: currencyCode }).format((Number(minor) || 0) / 100);
  const totalAvailable = balances.reduce((sum, row) => sum + Number(row.available || 0), 0);
  const totalReserved = balances.reduce((sum, row) => sum + Number(row.reserved || 0), 0);
  const totalDamaged = balances.reduce((sum, row) => sum + Number(row.damaged || 0), 0);
  const clientStorageRows = storageSnapshots.map(snapshot => {
    const client = clients.find(item => item.id === snapshot.clientId);
    const clientBalances = balances.filter(item => item.ownerId === snapshot.clientId);
    const clientProducts = products.filter(item => item.ownerType === 'CLIENT' && item.ownerId === snapshot.clientId);
    const locations = [...new Set(stockLedger.filter(item => item.ownerId === snapshot.clientId && item.locationCode).map(item => item.locationCode))];
    return {
      id: snapshot.id, clientName: client?.companyName || 'Unknown client', code: client?.code || '—',
      skuCount: clientProducts.length, skus: clientProducts.map(item => item.sku).join(', ') || '—',
      locations: locations.join(', ') || '—',
      onHand: clientBalances.reduce((sum, item) => sum + Number(item.onHand || 0), 0),
      available: clientBalances.reduce((sum, item) => sum + Number(item.available || 0), 0),
      reserved: clientBalances.reduce((sum, item) => sum + Number(item.reserved || 0), 0),
      damaged: clientBalances.reduce((sum, item) => sum + Number(item.damaged || 0), 0),
      snapshotDate: snapshot.snapshotDate, estimatedCostMinor: Number(snapshot.estimatedCostMinor || 0),
    };
  });
  const clientBillingRows = clients.map(client => {
    const storage = storageSnapshots.filter(item => item.clientId === client.id).reduce((sum, item) => sum + Number(item.estimatedCostMinor || 0), 0);
    const packaging = packagingJobs.filter(item => item.clientId === client.id).reduce((sum, item) => sum + Number(item.totalChargeMinor || 0), 0);
    const shipping = shippingJobs.filter(item => item.clientId === client.id).reduce((sum, item) => sum + Number(item.totalChargeMinor || 0), 0);
    const clientInvoices = invoices.filter(item => item.recipientId === client.id);
    const billed = clientInvoices.reduce((sum, item) => sum + Number(item.totalMinor || 0), 0);
    const paid = clientInvoices.reduce((sum, item) => sum + Number(item.paidAmountMinor || 0), 0);
    const balance = Math.max(0, billed - paid);
    return { id: client.id, companyName: client.companyName, code: client.code, storage, packaging, shipping, billed, paid, balance,
      status: billed === 0 ? 'NOT BILLED' : balance === 0 ? 'SETTLED' : paid > 0 ? 'PARTIAL' : 'DUE' };
  });
  const storageRates = rateCards.flatMap(card => [card.storagePalletPerMonthMinor, card.storageShelfPerMonthMinor, card.storageBinPerMonthMinor].map(Number).filter(value => Number.isFinite(value) && value > 0));
  const minStorageRate = storageRates.length ? Math.min(...storageRates) : 0;
  const maxStorageRate = storageRates.length ? Math.max(...storageRates) : 0;
  const selectedPkgClient = clients.find(client => client.id === pkgClientId);
  const selectedPkgRate = rateCards.find(card => card.id === selectedPkgClient?.rateCardId);
  const estimatedPackagingServiceMinor = Number(selectedPkgRate?.packFeeMinor || 0) * pkgQty
    + Number(selectedPkgRate?.extraItemFeeMinor || 0) * Math.max(0, pkgQty - 1);

  const handleCreatePackagingJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find((c) => c.id === pkgClientId);
    try {
      const materialCost = Number.parseFloat(pkgMaterialCost);
      if (!pkgClientId || !Number.isSafeInteger(pkgQty) || pkgQty <= 0 || !Number.isFinite(materialCost) || materialCost < 0) {
        alert('Select a client and enter a valid quantity and material cost.');
        return;
      }
      const matCostMinor = Math.round(materialCost * 100);
      await api.createPackagingJob({
        clientId: pkgClientId,
        clientName: client?.companyName || '3PL Partner',
        packagingType: pkgType,
        quantity: pkgQty,
        materialCostMinor: matCostMinor,
        orderNumber: pkgOrderNumber || undefined,
        notes: pkgNotes,
        performedBy: currentUser.name,
      }, selectedStoreId);
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
      const weight = Number.parseFloat(shpWeight);
      const carrierCost = Number.parseFloat(shpCarrierCost || '0');
      const serviceCharge = Number.parseFloat(shpServiceCharge || '0');
      if (!shpClientId || !shpCarrier || !shpServiceLevel || !shpDestination.trim() ||
          !Number.isFinite(weight) || weight <= 0 ||
          !Number.isFinite(carrierCost) || carrierCost < 0 ||
          !Number.isFinite(serviceCharge) || serviceCharge < 0) {
        alert('Select a client, carrier and service level; enter a valid weight, destination and non-negative charges.');
        return;
      }
      const carCostMinor = Math.round(carrierCost * 100);
      const srvChargeMinor = Math.round(serviceCharge * 100);
      await api.createShippingJob({
        clientId: shpClientId,
        clientName: client?.companyName || '3PL Partner',
        carrier: shpCarrier,
        trackingNumber: shpTracking || `GB-${Date.now().toString().slice(-8)}TRK`,
        serviceLevel: shpServiceLevel,
        parcelWeightKg: weight,
        carrierCostMinor: carCostMinor,
        serviceChargeMinor: srvChargeMinor,
        totalChargeMinor: carCostMinor + srvChargeMinor,
        destination: shpDestination,
        orderNumber: shpOrderNumber,
      }, selectedStoreId);
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
              Warehouse Services
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
          {canManageFulfilment && <button
            onClick={() => setShowPkgModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
          >
            <PackageCheck className="w-4 h-4 text-indigo-500" />
            <span>Record Packaging Job</span>
          </button>}
          {canManageFulfilment && <button
            onClick={() => setShowShpModal(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition shadow-xs shadow-indigo-600/20"
          >
            <Truck className="w-4 h-4" />
            <span>Record Outbound Dispatch</span>
          </button>}
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
            {formatMoney(summary?.storageEstimatedCostMinor ?? 0)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{clients.filter(client => client.accountStatus === 'ACTIVE').length} Active 3PL Clients Stored</span>
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
            {formatMoney(summary?.packagingChargesMinor ?? 0)}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 mt-2">
            <span>{packagingJobs.reduce((sum, job) => sum + Number(job.quantity || 0), 0)} units packaged & wrapped</span>
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
            {formatMoney(summary?.shippingChargesMinor ?? 0)}
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
            {formatMoney(invoices.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.totalMinor || 0) - Number(invoice.paidAmountMinor || 0)), 0))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-2">
            <span>Paid: {formatMoney(invoices.reduce((sum, invoice) => sum + Number(invoice.paidAmountMinor || 0), 0))}</span>
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
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Multi-Client Storage & Inventory</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Client stock and storage snapshots are ready.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Client SKUs</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{products.filter(item => item.ownerType === 'CLIENT').length}</div>
                <div className="text-[11px] text-slate-500 mt-1">{clients.length} client accounts</div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Physical Stock Status</div>
                <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{totalAvailable} Available / {totalReserved} Reserved</div>
                <div className="text-[11px] text-slate-500 mt-1">{totalDamaged} damaged units</div>
              </div>
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">Monthly Storage Rates</div>
                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{formatMoney(minStorageRate)} – {formatMoney(maxStorageRate)}</div>
                <div className="text-[11px] text-slate-500 mt-1">Lowest to highest configured unit rate</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr><th className="py-2.5 px-3 w-12">#</th><th className="py-2.5 px-3">Client</th><th className="py-2.5 px-3">SKUs</th><th className="py-2.5 px-3">Location Bins</th><th className="py-2.5 px-3 text-center">On Hand</th><th className="py-2.5 px-3 text-center">Available</th><th className="py-2.5 px-3 text-center">Reserved</th><th className="py-2.5 px-3 text-center">Damaged</th><th className="py-2.5 px-3 text-right">Storage Estimate</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {clientStorageRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td><td className="py-3 px-3"><div className="font-semibold text-slate-900 dark:text-slate-100">{row.clientName}</div><div className="text-[10px] text-slate-400">{row.code} · {row.snapshotDate}</div></td>
                      <td className="py-3 px-3"><div className="font-medium">{row.skuCount} SKUs</div><div className="text-[10px] text-slate-400 max-w-[220px] truncate" title={row.skus}>{row.skus}</div></td>
                      <td className="py-3 px-3 font-mono text-[11px]">{row.locations}</td>
                      <td className="py-3 px-3 text-center">{row.onHand}</td><td className="py-3 px-3 text-center font-bold text-emerald-600">{row.available}</td><td className="py-3 px-3 text-center text-amber-600">{row.reserved}</td><td className="py-3 px-3 text-center text-rose-500">{row.damaged}</td><td className="py-3 px-3 text-right font-mono">{formatMoney(row.estimatedCostMinor)}</td>
                    </tr>
                  ))}
                  {clientStorageRows.length === 0 && <tr><td colSpan={9} className="py-8 text-center text-slate-500">No storage snapshots are recorded in the database yet.</td></tr>}
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
              {canManageFulfilment && <button
                onClick={() => setShowPkgModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Packaging Record</span>
              </button>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12">#</th><th className="py-2.5 px-3">Job ID</th>
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
                  {packagingJobs.map((j, index) => (
                    <tr key={j.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td>
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
                        {formatMoney(j.materialCostMinor, currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-500">
                        {formatMoney(j.serviceChargeMinor, currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(j.totalChargeMinor, currency)}
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
              {canManageFulfilment && <button
                onClick={() => setShowShpModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-md transition shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Dispatch Job</span>
              </button>}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3 w-12">#</th><th className="py-2.5 px-3">Dispatch ID</th>
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
                  {shippingJobs.map((s, index) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td>
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
                        {formatMoney(s.carrierCostMinor, currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatMoney(s.serviceChargeMinor, currency)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(s.totalChargeMinor, currency)}
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
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Client-Wise Billing & Settlement</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Service activity and invoice balances calculated from stored storage, packaging, shipping and invoice records.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
                  <tr><th className="py-2.5 px-3 w-12">#</th><th className="py-2.5 px-3">Client Company</th><th className="py-2.5 px-3">Account Code</th><th className="py-2.5 px-3 text-right">Storage</th><th className="py-2.5 px-3 text-right">Packaging</th><th className="py-2.5 px-3 text-right">Shipping</th><th className="py-2.5 px-3 text-right">Invoiced Total</th><th className="py-2.5 px-3 text-right">Paid</th><th className="py-2.5 px-3 text-right">Balance Due</th><th className="py-2.5 px-3 text-center">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {clientBillingRows.map((row, index) => (
                    <tr key={row.id}>
                      <td className="py-3 px-3 text-slate-400 font-mono tabular-nums">{index + 1}</td><td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">{row.companyName}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{row.code}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatMoney(row.storage)}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatMoney(row.packaging)}</td>
                      <td className="py-3 px-3 text-right font-mono">{formatMoney(row.shipping)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold">{formatMoney(row.billed)}</td>
                      <td className="py-3 px-3 text-right font-mono text-emerald-600">{formatMoney(row.paid)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold">{formatMoney(row.balance)}</td>
                      <td className="py-3 px-3 text-center"><span className="px-2 py-0.5 rounded text-[10px] font-semibold">{row.status}</span></td>
                    </tr>
                  ))}
                  {clientBillingRows.length === 0 && <tr><td colSpan={10} className="py-8 text-center text-slate-500">No 3PL billing records are available.</td></tr>}
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
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <label className="block text-slate-400 mb-1">Rate-Card Service Fee</label>
                  <div className="text-sm font-semibold text-indigo-300">{formatMoney(estimatedPackagingServiceMinor)}</div>
                  <p className="text-[10px] text-slate-500 mt-1">Calculated from the selected client's saved rate card when the job is submitted.</p>
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
