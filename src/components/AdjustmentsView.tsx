import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Search,
} from 'lucide-react';
import { api } from '../services/api';
import { StockAdjustment, Product, User, SystemConfig } from '../types';

interface AdjustmentsViewProps {
  currentUser: User;
  config: SystemConfig;
  onOpenNewAdjustment: () => void;
}

export const AdjustmentsView: React.FC<AdjustmentsViewProps> = ({
  currentUser,
  config,
  onOpenNewAdjustment,
}) => {
  const [adjustments, setAdjustments] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAdj, setSelectedAdj] = useState<StockAdjustment | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadAdjustments();
  }, [currentUser.id]);

  const loadAdjustments = async () => {
    setLoading(true);
    try {
      const res = await api.getAdjustments();
      setAdjustments(res.adjustments);
    } catch (err) {
      console.error('Failed to load adjustments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecision = async (decision: 'APPROVE' | 'REJECT') => {
    if (!selectedAdj) return;
    setErrorMsg('');

    try {
      await api.processAdjustment(selectedAdj.id, decision, decisionNote);
      setSelectedAdj(null);
      setDecisionNote('');
      loadAdjustments();
    } catch (err: any) {
      setErrorMsg(err.message || 'Decision failed');
    }
  };

  const isOpsManagerOrAdmin = currentUser.role === 'OPS_MANAGER' || currentUser.role === 'SUPER_ADMIN';

  const filteredAdjustments = adjustments.filter(
    (a) =>
      !search ||
      a.adjustmentNumber.toLowerCase().includes(search.toLowerCase()) ||
      a.sku.toLowerCase().includes(search.toLowerCase()) ||
      a.requestedBy.toLowerCase().includes(search.toLowerCase()) ||
      a.reasonCode.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Stock Adjustments & Variance</h1>
          <p className="text-xs text-gray-500">
            Controlled stock corrections with dual-control manager sign-offs (Threshold: {config.adjustmentApprovalThresholdQuantity} units or £{(config.adjustmentApprovalThresholdValueMinor / 100).toFixed(2)}).
          </p>
        </div>

        {currentUser.role !== 'CLIENT_USER' && currentUser.role !== 'FINANCE_USER' && currentUser.role !== 'VIEWER' && (
          <button
            onClick={onOpenNewAdjustment}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Stock Adjustment</span>
          </button>
        )}
      </div>

      {/* Threshold Explanation Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs flex items-center justify-between">
        <div className="flex items-center space-x-2 text-slate-700">
          <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>
            <strong>Dual Control Governance (FR-ADJ-04):</strong> Requester cannot approve their own adjustment. Adjustments exceeding {config.adjustmentApprovalThresholdQuantity} units or £{(config.adjustmentApprovalThresholdValueMinor / 100).toFixed(2)} require distinct Operations Manager sign-off.
          </span>
        </div>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Adjustment #</th>
                <th className="py-2.5 px-3">Date (UTC)</th>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Quantity Delta</th>
                <th className="py-2.5 px-3">Target State</th>
                <th className="py-2.5 px-3">Reason Code</th>
                <th className="py-2.5 px-3">Evaluated Value</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Requester</th>
                <th className="py-2.5 px-3">Approver</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-gray-500">
                    Loading stock adjustments...
                  </td>
                </tr>
              ) : filteredAdjustments.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-gray-500">
                    No adjustments found.
                  </td>
                </tr>
              ) : (
                filteredAdjustments.map((a) => {
                  const isRequester = a.requestedBy.toLowerCase() === currentUser.email.toLowerCase();
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-semibold font-mono text-gray-900">
                        {a.adjustmentNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-500 text-[11px]">
                        {a.createdAt.split('T')[0]}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{a.sku}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded ${
                            a.quantityDelta > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {a.quantityDelta > 0 ? `+${a.quantityDelta}` : a.quantityDelta}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-800">{a.targetState}</td>
                      <td className="py-2.5 px-3">
                        <span className="capitalize px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 font-medium">
                          {a.reasonCode.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-semibold text-gray-900">
                        £{(a.evaluatedValueMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        {a.status === 'APPROVED' && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Approved
                          </span>
                        )}
                        {a.status === 'PENDING_APPROVAL' && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 w-max">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Needs Sign-off</span>
                          </span>
                        )}
                        {a.status === 'REJECTED' && (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 text-[11px]">{a.requestedBy}</td>
                      <td className="py-2.5 px-3 text-gray-600 text-[11px]">
                        {a.approvedBy || 'Pending'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {a.status === 'PENDING_APPROVAL' && (
                          <button
                            onClick={() => {
                              setSelectedAdj(a);
                              setErrorMsg('');
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition border border-indigo-200"
                          >
                            Review & Decide
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manager Decision Modal (SRS S6.4, AT-05) */}
      {selectedAdj && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Authorize Adjustment {selectedAdj.adjustmentNumber}
                </h3>
              </div>
              <button onClick={() => setSelectedAdj(null)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs flex items-start gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5 text-xs">
              <div>
                <span className="font-semibold text-gray-600">Product SKU:</span>{' '}
                <span className="font-mono font-bold text-indigo-700">{selectedAdj.sku}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Proposed Delta:</span>{' '}
                <span className="font-bold text-gray-900">
                  {selectedAdj.quantityDelta > 0 ? `+${selectedAdj.quantityDelta}` : selectedAdj.quantityDelta} units ({selectedAdj.targetState})
                </span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Evaluated Value:</span>{' '}
                <span className="font-mono font-bold text-gray-900">
                  £{(selectedAdj.evaluatedValueMinor / 100).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Reason Code:</span>{' '}
                <span className="capitalize">{selectedAdj.reasonCode}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Requester:</span>{' '}
                <span className="font-medium text-gray-800">{selectedAdj.requestedBy}</span>
              </div>
              <div>
                <span className="font-semibold text-gray-600">Staff Note:</span>{' '}
                <span className="italic text-gray-700">"{selectedAdj.note}"</span>
              </div>
            </div>

            {/* Requester Separation Check Warning */}
            {selectedAdj.requestedBy.toLowerCase() === currentUser.email.toLowerCase() && (
              <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-amber-900 text-xs">
                <strong>Attention:</strong> You requested this adjustment. Under dual control rules (FR-ADJ-04), you cannot approve your own submission. Switch to another Operations Manager or Super Admin in the top bar to test sign-off!
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Manager Review Note
              </label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="State reason for sign-off or grounds for rejection..."
                className="w-full border border-gray-300 rounded-md p-2 text-xs"
                rows={2}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setSelectedAdj(null)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-md text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDecision('REJECT')}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-md text-xs transition"
              >
                Reject Adjustment
              </button>
              <button
                onClick={() => handleDecision('APPROVE')}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md text-xs shadow-2xs transition"
              >
                Approve & Post to Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
