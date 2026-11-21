import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, BarChart3, CalendarDays,
  CheckCircle2, ChevronDown, Clock3, CreditCard, Download, Filter, Layers3,
  Package, RefreshCw, RotateCcw, Search, ShieldCheck, Wallet, X
} from 'lucide-react';
import { api } from '../services/api';

type ModuleKey = 'LISTINGS' | 'RETURNS' | 'ANALYTICS' | 'FINANCES';
type Account = any;

const panel = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm';
const muted = 'text-slate-500';
const money = (value: any, currency = 'GBP') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount); }
  catch { return `${currency} ${amount.toFixed(2)}`; }
};
const dateLabel = (value: any) => value ? new Date(value).toLocaleDateString() : '—';
const timeLabel = (value: any) => value ? new Date(value).toLocaleString() : '—';
const titleCase = (value: any) => String(value || 'Unknown').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const statusTone = (value: any) => {
  const s = String(value || '').toUpperCase();
  if (/COMPLETED|SUCCESS|ACTIVE|PAID|CLOSED|DELIVERED/.test(s)) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/15';
  if (/PENDING|OPEN|AWAITING|PARTIAL|PROCESS/.test(s)) return 'bg-amber-50 text-amber-700 ring-amber-600/15';
  if (/FAILED|CANCEL|REJECT|ERROR|OVERDUE/.test(s)) return 'bg-rose-50 text-rose-700 ring-rose-600/15';
  return 'bg-slate-100 text-slate-600 ring-slate-500/10';
};

function MetricCard({ label, value, hint, icon: Icon, tone = 'indigo' }: any) {
  const tones: any = {
    indigo: 'bg-indigo-50 text-indigo-600', emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', sky: 'bg-sky-50 text-sky-600'
  };
  return <div className={panel + ' p-4 sm:p-5 min-w-0'}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p><p className="mt-1 text-[11px] text-slate-400">{hint}</p></div>
      <span className={`rounded-xl p-2.5 ${tones[tone] || tones.indigo}`}><Icon className="h-5 w-5"/></span>
    </div>
  </div>;
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-5 py-14 text-center">
    <Layers3 className="h-8 w-8 text-slate-300"/>
    <p className="mt-3 text-sm font-semibold text-slate-700">{title}</p>
    <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{detail}</p>
  </div>;
}

