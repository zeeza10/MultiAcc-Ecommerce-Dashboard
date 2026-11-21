import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link2, RefreshCw, Store, Package, AlertCircle } from 'lucide-react';
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

interface EbayStockSourcePanelProps {
  selectedStoreId: string;
  localRecords?: any[];
  mode: 'PRODUCTS' | 'INVENTORY';
}

const money = (value: unknown, currency = 'GBP') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
};

export const EbayStockSourcePanel: React.FC<EbayStockSourcePanelProps> = ({ selectedStoreId, localRecords = [], mode }) => {
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const accountResult = await api.getEbayAccounts(selectedStoreId);
      const accounts = (accountResult.accounts || []).filter((account: any) =>
        account.environment === 'PRODUCTION' && !account.isDemo &&
        account.authStatus === 'CONNECTED' &&
        (selectedStoreId === 'ALL' || account.id === selectedStoreId)
      );
      const pages = await Promise.all(accounts.map(async (account: any) => {
        const result = await api.getEbayListings(account.id, 100, 0);
        const sourceRows = [
          ...(result.tradingListings || []),
          ...(result.listings || []).map((listing: any) => ({
            ...listing,
            itemId: listing.itemId || listing.offers?.[0]?.listingId,
          })),
        ];
        return sourceRows.map((listing: any): ListingRow => {
          const offer = Array.isArray(listing.offers) ? listing.offers[0] : undefined;
          const priceValue = offer?.pricingSummary?.price?.value ?? offer?.price?.value;
          const currency = offer?.pricingSummary?.price?.currency ?? offer?.price?.currency ?? 'GBP';
          return {
            accountId: account.id,
            accountName: account.name || account.sellerUsername || 'eBay Seller',
            sku: String(listing.sku || '').trim(),
            title: String(listing.title || listing.product?.title || 'Untitled listing'),
            itemId: listing.itemId || listing.offerId,
            status: String(listing.listingStatus || 'UNKNOWN'),
            quantity: listing.inventoryQuantity == null ? null : Number(listing.inventoryQuantity),
            price: priceValue == null ? undefined : String(priceValue),
            currency,
            syncedAt: listing.syncedAt,
          };
        });
      }));
      setRows(pages.flat().filter(row => row.sku));
      setUpdatedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message || 'eBay listing data could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [selectedStoreId]);

  useEffect(() => { void load(); }, [load]);

  const localSkus = useMemo(() => new Set(localRecords.map(record => String(record.sku || '').trim().toLowerCase()).filter(Boolean)), [localRecords]);
  const matchedCount = rows.filter(row => localSkus.has(row.sku.toLowerCase())).length;
  const unmatchedCount = rows.length - matchedCount;

  return (
    <section className="rounded-xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50/80 to-white p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-indigo-100 p-2 text-indigo-700"><Store className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{mode === 'PRODUCTS' ? 'eBay Listing SKU Source' : 'eBay Marketplace Stock Feed'}</h2>
            <p className="mt-1 text-xs text-slate-500">Read-only marketplace data · physical warehouse stock remains separate</p>
          </div>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh listings
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">eBay SKUs</p><p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{rows.length}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Matched to local SKU</p><p className="mt-1 text-xl font-semibold tabular-nums text-emerald-700">{matchedCount}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Mapping required</p><p className="mt-1 text-xl font-semibold tabular-nums text-amber-700">{unmatchedCount}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-500">Connected scope</p><p className="mt-1 truncate text-sm font-semibold text-slate-900">{selectedStoreId === 'ALL' ? 'All connected sellers' : 'Selected seller'}</p></div>
      </div>
      {error && <div role="alert" className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
            <th className="px-4 py-3 font-semibold">External SKU</th><th className="px-4 py-3 font-semibold">Listing</th><th className="px-4 py-3 font-semibold">Seller</th><th className="px-4 py-3 font-semibold">Price</th><th className="px-4 py-3 font-semibold">eBay Qty</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold">Local SKU Match</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Loading saved eBay listing data…</td></tr> :
              rows.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No synced eBay listing records found for this seller scope.</td></tr> :
              rows.map((row, index) => {
                const matched = localSkus.has(row.sku.toLowerCase());
                return <tr key={`${row.accountId}:${row.sku}:${row.itemId || index}`} className="hover:bg-slate-50/70">
                  <td className="whitespace-nowrap px-4 py-3 font-mono font-semibold text-indigo-700">{row.sku}</td>
                  <td className="min-w-[220px] px-4 py-3"><p className="font-medium text-slate-800">{row.title}</p><p className="mt-0.5 text-[10px] text-slate-400">{row.itemId || 'Item ID unavailable'}</p></td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.accountName}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">{row.price ? money(row.price, row.currency) : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums font-semibold text-slate-800">{row.quantity ?? '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{row.status.replaceAll('_', ' ')}</span></td>
                  <td className="whitespace-nowrap px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${matched ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Link2 className="h-3 w-3" />{matched ? 'Matched' : 'Mapping required'}</span></td>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400 sm:flex-row sm:justify-between">
        <span>Marketplace quantity is informational and is not posted to the physical stock ledger.</span>
        <span>{updatedAt ? `Loaded ${new Date(updatedAt).toLocaleString()}` : 'Not loaded yet'}</span>
      </div>
    </section>
  );
};
