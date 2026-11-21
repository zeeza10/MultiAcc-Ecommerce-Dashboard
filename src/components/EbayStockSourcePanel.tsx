import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw, Store, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

type ListingRow = {
  accountId: string;
  accountName: string;
  sku: string;
  title: string;
  itemId?: string;
  status: string;
  quantity: number | null;
  price?: string;
  currency?: string;
  syncedAt?: string;
};

type SkuMapping = {
  id: string;
  marketplaceAccountId: string;
  productId: string;
  externalSku: string;
  externalListingId: string;
  listingTitle: string;
  internalSku: string;
  internalName: string;
};

type ProductOption = { id: string; sku: string; name: string };

interface EbayStockSourcePanelProps {
  selectedStoreId: string;
  selectedEnvironment: 'DEMO' | 'SANDBOX' | 'PRODUCTION';
  localRecords?: any[];
  stockRecords?: any[];
  allocationRecords?: any[];
  onCreateProduct?: () => void;
  mode: 'PRODUCTS' | 'INVENTORY';
  onAllocationSaved?: () => void | Promise<void>;
}

const money = (value: unknown, currency = 'GBP') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
};

const rowKey = (row: ListingRow) => `${row.accountId}:${row.sku}`;

export const EbayStockSourcePanel: React.FC<EbayStockSourcePanelProps> = ({ selectedStoreId, selectedEnvironment, localRecords = [], stockRecords = [], allocationRecords = [], onCreateProduct, mode, onAllocationSaved }) => {
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [mappings, setMappings] = useState<SkuMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState('');
  const [allocationInputs, setAllocationInputs] = useState<Record<string, { allocated: string; reserved: string }>>({});
  const [savingAllocationKey, setSavingAllocationKey] = useState('');

  const products = useMemo<ProductOption[]>(() => {
    const seen = new Set<string>();
    return localRecords.map(record => ({
      id: String(record.id || record.productId || ''),
      sku: String(record.sku || '').trim(),
      name: String(record.name || record.productName || record.sku || 'Product'),
    })).filter(product => {
      if (!product.id || !product.sku || seen.has(product.id)) return false;
      seen.add(product.id);
      return true;
    });
  }, [localRecords]);

  const load = useCallback(async () => {
    if (selectedEnvironment !== 'PRODUCTION') {
      setRows([]);
      setMappings([]);
      setUpdatedAt(null);
      setLoading(false);
      setError('Switch the dashboard environment to Production to view and map live eBay seller listings. Demo and Sandbox data remain isolated.');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const accountResult = await api.getEbayAccounts(selectedStoreId);
      const accounts = (accountResult.accounts || []).filter((account: any) =>
        account.environment === 'PRODUCTION' && !account.isDemo &&
        account.authStatus === 'CONNECTED' &&
        (selectedStoreId === 'ALL' || account.id === selectedStoreId)
      );
      const accountData = await Promise.all(accounts.map(async (account: any) => {
        const [result, mappingResult] = await Promise.all([
          api.getEbayListings(account.id, 100, 0),
          api.getEbaySkuMappings(account.id),
        ]);
        const sourceRows = [
          ...(result.tradingListings || []),
          ...(result.listings || []).map((listing: any) => ({
            ...listing,
            itemId: listing.itemId || listing.offers?.[0]?.listingId,
          })),
        ];
        const unique = new Map<string, ListingRow>();
        sourceRows.forEach((listing: any) => {
          const sku = String(listing.sku || '').trim();
          if (!sku) return;
          const row: ListingRow = {
            accountId: account.id,
            accountName: account.name || account.sellerUsername || 'eBay Seller',
            sku,
            title: String(listing.title || listing.product?.title || 'Untitled listing'),
            itemId: listing.itemId || listing.offerId,
            status: String(listing.listingStatus || 'UNKNOWN'),
            quantity: listing.inventoryQuantity == null ? null : Number(listing.inventoryQuantity),
            price: (listing.offers?.[0]?.pricingSummary?.price?.value ?? listing.offers?.[0]?.price?.value) == null ? undefined : String(listing.offers?.[0]?.pricingSummary?.price?.value ?? listing.offers?.[0]?.price?.value),
            currency: listing.offers?.[0]?.pricingSummary?.price?.currency ?? listing.offers?.[0]?.price?.currency ?? 'GBP',
            syncedAt: listing.syncedAt,
          };
          unique.set(`${row.sku}:${row.itemId || ''}`, row);
        });
        return { rows: [...unique.values()], mappings: mappingResult.mappings || [] };
      }));
      setRows(accountData.flatMap(item => item.rows));
      setMappings(accountData.flatMap(item => item.mappings));
      setUpdatedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'eBay listing data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId, selectedEnvironment]);

  useEffect(() => { void load(); }, [load]);

  const syncListings = async () => {
    if (selectedEnvironment !== 'PRODUCTION') {
      setError('Live eBay listing sync is available only in the Production workspace.');
      return;
    }
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const accountResult = await api.getEbayAccounts(selectedStoreId);
      const accounts = (accountResult.accounts || []).filter((account: any) =>
        account.environment === 'PRODUCTION' && !account.isDemo &&
        account.authStatus === 'CONNECTED' &&
        (selectedStoreId === 'ALL' || account.id === selectedStoreId)
      );
      if (!accounts.length) throw new Error('No connected Production seller accounts were found in the selected scope.');
      const results = await Promise.allSettled(accounts.map((account: any) => api.syncEbayActiveListings(account.id)));
      const successful = results.filter(result => result.status === 'fulfilled');
      const failed = results.filter(result => result.status === 'rejected');
      const fetched = successful.reduce((sum, result: any) => sum + Number(result.value?.fetched || 0), 0);
      const pending = successful.some((result: any) => result.value?.pagesPending);
      await load();
      setNotice(`eBay Listings sync completed for ${successful.length}/${accounts.length} connected seller(s); ${fetched} listing record(s) fetched.${pending ? ' More pages remain; run Sync again to continue.' : ''}`);
      if (failed.length) setError(`${failed.length} seller sync(s) failed. Check seller permissions and eBay connection status.`);
    } catch (err: any) {
      setError(err?.message || 'eBay Listings could not be synchronized.');
    } finally {
      setSyncing(false);
    }
  };

  const mappingByKey = useMemo(() => {
    const result = new Map<string, SkuMapping>();
    mappings.forEach(mapping => result.set(`${mapping.marketplaceAccountId}:${mapping.externalSku}`, mapping));
    return result;
  }, [mappings]);

  const localSkuByKey = useMemo(() => new Map(products.map(product => [product.sku.toLowerCase(), product.id])), [products]);
  const mappedCount = rows.filter(row => mappingByKey.has(rowKey(row))).length;
  const unmatchedCount = rows.length - mappedCount;

  const saveMapping = async (row: ListingRow) => {
    const key = rowKey(row);
    const productId = selectedProducts[key] || localSkuByKey.get(row.sku.toLowerCase()) || '';
    if (!productId) {
      setError('Please select an internal Product/SKU before saving this mapping.');
      return;
    }
    setSavingKey(key);
    setError('');
    setNotice('');
    try {
      await api.createEbaySkuMapping({
        marketplaceAccountId: row.accountId,
        productId,
        externalSku: row.sku,
        externalListingId: row.itemId,
        listingTitle: row.title,
      });
      const product = products.find(item => item.id === productId);
      setMappings(current => [...current, {
        id: `local:${key}`, marketplaceAccountId: row.accountId, productId,
        externalSku: row.sku, externalListingId: row.itemId || '', listingTitle: row.title,
        internalSku: product?.sku || '', internalName: product?.name || '',
      }]);
      setNotice(`External SKU ${row.sku} is now mapped to ${product?.sku || 'the selected product'}.`);
    } catch (err: any) {
      setError(err?.message || 'The SKU mapping could not be saved.');
    } finally {
      setSavingKey('');
    }
  };

  const saveAllocation = async (row: ListingRow, mapping: SkuMapping) => {
    const key = rowKey(row);
    const current = allocationRecords.find(record => String(record.productId || record.id || '') === mapping.productId);
    const values = allocationInputs[key] || {
      allocated: String(current?.onHand ?? 0),
      reserved: String(current?.reserved ?? 0),
    };
    const allocatedQuantity = Number(values.allocated);
    const reservedQuantity = Number(values.reserved);
    if (!Number.isSafeInteger(allocatedQuantity) || !Number.isSafeInteger(reservedQuantity)
      || allocatedQuantity < 0 || reservedQuantity < 0 || reservedQuantity > allocatedQuantity) {
      setError('Allocated and reserved quantities must be valid non-negative whole numbers.');
      return;
    }
    setSavingAllocationKey(key);
    setError('');
    setNotice('');
    try {
      await api.allocateStoreInventory({
        marketplaceAccountId: row.accountId,
        productId: mapping.productId,
        allocatedQuantity,
        reservedQuantity,
      });
      setAllocationInputs(currentInputs => ({
        ...currentInputs,
        [key]: { allocated: String(allocatedQuantity), reserved: String(reservedQuantity) },
      }));
      setNotice(`Store allocation saved for ${row.sku}. Physical warehouse stock was not changed.`);
      void onAllocationSaved?.();
    } catch (err: any) {
      setError(err?.message || 'Store allocation could not be saved. Check available physical stock and permissions.');
    } finally {
      setSavingAllocationKey('');
    }
  };

  return (
    <section className="rounded-xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700"><Store className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{mode === 'PRODUCTS' ? 'eBay Listing SKU Source & Mapping' : 'eBay Marketplace Stock Feed'}</h2>
            <p className="mt-1 text-xs text-slate-500">Production marketplace data · warehouse physical stock remains separate</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void load()} disabled={loading || syncing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button type="button" onClick={() => void syncListings()} disabled={loading || syncing || selectedEnvironment !== 'PRODUCTION'} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync from eBay'}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">eBay SKUs</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{rows.length}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Mapped to internal SKU</p><p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700">{mappedCount}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Mapping required</p><p className="mt-1 text-xl font-semibold tabular-nums text-amber-700">{unmatchedCount}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Connected scope</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedStoreId === 'ALL' ? 'All connected sellers' : 'Selected seller'}</p></div>
      </div>
      {mode === 'PRODUCTS' && products.length === 0 && rows.length > 0 && (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <span>No Production internal Products/SKUs exist yet. Create a real catalog product before mapping these eBay SKUs.</span>
          {onCreateProduct && <button type="button" onClick={onCreateProduct} className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 font-semibold text-white hover:bg-indigo-700">Create internal Product</button>}
        </div>
      )}
      {error && <div role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
            <th className="px-4 py-3 font-semibold">External SKU</th><th className="px-4 py-3 font-semibold">Listing</th><th className="px-4 py-3 font-semibold">Seller</th><th className="px-4 py-3 font-semibold">Price</th><th className="px-4 py-3 font-semibold">eBay Qty</th><th className="px-4 py-3 font-semibold">Physical Available</th><th className="px-4 py-3 font-semibold">Store Allocation</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Internal SKU Mapping</th><th className="px-4 py-3 font-semibold">Allocation Controls</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">Loading saved eBay listing and SKU mapping data…</td></tr> :
              rows.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-500">No synced Production eBay listing records found for this seller scope.</td></tr> :
              rows.map((row, index) => {
                const key = rowKey(row);
                const mapping = mappingByKey.get(key);
                const suggestedProductId = selectedProducts[key] || localSkuByKey.get(row.sku.toLowerCase()) || '';
                return <tr key={`${key}:${row.itemId || index}`} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-indigo-700">{row.sku}</td>
                  <td className="min-w-[220px] px-4 py-3"><p className="font-medium text-slate-800">{row.title}</p><p className="mt-0.5 text-[10px] text-slate-400">{row.itemId || 'Item ID unavailable'}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.accountName}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{row.price ? money(row.price, row.currency) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-slate-800">{row.quantity ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{mapping ? (() => {
                    const physical = stockRecords.find(record => String(record.productId || record.id || '') === mapping.productId) || localRecords.find(record => String(record.id || record.productId || '') === mapping.productId);
                    if (!physical) return '0';
                    const value = mode === 'INVENTORY'
                      ? physical.available ?? Math.max(0, Number(physical.onHand || 0) - Number(physical.reserved || 0))
                      : physical.stockAvailable ?? physical.available ?? 0;
                    return Number(value).toLocaleString('en-GB');
                  })() : 'Map SKU first'}</td>
                  <td className="min-w-[170px] px-4 py-3 text-[10px] text-slate-600">{mode !== 'INVENTORY' ? '—' : mapping ? (() => {
                    const allocation = allocationRecords.find(record => String(record.productId || record.id || '') === mapping.productId);
                    if (!allocation) return 'Not allocated';
                    return `${Number(allocation.onHand || 0)} allocated · ${Number(allocation.reserved || 0)} reserved · ${Number(allocation.available || 0)} available`;
                  })() : 'Map SKU first'}</td>
                  <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{row.status.replaceAll('_', ' ')}</span></td>
                  <td className="min-w-[230px] px-4 py-3">
                    {mapping ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />{mapping.internalSku || 'Mapped'} · {mapping.internalName || 'Product'}</span> :
                      <div className="flex min-w-[220px] items-center gap-2">
                        <select value={suggestedProductId} onChange={event => setSelectedProducts(current => ({ ...current, [key]: event.target.value }))} className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-700 focus:border-indigo-500 focus:outline-none">
                          <option value="">Select internal SKU</option>
                          {products.map(product => <option key={product.id} value={product.id}>{product.sku} — {product.name}</option>)}
                        </select>
                        <button type="button" onClick={() => void saveMapping(row)} disabled={!suggestedProductId || savingKey === key} className="rounded-md bg-indigo-600 px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{savingKey === key ? 'Saving…' : 'Map'}</button>
                      </div>}
                  </td>
                  <td className="min-w-[190px] px-4 py-3">
                    {mode === 'INVENTORY' && selectedStoreId !== 'ALL' && mapping ? (() => {
                      const current = localRecords.find(record => String(record.productId || record.id || '') === mapping.productId);
                      const values = allocationInputs[key] || {
                        allocated: String(current?.onHand ?? 0),
                        reserved: String(current?.reserved ?? 0),
                      };
                      return <div className="flex items-center gap-1.5">
                        <input type="number" min="0" step="1" aria-label={`Allocated quantity for ${row.sku}`} value={values.allocated}
                          onChange={event => setAllocationInputs(currentInputs => ({ ...currentInputs, [key]: { ...values, allocated: event.target.value } }))}
                          className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]" />
                        <input type="number" min="0" step="1" aria-label={`Reserved quantity for ${row.sku}`} value={values.reserved}
                          onChange={event => setAllocationInputs(currentInputs => ({ ...currentInputs, [key]: { ...values, reserved: event.target.value } }))}
                          className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]" />
                        <button type="button" onClick={() => void saveAllocation(row, mapping)} disabled={savingAllocationKey === key}
                          className="rounded-md bg-indigo-600 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{savingAllocationKey === key ? '…' : 'Save'}</button>
                      </div>;
                    })() : <span className="text-[10px] text-slate-400">{mode === 'INVENTORY' && selectedStoreId !== 'ALL' ? 'Map SKU first' : 'Select one seller in Inventory to allocate'}</span>}
                  </td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400 sm:flex-row sm:justify-between">
        <span>Mapping links seller SKU to an internal product. Store allocations are limited by available physical stock and never alter the physical stock ledger.</span>
        <span>{updatedAt ? `Loaded ${new Date(updatedAt).toLocaleString()}` : 'Not loaded yet'}</span>
      </div>
    </section>
  );
};