function DataTable({ columns, rows, emptyTitle, emptyDetail }: any) {
  if (!rows.length) return <EmptyState title={emptyTitle} detail={emptyDetail}/>;
  return <div className={panel + ' overflow-hidden'}>
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
        <thead className="bg-slate-50/90 text-[10px] uppercase tracking-wider text-slate-500"><tr>{columns.map((c: any) => <th key={c.key} className="whitespace-nowrap px-4 py-3 font-semibold">{c.label}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 bg-white">{rows.map((row: any, i: number) => <tr key={row.id || row.key || i} className="transition hover:bg-slate-50/70">{columns.map((c: any) => <td key={c.key} className="whitespace-nowrap px-4 py-3.5 text-slate-700">{c.render ? c.render(row) : (row[c.key] ?? '—')}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="border-t border-slate-100 px-4 py-3 text-[11px] text-slate-400">Showing {rows.length} record{rows.length === 1 ? '' : 's'} currently loaded</div>
  </div>;
}

function TrafficChart({ resources }: { resources: any[] }) {
  const traffic = resources.find(r => r.type === 'ANALYTICS_TRAFFIC');
  const snapshot = traffic?.snapshot || {};
  const metrics = Array.isArray(snapshot.metrics) ? snapshot.metrics : [];
  const records = Array.isArray(snapshot.records) ? snapshot.records : [];
  const metricIndex = metrics.findIndex((m: any) => /view|visit|impression/i.test(String(m.key || m.localizedName)));
  const values: Array<{ date: string; value: number }> = records.map((r: any) => {
    const raw = r.metricValues?.[metricIndex >= 0 ? metricIndex : 0];
    const n = Number(typeof raw === 'object' && raw !== null ? raw.value : raw);
    return { date: r.dimensionValues?.[0]?.value ?? r.dimensionValues?.[0] ?? '', value: Number.isFinite(n) ? n : 0 };
  }).filter((p: any) => p.date);
  if (!values.length) return <EmptyState title="Traffic trend is not available yet" detail="A chart will appear when eBay Analytics returns dated traffic records and metric values for this account."/>;
  const width = 760, height = 220, pad = 24;
  const max = Math.max(1, ...values.map(v => v.value));
  const points: Array<{ date: string; value: number; x: number; y: number }> = values.map((v: { date: string; value: number }, i: number) => ({ ...v, x: pad + (values.length === 1 ? 0 : i * (width - pad * 2) / (values.length - 1)), y: height - pad - (v.value / max) * (height - pad * 2) }));
  const line = points.map((p: { x: number; y: number }) => `${p.x},${p.y}`).join(' ');
  const area = `${pad},${height-pad} ${line} ${points[points.length-1].x},${height-pad}`;
  return <div className={panel + ' p-4 sm:p-5'}>
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">Traffic performance</h3><p className="mt-1 text-xs text-slate-500">{metrics[metricIndex >= 0 ? metricIndex : 0]?.localizedName || metrics[0]?.key || 'Reported metric'} · actual eBay records</p></div><span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">{values.length} data points</span></div>
    <div className="mt-4 w-full overflow-hidden"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="eBay traffic trend chart" className="h-auto w-full">
      {[0,1,2,3].map(i => <line key={i} x1={pad} x2={width-pad} y1={pad+i*(height-pad*2)/3} y2={pad+i*(height-pad*2)/3} stroke="#e2e8f0" strokeDasharray="4 5"/>)} 
      <polygon points={area} fill="#6366f1" opacity=".10"/><polyline points={line} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((p: { x: number; y: number; date: string; value: number },i: number)=><circle key={i} cx={p.x} cy={p.y} r="4" fill="#4f46e5" stroke="white" strokeWidth="2"><title>{p.date}: {p.value}</title></circle>)}
    </svg></div>
    <div className="mt-2 flex justify-between gap-2 text-[10px] text-slate-400"><span>{values[0].date}</span><span>{values[values.length-1].date}</span></div>
  </div>;
}

export const EbayMarketplaceModuleView: React.FC<{ module: ModuleKey; selectedStoreId: string; currentUser: any }> = ({ module, selectedStoreId }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [records, setRecords] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [subTab, setSubTab] = useState('OVERVIEW');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [financeSyncing, setFinanceSyncing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    setError('');
    try {
      if (!selectedStoreId || selectedStoreId === 'ALL') {
        setAccount(null); setRecords(null); return;
      }
      const accountResponse = await api.getEbayAccounts(selectedStoreId);
      const selected = (accountResponse.accounts || []).find((a: any) => a.id === selectedStoreId && !a.isDemo && a.environment === 'PRODUCTION' && a.authStatus === 'CONNECTED');
      if (!selected) { setAccount(null); setRecords(null); return; }
      setAccount(selected);
      let data: any;
      if (module === 'LISTINGS') data = await api.getEbayListings(selected.id, 100, 0);
      else if (module === 'RETURNS') { const result = await api.getEbayReturns(selected.id); data = result.returns || []; }
      else if (module === 'ANALYTICS') { const result = await api.getEbayAnalytics(selected.id); data = result.resources || []; }
      else data = await api.getEbayFinances(selected.id);
      setRecords(data);
      setLastUpdated(new Date().toISOString());
    } catch (e: any) { setError(e?.message || 'Could not load marketplace data.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [module, selectedStoreId]);

  useEffect(() => { setSearch(''); setSubTab('OVERVIEW'); setStatusFilter('ALL'); void load(); }, [load]);

  const runFinanceSync = async () => {
    if (!account) return;
    setFinanceSyncing(true); setError('');
    try { await api.syncEbayFinances(account.id); await load(true); }
    catch (e: any) { setError(e?.message || 'Finance sync failed.'); }
    finally { setFinanceSyncing(false); }
  };

  const listingRows = useMemo(() => {
    const all = [...(records?.listings || []), ...(records?.tradingListings || [])];
    const q = search.trim().toLowerCase();
    return all.filter((r: any) => (!q || JSON.stringify(r).toLowerCase().includes(q)) &&
      (statusFilter === 'ALL' || String(r.listingStatus || r.syncStatus || '').toUpperCase().includes(statusFilter)));
  }, [records, search, statusFilter]);
  const returnsRows = useMemo(() => (Array.isArray(records) ? records : []).filter((r: any) => {
    const q = search.trim().toLowerCase(), status = String(r.status || r.state || '').toUpperCase();
    return (!q || JSON.stringify(r).toLowerCase().includes(q)) && (statusFilter === 'ALL' || status.includes(statusFilter));
  }), [records, search, statusFilter]);
  const finance = records || {};
  const payouts = finance.payouts || [], transactions = finance.transactions || [];
  const analytics = Array.isArray(records) ? records : [];
  const trafficResource = analytics.find((r: any) => r.type === 'ANALYTICS_TRAFFIC');
  const analyticsMetrics = trafficResource?.snapshot?.metrics || [];
  const analyticsRecords = trafficResource?.snapshot?.records || [];
  const totalViews = analyticsRecords.reduce((sum: number, row: any) => {
    const idx = analyticsMetrics.findIndex((m: any) => /view|visit|impression/i.test(String(m.key || m.localizedName)));
    const raw = row.metricValues?.[idx >= 0 ? idx : 0];
    const n = Number(typeof raw === 'object' && raw !== null ? raw.value : raw);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  const config: any = {
    LISTINGS: { title: 'Listings', subtitle: 'Manage catalogue visibility, offer health and live listing performance.', icon: Package },
    RETURNS: { title: 'Returns', subtitle: 'Track return requests, response deadlines and refund exposure.', icon: RotateCcw },
    ANALYTICS: { title: 'Analytics', subtitle: 'Understand traffic and seller performance using the data returned by eBay.', icon: BarChart3 },
    FINANCES: { title: 'Finance', subtitle: 'Monitor payouts, transactions and settlement activity in one workspace.', icon: Wallet }
  }[module];
  const Icon = config.icon;
  const tabs = module === 'LISTINGS' ? [['OVERVIEW','Overview'],['ACTIVE','Active listings'],['INVENTORY','Inventory health']]
    : module === 'RETURNS' ? [['OVERVIEW','Overview'],['OPEN','Open returns'],['CLOSED','Closed returns']]
    : module === 'ANALYTICS' ? [['OVERVIEW','Overview'],['TRAFFIC','Traffic'],['PERFORMANCE','Seller performance']]
    : [['OVERVIEW','Overview'],['PAYOUTS','Payouts'],['TRANSACTIONS','Transactions'],['SUMMARIES','Statements & summaries']];
  const filteredTransactions = transactions.filter((r: any) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  const filteredPayouts = payouts.filter((r: any) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  const listingCount = records?.total ?? listingRows.length;
  const openReturns = returnsRows.filter((r: any) => !/CLOSED|COMPLETED|REFUNDED/.test(String(r.status || r.state || '').toUpperCase())).length;
  const failedFinance = finance.failed?.length || 0;

  return <div className="mx-auto w-full max-w-[1600px] space-y-5 pb-8">
    <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-4"><span className="rounded-2xl border border-white/10 bg-white/10 p-3"><Icon className="h-6 w-6"/></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-indigo-200">eBay Marketplace / {config.title}</span><span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">Production</span></div><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{config.title} workspace</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300 sm:text-sm">{config.subtitle}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><p className="text-[9px] uppercase tracking-wider text-slate-400">Selected store</p><p className="mt-0.5 max-w-[180px] truncate text-xs font-semibold">{account?.name || (selectedStoreId === 'ALL' ? 'Select an account' : 'Loading account…')}</p></div><button onClick={() => void load(true)} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 shadow-sm transition hover:bg-indigo-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}/> Refresh data</button></div>
    </div>

    {error && <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span><button className="ml-auto" onClick={() => setError('')}><X className="h-4 w-4"/></button></div>}
    {loading ? <div className={panel + ' flex min-h-64 items-center justify-center gap-3 text-sm text-slate-500'}><RefreshCw className="h-5 w-5 animate-spin text-indigo-600"/>Loading {config.title.toLowerCase()} workspace…</div>
    : !account ? <EmptyState title="Select a connected eBay account" detail="Choose one connected Production seller account from the global workspace selector in the top bar. Account connection and developer credentials remain under eBay Accounts."/>
    : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {module === 'LISTINGS' && <><MetricCard label="Listings retrieved" value={listingCount} hint="Provider total when available" icon={Package}/><MetricCard label="Active offers" value={listingRows.filter((r: any) => /ACTIVE|PUBLISHED|LISTED/.test(String(r.listingStatus || '').toUpperCase())).length} hint="From loaded listing records" icon={CheckCircle2} tone="emerald"/><MetricCard label="Inventory quantity" value={listingRows.reduce((n: number,r: any)=>n+Number(r.inventoryQuantity||0),0)} hint="Across loaded SKUs" icon={Layers3} tone="sky"/><MetricCard label="Needs attention" value={listingRows.filter((r: any)=>r.syncStatus==='PARTIAL'||r.listingStatus==='NOT_LISTED').length} hint="Partial sync or no active offer" icon={AlertCircle} tone="amber"/></>}
        {module === 'RETURNS' && <><MetricCard label="Total returns" value={returnsRows.length} hint="Records returned by eBay" icon={RotateCcw}/><MetricCard label="Open cases" value={openReturns} hint="Not marked closed or refunded" icon={Clock3} tone="amber"/><MetricCard label="Closed cases" value={returnsRows.length-openReturns} hint="Completed return records" icon={CheckCircle2} tone="emerald"/><MetricCard label="Refund exposure" value={money(returnsRows.reduce((n: number,r: any)=>n+Number(r.estimatedRefund?.value||r.actualRefund?.value||0),0), returnsRows.find((r:any)=>r.estimatedRefund?.currency||r.actualRefund?.currency)?.estimatedRefund?.currency || 'GBP')} hint="Sum of reported refund values" icon={Wallet} tone="sky"/></>}
        {module === 'ANALYTICS' && <><MetricCard label="Analytics resources" value={analytics.length} hint="Stored eBay analytics datasets" icon={BarChart3}/><MetricCard label="Traffic data points" value={analyticsRecords.length} hint="Dated records available" icon={Activity} tone="sky"/><MetricCard label="Reported traffic metric" value={totalViews.toLocaleString()} hint="Sum of first matching view / visit metric" icon={ArrowUpRight} tone="emerald"/><MetricCard label="Seller insight sets" value={analytics.filter((r:any)=>r.type!=='ANALYTICS_TRAFFIC').length} hint="Standards and service metrics" icon={ShieldCheck} tone="amber"/></>}
        {module === 'FINANCES' && <><MetricCard label="Payouts" value={payouts.length} hint="Settlement records retrieved" icon={Wallet}/><MetricCard label="Transactions" value={transactions.length} hint="Financial entries retrieved" icon={CreditCard} tone="sky"/><MetricCard label="Finance summaries" value={(finance.summaries||[]).length} hint="Provider summary resources" icon={Layers3} tone="emerald"/><MetricCard label="Sync failures" value={failedFinance} hint="Failed resources in latest response" icon={AlertCircle} tone="amber"/></>}
      </div>

      <div className={panel + ' overflow-hidden'}>
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex max-w-full gap-1 overflow-x-auto pb-0.5">{tabs.map(([key,label])=><button key={key} onClick={()=>setSubTab(key)} className={`shrink-0 border-b-2 px-3 py-3 text-xs font-semibold transition ${subTab===key?'border-indigo-600 text-indigo-700':'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}</div>
          <div className="flex flex-wrap items-center gap-2 pb-3 sm:pb-0">
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${config.title.toLowerCase()}…`} className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"/></div>
            {(module==='LISTINGS'||module==='RETURNS')&&<select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-600 outline-none"><option value="ALL">All statuses</option>{(module==='LISTINGS'?['ACTIVE','NOT_LISTED','PARTIAL']:['OPEN','CLOSED','REFUNDED','PENDING']).map(v=><option key={v} value={v}>{titleCase(v)}</option>)}</select>}
            {module==='FINANCES'&&<button onClick={runFinanceSync} disabled={financeSyncing} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${financeSyncing?'animate-spin':''}`}/>{financeSyncing?'Syncing…':'Sync finance'}</button>}
          </div>
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          {module==='LISTINGS' && (subTab==='OVERVIEW'||subTab==='ACTIVE'||subTab==='INVENTORY') && <DataTable rows={listingRows.filter((r:any)=>subTab!=='ACTIVE'||/ACTIVE|PUBLISHED|LISTED/.test(String(r.listingStatus||'').toUpperCase())).filter((r:any)=>subTab!=='INVENTORY'||Number(r.inventoryQuantity||0)<=5)} emptyTitle="No listing records found" emptyDetail="No matching listing snapshots are currently available. Refresh after the next scheduled sync." columns={[
            {key:'sku',label:'SKU / Item ID',render:(r:any)=><span className="font-mono font-semibold text-slate-800">{r.sku||r.itemId||'—'}</span>},
            {key:'title',label:'Product',render:(r:any)=><div className="max-w-[260px] truncate font-medium text-slate-800" title={r.title}>{r.title||'Untitled listing'}</div>},
            {key:'listingStatus',label:'Listing status',render:(r:any)=><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusTone(r.listingStatus||r.syncStatus)}`}>{titleCase(r.listingStatus||r.syncStatus)}</span>},
            {key:'inventoryQuantity',label:'Available qty',render:(r:any)=><span className="tabular-nums">{r.inventoryQuantity??'—'}</span>},
            {key:'offer',label:'Offer / price',render:(r:any)=><div>{r.offers?.length?r.offers.map((o:any)=><div key={o.offerId||o.listingId}>{o.availableQuantity??'—'} · {money(o.pricingSummary?.price?.value,o.pricingSummary?.price?.currency||'GBP')}</div>):'—'}</div>},
            {key:'syncStatus',label:'Sync health',render:(r:any)=><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusTone(r.syncStatus)}`}>{titleCase(r.syncStatus)}</span>}
          ]}/>}
          {module==='RETURNS' && <DataTable rows={returnsRows.filter((r:any)=>subTab==='OPEN'?!/CLOSED|COMPLETED|REFUNDED/.test(String(r.status||r.state||'').toUpperCase()):subTab==='CLOSED'?/CLOSED|COMPLETED|REFUNDED/.test(String(r.status||r.state||'').toUpperCase()):true)} emptyTitle="No return requests found" emptyDetail="Return records will appear here after eBay returns data is synchronized." columns={[
            {key:'returnId',label:'Return reference',render:(r:any)=><span className="font-mono font-semibold text-indigo-700">{r.returnId||'—'}</span>},
            {key:'orderId',label:'Order / Item',render:(r:any)=><div><div className="font-medium text-slate-800">{r.orderId||'—'}</div><div className="text-[10px] text-slate-400">{r.itemId||'—'}</div></div>},
            {key:'reason',label:'Reason',render:(r:any)=>titleCase(r.reason)},
            {key:'status',label:'Status',render:(r:any)=><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusTone(r.status||r.state)}`}>{titleCase(r.status||r.state)}</span>},
            {key:'creationDate',label:'Requested',render:(r:any)=>dateLabel(r.creationDate)},
            {key:'sellerResponseDue',label:'Response due',render:(r:any)=><span className="text-slate-600">{dateLabel(r.sellerResponseDue)}</span>},
            {key:'refund',label:'Refund',render:(r:any)=>money(r.actualRefund?.value??r.estimatedRefund?.value,r.actualRefund?.currency||r.estimatedRefund?.currency||'GBP')}
          ]}/>}
          {module==='ANALYTICS' && <>{(subTab==='OVERVIEW'||subTab==='TRAFFIC')&&<TrafficChart resources={analytics}/>}
            {(subTab==='OVERVIEW'||subTab==='PERFORMANCE')&&<div className="grid grid-cols-1 gap-3 lg:grid-cols-2">{analytics.filter((r:any)=>r.type!=='ANALYTICS_TRAFFIC').filter((r:any)=>!search||JSON.stringify(r).toLowerCase().includes(search.toLowerCase())).map((r:any)=><div key={r.type+r.key} className={panel+' p-4'}><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-800">{titleCase(r.type)}</p><p className="mt-1 text-[10px] text-slate-400">{r.key}</p></div><span className="rounded-full bg-indigo-50 px-2 py-1 text-[9px] font-semibold text-indigo-700">eBay data</span></div><div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(r.snapshot||{}).filter(([k,v])=>!['records','metrics'].includes(k)&&['string','number','boolean'].includes(typeof v)).slice(0,6).map(([k,v])=><div key={k} className="rounded-lg bg-slate-50 p-2"><p className="text-[9px] uppercase tracking-wide text-slate-400">{titleCase(k)}</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{String(v)}</p></div>)}</div></div>)}</div>}</>}
          {module==='FINANCES' && (subTab==='OVERVIEW'||subTab==='PAYOUTS') && <DataTable rows={filteredPayouts} emptyTitle="No payout records available" emptyDetail="Payouts will appear here when the eBay Finance API returns settlement records." columns={[
            {key:'payoutId',label:'Payout reference',render:(r:any)=><span className="font-mono font-semibold text-indigo-700">{r.payoutId||r.id||'—'}</span>},
            {key:'payoutStatus',label:'Status',render:(r:any)=><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusTone(r.payoutStatus)}`}>{titleCase(r.payoutStatus)}</span>},
            {key:'amount',label:'Amount',render:(r:any)=><span className="font-semibold tabular-nums">{money(r.amount?.value,r.amount?.currency||'GBP')}</span>},
            {key:'payoutDate',label:'Payout date',render:(r:any)=>dateLabel(r.payoutDate)}
          ]}/>}
          {module==='FINANCES' && (subTab==='OVERVIEW'||subTab==='TRANSACTIONS') && <DataTable rows={filteredTransactions} emptyTitle="No transaction records available" emptyDetail="Transactions will appear here when the signed eBay Finance API returns transaction records." columns={[
            {key:'transactionId',label:'Transaction reference',render:(r:any)=><span className="font-mono font-semibold text-slate-800">{r.transactionId||r.id||'—'}</span>},
            {key:'transactionType',label:'Type',render:(r:any)=>titleCase(r.transactionType)},
            {key:'amount',label:'Amount',render:(r:any)=><span className="font-semibold tabular-nums">{money(r.amount?.value,r.amount?.currency||'GBP')}</span>},
            {key:'transactionDate',label:'Date',render:(r:any)=>timeLabel(r.transactionDate)}
          ]}/>}
          {module==='FINANCES' && subTab==='SUMMARIES' && <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{(finance.summaries||[]).map((s:any)=><div key={s.key} className={panel+' p-4'}><div className="flex items-center gap-2"><Wallet className="h-4 w-4 text-indigo-600"/><span className="text-xs font-semibold text-slate-800">{titleCase(s.key)}</span></div><p className="mt-2 text-[10px] text-slate-500">Provider summary resource received</p><p className="mt-1 text-[10px] text-slate-400">Synced {timeLabel(s.syncedAt)}</p></div>)}{!(finance.summaries||[]).length&&<EmptyState title="No finance summaries available" detail="Summary resources will be listed here when returned by the provider."/>}</div>}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-slate-400"><span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600"/> Read-only view of synchronized Production data</span><span>Last refreshed: {lastUpdated ? timeLabel(lastUpdated) : '—'}</span></div>
    </>}
  </div>;
};
