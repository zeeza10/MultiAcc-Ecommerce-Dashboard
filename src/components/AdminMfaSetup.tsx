import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';

type TotpFactor = { id: string; status: 'verified' | 'unverified' };

export const AdminMfaSetup: React.FC = () => {
  const [level, setLevel] = useState<'aal1' | 'aal2'>('aal1');
  const [factorId, setFactorId] = useState('');
  const [pendingFactorId, setPendingFactorId] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const qrSource = useMemo(() => {
    if (!qr) return '';
    // Supabase returns an SVG string. Keep an existing data URI intact.
    if (qr.startsWith('data:image/')) return qr;
    // Supabase returns the SVG payload, not a complete data URI.
    // Its documented format is a UTF-8 SVG data URL with the raw SVG appended.
    return 'data:image/svg+xml;utf-8,' + qr;
  }, [qr]);

  const refresh = async () => {
    const [assurance, factors] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
    ]);
    if (assurance.error) throw assurance.error;
    if (factors.error) throw factors.error;
    setLevel(assurance.data?.currentLevel === 'aal2' ? 'aal2' : 'aal1');
    const totp = (factors.data?.totp || []) as TotpFactor[];
    setFactorId(totp.find(item => item.status === 'verified')?.id || '');
    setPendingFactorId(totp.find(item => item.status === 'unverified')?.id || '');
  };

  useEffect(() => {
    void refresh().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load MFA status.'));
  }, []);

  const enroll = async () => {
    setBusy(true); setError(''); setMessage(''); setQrFailed(false); setCode('');
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'MultiAcc Super Admin',
      });
      if (enrollError) throw enrollError;
      if (!data?.id || !data.totp?.qr_code || !data.totp?.secret) {
        throw new Error('The authenticator setup could not generate a complete QR code and setup key.');
      }
      setFactorId('');
      setPendingFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'MFA setup failed.');
    } finally {
      setBusy(false);
    }
  };

  const discardPendingAndRestart = async () => {
    if (!pendingFactorId) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
      if (unenrollError) throw unenrollError;
      setPendingFactorId(''); setQr(''); setSecret(''); setCode(''); setQrFailed(false);
      await enroll();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The previous setup could not be replaced.');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingFactorId && !factorId) return;
    const activeFactorId = pendingFactorId || factorId;
    setBusy(true); setError(''); setMessage('');
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: activeFactorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: activeFactorId,
        challengeId: challenge.id,
        code,
      });
      if (verifyError) throw verifyError;
      setQr(''); setSecret(''); setCode(''); setPendingFactorId('');
      setMessage('Authenticator MFA is enabled. This session has been upgraded to MFA.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authenticator code could not be verified.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-indigo-600" />Administrator MFA protection</div>
        <p className="mt-1 text-xs text-slate-500">Multi-factor authentication is required before assigning or inviting another Super Admin.</p>
      </div>
      <span className={'rounded-full px-3 py-1 text-xs font-bold ' + (level === 'aal2' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
        {level === 'aal2' ? 'MFA verified for this session' : 'MFA step-up not active'}
      </span>
    </div>

    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
    {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-700">{message}</p>}

    {!factorId && !pendingFactorId && !qr && (
      <button type="button" onClick={() => void enroll()} disabled={busy} className="mt-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
        {busy ? 'Preparing secure setup…' : 'Set up authenticator app'}
      </button>
    )}

    {pendingFactorId && !qr && (
      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800">An unfinished authenticator setup was found. Replace it to generate a fresh QR code and setup key.</p>
        <button type="button" onClick={() => void discardPendingAndRestart()} disabled={busy} className="mt-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Discard old setup and create a new QR code'}</button>
      </div>
    )}

    {pendingFactorId && qr && (
      <form onSubmit={verify} className="mt-4 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
        <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
          {!qrFailed ? (
            <img
              alt="Authenticator enrollment QR code"
              src={qrSource}
              width={160}
              height={160}
              className="h-40 w-40 object-contain"
              onError={() => setQrFailed(true)}
            />
          ) : (
            <div className="text-center text-xs text-amber-700">
              <p className="font-semibold">QR code could not be displayed.</p>
              <p className="mt-1">Use the setup key manually in your authenticator app.</p>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-600">Scan this QR code in Google Authenticator, Microsoft Authenticator, or another TOTP app. If the image does not load, choose manual setup and enter the key below.</p>
          <p className="mt-3 text-xs font-semibold text-slate-700">Manual setup key</p>
          <p className="mt-1 select-all break-all rounded-lg border border-amber-200 bg-amber-50 p-3 font-mono text-sm tracking-wide text-slate-800">{secret}</p>
          <label className="mt-3 block text-xs font-medium text-slate-700" htmlFor="admin-mfa-code">Six-digit authenticator code</label>
          <input id="admin-mfa-code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ''))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="000000" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="submit" disabled={busy || code.length !== 6} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify and enable MFA'}</button>
            <button type="button" onClick={() => void discardPendingAndRestart()} disabled={busy} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className="h-3 w-3" />Replace setup key</button>
          </div>
          <p className="mt-2 text-[11px] text-amber-700">Keep this key private. Anyone who obtains it may generate your authenticator codes.</p>
        </div>
      </form>
    )}

    {factorId && !pendingFactorId && level !== 'aal2' && (
      <form onSubmit={verify} className="mt-3 flex flex-wrap items-center gap-2">
        <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/[^0-9]/g, ''))} className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Authenticator code" />
        <button type="submit" disabled={busy || code.length !== 6} className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify for this session'}</button>
      </form>
    )}

    {factorId && level === 'aal2' && <p className="mt-3 text-xs text-emerald-700">An authenticator factor is enrolled and this session has completed MFA verification.</p>}
  </section>;
};
