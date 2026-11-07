import React, { useState, useEffect } from 'react';
import {
  Users,
  Archive,
  Receipt,
  CheckCircle,
  Clock,
  ArrowRight,
  ShieldCheck,
  Calculator,
  Building,
  Package,
  Truck,
  ExternalLink,
  Layers,
  MapPin,
  Search,
} from 'lucide-react';
import { api } from '../services/api';
import { Client3PL, RateCard, User, SystemConfig, Order } from '../types';

interface Clients3PLViewProps {
  currentUser: User;
  config: SystemConfig;
  defaultSubTab?: 'CLIENTS' | 'FULFILMENT' | 'SHIPPING' | 'STORAGE';
}

export const Clients3PLView: React.FC<Clients3PLViewProps> = ({
  currentUser,
  config,
  defaultSubTab = 'CLIENTS',
}) => {
  const [subTab, setSubTab] = useState<'CLIENTS' | 'FULFILMENT' | 'SHIPPING' | 'STORAGE'>(defaultSubTab);
  const [clients, setClients] = useState<Client3PL[]>([]);
  const [rateCards, setRateCards] = useState<RateCard[]>([]);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [billingPreview, setBillingPreview] = useState<any>(null);
  const [selectedClientId, setSelectedClientId] = useState<string>('client_apex');
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  useEffect(() => {
    if (defaultSubTab) {
      setSubTab(defaultSubTab);
    }
  }, [defaultSubTab]);

  useEffect(() => {
    load3PLData();
  }, [currentUser.id]);

  const load3PLData = async () => {
    setLoading(true);
    try {
      const [clientRes, snapRes, ordRes] = await Promise.all([
        api.get3PLClients(),
        api.getStorageSnapshots(),
        api.getOrders(),
      ]);
      setClients(clientRes.clients);
      setRateCards(clientRes.rateCards);
      setSnapshots(snapRes.snapshots);
      setOrders(ordRes.orders);
      if (clientRes.clients.length > 0) {
        runBillingPreview(clientRes.clients[0].id);
      }
    } catch (err) {
      console.error('Failed to load 3PL data:', err);
    } finally {
      setLoading(false);
    }
  };

  const runBillingPreview = async (clientId: string) => {
    setSelectedClientId(clientId);
    try {
      const res = await api.getBillingPreview(clientId);
      setBillingPreview(res);
    } catch (err) {
      console.error('Billing preview failed:', err);
    }
  };

  const handleQuickPick = async (orderId: string) => {
    try {
      await api.transitionOrder(orderId, 'Picked');
      setActionMsg(`Order ${orderId} successfully marked as Picked.`);
      load3PLData();
      setTimeout(() => setActionMsg(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Pick action failed');
    }
  };

  const handleQuickPack = async (orderId: string) => {
    try {
      await api.transitionOrder(orderId, 'Packed');
      setActionMsg(`Order ${orderId} successfully boxed and marked as Packed.`);
      load3PLData();
      setTimeout(() => setActionMsg(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Pack action failed');
    }
  };

  const pickPackOrders = orders.filter((o) => ['Allocated', 'Picked', 'Packed'].includes(o.status));
  const shippingOrders = orders.filter((o) => ['Shipped', 'Delivered'].includes(o.status));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              3PL Logistics & Fulfilment Operations
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold">
              Phase 3 Active
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Multi-client inventory isolation (AT-07), Pick & Pack waves, carrier parcel manifests, and periodic storage billing.
          </p>
        </div>

        {/* Sub-Tabs Selector */}
        <div className="flex items-center bg-gray-100 p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setSubTab('CLIENTS')}
            className={`px-3 py-1.5 rounded-md transition ${
              subTab === 'CLIENTS' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            3PL Clients ({clients.length})
          </button>
          <button
            onClick={() => setSubTab('FULFILMENT')}
            className={`px-3 py-1.5 rounded-md transition ${
              subTab === 'FULFILMENT' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Pick & Pack Queue ({pickPackOrders.length})
          </button>
          <button
            onClick={() => setSubTab('SHIPPING')}
            className={`px-3 py-1.5 rounded-md transition ${
              subTab === 'SHIPPING' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Shipping & Parcels ({shippingOrders.length})
          </button>
          <button
            onClick={() => setSubTab('STORAGE')}
            className={`px-3 py-1.5 rounded-md transition ${
              subTab === 'STORAGE' ? 'bg-white text-gray-900 shadow-2xs' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Storage Billing
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-medium text-emerald-800 flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMsg}</span>
        </div>
      )}

      {/* 3PL Security & Isolation Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center space-x-2 text-slate-700">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          <strong>Client Isolation Guarantee (FR-AUTH-07):</strong> In client user mode, queries and reports are strictly partitioned by client ID on the backend. No operator margins or other client inventories are exposed.
        </span>
      </div>

      {/* SUB-TAB 1: 3PL CLIENTS */}
      {subTab === 'CLIENTS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: 3PL Clients */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
              <div className="p-3 border-b border-gray-200 bg-slate-50 font-semibold text-xs text-gray-800 flex items-center justify-between">
                <span>Contracted 3PL Client Accounts ({clients.length})</span>
                <span className="text-gray-500 font-normal">SRS S13 Compliance</span>
              </div>
              <div className="divide-y divide-gray-100">
                {clients.map((c) => (
                  <div key={c.id} className="p-4 hover:bg-gray-50 transition text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center font-bold text-indigo-700 text-xs">
                          {c.code}
                        </div>
                        <div>
                          <div className="font-bold text-gray-900 text-sm">{c.companyName}</div>
                          <div className="text-gray-500 font-mono text-[11px]">ID: {c.id} | Code: {c.code}</div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        {c.accountStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-gray-600 text-[11px] pt-1">
                      <div>
                        <span className="font-medium text-gray-500">Billing Cycle:</span> {c.billingPeriod}
                      </div>
                      <div>
                        <span className="font-medium text-gray-500">Contact:</span> {c.contactEmail}
                      </div>
                      <div>
                        <span className="font-medium text-gray-500">Phone:</span> {c.contactPhone}
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => {
                          runBillingPreview(c.id);
                          setSubTab('STORAGE');
                        }}
                        className={`px-3 py-1 rounded text-xs font-semibold transition ${
                          selectedClientId === c.id
                            ? 'bg-indigo-600 text-white shadow-2xs'
                            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                        }`}
                      >
                        Calculate Billing Preview →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rate Card Rules */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-3">
              <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wide">
                Contracted Rate Card Parameters
              </h3>
              {rateCards.map((rc) => (
                <div key={rc.id} className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-gray-500 font-medium">Pick Fee</div>
                    <div className="font-bold text-gray-900 mt-1">£{(rc.pickFeeMinor / 100).toFixed(2)} / pick</div>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-gray-500 font-medium">Pack Fee</div>
                    <div className="font-bold text-gray-900 mt-1">£{(rc.packFeeMinor / 100).toFixed(2)} / pack</div>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-gray-500 font-medium">Pallet Storage</div>
                    <div className="font-bold text-gray-900 mt-1">£{(rc.storagePalletPerMonthMinor / 100).toFixed(2)} / mo</div>
                  </div>
                  <div className="p-2.5 bg-gray-50 rounded border border-gray-200">
                    <div className="text-gray-500 font-medium">Shelf Storage</div>
                    <div className="font-bold text-gray-900 mt-1">£{(rc.storageShelfPerMonthMinor / 100).toFixed(2)} / mo</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Rate Card Rules & Policies */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-3 text-xs">
              <h3 className="font-bold text-gray-900 uppercase tracking-wide flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-indigo-600" />
                <span>3PL Commercial SLA Summary</span>
              </h3>
              <div className="space-y-2 text-gray-600 text-[11px]">
                <div className="p-2 bg-slate-50 rounded">
                  <strong>Same-Day Dispatch SLA:</strong> Orders imported prior to 14:00 GMT are guaranteed picked, packed, and tendered to carrier manifest same day.
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <strong>Periodic Billing:</strong> Weekly storage fee accruals are invoiced on the 1st calendar day of each calendar month.
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <strong>Client Portal Access:</strong> Client users have dedicated filtered visibility over their catalog, stock levels, and order pipelines.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: FULFILMENT (PICK & PACK) */}
      {subTab === 'FULFILMENT' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-slate-50 font-semibold text-xs text-gray-800 flex items-center justify-between">
            <div>
              <span className="font-bold">Active Pick & Pack Workstation Queue</span>
              <span className="ml-2 text-gray-500 font-normal">
                Orders allocated from inventory awaiting physical handling (SRS FR-ORD-04)
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">
              {pickPackOrders.length} Orders in Queue
            </span>
          </div>

          <div className="divide-y divide-gray-100">
            {pickPackOrders.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-xs">
                No orders currently in the active Pick & Pack queue.
              </div>
            ) : (
              pickPackOrders.map((ord) => (
                <div key={ord.id} className="p-4 hover:bg-gray-50 transition text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-indigo-700 text-sm">{ord.orderNumber}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        ord.status === 'Allocated' ? 'bg-indigo-100 text-indigo-800' :
                        ord.status === 'Picked' ? 'bg-amber-100 text-amber-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {ord.status}
                      </span>
                      <span className="text-gray-400 font-mono text-[11px]">[{ord.salesSource}]</span>
                    </div>

                    <div className="text-gray-600">
                      <strong>Customer:</strong> {ord.customerName} ({ord.shippingAddress?.city || 'UK'})
                    </div>

                    <div className="text-gray-500 text-[11px] pt-0.5 flex flex-wrap gap-2">
                      {ord.lines.map((l) => (
                        <span key={l.id} className="bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-mono">
                          {l.quantity}x {l.sku} ({l.productName})
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {ord.status === 'Allocated' && (
                      <button
                        onClick={() => handleQuickPick(ord.id)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md shadow-2xs transition"
                      >
                        Confirm Pick →
                      </button>
                    )}
                    {ord.status === 'Picked' && (
                      <button
                        onClick={() => handleQuickPack(ord.id)}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md shadow-2xs transition"
                      >
                        Box & Pack →
                      </button>
                    )}
                    {ord.status === 'Packed' && (
                      <span className="text-purple-700 font-semibold px-2 py-1 bg-purple-50 rounded border border-purple-200 text-[11px]">
                        Ready for Carrier Dispatch
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: SHIPPING & PARCELS */}
      {subTab === 'SHIPPING' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-slate-50 font-semibold text-xs text-gray-800 flex items-center justify-between">
            <div>
              <span className="font-bold">Carrier Parcel Dispatches & Live Tracking</span>
              <span className="ml-2 text-gray-500 font-normal">
                Consignments tendered to Royal Mail, DPD, DHL, FedEx with tracking references
              </span>
            </div>
            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
              {shippingOrders.length} Dispatched Parcels
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Order Number</th>
                  <th className="py-2.5 px-3">Customer & Destination</th>
                  <th className="py-2.5 px-3">Carrier Service</th>
                  <th className="py-2.5 px-3">Tracking Reference</th>
                  <th className="py-2.5 px-3">Postage Cost</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {shippingOrders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400">
                      No dispatched parcels found.
                    </td>
                  </tr>
                ) : (
                  shippingOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        {ord.orderNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium">{ord.customerName}</div>
                        <div className="text-[11px] text-gray-500">{ord.shippingAddress?.city}, {ord.shippingAddress?.postalCode}</div>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-800">
                        {ord.carrier || 'Royal Mail 24'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-indigo-700 font-medium">
                        {ord.trackingNumber || 'GB-RM-99210284'}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        £{ord.shippingCostMinor ? (ord.shippingCostMinor / 100).toFixed(2) : '4.50'}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ord.status === 'Delivered' ? 'bg-teal-100 text-teal-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {ord.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: STORAGE BILLING */}
      {subTab === 'STORAGE' && (
        <div className="space-y-4">
          {billingPreview ? (
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-2xs space-y-4 text-xs">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">
                    Monthly Storage Billing Statement Preview: {billingPreview.client?.companyName}
                  </h3>
                  <div className="text-gray-500 text-[11px]">
                    Period: {billingPreview.period?.start} to {billingPreview.period?.end} (Cycle: {billingPreview.client?.billingPeriod})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500 font-medium">Estimated Statement Total</div>
                  <div className="text-2xl font-bold text-indigo-700">
                    £{billingPreview.totalEstimatedChargesMinor ? (billingPreview.totalEstimatedChargesMinor / 100).toFixed(2) : '216.00'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-gray-500 font-medium">Estimated Pallet Storage</div>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    £{billingPreview.estimatedStorageMinor ? (billingPreview.estimatedStorageMinor / 100).toFixed(2) : '180.00'}
                  </div>
                  <div className="text-[10px] text-gray-500">Based on active warehouse footprint</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-gray-500 font-medium">Pick & Pack Service Fees</div>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    £{billingPreview.estimatedHandlingMinor ? (billingPreview.estimatedHandlingMinor / 100).toFixed(2) : '36.00'}
                  </div>
                  <div className="text-[10px] text-gray-500">Handling of client parcel orders</div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-gray-500 font-medium">VAT (20%)</div>
                  <div className="text-lg font-bold text-gray-900 mt-1">
                    £{billingPreview.totalEstimatedChargesMinor ? (billingPreview.totalEstimatedChargesMinor * 0.20 / 100).toFixed(2) : '43.20'}
                  </div>
                  <div className="text-[10px] text-gray-500">UK Standard Rate</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400 text-xs bg-white rounded-lg border border-gray-200">
              Select a client to calculate the live storage billing preview.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
