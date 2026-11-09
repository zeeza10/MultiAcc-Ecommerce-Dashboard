import React, { useState, useEffect } from 'react';
import {
  Calculator,
  DollarSign,
  TrendingUp,
  Percent,
  Download,
  Save,
  CheckCircle2,
  HelpCircle,
  Package,
  Truck,
  Layers,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { DropshippingCalculation, Product, User } from '../types';
import { api } from '../services/api';

interface DropshippingCalculatorViewProps {
  currentUser: User;
}

export const DropshippingCalculatorView: React.FC<DropshippingCalculatorViewProps> = ({ currentUser }) => {
  const [calculationOption, setCalculationOption] = useState<'SHIPPING_INCLUDED' | 'SHIPPING_EXCLUDED'>('SHIPPING_INCLUDED');
  const [currency, setCurrency] = useState<'GBP' | 'USD' | 'EUR'>('GBP');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedSku, setSelectedSku] = useState<string>('CUSTOM');
  const [savedSimulations, setSavedSimulations] = useState<DropshippingCalculation[]>([]);
  const [loading, setLoading] = useState(true);

  // Form Inputs
  const [productName, setProductName] = useState('Nexus Pro Active Noise-Cancelling Headphones');
  const [skuInput, setSkuInput] = useState('NX-AUD-001');
  const [supplierName, setSupplierName] = useState('Anker Innovations Technology Ltd');
  const [purchaseCost, setPurchaseCost] = useState('38.00');
  const [shippingCost, setShippingCost] = useState('4.50');
  const [packagingCost, setPackagingCost] = useState('1.20');
  const [additionalExpenses, setAdditionalExpenses] = useState('0.50');
  const [sellingPrice, setSellingPrice] = useState('89.99');
  const [shippingChargedToCustomer, setShippingChargedToCustomer] = useState('0.00');
  const [marketplaceFeePercent, setMarketplaceFeePercent] = useState('12.8');
  const [otherCosts, setOtherCosts] = useState('0.30');

  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const currencySymbol = currency === 'GBP' ? '£' : currency === 'USD' ? '$' : '€';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, calcRes] = await Promise.all([
        api.getProducts(),
        api.getDropshippingCalculations(),
      ]);
      setProducts(prodRes.products || []);
      setSavedSimulations(calcRes.calculations || []);
    } catch (err) {
      console.error('Failed to load dropshipping calculator initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleProductSelect = (sku: string) => {
    setSelectedSku(sku);
    if (sku === 'CUSTOM') {
      setProductName('Custom Dropshipped Product');
      setSkuInput('DS-NEW-01');
      setSupplierName('Global Supplier Direct');
      setPurchaseCost('25.00');
      setSellingPrice('59.99');
      return;
    }
    const found = products.find((p) => p.sku === sku);
    if (found) {
      setProductName(found.name);
      setSkuInput(found.sku);
      setPurchaseCost((found.costPriceMinor / 100).toFixed(2));
      setSellingPrice((found.sellingPriceMinor / 100).toFixed(2));
    }
  };

  // Live Math
  const numPurchase = parseFloat(purchaseCost) || 0;
  const numShipping = parseFloat(shippingCost) || 0;
  const numPackaging = parseFloat(packagingCost) || 0;
  const numAdditional = parseFloat(additionalExpenses) || 0;
  const numSelling = parseFloat(sellingPrice) || 0;
  const numShippingCharged = parseFloat(shippingChargedToCustomer) || 0;
  const numFeePercent = parseFloat(marketplaceFeePercent) || 0;
  const numOther = parseFloat(otherCosts) || 0;

  let totalProductCost = 0;
  let grossProfit = 0;
  let marketplaceFeeAmount = 0;
  let netProfit = 0;
  let marginPercent = 0;

  if (calculationOption === 'SHIPPING_INCLUDED') {
    // Option A: Total Product Cost = Purchase Cost + Shipping Cost + Packaging Cost + Additional Expenses
    totalProductCost = numPurchase + numShipping + numPackaging + numAdditional;
    grossProfit = numSelling - totalProductCost;
    marketplaceFeeAmount = (numSelling * numFeePercent) / 100;
    netProfit = grossProfit - marketplaceFeeAmount - numOther;
    marginPercent = numSelling > 0 ? (grossProfit / numSelling) * 100 : 0;
  } else {
    // Option B: Total Product Cost = Purchase Cost + Packaging Cost + Additional Expenses
    // Gross Profit = (Selling Price + Shipping Charged to Customer) - (Total Product Cost + Actual Shipping Cost)
    totalProductCost = numPurchase + numPackaging + numAdditional;
    const totalRevenue = numSelling + numShippingCharged;
    const totalOutlay = totalProductCost + numShipping;
    grossProfit = totalRevenue - totalOutlay;
    marketplaceFeeAmount = (totalRevenue * numFeePercent) / 100;
    netProfit = grossProfit - marketplaceFeeAmount - numOther;
    marginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  }

  const handleSaveCalculation = async () => {
    try {
      const res = await api.saveDropshippingCalculation({
        sku: skuInput,
        productName,
        supplierName,
        purchaseCostMinor: Math.round(numPurchase * 100),
        supplierCostMinor: Math.round(numPurchase * 100),
        shippingCostMinor: Math.round(numShipping * 100),
        packagingCostMinor: Math.round(numPackaging * 100),
        additionalExpensesMinor: Math.round(numAdditional * 100),
        sellingPriceMinor: Math.round(numSelling * 100),
        marketplaceFeePercent: numFeePercent,
        marketplaceFeeMinor: Math.round(marketplaceFeeAmount * 100),
        otherCostsMinor: Math.round(numOther * 100),
        shippingOption: calculationOption,
        shippingChargedToCustomerMinor: Math.round(numShippingCharged * 100),
        totalCostMinor: Math.round(totalProductCost * 100),
        grossProfitMinor: Math.round(grossProfit * 100),
        marginPercent: parseFloat(marginPercent.toFixed(2)),
        netProfitMinor: Math.round(netProfit * 100),
        currency,
        updatedBy: currentUser.name,
      });

      setSaveSuccessMessage(`Simulation saved for SKU ${res.calculation.sku}`);
      setTimeout(() => setSaveSuccessMessage(null), 3000);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to save dropshipping simulation');
    }
  };

  const exportSimulationsCsv = () => {
    const headers = [
      'SKU',
      'Product Name',
      'Supplier',
      'Option',
      'Currency',
      'Purchase Cost',
      'Shipping Cost',
      'Packaging Cost',
      'Selling Price',
      'Total Cost',
      'Gross Profit',
      'Margin %',
      'Net Profit',
      'Timestamp',
    ];
    const rows = savedSimulations.map((c) => [
      `"${c.sku}"`,
      `"${c.productName.replace(/"/g, '""')}"`,
      `"${c.supplierName.replace(/"/g, '""')}"`,
      `"${c.shippingOption}"`,
      `"${c.currency}"`,
      `"${(c.purchaseCostMinor / 100).toFixed(2)}"`,
      `"${(c.shippingCostMinor / 100).toFixed(2)}"`,
      `"${(c.packagingCostMinor / 100).toFixed(2)}"`,
      `"${(c.sellingPriceMinor / 100).toFixed(2)}"`,
      `"${(c.totalCostMinor / 100).toFixed(2)}"`,
      `"${(c.grossProfitMinor / 100).toFixed(2)}"`,
      `"${c.marginPercent}%"`,
      `"${(c.netProfitMinor / 100).toFixed(2)}"`,
      `"${c.updatedAt}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Dropshipping_Calculations_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Phase 1 • Cost Accounting
            </span>
            <span className="text-xs text-slate-400 font-medium">Dropshipping Margin Engine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mt-1">
            Dropshipping Cost & Profitability Calculator
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Calculate actual landed cost, eBay marketplace fees, gross profit, and net margin before or after shipping inclusion.
          </p>
        </div>

        {/* Currency & Actions */}
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
            <button
              onClick={() => setCurrency('GBP')}
              className={`px-3 py-1 rounded font-semibold transition ${
                currency === 'GBP'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              GBP (£)
            </button>
            <button
              onClick={() => setCurrency('USD')}
              className={`px-3 py-1 rounded font-semibold transition ${
                currency === 'USD'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              USD ($)
            </button>
            <button
              onClick={() => setCurrency('EUR')}
              className={`px-3 py-1 rounded font-semibold transition ${
                currency === 'EUR'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              EUR (€)
            </button>
          </div>

          <button
            onClick={exportSimulationsCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {saveSuccessMessage && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-400 text-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* Calculation Formula Toggle: Option A vs Option B */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => setCalculationOption('SHIPPING_INCLUDED')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            calculationOption === 'SHIPPING_INCLUDED'
              ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 ring-2 ring-indigo-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Option A – Shipping Included
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-300 font-medium">
              Free Shipping Model
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
            Calculate the complete landed cost with shipping rolled into the product purchase price.
          </p>
          <div className="text-[11px] font-mono bg-slate-100 dark:bg-slate-950 p-2 rounded text-slate-700 dark:text-slate-300">
            Total Cost = Purchase + Shipping + Packaging + Extra
            <br />
            Gross Profit = Selling Price - Total Cost
          </div>
        </div>

        <div
          onClick={() => setCalculationOption('SHIPPING_EXCLUDED')}
          className={`cursor-pointer p-4 rounded-xl border transition ${
            calculationOption === 'SHIPPING_EXCLUDED'
              ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-500 ring-2 ring-indigo-500/20'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Option B – Shipping Excluded
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/50 text-purple-800 dark:text-purple-300 font-medium">
              Buyer Paid Shipping Model
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
            Calculate product cost separately, with buyer shipping revenue and carrier shipping cost tracked independently.
          </p>
          <div className="text-[11px] font-mono bg-slate-100 dark:bg-slate-950 p-2 rounded text-slate-700 dark:text-slate-300">
            Total Cost = Purchase + Packaging + Extra
            <br />
            Gross Profit = (Selling + Ship Charged) - (Total Cost + Actual Ship)
          </div>
        </div>
      </div>

      {/* Main Simulator & Output Visualizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Inputs (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-indigo-500" />
              Product Parameters & Cost Components
            </h3>

            {/* Catalog SKU Loader */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Preset SKU:</span>
              <select
                value={selectedSku}
                onChange={(e) => handleProductSelect(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="CUSTOM">Custom Simulation</option>
                {products.map((p) => (
                  <option key={p.id} value={p.sku}>
                    {p.sku} - {p.name.slice(0, 22)}...
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Product Name</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">SKU Reference</label>
              <input
                type="text"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-slate-600 dark:text-slate-400 mb-1">Supplier / Sourcing Partner</label>
            <input
              type="text"
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Pricing & Cost Grids */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Purchase / Factory Cost</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={purchaseCost}
                  onChange={(e) => setPurchaseCost(e.target.value)}
                  className="w-full pl-6 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Actual Shipping Cost</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  className="w-full pl-6 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Packaging Cost</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={packagingCost}
                  onChange={(e) => setPackagingCost(e.target.value)}
                  className="w-full pl-6 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Selling Price (eBay/Store)</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="w-full pl-6 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono font-bold text-emerald-600"
                />
              </div>
            </div>

            {calculationOption === 'SHIPPING_EXCLUDED' && (
              <div>
                <label className="block text-slate-600 dark:text-slate-400 mb-1">Shipping Charged to Buyer</label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-slate-400">{currencySymbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={shippingChargedToCustomer}
                    onChange={(e) => setShippingChargedToCustomer(e.target.value)}
                    className="w-full pl-6 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Marketplace Fee (%)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={marketplaceFeePercent}
                  onChange={(e) => setMarketplaceFeePercent(e.target.value)}
                  className="w-full pr-7 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
                />
                <span className="absolute right-2.5 top-2 text-slate-400">%</span>
              </div>
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-400 mb-1">Other Incidental Costs</label>
              <div className="relative">
                <span className="absolute left-2.5 top-2 text-slate-400">{currencySymbol}</span>
                <input
                  type="number"
                  step="0.01"
                  value={otherCosts}
                  onChange={(e) => setOtherCosts(e.target.value)}
                  className="w-full pl-6 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-2 text-slate-900 dark:text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
            <button
              onClick={handleSaveCalculation}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs flex items-center gap-2 shadow-sm shadow-indigo-600/20"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save & Record Simulation</span>
            </button>
          </div>
        </div>

        {/* Right Output Dashboard (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center justify-between">
              <span>Financial Profitability Card</span>
              <span className="text-[11px] font-mono text-indigo-500">{skuInput}</span>
            </h3>

            {/* Big Margin Display */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center mb-4">
              <div className="text-xs text-slate-500 font-medium">Profit Margin Percentage</div>
              <div
                className={`text-4xl font-extrabold font-mono mt-1 ${
                  marginPercent >= 30
                    ? 'text-emerald-500'
                    : marginPercent >= 15
                    ? 'text-amber-500'
                    : 'text-rose-500'
                }`}
              >
                {marginPercent.toFixed(2)}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {marginPercent >= 30 ? 'High-Margin Product' : 'Standard E-Commerce Range'}
              </div>
            </div>

            {/* Breakdown Waterfall */}
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Total Product Cost:</span>
                <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                  {currencySymbol}{totalProductCost.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Gross Profit:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                  {currencySymbol}{grossProfit.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <span>Marketplace Fees ({numFeePercent}%):</span>
                <span className="font-mono text-rose-500">-{currencySymbol}{marketplaceFeeAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800 text-slate-500">
                <span>Other Costs:</span>
                <span className="font-mono text-rose-500">-{currencySymbol}{numOther.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-2 text-sm font-bold bg-emerald-500/10 rounded-lg px-3">
                <span className="text-emerald-700 dark:text-emerald-300">Estimated Net Profit:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {currencySymbol}{netProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Saved Simulations History */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Historical Dropshipping Product Simulations
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Saved simulations audited with timestamps and profitability benchmarks.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold uppercase text-[11px]">
              <tr>
                <th className="py-2.5 px-3">SKU</th>
                <th className="py-2.5 px-3">Product Name</th>
                <th className="py-2.5 px-3">Option Mode</th>
                <th className="py-2.5 px-3 text-right">Landed Cost</th>
                <th className="py-2.5 px-3 text-right">Selling Price</th>
                <th className="py-2.5 px-3 text-right">Gross Profit</th>
                <th className="py-2.5 px-3 text-center">Margin %</th>
                <th className="py-2.5 px-3 text-right">Net Profit</th>
                <th className="py-2.5 px-3">Simulated By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {savedSimulations.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                  <td className="py-3 px-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">{s.sku}</td>
                  <td className="py-3 px-3 font-medium text-slate-900 dark:text-slate-100">{s.productName}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800">
                      {s.shippingOption === 'SHIPPING_INCLUDED' ? 'Option A (Included)' : 'Option B (Excluded)'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-500">
                    £{(s.totalCostMinor / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                    £{(s.sellingPriceMinor / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                    £{(s.grossProfitMinor / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-center font-mono font-bold text-emerald-500">
                    {s.marginPercent}%
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    £{(s.netProfitMinor / 100).toFixed(2)}
                  </td>
                  <td className="py-3 px-3 text-slate-400 text-[11px]">{s.updatedBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
