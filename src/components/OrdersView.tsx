import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  CheckCircle,
  Truck,
  Package,
  Clock,
  XCircle,
  RotateCcw,
  Copy,
  ExternalLink,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { api } from '../services/api';
import { Order, OrderStatus, User, SystemConfig } from '../types';

interface OrdersViewProps {
  currentUser: User;
  config: SystemConfig;
  initialFilter?: any;
  onOpenNewOrder: () => void;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  currentUser,
  config,
  initialFilter,
  onOpenNewOrder,
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter?.status || 'ALL');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderHistories, setOrderHistories] = useState<any[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [carrierInput, setCarrierInput] = useState('Royal Mail');
  const [trackingInput, setTrackingInput] = useState('');
  const [shippingCostInput, setShippingCostInput] = useState('4.50');
  const [actionError, setActionError] = useState('');
  const [copiedRaw, setCopiedRaw] = useState(false);

  useEffect(() => {
    loadOrders();
  }, [statusFilter, currentUser.id]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.getOrders({
        status: statusFilter === 'PENDING_GROUP' ? undefined : statusFilter,
        search,
      });

      let list = res.orders;
      if (statusFilter === 'PENDING_GROUP') {
        const pending = ['New', 'Confirmed', 'Allocated', 'Picked', 'Packed'];
        list = list.filter((o) => pending.includes(o.status));
      }
      setOrders(list);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const openOrderDetail = async (orderId: string) => {
    setActionError('');
    try {
      const res = await api.getOrder(orderId);
      setSelectedOrder(res.order);
      setOrderHistories(res.histories);
      setShowDetailModal(true);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch order details');
    }
  };

  const handleTransition = async (targetStatus: OrderStatus) => {
    if (!selectedOrder) return;
    setActionError('');

    if (targetStatus === 'Shipped') {
      setShowDispatchModal(true);
      return;
    }

    try {
      const res = await api.transitionOrder(selectedOrder.id, targetStatus);
      setSelectedOrder(res.order);
      loadOrders();
    } catch (err: any) {
      setActionError(err.message || 'Failed to update order status');
    }
  };

  const handleDispatchConfirm = async () => {
    if (!selectedOrder) return;
    if (!trackingInput.trim()) {
      setActionError('Please enter a valid carrier tracking reference.');
      return;
    }

    try {
      const res = await api.transitionOrder(selectedOrder.id, 'Shipped', {
        carrier: carrierInput,
        trackingNumber: trackingInput.trim(),
        note: `Dispatched with ${carrierInput} - Tracking: ${trackingInput.trim()}`,
      });
      setSelectedOrder(res.order);
      setShowDispatchModal(false);
      loadOrders();
    } catch (err: any) {
      setActionError(err.message || 'Dispatch failed');
    }
  };

  const exportCsv = () => {
    const headers = ['Order #', 'Marketplace ID', 'Date', 'Customer', 'Status', 'Payment', 'Total GBP', 'Carrier', 'Tracking'];
    const rows = orders.map((o) => [
      `"${o.orderNumber}"`,
      `"${o.externalOrderId || ''}"`,
      `"${o.createdAt.split('T')[0]}"`,
      `"${o.customerName.replace(/"/g, '""')}"`,
      `"${o.status}"`,
      `"${o.paymentState}"`,
      `"${(o.totalMinor / 100).toFixed(2)}"`,
      `"${o.carrier || ''}"`,
      `"${o.trackingNumber || ''}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Orders_Export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'New':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-800 border border-gray-300">New</span>;
      case 'Confirmed':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">Confirmed</span>;
      case 'Allocated':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">Allocated</span>;
      case 'Picked':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">Picked</span>;
      case 'Packed':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">Packed</span>;
      case 'Shipped':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">Shipped</span>;
      case 'Delivered':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-100 text-teal-800 border border-teal-200">Delivered</span>;
      case 'Cancelled':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">Cancelled</span>;
      case 'Returned':
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-orange-100 text-orange-800 border border-orange-200">Returned</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-800">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Title & Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Order Management</h1>
          <p className="text-xs text-gray-500">
            Canonical order status lifecycle (SRS S7.1) with stock reservations and ledger dispatch tracking.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-2xs transition"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>Export CSV</span>
          </button>

          {currentUser.role !== 'CLIENT_USER' && currentUser.role !== 'VIEWER' && (
            <button
              onClick={onOpenNewOrder}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-2xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Manual Order</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadOrders()}
            placeholder="Search Order #, eBay ID, Buyer Name, SKU, Tracking #..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-gray-500 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-2.5 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_GROUP">Pending Pipeline (New → Packed)</option>
            <option value="New">New</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Allocated">Allocated</option>
            <option value="Picked">Picked</option>
            <option value="Packed">Packed</option>
            <option value="Shipped">Shipped</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Returned">Returned</option>
          </select>

          <button
            onClick={loadOrders}
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md font-medium"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Order Number</th>
                <th className="py-2.5 px-3">Channel / Source</th>
                <th className="py-2.5 px-3">Customer / Buyer</th>
                <th className="py-2.5 px-3">Date (UTC)</th>
                <th className="py-2.5 px-3">Items / SKUs</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Total (£)</th>
                <th className="py-2.5 px-3">Dispatch Details</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    No orders found matching the filter criteria.
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const hasBackorder = order.lines.some((l) => l.isBackordered);
                  return (
                    <tr key={order.id} className="hover:bg-gray-50/80 transition">
                      <td className="py-2.5 px-3 font-semibold text-gray-900">
                        <div className="flex items-center space-x-1.5">
                          <span>{order.orderNumber}</span>
                          {hasBackorder && (
                            <span
                              title="Insufficient stock: Line backordered"
                              className="px-1 rounded bg-rose-100 text-rose-700 text-[10px] font-bold"
                            >
                              Backorder
                            </span>
                          )}
                        </div>
                        {order.externalOrderId && (
                          <div className="text-[10px] font-mono text-gray-400">eBay: {order.externalOrderId}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            order.salesSource === 'EBAY'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {order.salesSource}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-gray-900">{order.customerName}</div>
                        <div className="text-[10px] text-gray-500 truncate max-w-[140px]">
                          {order.shippingAddress.city}, {order.shippingAddress.country}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-500 text-[11px]">
                        {order.createdAt.split('T')[0]}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-gray-900 font-medium">{order.lines.length} line item(s)</div>
                        <div className="text-[10px] text-gray-500 truncate max-w-[150px]">
                          {order.lines.map((l) => `${l.quantity}x ${l.sku}`).join(', ')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">{getStatusBadge(order.status)}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        £{(order.totalMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">
                        {order.trackingNumber ? (
                          <div className="text-gray-900 font-mono flex items-center gap-1">
                            <Truck className="w-3 h-3 text-emerald-600" />
                            <span>{order.trackingNumber}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 italic">Not dispatched</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => openOrderDetail(order.id)}
                          className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Detail</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Drawer / Modal (SRS FR-ORD-02 & Traceability) */}
      {showDetailModal && selectedOrder && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-200 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-lg font-bold text-gray-900">{selectedOrder.orderNumber}</h2>
                  {getStatusBadge(selectedOrder.status)}
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-800 font-mono font-medium">
                    {selectedOrder.salesSource}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Placed on {selectedOrder.createdAt.replace('T', ' ').split('.')[0]} UTC
                  {selectedOrder.externalOrderId && ` • eBay Reference: ${selectedOrder.externalOrderId}`}
                </p>
              </div>

              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-md"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Error banner inside modal */}
            {actionError && (
              <div className="mx-5 mt-4 p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}

            {/* Workflow Action Bar (SRS S6.1, S7.1) */}
            <div className="p-4 bg-indigo-50/60 border-b border-indigo-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-indigo-950 uppercase tracking-wide">
                Canonical Status Progression:
              </span>

              <div className="flex flex-wrap items-center gap-1.5">
                {selectedOrder.status === 'New' && (
                  <button
                    onClick={() => handleTransition('Confirmed')}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-2xs transition"
                  >
                    Confirm & Reserve Stock
                  </button>
                )}

                {selectedOrder.status === 'Confirmed' && (
                  <button
                    onClick={() => handleTransition('Allocated')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-2xs transition"
                  >
                    Allocate to Pick List
                  </button>
                )}

                {selectedOrder.status === 'Allocated' && (
                  <button
                    onClick={() => handleTransition('Picked')}
                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md shadow-2xs transition"
                  >
                    Mark Picked
                  </button>
                )}

                {selectedOrder.status === 'Picked' && (
                  <button
                    onClick={() => handleTransition('Packed')}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md shadow-2xs transition"
                  >
                    Confirm Packed & Parcel Box
                  </button>
                )}

                {selectedOrder.status === 'Packed' && (
                  <button
                    onClick={() => handleTransition('Shipped')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md shadow-2xs transition flex items-center gap-1"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch & Post Stock Relief (FR-SHIP-03)</span>
                  </button>
                )}

                {selectedOrder.status === 'Shipped' && (
                  <button
                    onClick={() => handleTransition('Delivered')}
                    className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-md shadow-2xs transition"
                  >
                    Mark Delivered
                  </button>
                )}

                {/* Cancel action */}
                {!['Shipped', 'Delivered', 'Cancelled', 'Returned'].includes(selectedOrder.status) && (
                  <button
                    onClick={() => handleTransition('Cancelled')}
                    className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold rounded-md transition"
                  >
                    Cancel Order (Release Reservations)
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 space-y-6">
              {/* Customer & Address Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="font-bold text-gray-900 mb-1.5 uppercase tracking-wide">
                    Buyer & Customer Record
                  </div>
                  <div className="space-y-1 text-gray-700">
                    <div>
                      <span className="text-gray-500 font-medium">Name:</span> {selectedOrder.customerName}
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Email:</span> {selectedOrder.customerEmail}
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Payment State:</span>{' '}
                      <span className="font-semibold text-emerald-700">{selectedOrder.paymentState}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="font-bold text-gray-900 mb-1.5 uppercase tracking-wide">
                    Shipping & Delivery Address
                  </div>
                  <div className="space-y-0.5 text-gray-700 font-mono text-[11px]">
                    <div>{selectedOrder.shippingAddress.name}</div>
                    <div>{selectedOrder.shippingAddress.street}</div>
                    <div>
                      {selectedOrder.shippingAddress.city}, {selectedOrder.shippingAddress.postalCode}
                    </div>
                    <div>{selectedOrder.shippingAddress.country}</div>
                  </div>
                </div>
              </div>

              {/* Order Lines Table */}
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                  Order Line Items ({selectedOrder.lines.length})
                </h3>
                <table className="w-full text-left text-xs border border-gray-200 rounded-md overflow-hidden">
                  <thead className="bg-slate-100 text-gray-600 font-semibold text-[11px]">
                    <tr>
                      <th className="py-2 px-3">SKU</th>
                      <th className="py-2 px-3">Product Name</th>
                      <th className="py-2 px-3">Qty</th>
                      <th className="py-2 px-3">Reserved</th>
                      <th className="py-2 px-3">Unit Price (£)</th>
                      <th className="py-2 px-3">VAT (£)</th>
                      <th className="py-2 px-3 text-right">Line Total (£)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedOrder.lines.map((l) => (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="py-2 px-3 font-mono font-semibold text-indigo-700">{l.sku}</td>
                        <td className="py-2 px-3 text-gray-900 font-medium">{l.productName}</td>
                        <td className="py-2 px-3">{l.quantity}</td>
                        <td className="py-2 px-3">
                          <span className={l.reservedQuantity > 0 ? 'text-emerald-700 font-bold' : 'text-gray-400'}>
                            {l.reservedQuantity}
                          </span>
                          {l.isBackordered && (
                            <span className="ml-1 text-[10px] text-rose-600 font-semibold">(Backordered)</span>
                          )}
                        </td>
                        <td className="py-2 px-3">£{(l.unitPriceMinor / 100).toFixed(2)}</td>
                        <td className="py-2 px-3 text-gray-500">£{(l.taxAmountMinor / 100).toFixed(2)}</td>
                        <td className="py-2 px-3 text-right font-bold text-gray-900">
                          £{(l.totalPriceMinor / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold border-t border-gray-200">
                    <tr>
                      <td colSpan={6} className="py-2 px-3 text-right text-gray-700">
                        Total Order Amount:
                      </td>
                      <td className="py-2 px-3 text-right text-sm text-gray-900">
                        £{(selectedOrder.totalMinor / 100).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Status History Audit Trail (SRS FR-ORD-02) */}
              <div>
                <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide mb-2">
                  Order Status Transition History
                </h3>
                <div className="bg-slate-50 border border-gray-200 rounded-lg p-3 space-y-2">
                  {orderHistories.map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-xs border-b border-gray-200/60 pb-1.5 last:border-0 last:pb-0">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                        <span className="font-semibold text-gray-900">
                          {h.fromStatus ? `${h.fromStatus} → ` : ''}{h.toStatus}
                        </span>
                        <span className="text-gray-500">• {h.note}</span>
                      </div>
                      <div className="text-[11px] text-gray-400 font-mono">
                        {h.timestamp.replace('T', ' ').split('.')[0]} ({h.changedBy})
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw eBay JSON Payload Traceability (SRS FR-EBAY-05) */}
              {selectedOrder.rawPayload && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                      Original Marketplace Payload (Audit Traceability)
                    </h3>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(selectedOrder.rawPayload, null, 2));
                        setCopiedRaw(true);
                        setTimeout(() => setCopiedRaw(false), 2000);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedRaw ? 'Copied!' : 'Copy Raw JSON'}</span>
                    </button>
                  </div>
                  <pre className="bg-slate-900 text-slate-100 p-3 rounded-lg text-[10px] font-mono max-h-40 overflow-y-auto">
                    {JSON.stringify(selectedOrder.rawPayload, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-md text-xs transition"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch & Shipping Modal (FR-SHIP-01, FR-SHIP-03) */}
      {showDispatchModal && selectedOrder && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Dispatch Order {selectedOrder.orderNumber}</h3>
              </div>
              <button onClick={() => setShowDispatchModal(false)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-xs text-gray-600">
              Confirming dispatch permanently deducts physical units from the <strong>append-only Stock Ledger</strong> and posts <strong>COGS</strong> to the Financial Ledger (AT-04).
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Carrier Provider</label>
                <select
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2 bg-white"
                >
                  <option value="Royal Mail">Royal Mail Tracked 24/48</option>
                  <option value="DPD UK">DPD Express Logistics</option>
                  <option value="Evri">Evri Parcel Courier</option>
                  <option value="DHL Express">DHL Express Global</option>
                  <option value="FedEx">FedEx International</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Tracking Number / Barcode</label>
                <input
                  type="text"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="e.g. GB982103841RM or DPD-881923"
                  className="w-full border border-gray-300 rounded-md p-2 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Carrier Postage Cost (£)</label>
                <input
                  type="number"
                  step="0.01"
                  value={shippingCostInput}
                  onChange={(e) => setShippingCostInput(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-2"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setShowDispatchModal(false)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-md text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleDispatchConfirm}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md text-xs shadow-2xs"
              >
                Confirm Dispatch & Relieve Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
