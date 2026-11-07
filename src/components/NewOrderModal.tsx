import React, { useState, useEffect } from 'react';
import { ShoppingCart, XCircle, Plus, Trash2 } from 'lucide-react';
import { api } from '../services/api';
import { Product, User, SystemConfig } from '../types';

interface NewOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  config: SystemConfig;
  onSuccess: () => void;
}

export const NewOrderModal: React.FC<NewOrderModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  config,
  onSuccess,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [customerName, setCustomerName] = useState('TechWorld Retailers');
  const [customerEmail, setCustomerEmail] = useState('procurement@techworld.co.uk');
  const [street, setStreet] = useState('14 Bishopsgate');
  const [city, setCity] = useState('London');
  const [postalCode, setPostalCode] = useState('EC2N 4AY');
  const [lines, setLines] = useState<{ productId: string; quantity: number }[]>([]);
  const [notes, setNotes] = useState('Wholesale direct invoice order');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    try {
      const res = await api.getProducts();
      setProducts(res.products);
      if (res.products.length > 0 && lines.length === 0) {
        setLines([{ productId: res.products[0].id, quantity: 1 }]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const handleAddLine = () => {
    if (products.length > 0) {
      setLines([...lines, { productId: products[0].id, quantity: 1 }]);
    }
  };

  const handleRemoveLine = (index: number) => {
    setLines(lines.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    if (lines.length === 0) {
      setErrorMsg('At least one line item is required.');
      setSubmitting(false);
      return;
    }

    try {
      const payloadLines = lines.map((l) => {
        const prod = products.find((p) => p.id === l.productId);
        return {
          productId: l.productId,
          sku: prod?.sku || 'SKU',
          productName: prod?.name || 'Product',
          quantity: l.quantity,
          unitPriceMinor: prod?.sellingPriceMinor || 2000,
        };
      });

      await api.createOrder({
        salesSource: 'MANUAL',
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        shippingAddress: {
          name: customerName,
          street,
          city,
          postalCode,
          country: 'United Kingdom',
        },
        lines: payloadLines,
        notes,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center space-x-2">
            <ShoppingCart className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Create Direct / Phone Order (FR-ORD-08)</h3>
          </div>
          <button onClick={onClose}>
            <XCircle className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Customer / Buyer Name *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-gray-300 rounded p-1.5"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Customer Email *</label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full border border-gray-300 rounded p-1.5"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block font-semibold text-gray-700 mb-1">Street Address</label>
              <input
                type="text"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                className="w-full border border-gray-300 rounded p-1.5"
              />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full border border-gray-300 rounded p-1.5"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-semibold text-gray-700">Order Line Items</label>
              <button
                type="button"
                onClick={handleAddLine}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <select
                    value={l.productId}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[idx].productId = e.target.value;
                      setLines(updated);
                    }}
                    className="flex-1 border border-gray-300 rounded p-1.5 bg-white"
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.sku} — {p.name} (£{(p.sellingPriceMinor / 100).toFixed(2)})
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={l.quantity}
                    onChange={(e) => {
                      const updated = [...lines];
                      updated[idx].quantity = parseInt(e.target.value, 10) || 1;
                      setLines(updated);
                    }}
                    className="w-16 border border-gray-300 rounded p-1.5 text-center font-bold"
                  />

                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(idx)}
                      className="p-1.5 text-rose-500 hover:text-rose-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-xs shadow-2xs disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Place Direct Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
