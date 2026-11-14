import React, { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const AdminMfaSetup: React.FC = () => {
  const [level, setLevel] = useState<'aal1' | 'aal2'>('aal1');
  const [factorId, setFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const [assurance, factors] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
    setLevel(assurance.data?.currentLevel === 'aal2' ? 'aal2' : 'aal1');
    setFactorId(factors.data?.totp?.find(item => item.status === 'verified')?.id || '');
  };
  useEffect(() => { void refresh(); }, []);

  const enroll = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MultiAcc Super Admin' });
      if (enrollError) throw enrollError;
      if (!data?.id || !data.totp?.qr_code) throw new Error('Authenticator enrollment could not be initialized.');
      setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret || '');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'MFA setup failed.'); }
    finally { setBusy(false); }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
      if (verifyError) throw verifyError;
      setQr(''); setSecret(''); setCode(''); setMessage('Authenticator MFA is enabled for this account.');
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Authenticator code could not be verified.'); }
    finally { setBusy(false); }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-indigo-600"/>Administrator MFA protection</div><p className="mt-1 text-xs text-slate-500">Multi-factor authentication is required before assigning or inviting another Super Admin.</p></div>
      <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (level === 'aal2' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{level === 'aal2' ? 'MFA verified for this session' : 'MFA step-up not active'}</span>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-xs text-emerald-700">{message}</p>}
    {!factorId && !qr && <button onClick={() => void enroll()} disabled={busy} className="mt-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">Set up authenticator app</button>}
    {factorId && !qr && level !== 'aal2' && <form onSubmit={verify} className="mt-3 flex flex-wrap items-center gap-2"><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))} className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Authenticator code"/><button disabled={busy || code.length !== 6} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify for this session'}</button></form>}
    {qr && <form onSubmit={verify} className="mt-4 flex flex-wrap items-start gap-4">
      <img alt="Authenticator enrollment QR code" src={'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qr)} className="h-36 w-36 rounded-lg border border-slate-200 bg-white p-2"/>
      <div className="min-w-[220px] flex-1"><p className="text-xs text-slate-600">Scan this QR code in your authenticator app, then enter the six-digit code.</p><p className="mt-2 break-all rounded bg-slate-50 p-2 font-mono text-xs text-slate-700">Setup key: {secret}</p><input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="6-digit authenticator code"/><button disabled={busy || code.length !== 6} className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and enable MFA'}</button></div>
    </form>}
  </section>;
};