import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session;
  user: User;
  organizationId: string;
  organizationName: string;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);
export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthGate');
  return value;
};

type Workspace = { organization_id: string; role: { code: string } | { code: string }[]; organization: { name: string } | { name: string }[] };
const toOne = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [workspaceName, setWorkspaceName] = useState('NexusOps');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAccount = async (activeSession: Session | null) => {
    setSession(activeSession);
    setAppUser(null);
    setWorkspace(null);
    if (!activeSession?.user) return;
    const authUser = activeSession.user;
    const [{ data: profile, error: profileError }, { data: member, error: memberError }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,is_active,two_factor_enabled,created_at').eq('id', authUser.id).maybeSingle(),
      supabase.from('organization_members')
        .select('organization_id,is_active,role:roles(code),organization:organizations(name)')
        .eq('user_id', authUser.id).eq('is_active', true).limit(1).maybeSingle(),
    ]);
    if (profileError) throw profileError;
    if (memberError) throw memberError;
    if (profile && !profile.is_active) throw new Error('Your account has been disabled. Contact your organization administrator.');
    if (!profile) throw new Error('Your account profile is not ready. Please contact support.');
    if (!member) return;
    const roleRow = toOne(member.role as Workspace['role']);
    const orgRow = toOne(member.organization as Workspace['organization']);
    const allowedRoles = ['SUPER_ADMIN','OPS_MANAGER','WAREHOUSE_STAFF','FINANCE_USER','CLIENT_USER','VIEWER'];
    const role = roleRow?.code;
    if (!role || !allowedRoles.includes(role)) throw new Error('Your organization role is not configured. Contact an administrator.');
    setWorkspace({ id: member.organization_id, name: orgRow?.name || 'Workspace' });
    setAppUser({
      id: authUser.id,
      email: authUser.email || '',
      name: profile.full_name || authUser.email || 'User',
      role: role as User['role'],
      isActive: true,
      twoFactorEnabled: profile.two_factor_enabled,
      failedLoginAttempts: 0,
      createdAt: profile.created_at || authUser.created_at,
    });
  };

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(sessionError.message);
      try { await loadAccount(data.session); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load account.'); }
      finally { if (alive) setLoading(false); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') { setRecoveryActive(true); setMode('reset'); }
      setTimeout(async () => {
        if (!alive) return;
        try { await loadAccount(nextSession); setError(''); }
        catch (e) { setError(e instanceof Error ? e.message : 'Unable to load account.'); }
        finally { if (alive) setLoading(false); }
      }, 0);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  const runAuth = async (action: () => Promise<{ error: Error | null }>) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await action();
      if (result.error) throw result.error;
    } catch (e) { setError(e instanceof Error ? e.message : 'Authentication failed.'); }
    finally { setBusy(false); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'reset' && recoveryActive) {
      await runAuth(async () => {
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) { setMessage('Password updated. Please sign in with your new password.'); setRecoveryActive(false); await supabase.auth.signOut(); setMode('login'); setPassword(''); }
        return { error };
      });
    } else if (mode === 'login') {
      await runAuth(() => supabase.auth.signInWithPassword({ email: email.trim(), password }));
    } else if (mode === 'signup') {
      await runAuth(async () => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { full_name: fullName.trim() }, emailRedirectTo: window.location.origin },
        });
        if (!error && !data.session) setMessage('Account created. Check your email to verify the address, then sign in.');
        return { error };
      });
    } else {
      await runAuth(async () => {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (!error) setMessage('Password reset email sent. Follow the link to choose a new password.');
        return { error };
      });
    }
  };

  const createWorkspace = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const slug = workspaceName.toLowerCase().trim().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
      if (workspaceName.trim().length < 2 || !slug) throw new Error('Enter a valid workspace name.');
      const { error: createError } = await supabase.rpc('bootstrap_organization', { p_name: workspaceName.trim(), p_slug: slug });
      if (createError) throw createError;
      const { data } = await supabase.auth.getSession();
      await loadAccount(data.session);
    } catch (e) { setError(e instanceof Error ? e.message : 'Workspace could not be created.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); setAppUser(null); setWorkspace(null); };
  const value = useMemo(() => session && appUser && workspace ? { session, user: appUser, organizationId: workspace.id, organizationName: workspace.name, signOut } : null, [session, appUser, workspace]);

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Loading secure session…</div>;
  if (value && !recoveryActive) return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;

  const signedInWithoutWorkspace = !!session && !recoveryActive;
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-8">
        <div className="mb-7">
          <div className="text-xs font-bold tracking-[0.25em] text-indigo-600 uppercase">NexusOps</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">{signedInWithoutWorkspace ? 'Workspace access' : mode === 'login' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'}</h1>
          <p className="mt-2 text-sm text-slate-500">{signedInWithoutWorkspace ? 'Your email is authenticated, but this account is not yet a member of a workspace.' : 'Secure sign-in powered by Supabase Authentication.'}</p>
        </div>
        {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{message}</div>}
        {signedInWithoutWorkspace ? (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">Workspace name
              <input value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <button disabled={busy} onClick={createWorkspace} className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create my workspace'}</button>
            <p className="text-xs text-slate-500">Creating a workspace makes your account its initial workspace administrator. If you were invited to an existing workspace, sign out and ask its administrator to add your account.</p>
            <button onClick={signOut} className="w-full py-2 text-sm text-slate-600">Sign out</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && <label className="block text-sm font-medium text-slate-700">Full name<input required value={fullName} onChange={e=>setFullName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
            <label className="block text-sm font-medium text-slate-700">Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
            {(mode !== 'reset' || recoveryActive) && <label className="block text-sm font-medium text-slate-700">{recoveryActive ? 'New password' : 'Password'}<input required minLength={10} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /><span className="mt-1 block text-xs text-slate-400">Use at least 10 characters.</span></label>}
            <button disabled={busy} className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : recoveryActive ? 'Update password' : 'Send reset link'}</button>
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              <button type="button" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setMessage('');}} className="text-indigo-600">{mode==='login'?'Create an account':'Back to sign in'}</button>
              {mode==='login' && <button type="button" onClick={()=>{setMode('reset');setError('');setMessage('');}} className="text-slate-500">Forgot password?</button>}
              {mode==='reset' && <button type="button" onClick={()=>setMode('login')} className="text-slate-500">Back to sign in</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
