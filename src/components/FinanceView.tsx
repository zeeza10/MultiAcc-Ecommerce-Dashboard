import React, { useState, useEffect } from 'react';
import {
  FileText,
  CreditCard,
  Receipt,
  TrendingUp,
  Plus,
  AlertTriangle,
  Lock,
  CheckCircle,
  XCircle,
  ShieldCheck,
  Scale,
} from 'lucide-react';
import { api } from '../services/api';
import { Invoice, Payment, Expense, FinancialLedgerEntry, User, SystemConfig } from '../types';

interface FinanceViewProps {
  currentUser: User;
  config: SystemConfig;
  defaultTab?: 'INVOICES' | 'PAYMENTS' | 'EXPENSES' | 'LEDGER' | 'PROFIT';
}

export const FinanceView: React.FC<FinanceViewProps> = ({
  currentUser,
  config,
  defaultTab = 'INVOICES',
}) => {
  const [activeTab, setActiveTab] = useState<'INVOICES' | 'PAYMENTS' | 'EXPENSES' | 'LEDGER' | 'PROFIT'>(defaultTab);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [ledger, setLedger] = useState<FinancialLedgerEntry[]>([]);
  const [profitRows, setProfitRows] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidError, setVoidError] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('144.00');
  const [paymentRef, setPaymentRef] = useState('BACS-ONLINE-SETTLE');
  const [paymentMethod, setPaymentMethod] = useState<'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER'>('BANK_TRANSFER');
  const [selectedInvoiceForPay, setSelectedInvoiceForPay] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFinanceData();
  }, [currentUser.id]);

  const loadFinanceData = async () => {
    setLoading(true);
    try {
      const [invRes, payRes, expRes, ledRes, profRes] = await Promise.all([
        api.getInvoices(),
        api.getPayments(),
        api.getExpenses(),
        api.getFinancialLedger(),
        api.getReport('R-13'),
      ]);
      setInvoices(invRes.invoices);
      setPayments(payRes.payments);
      setExpenses(expRes.expenses);
      setLedger(ledRes.ledger);
      setProfitRows(profRes.data || []);
      if (invRes.invoices.length > 0) {
        setSelectedInvoiceForPay(invRes.invoices[0].id);
      }
    } catch (err) {
      console.error('Failed to load finance data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVoidInvoice = async () => {
    if (!selectedInvoice) return;
    setVoidError('');

    if (currentUser.role !== 'SUPER_ADMIN') {
      setVoidError('Security restriction: Voiding financial documents requires Super Admin authority (AT-13).');
      return;
    }

    if (!voidReason.trim()) {
      setVoidError('A mandatory audit reason is required for voiding.');
      return;
    }

    try {
      await api.voidInvoice(selectedInvoice.id, voidReason);
      setShowVoidModal(false);
      setSelectedInvoice(null);
      setVoidReason('');
      loadFinanceData();
    } catch (err: any) {
      setVoidError(err.message || 'Voiding failed');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const inv = invoices.find((i) => i.id === selectedInvoiceForPay);
    if (!inv) return;

    const amtMinor = Math.round(parseFloat(paymentAmount) * 100);

    try {
      await api.recordPayment({
        amountMinor: amtMinor,
        paymentMethod,
        reference: paymentRef,
        payerName: inv.recipientName,
        allocations: [
          {
            invoiceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
            amountMinor: amtMinor,
          },
        ],
      });
      setShowPaymentModal(false);
      loadFinanceData();
    } catch (err: any) {
      alert(err.message || 'Payment recording failed');
    }
  };

  const totalDebits = ledger.reduce((a, b) => a + b.debitMinor, 0);
  const totalCredits = ledger.reduce((a, b) => a + b.creditMinor, 0);
  const isBalanced = totalDebits === totalCredits;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Finance, Invoicing & Financial Ledger
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
              Phase 4 Active
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Balanced double-entry financial ledger (S12), invoice lifecycles, and order-level unit profitability.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {currentUser.role !== 'CLIENT_USER' && (
            <button
              onClick={() => setShowPaymentModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-2xs transition"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Record Client Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 text-xs">
        <button
          onClick={() => setActiveTab('INVOICES')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'INVOICES'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Invoices ({invoices.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PAYMENTS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'PAYMENTS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Payments & Allocations ({payments.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'LEDGER'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Append-Only Financial Ledger ({ledger.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('PROFIT')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 transition ${
            activeTab === 'PROFIT'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Order Profitability Analysis</span>
        </button>
      </div>

      {/* Tab: Invoices */}
      {activeTab === 'INVOICES' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Recipient</th>
                    <th className="py-2.5 px-3">Issue Date</th>
                    <th className="py-2.5 px-3">Due Date</th>
                    <th className="py-2.5 px-3">Subtotal (£)</th>
                    <th className="py-2.5 px-3">VAT (20%)</th>
                    <th className="py-2.5 px-3">Total (£)</th>
                    <th className="py-2.5 px-3">Paid (£)</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                        {inv.invoiceNumber}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 text-[10px] font-semibold">
                          {inv.type}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{inv.recipientName}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">{inv.issueDate}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-500">
                        {inv.dueDate.split('T')[0]}
                      </td>
                      <td className="py-2.5 px-3">£{(inv.subtotalMinor / 100).toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-gray-500">£{(inv.vatAmountMinor / 100).toFixed(2)}</td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        £{(inv.totalMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-emerald-700 font-semibold">
                        £{(inv.paidAmountMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            inv.status === 'PAID'
                              ? 'bg-emerald-100 text-emerald-800'
                              : inv.status === 'OVERDUE'
                              ? 'bg-rose-100 text-rose-800'
                              : inv.status === 'VOID'
                              ? 'bg-gray-200 text-gray-700 line-through'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {inv.status !== 'VOID' && inv.status !== 'PAID' && currentUser.role === 'SUPER_ADMIN' && (
                          <button
                            onClick={() => {
                              setSelectedInvoice(inv);
                              setShowVoidModal(true);
                              setVoidError('');
                            }}
                            className="px-2.5 py-1 text-xs text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded transition font-medium"
                          >
                            Void (AT-13)
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Append-Only Financial Ledger */}
      {activeTab === 'LEDGER' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-3.5 shadow-2xs flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <span className="font-bold text-gray-900">Trial Balance Verification:</span>{' '}
                <span className="text-gray-600">
                  Total Debits: £{(totalDebits / 100).toFixed(2)} | Total Credits: £{(totalCredits / 100).toFixed(2)}
                </span>
              </div>
            </div>
            <span
              className={`px-2 py-0.5 rounded font-bold ${
                isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isBalanced ? '100% BALANCED (DEBITS = CREDITS)' : 'UNBALANCED VARIANCE'}
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Date (UTC)</th>
                    <th className="py-2.5 px-3">Account Code</th>
                    <th className="py-2.5 px-3">General Ledger Account Name</th>
                    <th className="py-2.5 px-3">Debit Amount (£)</th>
                    <th className="py-2.5 px-3">Credit Amount (£)</th>
                    <th className="py-2.5 px-3">Source Type</th>
                    <th className="py-2.5 px-3">Source ID</th>
                    <th className="py-2.5 px-3">Posting Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700 font-mono text-[11px]">
                  {ledger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 transition">
                      <td className="py-2 px-3 text-gray-500">
                        {entry.createdAt.split('.')[0].replace('T', ' ')}
                      </td>
                      <td className="py-2 px-3 font-bold text-indigo-700">{entry.accountId}</td>
                      <td className="py-2 px-3 font-sans font-semibold text-gray-900">
                        {entry.accountName}
                      </td>
                      <td className="py-2 px-3">
                        {entry.debitMinor > 0 ? (
                          <span className="font-bold text-gray-900">
                            £{(entry.debitMinor / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {entry.creditMinor > 0 ? (
                          <span className="font-bold text-gray-900">
                            £{(entry.creditMinor / 100).toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 font-sans">
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 text-[10px]">
                          {entry.sourceType}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-900 font-medium">{entry.sourceId}</td>
                      <td className="py-2 px-3 font-sans text-gray-600">{entry.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Profitability */}
      {activeTab === 'PROFIT' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="p-3 border-b border-gray-200 bg-slate-50 font-semibold text-xs text-gray-800">
            Unit Economics & Gross Profit Breakdown by Order (FR-PRF-01)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Order #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Revenue (£)</th>
                  <th className="py-2.5 px-3">COGS (£)</th>
                  <th className="py-2.5 px-3">Marketplace Fee (£)</th>
                  <th className="py-2.5 px-3">Postage Cost (£)</th>
                  <th className="py-2.5 px-3">Gross Profit (£)</th>
                  <th className="py-2.5 px-3 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {profitRows.map((r, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono font-bold text-indigo-700">{r.orderNumber}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{r.date}</td>
                    <td className="py-2 px-3 font-medium text-gray-900">{r.buyer}</td>
                    <td className="py-2 px-3 font-bold text-gray-900">£{r.revenue}</td>
                    <td className="py-2 px-3 text-gray-600">£{r.cogs}</td>
                    <td className="py-2 px-3 text-gray-600">£{r.fees}</td>
                    <td className="py-2 px-3 text-gray-600">£{r.shipping}</td>
                    <td className="py-2 px-3 font-bold text-emerald-700">£{r.grossProfit}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-700">{r.marginPercent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Payments */}
      {activeTab === 'PAYMENTS' && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Payment #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Reference</th>
                  <th className="py-2.5 px-3">Payer</th>
                  <th className="py-2.5 px-3">Amount (£)</th>
                  <th className="py-2.5 px-3">Allocated Invoices</th>
                  <th className="py-2.5 px-3">Recorded By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{p.paymentNumber}</td>
                    <td className="py-2.5 px-3 font-mono text-gray-500">{p.paymentDate}</td>
                    <td className="py-2.5 px-3">{p.paymentMethod.replace('_', ' ')}</td>
                    <td className="py-2.5 px-3 font-mono">{p.reference}</td>
                    <td className="py-2.5 px-3 font-semibold text-gray-900">{p.payerName}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-700">
                      £{(p.amountMinor / 100).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {p.allocations.map((a) => `${a.invoiceNumber} (£${(a.amountMinor / 100).toFixed(2)})`).join(', ')}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">{p.recordedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Void Invoice Modal (SRS FR-INVC-04, AT-13) */}
      {showVoidModal && selectedInvoice && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Void Invoice {selectedInvoice.invoiceNumber}
                </h3>
              </div>
              <button onClick={() => setShowVoidModal(false)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {voidError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs">
                {voidError}
              </div>
            )}

            <p className="text-gray-600">
              Under <strong>BR-05 & AT-13</strong>, issued invoices are strictly immutable and cannot be deleted. Voiding generates an automatic reversing entry in the Financial Ledger.
            </p>

            <div>
              <label className="block font-semibold text-gray-700 mb-1">
                Mandatory Void Reason (Audit Requirement) *
              </label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="State precise reason for cancellation and reversing entry..."
                className="w-full border border-gray-300 rounded p-2"
                rows={2}
                required
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setShowVoidModal(false)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleVoidInvoice}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded text-xs shadow-2xs"
              >
                Confirm Void & Post Reversal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record Payment Modal (AT-09) */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Record & Allocate Client Payment</h3>
              </div>
              <button onClick={() => setShowPaymentModal(false)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Target Open Invoice *</label>
                <select
                  value={selectedInvoiceForPay}
                  onChange={(e) => setSelectedInvoiceForPay(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 bg-white"
                >
                  {invoices
                    .filter((i) => i.status !== 'PAID' && i.status !== 'VOID')
                    .map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.invoiceNumber} — {inv.recipientName} (Balance due: £
                        {((inv.totalMinor - inv.paidAmountMinor) / 100).toFixed(2)})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Payment Amount (£) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Bank Reference *</label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="e.g. BACS-TRANS-9812"
                  className="w-full border border-gray-300 rounded p-2 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Payment Channel</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full border border-gray-300 rounded p-2 bg-white"
                >
                  <option value="BANK_TRANSFER">Bank Transfer (BACS/CHAPS)</option>
                  <option value="CARD">Credit / Debit Card</option>
                  <option value="CASH">Cash</option>
                  <option value="OTHER">Other Settlement</option>
                </select>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-xs shadow-2xs"
                >
                  Post Payment & Relieve AR
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
