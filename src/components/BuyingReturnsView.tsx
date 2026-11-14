import React, { useState, useEffect } from 'react';
import {
  Truck,
  Boxes,
  RotateCcw,
  CheckCircle,
  PackageCheck,
  AlertTriangle,
  Clock,
  XCircle,
  ShieldCheck,
  Users,
  Search,
  ExternalLink,
} from 'lucide-react';
import { api } from '../services/api';
import { Supplier, PurchaseOrder, ReturnOrder, Order, User, SystemConfig, Product } from '../types';

interface BuyingReturnsViewProps {
  currentUser: User;
  config: SystemConfig;
  defaultSubTab?: 'SUPPLIERS' | 'POS' | 'RETURNS' | 'CUSTOMERS';
}

export const BuyingReturnsView: React.FC<BuyingReturnsViewProps> = ({
  currentUser,
  config,
  defaultSubTab = 'POS',
}) => {
  const [subTab, setSubTab] = useState<'SUPPLIERS' | 'POS' | 'RETURNS' | 'CUSTOMERS'>(defaultSubTab);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [returns, setReturns] = useState<ReturnOrder[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);
  const [selectedReturn, setSelectedReturn] = useState<ReturnOrder | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<Record<string, { received: number; damaged: number }>>({});
  const [discrepancyNote, setDiscrepancyNote] = useState('');
  const [receiptRequestId, setReceiptRequestId] = useState('');
  const [showPoForm, setShowPoForm] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState('');
  const [poExpectedDate, setPoExpectedDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poTaxAmount, setPoTaxAmount] = useState('0');
  const [poLines, setPoLines] = useState<Array<{ productId: string; quantity: string; unitCost: string }>>([]);
  const [poRequestId, setPoRequestId] = useState('');
  const [savingPo, setSavingPo] = useState(false);
  const [approvingPoId, setApprovingPoId] = useState<string | null>(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', code: '', contactName: '', email: '', phone: '', paymentTermsDays: '30', currency: 'GBP', leadTimeDays: '7' });
  const [returnDispositions, setReturnDispositions] = useState<Record<string, string>>({});
  const [issueRefund, setIssueRefund] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (defaultSubTab) {
      setSubTab(defaultSubTab);
    }
  }, [defaultSubTab]);

  useEffect(() => {
    loadData();
  }, [currentUser.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [supRes, poRes, retRes, ordRes, prodRes] = await Promise.all([
        api.getSuppliers(),
        api.getPurchaseOrders(),
        api.getReturns(),
        api.getOrders(),
        api.getProducts(),
      ]);
      setSuppliers(supRes.suppliers || []);
      setPurchaseOrders(poRes.purchaseOrders || []);
      setProducts(prodRes.products || []);
      setReceipts(poRes.receipts || []);
      setReturns(retRes.returns || []);
      setOrders(ordRes.orders || []);
    } catch (err) {
      console.error('Failed to load buying & returns data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingSupplier(true);
    try {
      await api.createSupplier({
        name: supplierForm.name,
        code: supplierForm.code,
        contactName: supplierForm.contactName || undefined,
        email: supplierForm.email || undefined,
        phone: supplierForm.phone || undefined,
        paymentTermsDays: Number.parseInt(supplierForm.paymentTermsDays, 10) || 0,
        currency: supplierForm.currency,
        leadTimeDays: Number.parseInt(supplierForm.leadTimeDays, 10) || 0,
      });
      setSupplierForm({ name: '', code: '', contactName: '', email: '', phone: '', paymentTermsDays: '30', currency: 'GBP', leadTimeDays: '7' });
      setShowSupplierForm(false);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Supplier creation failed');
    } finally {
      setSavingSupplier(false);
    }
  };

  const refreshPoRequestId = () => setPoRequestId(window.crypto.randomUUID());

  const openPoForm = () => {
    const firstSupplier = suppliers.find(supplier => supplier.isActive);
    const firstProduct = products.find(product => product.status === 'ACTIVE');
    setPoSupplierId(firstSupplier?.id || '');
    setPoExpectedDate('');
    setPoNotes('');
    setPoTaxAmount('0');
    setPoLines(firstProduct ? [{
      productId: firstProduct.id,
      quantity: '1',
      unitCost: (firstProduct.costPriceMinor / 100).toFixed(2),
    }] : []);
    refreshPoRequestId();
    setShowPoForm(true);
  };

  const handleCreatePurchaseOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    const requestId = poRequestId || window.crypto.randomUUID();
    setPoRequestId(requestId);
    setSavingPo(true);
    try {
      await api.createPurchaseOrder({
        supplierId: poSupplierId,
        expectedDate: poExpectedDate || undefined,
        notes: poNotes || undefined,
        taxMinor: Math.round((Number.parseFloat(poTaxAmount) || 0) * 100),
        lines: poLines.map(line => ({
          productId: line.productId,
          orderedQty: Number.parseInt(line.quantity, 10) || 0,
          unitCostMinor: Math.round((Number.parseFloat(line.unitCost) || 0) * 100),
        })),
      }, requestId);
      setShowPoForm(false);
      setPoRequestId('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Purchase order creation failed');
    } finally {
      setSavingPo(false);
    }
  };

  const handleApprovePurchaseOrder = async (id: string) => {
    setApprovingPoId(id);
    try {
      await api.approvePurchaseOrder(id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Purchase order approval failed');
    } finally {
      setApprovingPoId(null);
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setSelectedPo(po);
    const initialInputs: Record<string, { received: number; damaged: number }> = {};
    (po.lines || []).forEach((l) => {
      const remaining = Math.max(0, l.orderedQty - l.receivedQty);
      initialInputs[l.productId] = { received: remaining, damaged: 0 };
    });
    setReceiveInputs(initialInputs);
    setDiscrepancyNote('');
    setReceiptRequestId(window.crypto.randomUUID());
  };

  const handleConfirmReceipt = async () => {
    if (!selectedPo) return;

    const items = (selectedPo.lines || []).map((l) => ({
      productId: l.productId,
      sku: l.sku,
      receivedQty: receiveInputs[l.productId]?.received || 0,
      damagedQty: receiveInputs[l.productId]?.damaged || 0,
    }));

    try {
      await api.receivePO(selectedPo.id, items, discrepancyNote, receiptRequestId);
      setSelectedPo(null);
      setReceiptRequestId('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Receipt recording failed');
    }
  };

  const openReturnModal = (ret: ReturnOrder) => {
    setSelectedReturn(ret);
    const initialDisp: Record<string, string> = {};
    (ret.lines || []).forEach((l) => {
      initialDisp[l.id] = l.disposition || 'RESTOCK';
    });
    setReturnDispositions(initialDisp);
    setIssueRefund(true);
  };

  const handleConfirmDisposition = async () => {
    if (!selectedReturn) return;

    const disps = (selectedReturn.lines || []).map((l) => ({
      lineId: l.id,
      disposition: returnDispositions[l.id] || 'RESTOCK',
      quantity: l.quantity,
    }));

    try {
      await api.processReturnDisposition(selectedReturn.id, disps, issueRefund);
      setSelectedReturn(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Disposition recording failed');
    }
  };

  // Derive aggregated customer directory from verified orders
  const customerMap = new Map<string, {
    name: string;
    email: string;
    phone: string;
    address: string;
    orderCount: number;
    totalSpendMinor: number;
    recentOrderDate: string;
    recentStatus: string;
  }>();

  orders.forEach((o) => {
    const key = (o.customerName || 'Anonymous Buyer').trim();
    const existing = customerMap.get(key);
    const addressStr = o.shippingAddress
      ? `${o.shippingAddress.street}, ${o.shippingAddress.city} ${o.shippingAddress.postalCode}`
      : 'N/A';
    if (!existing) {
      customerMap.set(key, {
        name: key,
        email: o.customerEmail || 'customer@marketplace.com',
        phone: (o as any).customerPhone || '—',
        address: addressStr,
        orderCount: 1,
        totalSpendMinor: o.totalMinor || 0,
        recentOrderDate: o.createdAt,
        recentStatus: o.status,
      });
    } else {
      existing.orderCount += 1;
      existing.totalSpendMinor += o.totalMinor || 0;
      if (new Date(o.createdAt) > new Date(existing.recentOrderDate)) {
        existing.recentOrderDate = o.createdAt;
        existing.recentStatus = o.status;
      }
    }
  });

  const customerList = Array.from(customerMap.values()).filter((c) =>
    customerSearch
      ? c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.email.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.address.toLowerCase().includes(customerSearch.toLowerCase())
      : true
  );

  const poCurrency = suppliers.find(supplier => supplier.id === poSupplierId)?.currency || 'GBP';
  const poSubtotalMinor = poLines.reduce((sum, line) =>
    sum + (Number.parseInt(line.quantity, 10) || 0) * Math.round((Number.parseFloat(line.unitCost) || 0) * 100), 0);
  const poTaxMinor = Math.round((Number.parseFloat(poTaxAmount) || 0) * 100);
  const poTotalMinor = poSubtotalMinor + poTaxMinor;
  const formatPoMoney = (minor: number) => new Intl.NumberFormat('en-GB', {
    style: 'currency', currency: poCurrency,
  }).format(minor / 100);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              Purchasing, Receipts, Returns & Customers
            </h1>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold">
              Phase 2 Active
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Control buying, goods receiving with partial / discrepancy notes, return inspections with dispositions, and customer directory.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-gray-200 text-xs overflow-x-auto">
        <button
          onClick={() => setSubTab('POS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition ${
            subTab === 'POS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Boxes className="w-4 h-4" />
          <span>Purchase Orders ({purchaseOrders.length})</span>
        </button>

        <button
          onClick={() => setSubTab('RETURNS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition ${
            subTab === 'RETURNS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>Customer Returns ({returns.length})</span>
        </button>

        <button
          onClick={() => setSubTab('SUPPLIERS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition ${
            subTab === 'SUPPLIERS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Suppliers Directory ({suppliers.length})</span>
        </button>

        <button
          onClick={() => setSubTab('CUSTOMERS')}
          className={`flex items-center gap-2 px-4 py-2 font-semibold border-b-2 whitespace-nowrap transition ${
            subTab === 'CUSTOMERS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Customers Directory ({customerList.length})</span>
        </button>
      </div>

      {/* Tab: Purchase Orders */}
      {subTab === 'POS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-gray-900">Purchase Orders</h2>
              <p className="text-xs text-gray-500">Create a draft, approve it, then receive goods against the approved order.</p>
            </div>
            <button
              onClick={openPoForm}
              disabled={!suppliers.some(supplier => supplier.isActive) || !products.some(product => product.status === 'ACTIVE')}
              className="px-3 py-2 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-40"
            >
              + Create Purchase Order
            </button>
          </div>

          {showPoForm && (
            <form onSubmit={handleCreatePurchaseOrder} className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-gray-900">New Purchase Order</h3>
                  <p className="text-xs text-gray-500">A new order is saved as DRAFT and must be approved before receiving.</p>
                </div>
                <button type="button" onClick={() => setShowPoForm(false)} className="text-xs text-gray-500 hover:text-gray-900">Close</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <label className="text-xs font-medium text-gray-600">Supplier
                  <select required value={poSupplierId} onChange={e => { setPoSupplierId(e.target.value); refreshPoRequestId(); }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm">
                    <option value="">Select supplier</option>
                    {suppliers.filter(supplier => supplier.isActive).map(supplier => (
                      <option key={supplier.id} value={supplier.id}>{supplier.name} ({supplier.currency})</option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">Expected Delivery Date
                  <input type="date" value={poExpectedDate} onChange={e => { setPoExpectedDate(e.target.value); refreshPoRequestId(); }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-600">Tax Amount ({poCurrency})
                  <input type="number" min="0" step="0.01" value={poTaxAmount} onChange={e => { setPoTaxAmount(e.target.value); refreshPoRequestId(); }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-gray-800">Order Lines</h4>
                  <button type="button" onClick={() => { setPoLines(lines => [...lines, { productId: '', quantity: '1', unitCost: '0.00' }]); refreshPoRequestId(); }} className="text-xs font-semibold text-indigo-700">+ Add Item</button>
                </div>
                {poLines.map((line, index) => {
                  const selectedProduct = products.find(product => product.id === line.productId);
                  return (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      <label className="md:col-span-6 text-xs font-medium text-gray-600">Product
                        <select required value={line.productId} onChange={e => {
                          const product = products.find(item => item.id === e.target.value);
                          setPoLines(lines => lines.map((item, lineIndex) => lineIndex === index ? {
                            ...item,
                            productId: e.target.value,
                            unitCost: product ? (product.costPriceMinor / 100).toFixed(2) : item.unitCost,
                          } : item));
                          refreshPoRequestId();
                        }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm">
                          <option value="">Select product</option>
                          {products.filter(product => product.status === 'ACTIVE').map(product => (
                            <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="md:col-span-2 text-xs font-medium text-gray-600">Quantity
                        <input required type="number" min="1" step="1" value={line.quantity} onChange={e => {
                          setPoLines(lines => lines.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: e.target.value } : item));
                          refreshPoRequestId();
                        }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                      </label>
                      <label className="md:col-span-3 text-xs font-medium text-gray-600">Unit Cost ({poCurrency})
                        <input required type="number" min="0" step="0.01" value={line.unitCost} onChange={e => {
                          setPoLines(lines => lines.map((item, lineIndex) => lineIndex === index ? { ...item, unitCost: e.target.value } : item));
                          refreshPoRequestId();
                        }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                      </label>
                      <div className="md:col-span-1 flex items-center justify-between md:justify-end gap-2">
                        <span className="text-xs font-bold text-gray-800">{formatPoMoney((Number.parseInt(line.quantity, 10) || 0) * Math.round((Number.parseFloat(line.unitCost) || 0) * 100))}</span>
                        <button type="button" disabled={poLines.length <= 1} onClick={() => { setPoLines(lines => lines.filter((_, lineIndex) => lineIndex !== index)); refreshPoRequestId(); }} className="text-rose-600 disabled:opacity-30" aria-label="Remove purchase order line">×</button>
                      </div>
                      {selectedProduct && <div className="md:col-span-12 text-[11px] text-gray-500">SKU: {selectedProduct.sku}</div>}
                    </div>
                  );
                })}
              </div>

              <label className="block text-xs font-medium text-gray-600">Purchase Order Notes
                <textarea rows={2} maxLength={2000} value={poNotes} onChange={e => { setPoNotes(e.target.value); refreshPoRequestId(); }} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="Delivery instructions, supplier reference, or terms..." />
              </label>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t border-gray-100 pt-3">
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Subtotal: <strong>{formatPoMoney(poSubtotalMinor)}</strong></div>
                  <div>Tax: <strong>{formatPoMoney(poTaxMinor)}</strong></div>
                  <div className="text-sm text-gray-900">Total: <strong>{formatPoMoney(poTotalMinor)}</strong></div>
                </div>
                <button type="submit" disabled={savingPo || !poSupplierId || poLines.length === 0 || poLines.some(line => !line.productId)} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">
                  {savingPo ? 'Creating...' : 'Save Draft Purchase Order'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">PO Number</th>
                    <th className="py-2.5 px-3">Supplier Name</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Date (UTC)</th>
                    <th className="py-2.5 px-3">Expected Date</th>
                    <th className="py-2.5 px-3">Items & Qty</th>
                    <th className="py-2.5 px-3">Total</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {purchaseOrders.map((po) => (
                    <tr key={po.id} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{po.poNumber}</td>
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{po.supplierName}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            po.status === 'RECEIVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : po.status === 'PARTIALLY_RECEIVED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {(po.status || '').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px]">
                        {po.createdAt ? po.createdAt.split('T')[0] : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px]">
                        {po.expectedDate ? po.expectedDate.split('T')[0] : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {(po.lines || []).map((l) => (
                          <div key={l.id} className="text-[11px]">
                            <span className="font-semibold text-gray-900">{l.sku}:</span>{' '}
                            <span>{l.receivedQty} / {l.orderedQty} rec'd</span>
                          </div>
                        ))}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-gray-900">
                        {new Intl.NumberFormat('en-GB', { style: 'currency', currency: po.currency || 'GBP' }).format((po.totalMinor || 0) / 100)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {po.status === 'DRAFT' ? (
                          <button
                            onClick={() => void handleApprovePurchaseOrder(po.id)}
                            disabled={approvingPoId === po.id}
                            className="px-3 py-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition shadow-2xs disabled:opacity-50"
                          >
                            {approvingPoId === po.id ? 'Approving...' : 'Approve'}
                          </button>
                        ) : ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'].includes(po.status) ? (
                          <button
                            onClick={() => openReceiveModal(po)}
                            className="px-3 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition shadow-2xs"
                          >
                            Receive Goods
                          </button>
                        ) : <span className="text-[11px] text-gray-400">—</span>}
                      </td>
                    </tr>
                  ))}
                  {purchaseOrders.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        No purchase orders found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Customer Returns */}
      {subTab === 'RETURNS' && (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Return #</th>
                    <th className="py-2.5 px-3">Order Number</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Inspection Status</th>
                    <th className="py-2.5 px-3">Disposition Outcome</th>
                    <th className="py-2.5 px-3">Refund Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {returns.map((ret) => {
                    const reasonDisplay = ret.reasonCode
                      ? ret.reasonCode.replace(/_/g, ' ')
                      : (ret.lines?.[0]?.notes || (ret.lines?.[0] as any)?.reason || 'Customer Return');

                    const refundAmount =
                      ret.refundAmountMinor ?? (ret as any).totalRefundMinor ?? 0;

                    return (
                      <tr key={ret.id} className="hover:bg-gray-50 transition">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{ret.returnNumber}</td>
                        <td className="py-2.5 px-3 font-semibold text-gray-900">{ret.orderNumber}</td>
                        <td className="py-2.5 px-3">{ret.customerName}</td>
                        <td className="py-2.5 px-3 capitalize text-gray-800">{reasonDisplay}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              ret.status === 'INSPECTED' || ret.status === 'CLOSED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ret.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-gray-900">
                          {(ret.lines || []).map((l) => l.disposition || 'Pending Inspection').join(', ') || 'Pending'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-emerald-700">
                            {ret.refundStatus || 'Pending'} {refundAmount > 0 ? `(£${(refundAmount / 100).toFixed(2)})` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => openReturnModal(ret)}
                            className="px-3 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-md transition"
                          >
                            Inspect & Dispose
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {returns.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        No customer returns recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Suppliers */}
      {subTab === 'SUPPLIERS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-gray-900">Suppliers Directory</h2>
              <p className="text-xs text-gray-500">Manage suppliers used to create purchase orders.</p>
            </div>
            <button onClick={() => setShowSupplierForm(value => !value)} className="px-3 py-2 rounded-md bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">
              {showSupplierForm ? 'Close Form' : '+ Add Supplier'}
            </button>
          </div>

          {showSupplierForm && (
            <form onSubmit={handleCreateSupplier} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <h3 className="font-bold text-sm text-gray-900">Create Supplier</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <label className="text-xs font-medium text-gray-600">Supplier Name
                  <input required maxLength={160} value={supplierForm.name} onChange={e => setSupplierForm({ ...supplierForm, name: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-600">Supplier Code
                  <input required maxLength={40} value={supplierForm.code} onChange={e => setSupplierForm({ ...supplierForm, code: e.target.value.toUpperCase() })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" placeholder="SUP-001" />
                </label>
                <label className="text-xs font-medium text-gray-600">Contact Person
                  <input maxLength={120} value={supplierForm.contactName} onChange={e => setSupplierForm({ ...supplierForm, contactName: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-600">Email
                  <input type="email" maxLength={254} value={supplierForm.email} onChange={e => setSupplierForm({ ...supplierForm, email: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-600">Phone
                  <input maxLength={40} value={supplierForm.phone} onChange={e => setSupplierForm({ ...supplierForm, phone: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-600">Payment Terms (days)
                  <input type="number" min="0" max="365" step="1" value={supplierForm.paymentTermsDays} onChange={e => setSupplierForm({ ...supplierForm, paymentTermsDays: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
                <label className="text-xs font-medium text-gray-600">Currency
                  <select value={supplierForm.currency} onChange={e => setSupplierForm({ ...supplierForm, currency: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm">
                    {['GBP', 'USD', 'EUR', 'PKR', 'AED', 'SAR'].map(currency => <option key={currency} value={currency}>{currency}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">Lead Time (days)
                  <input type="number" min="0" max="365" step="1" value={supplierForm.leadTimeDays} onChange={e => setSupplierForm({ ...supplierForm, leadTimeDays: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-md p-2 text-sm" />
                </label>
              </div>
              <div className="flex justify-end">
                <button type="submit" disabled={savingSupplier} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-xs font-semibold disabled:opacity-50">{savingSupplier ? 'Saving...' : 'Save Supplier'}</button>
              </div>
            </form>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suppliers.map((s) => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-2xs space-y-2 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm">{s.name}</h3>
                  <div className="text-gray-500 font-mono text-[11px]">Vendor Code: {s.code}</div>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[10px]">
                  Active Supplier
                </span>
              </div>
              <div className="space-y-1 text-gray-700 pt-2 border-t border-gray-100">
                <div>
                  <span className="font-medium text-gray-500">Contact Person:</span> {s.contactName}
                </div>
                <div>
                  <span className="font-medium text-gray-500">Email:</span> {s.email}
                </div>
                <div>
                  <span className="font-medium text-gray-500">Payment Terms:</span> Net {s.paymentTermsDays} Days
                </div>
                <div>
                  <span className="font-medium text-gray-500">Default Currency:</span> {s.currency}
                </div>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && (
            <div className="col-span-2 py-8 text-center text-gray-400 bg-white rounded-lg border border-gray-200">
              No suppliers configured.
            </div>
          )}
          </div>
        </div>
      )}

      {/* Tab: Customers Directory */}
      {subTab === 'CUSTOMERS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 bg-white p-3 border border-gray-200 rounded-lg shadow-2xs">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Search customers by name, email or city..."
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-md focus:outline-indigo-500"
              />
            </div>
            <div className="text-xs text-gray-500">
              Showing <strong className="text-gray-900">{customerList.length}</strong> active buyer profiles
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-3">Customer Name</th>
                    <th className="py-2.5 px-3">Email Address</th>
                    <th className="py-2.5 px-3">Primary Shipping Address</th>
                    <th className="py-2.5 px-3 text-center">Orders Placed</th>
                    <th className="py-2.5 px-3 text-right">Lifetime Spend</th>
                    <th className="py-2.5 px-3">Recent Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {customerList.map((c, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition">
                      <td className="py-2.5 px-3 font-semibold text-gray-900 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                          {c.name.charAt(0)}
                        </div>
                        <span>{c.name}</span>
                      </td>
                      <td className="py-2.5 px-3 text-gray-600 font-mono text-[11px]">{c.email}</td>
                      <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">{c.address}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                          {c.orderCount}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                        £{(c.totalSpendMinor / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-gray-500 font-mono text-[11px]">
                        {c.recentOrderDate.split('T')[0]} ({c.recentStatus})
                      </td>
                    </tr>
                  ))}
                  {customerList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-400">
                        No customer profiles matching search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Receive Goods Modal (FR-PO-02, AT-06) */}
      {selectedPo && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <PackageCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Goods Receiving: {selectedPo.poNumber}</h3>
              </div>
              <button onClick={() => setSelectedPo(null)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-gray-600">
              Enter physical received quantities. Shortages and damages will automatically generate discrepancy notes, post to the <strong>Stock Ledger</strong>, and update GRNI liability.
            </p>

            <div className="space-y-3">
              {(selectedPo.lines || []).map((line) => {
                const input = receiveInputs[line.productId] || { received: 0, damaged: 0 };
                return (
                  <div key={line.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                    <div className="flex justify-between font-bold text-gray-900">
                      <span>{line.sku}</span>
                      <span>Total Ordered: {line.orderedQty} (Already rec'd: {line.receivedQty})</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Received (Sellable)</label>
                        <input
                          type="number"
                          value={input.received}
                          onChange={(e) => {
                            setReceiveInputs({
                              ...receiveInputs,
                              [line.productId]: { ...input, received: parseInt(e.target.value, 10) || 0 },
                            });
                            setReceiptRequestId(window.crypto.randomUUID());
                          }}
                          className="w-full border border-gray-300 rounded p-1.5 font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-gray-600 font-medium mb-1">Damaged on Arrival</label>
                        <input
                          type="number"
                          value={input.damaged}
                          onChange={(e) => {
                            setReceiveInputs({
                              ...receiveInputs,
                              [line.productId]: { ...input, damaged: parseInt(e.target.value, 10) || 0 },
                            });
                            setReceiptRequestId(window.crypto.randomUUID());
                          }}
                          className="w-full border border-gray-300 rounded p-1.5 font-bold text-rose-700"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Receiving / Discrepancy Note</label>
                <textarea
                  value={discrepancyNote}
                  onChange={(e) => {
                    setDiscrepancyNote(e.target.value);
                    setReceiptRequestId(window.crypto.randomUUID());
                  }}
                  placeholder="e.g. Inbound pallet 1 of 2. Remainder backordered by supplier."
                  className="w-full border border-gray-300 rounded p-2"
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setSelectedPo(null)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReceipt}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-xs shadow-2xs"
              >
                Post Goods Receipt to Ledger
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Disposition Modal (FR-RET-02, AT-10) */}
      {selectedReturn && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <RotateCcw className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">
                  Inspect & Dispose Return {selectedReturn.returnNumber}
                </h3>
              </div>
              <button onClick={() => setSelectedReturn(null)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <p className="text-gray-600">
              Assign inspection outcome for each unit: <strong>Restock</strong> (returns to available sellable inventory), <strong>Damaged</strong> (moves to damaged quarantine), or <strong>Dispose</strong>.
            </p>

            <div className="space-y-3">
              {(selectedReturn.lines || []).map((line) => (
                <div key={line.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>{line.sku}</span>
                    <span>Quantity: {line.quantity}</span>
                  </div>

                  <div>
                    <label className="block text-gray-600 font-medium mb-1">Target Disposition Outcome</label>
                    <select
                      value={returnDispositions[line.id] || 'RESTOCK'}
                      onChange={(e) =>
                        setReturnDispositions({
                          ...returnDispositions,
                          [line.id]: e.target.value,
                        })
                      }
                      className="w-full border border-gray-300 rounded p-1.5 bg-white font-medium"
                    >
                      <option value="RESTOCK">Restock (Re-enter sellable On-Hand)</option>
                      <option value="DAMAGED">Damaged (Move to damaged quarantine location)</option>
                      <option value="QUARANTINE">Quarantine (Hold pending specialist test)</option>
                      <option value="DISPOSE">Dispose / Scrap (Do not add back to stock)</option>
                    </select>
                  </div>
                </div>
              ))}

              <label className="flex items-center space-x-2 text-gray-700 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={issueRefund}
                  onChange={(e) => setIssueRefund(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>
                  Issue & Record Refund in Financial Ledger (£{(((selectedReturn.refundAmountMinor ?? (selectedReturn as any).totalRefundMinor ?? 0)) / 100).toFixed(2)})
                </span>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-gray-200">
              <button
                onClick={() => setSelectedReturn(null)}
                className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDisposition}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-xs shadow-2xs"
              >
                Finalize Inspection & Post Ledger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
