import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, EyeOff, KeyRound, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

type Environment = 'SANDBOX' | 'PRODUCTION';
type CredentialStatus = {
  environment: Environment;
  configured: boolean;
  clientIdMasked: string;
  credentialVersion: number;
  updatedAt: string | null;
  secretsAreNeverReturned: true;
};

const emptyForm = { clientId: '', clientSecret: '', ruName: '' };

export const IntegrationManagementView: React.FC = () => {
  const { user } = useAuth();
  const [environment, setEnvironment] = useState<Environment>('SANDBOX');
  const [statuses, setStatuses] = useState<CredentialStatus[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getIntegrationCredentials();
      setStatuses(result.environments);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Credential status could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const current = statuses.find(item => item.environment === environment);
  const change = (field: keyof typeof emptyForm, value: string) => {
    setForm(previous => ({ ...previous, [field]: value }));
    setNotice('');
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (user.role !== 'SUPER_ADMIN') {
      setError('Only the platform Super Admin can manage application credentials.');
      return;
    }
    if (!form.clientId.trim() || !form.clientSecret.trim() || !form.ruName.trim()) {
      setError('Enter all three values. Existing saved credentials will not be changed.');
      return;
    }
    setSaving(true);
    try {
      const result = await api.saveIntegrationCredentials(environment, {
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret,
        ruName: form.ruName.trim(),
      });
      setForm(emptyForm);
      setNotice(`${environment} credentials were encrypted and saved. Version ${result.credentialVersion}.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Credentials could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  if (user.role !== 'SUPER_ADMIN') {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">Access denied. Platform Super Admin role is required.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-indigo-600" />
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Integrations & API Management</h1>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500">
            Manage platform-level eBay Developer credentials. Seller accounts and their OAuth permissions remain separate from these application credentials.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh status
        </button>
      </header>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(['SANDBOX', 'PRODUCTION'] as Environment[]).map(env => {
          const item = statuses.find(status => status.environment === env);
          return (
            <button key={env} type="button" onClick={() => { setEnvironment(env); setForm(emptyForm); setError(''); setNotice(''); }}
              className={`rounded-xl border p-4 text-left transition ${environment === env ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-900">{env === 'SANDBOX' ? 'Sandbox Environment' : 'Production Environment'}</span>
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                  {item?.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">{env === 'SANDBOX' ? 'For safe development and seller authorization tests.' : 'For live seller accounts. Enable only after Sandbox validation.'}</p>
              {item?.configured && <p className="mt-2 font-mono text-[11px] text-gray-700">{item.clientIdMasked} · Version {item.credentialVersion}</p>}
            </button>
          );
        })}
      </section>

      {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

      <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-start gap-3 border-b border-gray-100 p-4">
          <div className="rounded-lg bg-indigo-50 p-2"><KeyRound className="h-4 w-4 text-indigo-700" /></div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">{environment} Application Credentials</h2>
            <p className="mt-1 text-[11px] leading-5 text-gray-500">All fields are write-only. Saved secret values can never be viewed or downloaded from this dashboard. Enter all three values when creating or rotating credentials.</p>
          </div>
        </div>
        <form onSubmit={save} className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-gray-700">App ID / Client ID</span>
              <input value={form.clientId} onChange={e => change('clientId', e.target.value)} autoComplete="off" spellCheck={false} maxLength={256} required disabled={saving || loading} placeholder="Paste eBay App ID" className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <span className="text-[10px] text-gray-500">Application identifier issued by eBay Developer Portal.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-gray-700">Cert ID / Client Secret</span>
              <input type="password" value={form.clientSecret} onChange={e => change('clientSecret', e.target.value)} autoComplete="new-password" spellCheck={false} maxLength={512} required disabled={saving || loading} placeholder="Paste eBay Cert ID" className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <span className="text-[10px] text-gray-500">Never displayed again after saving.</span>
            </label>
            <label className="block space-y-1.5 md:col-span-2">
              <span className="text-xs font-semibold text-gray-700">OAuth RuName</span>
              <input value={form.ruName} onChange={e => change('ruName', e.target.value)} autoComplete="off" spellCheck={false} maxLength={256} required disabled={saving || loading} placeholder="Paste eBay OAuth RuName" className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100" />
              <span className="text-[10px] text-gray-500">Use the RuName identifier generated in eBay Developer Portal, not the callback URL.</span>
            </label>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800"><ShieldCheck className="h-4 w-4" /> Secure storage controls</div>
            <ul className="mt-2 grid grid-cols-1 gap-1.5 text-[11px] text-slate-600 sm:grid-cols-2">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> AES-256-GCM encryption</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Server-side Super Admin check</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Secrets never returned to browser</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Metadata-only audit trail</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> Database access restricted to Worker</li>
              <li className="flex items-center gap-1.5"><EyeOff className="h-3 w-3 text-emerald-600" /> No plaintext secret logging</li>
            </ul>
          </div>

          {current?.configured && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900">
              <Clock3 className="h-4 w-4 shrink-0" />
              <span>Configured version {current.credentialVersion}. Saving will rotate all three values.</span>
              {current.updatedAt && <span className="text-amber-700">Last changed: {new Date(current.updatedAt).toLocaleString()}</span>}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-[10px] leading-4 text-gray-500">Do not paste production credentials into Sandbox. Use the matching eBay Developer Portal keyset and verify the environment before saving.</p>
            <button type="submit" disabled={saving || loading || !form.clientId.trim() || !form.clientSecret || !form.ruName.trim()} className="rounded-md bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? 'Encrypting & saving…' : current?.configured ? 'Rotate credentials' : 'Save encrypted credentials'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div className="space-y-1">
            <h3 className="text-xs font-bold text-amber-950">Important security boundary</h3>
            <p className="text-[11px] leading-5 text-amber-900">Encryption protects credentials stored in the database and keeps them out of source control. It cannot protect secrets from a compromised Worker runtime, a malicious deployment, a compromised Cloudflare account, or a stolen Super Admin session. Protect Cloudflare and GitHub with strong MFA, least-privilege access and reviewed deployments.</p>
          </div>
        </div>
      </section>
    </div>
  );
};
