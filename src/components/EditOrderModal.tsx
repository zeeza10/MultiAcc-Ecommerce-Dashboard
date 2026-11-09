import React, { useState } from 'react';
import {
  X,
  AlertCircle,
  Save,
  Plus,
  Trash2,
  Lock,
  FileText,
  DollarSign,
  ShieldAlert,
} from 'lucide-react';
import { Order, Product, User } from '../types';
import { api } from '../services/api';

interface EditOrderModalProps {
  order: Order;
  products: Product[];
  currentUser: User | null;
  onClose: () => void;
  onSuccess: (updatedOrder: Order) => void;
}

interface EditableLine {
  sku: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
}

export const EditOrderModal: React.FC<EditOrderModalProps> = ({
  order,
  products,
  currentUser,
  onClose,
  onSuccess,
}) => {
  const isLocked = ['Shipped', 'Delivered'].includes(order.status);

  // Form State
  const [customerName, setCustomerName] = useState(order.customerName || '');
  const [customerEmail, setCustomerEmail] = useState(order.customerEmail || '');
  const [street, setStreet] = useState(order.shippingAddress?.street || '');
  const [city, setCity] = useState(order.shippingAddress?.city || '');
  const [postalCode, setPostalCode] = useState(order.shippingAddress?.postalCode || '');
  const [country, setCountry] = useState(order.shippingAddress?.country || 'GB');
  const [status, setStatus] = useState<string>(order.status);
  const [notes, setNotes] = useState(order.notes || '');
  const [reason, setReason] = useState('');
  const [shippingFeeMinor, setShippingFeeMinor] = useState(order.shippingChargeMinor || 0);

  const [lines, setLines] = useState<EditableLine[]>(
    order.lines.map((l) => ({
      sku: l.sku,
      productName: l.productName,
      quantity: l.quantity,
      unitPriceMinor: l.unitPriceMinor,
    }))
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculations
  const subtotalMinor = lines.reduce((acc, l) => acc + l.quantity * l.unitPriceMinor, 0);
  const vatMinor = Math.round(subtotalMinor * 0.2);
  const totalMinor = subtotalMinor + shippingFeeMinor;

  const handleAddLine = () => {
    if (isLocked) return;
    const firstProd = products[0];
    if (firstProd) {
      setLines([
        ...lines,
        {
          sku: firstProd.sku,
          productName: firstProd.name,
          quantity: 1,
          unitPriceMinor: firstProd.sellingPriceMinor,
        },
      ]);
    }
  };

  const handleRemoveLine = (idx: number) => {
    if (isLocked || lines.length <= 1) return;
    setLines(lines.filter((_, i) => i !== idx));
  };

  const handleProductChange = (idx: number, sku: string) => {
    const prod = products.find((p) => p.sku === sku);
    if (!prod) return;
    const newLines = [...lines];
    newLines[idx] = {
      ...newLines[idx],
      sku: prod.sku,
      productName: prod.name,
      unitPriceMinor: prod.sellingPriceMinor,
    };
    setLines(newLines);
  };

  const handleQtyChange = (idx: number, qty: number) => {
    if (qty < 1) return;
    const newLines = [...lines];
    newLines[idx].quantity = qty;
    setLines(newLines);
  };

  const handlePriceChange = (idx: number, priceMajor: number) => {
    const newLines = [...lines];
    newLines[idx].unitPriceMinor = Math.max(0, Math.round(priceMajor * 100));
    setLines(newLines);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason.trim()) {
      setError('Audit reason is required for compliance recording.');
      return;
    }

    if (lines.length === 0) {
      setError('Order must contain at least one line item.');
      return;
    }

    try {
      setSaving(true);
      const payload: any = {
        customerName,
        customerEmail,
        shippingAddress: {
          name: customerName,
          street,
          city,
          postalCode,
          country,
        },
        shippingFeeMinor,
        notes,
        reason,
        status,
      };

      if (!isLocked) {
        payload.items = lines.map((l) => ({
          sku: l.sku,
          quantity: l.quantity,
          unitPriceMinor: l.unitPriceMinor,
        }));
      }

      const res = await api.editOrder(order.id, payload);
      onSuccess(res.order);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full shadow-2xl max-h-[90vh] flex flex-col my-auto text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 rounded-t-xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Edit Order <span className="text-indigo-400 font-mono text-sm">{order.orderNumber}</span>
              </h2>
              <p className="text-xs text-slate-400">
                Audited modification • Actor: {currentUser?.name || 'Administrator'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-start gap-3 text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>{error}</div>
            </div>
          )}

          {isLocked && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3 text-amber-300 text-sm">
              <Lock className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-medium">Order Dispatched / Delivered</p>
                <p className="text-xs text-amber-300/80 mt-0.5">
                  Physical stock relief has posted to the immutable ledger. Line items, quantities, and financial postings are locked to protect GAAP accounting. Customer contact details and delivery notes may still be amended.
                </p>
              </div>
            </div>
          )}

          {/* Section: Customer Information */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              Customer & Recipient
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Customer / Recipient Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Customer Email</label>
                <input
                  type="email"
                  required
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="block text-xs text-slate-400 mb-1">Street Address</label>
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Postal Code</label>
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Section: Line Items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                Order Items & Quantity {isLocked && <Lock className="w-3.5 h-3.5 text-amber-400" />}
              </h3>
              {!isLocked && (
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              )}
            </div>

            <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 text-left">
                    <th className="py-2.5 px-3">Product / SKU</th>
                    <th className="py-2.5 px-3 w-20 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-28 text-right">Unit Price</th>
                    <th className="py-2.5 px-3 w-28 text-right">Total</th>
                    {!isLocked && <th className="py-2.5 px-3 w-10"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {lines.map((l, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/20">
                      <td className="py-2.5 px-3">
                        {isLocked ? (
                          <div>
                            <div className="font-medium text-slate-200">{l.productName}</div>
                            <div className="text-slate-500 font-mono text-[11px]">{l.sku}</div>
                          </div>
                        ) : (
                          <select
                            value={l.sku}
                            onChange={(e) => handleProductChange(idx, e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.sku}>
                                {p.sku} — {p.name} (£{(p.sellingPriceMinor / 100).toFixed(2)})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isLocked ? (
                          <span className="font-semibold text-slate-200">{l.quantity}</span>
                        ) : (
                          <input
                            type="number"
                            min="1"
                            value={l.quantity}
                            onChange={(e) => handleQtyChange(idx, parseInt(e.target.value) || 1)}
                            className="w-16 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-center text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {isLocked ? (
                          <span className="text-slate-300">£{(l.unitPriceMinor / 100).toFixed(2)}</span>
                        ) : (
                          <div className="relative">
                            <span className="absolute left-2 top-1.5 text-slate-500">£</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={(l.unitPriceMinor / 100).toFixed(2)}
                              onChange={(e) => handlePriceChange(idx, parseFloat(e.target.value) || 0)}
                              className="w-24 bg-slate-900 border border-slate-700 rounded pl-5 pr-2 py-1.5 text-right text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-200">
                        £{((l.quantity * l.unitPriceMinor) / 100).toFixed(2)}
                      </td>
                      {!isLocked && (
                        <td className="py-2.5 px-3 text-center">
                          {lines.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Financials & Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Order Status</label>
                <select
                  disabled={isLocked}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                >
                  <option value="New">New</option>
                  <option value="Confirmed">Confirmed</option>
                  <option value="Allocated">Allocated</option>
                  <option value="Picked">Picked</option>
                  <option value="Packed">Packed</option>
                  <option value="Shipped">Shipped</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Shipping Fee (£)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isLocked}
                  value={(shippingFeeMinor / 100).toFixed(2)}
                  onChange={(e) => setShippingFeeMinor(Math.round((parseFloat(e.target.value) || 0) * 100))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Order Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions or handling notes..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>
            </div>

            {/* Live Financial Summary */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Financial Recalculation
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Subtotal:</span>
                    <span className="font-mono text-slate-200">£{(subtotalMinor / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>VAT (20%):</span>
                    <span className="font-mono text-slate-200">£{(vatMinor / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Shipping Charged:</span>
                    <span className="font-mono text-slate-200">£{(shippingFeeMinor / 100).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-slate-800 pt-2 flex justify-between font-semibold text-sm">
                    <span className="text-slate-200">Grand Total:</span>
                    <span className="font-mono text-emerald-400">£{(totalMinor / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400">
                <span>Inventory Reservation: </span>
                <span className="text-indigo-300 font-medium">
                  {lines.reduce((acc, l) => acc + l.quantity, 0)} units total
                </span>
              </div>
            </div>
          </div>

          {/* Mandatory Reason for Audit Log */}
          <div className="pt-2 border-t border-slate-800">
            <label className="block text-xs font-medium text-amber-300 mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Reason for Amendment <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g., Customer requested SKU upgrade, address corrected before dispatch..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-400"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Required for compliance. This reason will be stamped into the permanent immutable audit log with your user identity.
            </p>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-colors"
            >
              {saving ? (
                <>Saving & Posting...</>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" /> Save Changes
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
