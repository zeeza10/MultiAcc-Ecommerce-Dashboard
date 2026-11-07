import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Download,
  AlertTriangle,
  Lock,
  Tag,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api';
import { Product, User, SystemConfig } from '../types';

interface ProductsViewProps {
  currentUser: User;
  config: SystemConfig;
  initialFilter?: any;
}

export const ProductsView: React.FC<ProductsViewProps> = ({
  currentUser,
  config,
  initialFilter,
}) => {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState(initialFilter?.filter === 'LOW_STOCK');
  const [showAddModal, setShowAddModal] = useState(false);

  // New product form
  const [newSku, setNewSku] = useState('');
  const [newName, setNewName] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newCategory, setNewCategory] = useState('Audio');
  const [newCost, setNewCost] = useState('25.00');
  const [newPrice, setNewPrice] = useState('59.99');
  const [newThreshold, setNewThreshold] = useState('15');
  const [newReorder, setNewReorder] = useState('50');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    loadProducts();
  }, [currentUser.id]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const res = await api.getProducts();
      setProducts(res.products);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newSku.trim() || !newName.trim()) {
      setFormError('SKU and Product Name are required.');
      return;
    }

    try {
      await api.createProduct({
        sku: newSku.trim().toUpperCase(),
        name: newName.trim(),
        barcode: newBarcode.trim() || undefined,
        category: newCategory,
        costPriceMinor: Math.round(parseFloat(newCost || '0') * 100),
        sellingPriceMinor: Math.round(parseFloat(newPrice || '0') * 100),
        lowStockThreshold: parseInt(newThreshold, 10) || 10,
        reorderLevel: parseInt(newReorder, 10) || 30,
        ownerType: currentUser.role === 'CLIENT_USER' ? 'CLIENT' : 'OPERATOR',
        ownerId: currentUser.role === 'CLIENT_USER' ? currentUser.clientId : 'operator',
      });

      setShowAddModal(false);
      // Reset form
      setNewSku('');
      setNewName('');
      setNewBarcode('');
      loadProducts();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create product');
    }
  };

  const exportCsv = () => {
    const headers = ['SKU', 'Product Name', 'Category', 'Barcode', 'Available', 'On Hand', 'Reserved', 'Incoming', 'Threshold'];
    const rows = products.map((p) => [
      `"${p.sku}"`,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${p.category}"`,
      `"${p.barcode || ''}"`,
      p.stockAvailable,
      p.stockOnHand,
      p.stockReserved,
      p.stockIncoming,
      p.lowStockThreshold,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Product_Catalog_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const isWarehouseStaff = currentUser.role === 'WAREHOUSE_STAFF';

  const filteredProducts = products.filter((p) => {
    if (filterLowStockOnly && p.stockAvailable > p.lowStockThreshold) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      p.sku.toLowerCase().includes(s) ||
      p.name.toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s) ||
      (p.barcode && p.barcode.toLowerCase().includes(s))
    );
  });

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Products & SKU Catalog</h1>
          <p className="text-xs text-gray-500">
            Master SKU definitions with real-time ledger-backed inventory levels and threshold alerts.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-2xs transition"
          >
            <Download className="w-3.5 h-3.5 text-gray-500" />
            <span>Export Catalog</span>
          </button>

          {!isWarehouseStaff && currentUser.role !== 'VIEWER' && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 shadow-2xs transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Warehouse Staff Privacy Banner */}
      {isWarehouseStaff && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800 flex items-center space-x-2">
          <Lock className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Role Restriction Enforced (SRS S4):</strong> Cost prices and gross margins are redacted from warehouse staff view.
          </span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex-1 min-w-[240px] relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SKU code, product title, category, barcode..."
            className="w-full pl-8 pr-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-1.5 cursor-pointer text-gray-700 font-medium">
            <input
              type="checkbox"
              checked={filterLowStockOnly}
              onChange={(e) => setFilterLowStockOnly(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Show Low Stock Only</span>
          </label>
        </div>
      </div>

      {/* Catalog Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-2.5 px-3">SKU Code</th>
                <th className="py-2.5 px-3">Product Name & Category</th>
                <th className="py-2.5 px-3">Owner</th>
                <th className="py-2.5 px-3">Barcode</th>
                {!isWarehouseStaff && <th className="py-2.5 px-3">Unit Cost (£)</th>}
                {!isWarehouseStaff && <th className="py-2.5 px-3">Selling Price (£)</th>}
                <th className="py-2.5 px-3">Available</th>
                <th className="py-2.5 px-3">On Hand</th>
                <th className="py-2.5 px-3">Reserved</th>
                <th className="py-2.5 px-3">Incoming</th>
                <th className="py-2.5 px-3 text-right">Threshold</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-gray-500">
                    Loading catalog items...
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-gray-500">
                    No products found.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isLow = p.stockAvailable <= p.lowStockThreshold;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50/80 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                        {p.sku}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-gray-900">{p.name}</div>
                        <div className="text-[11px] text-gray-500">{p.category}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            p.ownerType === 'OPERATOR'
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}
                        >
                          {p.ownerType === 'OPERATOR' ? 'Operator' : '3PL Apex'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-gray-500 text-[11px]">
                        {p.barcode || '—'}
                      </td>
                      {!isWarehouseStaff && (
                        <td className="py-2.5 px-3 font-medium text-gray-700">
                          £{(p.costPriceMinor / 100).toFixed(2)}
                        </td>
                      )}
                      {!isWarehouseStaff && (
                        <td className="py-2.5 px-3 font-bold text-gray-900">
                          £{(p.sellingPriceMinor / 100).toFixed(2)}
                        </td>
                      )}
                      <td className="py-2.5 px-3">
                        <span
                          className={`font-bold px-2 py-0.5 rounded text-xs ${
                            isLow
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {p.stockAvailable} units
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-gray-900">{p.stockOnHand}</td>
                      <td className="py-2.5 px-3 text-indigo-700 font-medium">{p.stockReserved}</td>
                      <td className="py-2.5 px-3 text-blue-700 font-medium">{p.stockIncoming}</td>
                      <td className="py-2.5 px-3 text-right text-gray-500 font-mono">
                        ≤ {p.lowStockThreshold}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-gray-900">Create Catalog Product & SKU</h3>
              </div>
              <button onClick={() => setShowAddModal(false)}>
                <XCircle className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateProduct} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">SKU Code *</label>
                  <input
                    type="text"
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="e.g. NX-MIC-006"
                    className="w-full border border-gray-300 rounded-md p-2 font-mono uppercase"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2 bg-white"
                  >
                    <option value="Audio">Audio</option>
                    <option value="Video">Video</option>
                    <option value="Peripherals">Peripherals</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Packaging">Packaging</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Product Title *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Studio Condenser USB Microphone"
                  className="w-full border border-gray-300 rounded-md p-2"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Barcode / EAN</label>
                <input
                  type="text"
                  value={newBarcode}
                  onChange={(e) => setNewBarcode(e.target.value)}
                  placeholder="e.g. 5060001001099"
                  className="w-full border border-gray-300 rounded-md p-2 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Cost Price (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Selling Price (£)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Low Stock Alert Threshold</label>
                  <input
                    type="number"
                    value={newThreshold}
                    onChange={(e) => setNewThreshold(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Reorder Target Level</label>
                  <input
                    type="number"
                    value={newReorder}
                    onChange={(e) => setNewReorder(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 font-medium rounded-md text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md text-xs shadow-2xs"
                >
                  Save Product to Catalog
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
