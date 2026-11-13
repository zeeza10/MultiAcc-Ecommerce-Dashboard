import React, { useState } from 'react';
import { Building2, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<'SIGN_IN' | 'SIGN_UP' | 'RESET'>('SIGN_IN');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    auth.clearError();
    try {
      if (mode === 'SIGN_IN') {
        await auth.signInWithPassword(email, password);
      } else if (mode === 'SIGN_UP') {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        const result = await auth.signUpWithPassword(email, password, name);
        setMessage(result.confirmationRequired
          ? 'Account created. Check your email to confirm your address, then sign in.'
          : 'Account created successfully.');
      } else {
        await auth.requestPasswordReset(email);
        setMessage('If an account exists for this email, a password reset link has been sent.');
      }
    } catch (err: any) {
      setMessage(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-7">
        <div className="flex items-center gap-3 mb-7">
          <div className="w-11 h-11 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Building2 /></div>
          <div><h1 className="text-xl font-bold text-slate-900">NexusOps</h1><p className="text-xs text-slate-500">Secure E-Commerce Operations Platform</p></div>
        </div>
        <h2 className="text-lg font-semibold text-slate-900">{mode === 'SIGN_IN' ? 'Sign in to your account' : mode === 'SIGN_UP' ? 'Create your account' : 'Reset your password'}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-5">Authentication is securely handled by Supabase.</p>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'SIGN_UP' && <label className="block text-sm font-medium text-slate-700">Full name<input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" autoComplete="name" /></label>}
          <label className="block text-sm font-medium text-slate-700"><span className="flex items-center gap-2"><Mail size={15}/> Email address</span><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" autoComplete="email" /></label>
          {mode !== 'RESET' && <label className="block text-sm font-medium text-slate-700"><span className="flex items-center gap-2"><LockKeyhole size={15}/> Password</span><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" autoComplete={mode === 'SIGN_IN' ? 'current-password' : 'new-password'} /></label>}
          {message && <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">{message}</div>}
          {auth.error && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{auth.error}</div>}
          <button disabled={busy} className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5">{busy ? 'Please wait…' : mode === 'SIGN_IN' ? 'Sign In' : mode === 'SIGN_UP' ? 'Create Account' : 'Send Reset Link'}</button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
          {mode === 'SIGN_IN' ? <><button className="text-indigo-600 hover:underline" onClick={() => setMode('RESET')}>Forgot password?</button><button className="text-indigo-600 hover:underline" onClick={() => setMode('SIGN_UP')}>Create account</button></> : <button className="text-indigo-600 hover:underline" onClick={() => { setMode('SIGN_IN'); setMessage(''); }}>Back to sign in</button>}
        </div>
        <div className="mt-7 pt-5 border-t border-slate-100 flex gap-2 text-xs text-slate-500"><ShieldCheck size={16} className="shrink-0 text-emerald-600"/> Your password is never stored in this application database.</div>
      </div>
    </div>
  );
}

export function OrganizationSetup() {
  const auth = useAuth();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const updateName = (value: string) => {
    setName(value);
    setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await auth.createOrganization(name, slug);
    } catch (err: any) {
      setMessage(err.message || 'Could not create organization.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 p-7 space-y-4">
        <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Building2 /></div>
        <h1 className="text-xl font-bold text-slate-900">Set up your organization</h1>
        <p className="text-sm text-slate-600">Your account is authenticated, but it is not linked to an organization yet. Create your workspace to continue. The first member becomes the workspace administrator.</p>
        <label className="block text-sm font-medium text-slate-700">Organization name<input required minLength={2} maxLength={120} value={name} onChange={(e) => updateName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
        <label className="block text-sm font-medium text-slate-700">Workspace URL identifier<input required pattern="[a-z0-9]+([a-z0-9-]*[a-z0-9])?" maxLength={60} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono" /><span className="text-xs text-slate-500">Lowercase letters, numbers and hyphens.</span></label>
        {message && <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">{message}</div>}
        <button disabled={busy} className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5">{busy ? 'Creating workspace…' : 'Create organization'}</button>
        <button type="button" onClick={() => void auth.signOutUser()} className="w-full py-2 text-sm text-slate-500 hover:text-slate-800">Sign out</button>
      </form>
    </div>
  );
}
