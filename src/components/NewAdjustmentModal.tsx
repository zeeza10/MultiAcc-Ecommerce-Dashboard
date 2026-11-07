import React, { useState, useEffect } from 'react';
import { Sliders, XCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { Product, StockState, User, SystemConfig } from '../types';

interface NewAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  config: SystemConfig;
  onSuccess: () => void;
}

export const NewAdjustmentModal: React.FC<NewAdjustmentModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  config,
  onSuccess,
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [delta, setDelta] = useState('5');
  const [isDeduction, setIsDeduction] = useState(false);
  const [targetState, setTargetState] = useState<StockState>('ON_HAND');
  const [reasonCode, setReasonCode] = useState<'damage' | 'loss' | 'found' | 'count_correction' | 'quarantine' | 'write_off'>('count_correction');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadProducts();
    }
  }, [isOpen]);

  const loadProducts = async () => {
    try {
      const res = await api.getProducts();
      setProducts(res.products);
      if (res.products.length > 0 && !selectedProductId) {
        setSelectedProductId(res.products[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  const product = products.find((p) => p.id === selectedProductId);
  const parsedDelta = (parseInt(delta, 10) || 0) * (isDeduction ? -1 : 1);
  const estimatedValueMinor = product ? Math.abs(parsedDelta) * product.costPriceMinor : 0;
  const willRequireApproval =
    Math.abs(parsedDelta) > config.adjustmentApprovalThresholdQuantity ||
    estimatedValueMinor > config.adjustmentApprovalThresholdValueMinor;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    if (!selectedProductId) {
      setErrorMsg('Please select a product.');
      setSubmitting(false);
      return;
    }

    try {
      await api.createAdjustment({
        productId: selectedProductId,
        quantityDelta: parsedDelta,
        targetState,
        reasonCode,
        note: note.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4 text-xs">
        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-gray-900">Create Stock Adjustment (FR-ADJ-01)</h3>
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
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Select Catalog Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full border border-gray-300 rounded p-2 bg-white"
              required
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Movement Type</label>
              <div className="flex rounded border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsDeduction(false)}
                  className={`flex-1 py-1.5 font-bold transition ${
                    !isDeduction ? 'bg-emerald-600 text-white' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setIsDeduction(true)}
                  className={`flex-1 py-1.5 font-bold transition ${
                    isDeduction ? 'bg-rose-600 text-white' : 'bg-gray-50 text-gray-700'
                  }`}
                >
                  - Deduct Stock
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Units Quantity *</label>
              <input
                type="number"
                min="1"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                className="w-full border border-gray-300 rounded p-1.5 font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-gray-700 mb-1">Reason Code *</label>
              <select
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value as any)}
                className="w-full border border-gray-300 rounded p-1.5 bg-white capitalize"
              >
                <option value="count_correction">Count Correction</option>
                <option value="damage">Damage</option>
                <option value="loss">Loss / Theft</option>
                <option value="found">Found Stock</option>
                <option value="quarantine">Quarantine</option>
                <option value="write_off">Write-Off</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">Target Stock State</label>
              <select
                value={targetState}
                onChange={(e) => setTargetState(e.target.value as any)}
                className="w-full border border-gray-300 rounded p-1.5 bg-white"
              >
                <option value="ON_HAND">On Hand (Sellable)</option>
                <option value="DAMAGED">Damaged</option>
                <option value="QUARANTINED">Quarantined</option>
                <option value="MISSING">Missing</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">
              Audit Note / Variance Description *
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain physical recount discrepancy or damage condition..."
              className="w-full border border-gray-300 rounded p-2"
              rows={2}
              required
            />
          </div>

          {/* Threshold Preview */}
          <div className="p-2.5 rounded-lg border text-xs bg-slate-50 border-slate-200">
            <div className="flex justify-between text-gray-600">
              <span>Estimated Movement Value:</span>
              <span className="font-bold text-gray-900 font-mono">
                £{(estimatedValueMinor / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center space-x-1.5 mt-1 font-semibold">
              {willRequireApproval ? (
                <span className="text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Exceeds threshold: Will route for Operations Manager approval</span>
                </span>
              ) : (
                <span className="text-emerald-800 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Within limits: Will post directly to append-only stock ledger</span>
                </span>
              )}
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
              {submitting ? 'Submitting...' : 'Submit Stock Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
