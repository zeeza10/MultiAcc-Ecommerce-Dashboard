import React, { useState } from 'react';
import { ShieldCheck, FlaskConical, Globe2, LockKeyhole, Info } from 'lucide-react';

type Environment = 'sandbox' | 'production';

export const IntegrationManagementView: React.FC = () => {
  const [environment, setEnvironment] = useState<Environment>('sandbox');
  const [appId, setAppId] = useState('');
  const [certId, setCertId] = useState('');
  const [ruName, setRuName] = useState('');

  const isSandbox = environment === 'sandbox';

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">Platform administration</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Integrations & API Management</h1>
          <p className="mt-1 text-sm text-slate-500">Manage marketplace application environments and credentials.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> Frontend preview · Backend not connected
        </span>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => setEnvironment('sandbox')} className={`rounded-xl border p-5 text-left transition ${isSandbox ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-slate-900"><FlaskConical className="h-5 w-5 text-indigo-600" /> Sandbox Environment</span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${isSandbox ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{isSandbox ? 'Selected' : 'Test'}</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Connect and validate eBay using test credentials before production.</p>
        </button>
        <button type="button" onClick={() => setEnvironment('production')} className={`rounded-xl border p-5 text-left transition ${!isSandbox ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-semibold text-slate-900"><Globe2 className="h-5 w-5 text-emerald-600" /> Production Environment</span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${!isSandbox ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{!isSandbox ? 'Selected' : 'Live'}</span>
          </div>
          <p className="mt-2 text-sm text-slate-500">Production credentials will be added only after Sandbox validation and eBay approval.</p>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-900">{isSandbox ? 'eBay Sandbox credentials' : 'eBay Production credentials'}</h2>
            <p className="mt-1 text-xs text-slate-500">Application keys from eBay Developer Portal</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isSandbox ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{isSandbox ? 'TEST MODE' : 'LIVE MODE'}</span>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium text-slate-700">App ID / Client ID
            <input value={appId} onChange={e => setAppId(e.target.value)} autoComplete="off" placeholder="Enter eBay App ID" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700">Cert ID / Client Secret
            <input value={certId} onChange={e => setCertId(e.target.value)} type="password" autoComplete="new-password" placeholder="Enter eBay Cert ID" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
          <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2">OAuth RuName
            <input value={ruName} onChange={e => setRuName(e.target.value)} autoComplete="off" placeholder="Enter eBay OAuth redirect RuName" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
          </label>
        </div>
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
          <div className="flex gap-3 text-sm text-slate-600">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
            <p>Credentials must be sent directly to the secured backend over HTTPS and encrypted before storage. This preview does not save, transmit, or persist the values you type.</p>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">OAuth callback: <code className="rounded bg-slate-200 px-1.5 py-0.5">/api/v1/ebay/oauth/callback</code></p>
            <button type="button" disabled className="cursor-not-allowed rounded-lg bg-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600">Save credentials (backend pending)</button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold">Current development status</p>
            <p className="mt-1 text-blue-800">This screen is a frontend preview only. No eBay connection is active. The secure credential API, encryption secrets, MFA step-up and Sandbox testing will be enabled in a separate backend phase after the required credentials are available.</p>
          </div>
        </div>
      </div>
    </section>
  );
};
