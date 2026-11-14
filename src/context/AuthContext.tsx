import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { supabase } from '../lib/supabase';

type AuthContextValue = {
  session: Session;
  user: User;
  organizationId: string;
  organizationName: string;
  permissions: string[];
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider.');
  return value;
}

type Workspace = {
  organization_id: string;
  role_id: string;
  role: { code: string } | { code: string }[];
  organization: { name: string } | { name: string }[];
};

const toOne = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? value[0] ?? null : value;

const getAuthRedirectUrl = () => window.location.origin;

/**
 * The single application authentication provider and route boundary.
 * It owns the Supabase SDK session, profile, organization membership and
 * the existing sign-in/onboarding screens. Application children render only
 * after an authenticated user has an active organization membership.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [appUser, setAppUser] = useState<User | null>(null);
  const [workspace, setWorkspace] = useState<{ id: string; name: string } | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<'login' | 'reset'>('login');
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [inviteSetupActive, setInviteSetupActive] = useState(() => window.location.pathname === '/accept-invitation');
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadAccount = useCallback(async (activeSession: Session | null) => {
    setSession(activeSession);
    setAppUser(null);
    setWorkspace(null);
    if (!activeSession?.user) {
      window.localStorage.removeItem('nexusops_active_organization_id');
      setPermissions([]);
      return;
    }

    const authUser = activeSession.user;
    const [{ data: profile, error: profileError }, { data: member, error: memberError }] = await Promise.all([
      supabase.from('profiles')
        .select('id,full_name,is_active,two_factor_enabled,created_at')
        .eq('id', authUser.id)
        .maybeSingle(),
      supabase.from('organization_members')
        .select('organization_id,role_id,is_active,role:roles(code),organization:organizations(name)')
        .eq('user_id', authUser.id)
        .eq('is_active', true)
        .order('joined_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileError) throw profileError;
    if (memberError) throw memberError;
    if (profile && !profile.is_active) {
      throw new Error('Your account has been disabled. Contact your organization administrator.');
    }
    if (!profile) throw new Error('Your account profile is not ready. Please contact support.');
    if (!member) {
      window.localStorage.removeItem('nexusops_active_organization_id');
      setPermissions([]);
      return;
    }

    const roleRow = toOne(member.role as Workspace['role']);
    const orgRow = toOne(member.organization as Workspace['organization']);
    const role = roleRow?.code;
    const allowedRoles = ['SUPER_ADMIN', 'OPS_MANAGER', 'WAREHOUSE_STAFF', 'FINANCE_USER', 'CLIENT_USER', 'VIEWER'];
    if (!role || (!allowedRoles.includes(role) && !role.startsWith('CUSTOM_'))) {
      throw new Error('Your organization role is not configured. Contact an administrator.');
    }

    const { data: permissionRows, error: permissionError } = await supabase
      .from('role_permissions')
      .select('permissions(code)')
      .eq('role_id', member.role_id);
    if (permissionError) throw permissionError;

    const rolePermissionCodes = (permissionRows || []).map((row: any) => {
      const relation = row.permissions;
      return Array.isArray(relation) ? relation[0]?.code : relation?.code;
    }).filter((code: unknown): code is string => typeof code === 'string');

    const { data: overrideRows, error: overrideError } = await supabase
      .from('organization_member_permission_overrides')
      .select('effect,permissions(code)')
      .eq('organization_id', member.organization_id)
      .eq('user_id', authUser.id);
    if (overrideError) throw overrideError;

    const granted = (overrideRows || []).filter((row: any) => row.effect === 'GRANT').map((row: any) => {
      const relation = row.permissions;
      return Array.isArray(relation) ? relation[0]?.code : relation?.code;
    }).filter((code: unknown): code is string => typeof code === 'string');
    const denied = new Set<string>((overrideRows || []).filter((row: any) => row.effect === 'DENY').map((row: any) => {
      const relation = row.permissions;
      return Array.isArray(relation) ? relation[0]?.code : relation?.code;
    }).filter((code: unknown): code is string => typeof code === 'string'));

    const activePermissions = role === 'SUPER_ADMIN'
      ? ['*']
      : [...new Set([...rolePermissionCodes, ...granted])].filter(code => !denied.has(code));

    window.localStorage.setItem('nexusops_active_organization_id', member.organization_id);
    setPermissions(activePermissions);
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
  }, []);

  useEffect(() => {
    let alive = true;

    void supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError) setError(sessionError.message);
      try {
        await loadAccount(data.session);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load account.');
      } finally {
        if (alive) setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryActive(true);
        setMode('reset');
      }
      // Defer Supabase reads until the auth callback has released its internal lock.
      window.setTimeout(async () => {
        if (!alive) return;
        try {
          await loadAccount(nextSession);
          setError('');
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Unable to load account.');
        } finally {
          if (alive) setLoading(false);
        }
      }, 0);
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [loadAccount]);

  const runAuth = async (action: () => Promise<{ error: Error | null }>) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await action();
      if (result.error) throw result.error;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (inviteSetupActive) {
      if (!session) {
        setError('This invitation link is invalid or expired. Ask your Super Admin to send a new invitation.');
        return;
      }
      if (password.length < 12) {
        setError('Choose a password with at least 12 characters.');
        return;
      }
      if (password !== inviteConfirmPassword) {
        setError('The passwords do not match.');
        return;
      }
      await runAuth(async () => {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (!updateError) {
          setPassword('');
          setInviteConfirmPassword('');
          setInviteSetupActive(false);
          window.history.replaceState({}, '', '/');
          setMessage('Your account password is set. Opening your workspace…');
          await loadAccount(session);
        }
        return { error: updateError };
      });
      return;
    }

    if (mode === 'reset' && recoveryActive) {
      await runAuth(async () => {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (!updateError) {
          setMessage('Password updated. Please sign in with your new password.');
          setRecoveryActive(false);
          await supabase.auth.signOut();
          setMode('login');
          setPassword('');
        }
        return { error: updateError };
      });
      return;
    }

    if (mode === 'login') {
      await runAuth(() => supabase.auth.signInWithPassword({ email: email.trim(), password }));
      return;
    }

    await runAuth(async () => {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl(),
      });
      if (!resetError) {
        setMessage('Password reset email sent. Follow the link to choose a new password.');
      }
      return { error: resetError };
    });
  };

  const signOut = useCallback(async () => {
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
    window.localStorage.removeItem('nexusops_active_organization_id');
    setPermissions([]);
    setAppUser(null);
    setWorkspace(null);
  }, []);

  const value = useMemo(
    () => session && appUser && workspace
      ? { session, user: appUser, organizationId: workspace.id, organizationName: workspace.name, permissions, signOut }
      : null,
    [session, appUser, workspace, permissions, signOut],
  );

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Loading secure session…</div>;
  }

  if (value && !recoveryActive && !inviteSetupActive) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  const signedInWithoutWorkspace = !!session && !recoveryActive && !inviteSetupActive;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-8">
        <div className="mb-7">
          <div className="text-xs font-bold tracking-[0.25em] text-indigo-600 uppercase">NexusOps</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {inviteSetupActive ? 'Set up your account' : signedInWithoutWorkspace ? 'Workspace access required' : mode === 'login' ? 'Welcome back' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {inviteSetupActive
              ? session ? `Invitation verified for ${session.user.email || 'your email'}. Create your password to activate your workspace account.` : 'This invitation link could not be verified. It may have expired or already been used; ask your Super Admin to resend it.'
              : signedInWithoutWorkspace
                ? 'This account has no active organization invitation. Contact your organization administrator.'
                : 'Secure sign-in powered by Supabase Authentication.'}
          </p>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{message}</div>}

        {inviteSetupActive ? (
          session ? (
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                New password
                <input required minLength={12} type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                <span className="mt-1 block text-xs text-slate-400">Use at least 12 characters. Do not reuse a password from another service.</span>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Confirm password
                <input required minLength={12} type="password" autoComplete="new-password" value={inviteConfirmPassword} onChange={event => setInviteConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <button disabled={busy} className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">
                {busy ? 'Setting up account…' : 'Set password and continue'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">For your security, this link cannot be reused. Contact your Super Admin for a fresh invitation.</p>
              <a href="/" className="block w-full rounded-lg border border-slate-300 py-3 text-center text-sm font-semibold text-slate-700">Return to sign in</a>
            </div>
          )
        ) : signedInWithoutWorkspace ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">Your sign-in succeeded, but no active organization membership was found. Ask your organization Super Admin to send or renew your invitation.</p>
            <button onClick={signOut} className="w-full rounded-lg border border-slate-300 py-3 text-sm font-semibold text-slate-700">Sign out</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            {(mode !== 'reset' || recoveryActive) && (
              <label className="block text-sm font-medium text-slate-700">
                {recoveryActive ? 'New password' : 'Password'}
                <input required minLength={10} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                <span className="mt-1 block text-xs text-slate-400">Use at least 10 characters.</span>
              </label>
            )}
            <button disabled={busy} className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : recoveryActive ? 'Update password' : 'Send reset link'}
            </button>
            <div className="flex flex-wrap justify-between gap-3 text-sm">
              {mode === 'login' && (
                <button type="button" onClick={() => { setMode('reset'); setError(''); setMessage(''); }} className="text-slate-500">
                  Forgot password?
                </button>
              )}
              {mode === 'reset' && (
                <button type="button" onClick={() => setMode('login')} className="text-slate-500">Back to sign in</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
