import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

const getAuthRedirectUrl = () => new URL('/forgot-password', window.location.origin).toString();

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
  const [accountState, setAccountState] = useState<'checking' | 'signed-out' | 'ready' | 'no-membership' | 'error'>('checking');
  const loadGeneration = useRef(0);
  const authEventGeneration = useRef(0);
  const inFlightAccountLoad = useRef<{ key: string; promise: Promise<void> } | null>(null);
  const completedAccountLoadKey = useRef<string | null>(null);
  const [mode, setMode] = useState<'login' | 'reset'>(() => window.location.pathname === '/forgot-password' ? 'reset' : 'login');
  const [recoveryActive, setRecoveryActive] = useState(false);
  const [inviteSetupActive, setInviteSetupActive] = useState(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    return window.location.pathname === '/accept-invitation'
      || hashParams.get('type') === 'invite'
      || queryParams.get('type') === 'invite'
      || hashParams.has('invitation_id')
      || queryParams.has('invitation_id');
  });
  const [invitationId] = useState<string | null>(() => {
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    return fragmentParams.get('invitation_id') || queryParams.get('invitation_id');
  });
  const [inviteStatus, setInviteStatus] = useState<'checking' | 'pending' | 'accepted' | 'invalid' | 'unavailable'>(() => {
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    return fragmentParams.has('invitation_id') || queryParams.has('invitation_id') ? 'checking' : 'pending';
  });
  const [inviteStatusAttempt, setInviteStatusAttempt] = useState(0);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(() => {
    // Email clients and auth redirects can preserve the invitation token while
    // normalizing the callback path. Read the token from either URL location;
    // the invite marker, not the pathname, identifies this one-time flow.
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const queryParams = new URLSearchParams(window.location.search);
    if (fragmentParams.get('type') === 'invite') return fragmentParams.get('token_hash');
    return queryParams.get('type') === 'invite' ? queryParams.get('token_hash') : null;
  });
  const [inviteConfirmPassword, setInviteConfirmPassword] = useState('');

  useEffect(() => {
    if (!inviteSetupActive || !invitationId) return;
    let active = true;
    setInviteStatus('checking');
    supabase.functions.invoke('check-employee-invitation', { body: { invitationId } })
      .then(({ data, error: statusError }) => {
        if (!active) return;
        if (statusError) {
          setInviteStatus('unavailable');
          return;
        }
        setInviteStatus(data?.status === 'accepted' ? 'accepted'
          : data?.status === 'pending' ? 'pending' : 'invalid');
      })
      .catch(() => { if (active) setInviteStatus('unavailable'); });
    return () => { active = false; };
  }, [inviteSetupActive, invitationId, inviteStatusAttempt]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  // Remove the one-time token from the address bar before the page can load
  // subresources or the user can copy/share the URL. The token remains in
  // memory only and is submitted to Supabase only when the invitee sets a password.
  useLayoutEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const fragmentParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const isInvitationCallback = window.location.pathname === '/accept-invitation'
      || queryParams.get('type') === 'invite'
      || fragmentParams.get('type') === 'invite'
      || queryParams.has('invitation_id')
      || fragmentParams.has('invitation_id');
    if (!isInvitationCallback) return;

    // Normalize every recognized invitation callback to the dedicated route,
    // then scrub query/fragment credentials before the app loads subresources.
    window.history.replaceState({}, '', '/accept-invitation');
  }, []);

  const loadAccount = useCallback(async (activeSession: Session | null, force = false) => {
    setSession(activeSession);

    if (!activeSession?.user) {
      // Invalidate every in-flight request so an older response cannot restore a
      // workspace after sign-out or after the user switches accounts.
      loadGeneration.current += 1;
      inFlightAccountLoad.current = null;
      completedAccountLoadKey.current = null;
      window.localStorage.removeItem('oriafuture_active_organization_id');
      setAppUser(null);
      setWorkspace(null);
      setPermissions([]);
      setError('');
      setAccountState('signed-out');
      setLoading(false);
      return;
    }

    const authUser = activeSession.user;
    const loadKey = `${authUser.id}:${activeSession.access_token}`;
    if (!force && inFlightAccountLoad.current?.key === loadKey) {
      await inFlightAccountLoad.current.promise;
      return;
    }
    if (!force && completedAccountLoadKey.current === loadKey) return;

    const requestId = ++loadGeneration.current;
    setLoading(true);
    setAccountState('checking');
    setError('');

    const task = (async () => {
      try {
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

        if (requestId !== loadGeneration.current) return;
        if (profileError) throw new Error('Your account profile could not be verified. Please retry.');
        if (memberError) throw new Error('Your workspace membership could not be verified. Please retry.');
        if (profile && !profile.is_active) {
          throw new Error('Your account has been disabled. Contact your organization administrator.');
        }
        if (!profile) throw new Error('Your account profile is not ready. Please contact support.');
        if (!member) {
          window.localStorage.removeItem('oriafuture_active_organization_id');
          setPermissions([]);
          setWorkspace(null);
          setAppUser(null);
          setAccountState('no-membership');
          completedAccountLoadKey.current = loadKey;
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
        if (permissionError) throw new Error('Workspace permissions could not be verified. Please retry.');

        const rolePermissionCodes = (permissionRows || []).map((row: any) => {
          const relation = row.permissions;
          return Array.isArray(relation) ? relation[0]?.code : relation?.code;
        }).filter((code: unknown): code is string => typeof code === 'string');

        const { data: overrideRows, error: overrideError } = await supabase
          .from('organization_member_permission_overrides')
          .select('effect,permissions(code)')
          .eq('organization_id', member.organization_id)
          .eq('user_id', authUser.id);
        if (overrideError) throw new Error('Individual workspace permissions could not be verified. Please retry.');

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

        if (requestId !== loadGeneration.current) return;
        window.localStorage.setItem('oriafuture_active_organization_id', member.organization_id);
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
        setAccountState('ready');
        completedAccountLoadKey.current = loadKey;
      } catch (cause) {
        if (requestId !== loadGeneration.current) return;
        setError(cause instanceof Error ? cause.message : 'Unable to verify your workspace. Please retry.');
        setAccountState('error');
        completedAccountLoadKey.current = null;
      } finally {
        if (requestId === loadGeneration.current) setLoading(false);
      }
    })();

    inFlightAccountLoad.current = { key: loadKey, promise: task };
    await task;
    if (inFlightAccountLoad.current?.promise === task) inFlightAccountLoad.current = null;
  }, []); 

  useEffect(() => {
    let alive = true;

    // Supabase emits INITIAL_SESSION when this listener is registered. Using that
    // event as the single bootstrap source avoids racing getSession() against the
    // listener's INITIAL_SESSION callback.
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'TOKEN_REFRESHED') {
        authEventGeneration.current += 1;
        // The verified identity and membership have not changed. Keep the current
        // workspace mounted and update only the session used by API requests.
        setSession(nextSession);
        if (!nextSession) {
          void loadAccount(null);
        } else if (!completedAccountLoadKey.current?.startsWith(`${nextSession.user.id}:`)) {
          // Do not call Supabase data APIs while the auth callback holds its lock.
          const eventGeneration = authEventGeneration.current;
          window.setTimeout(() => {
            if (alive && eventGeneration === authEventGeneration.current) {
              void loadAccount(nextSession, true);
            }
          }, 0);
        }
        return;
      }

      if (event === 'SIGNED_OUT') {
        authEventGeneration.current += 1;
        setRecoveryActive(false);
        setInviteSetupActive(false);
        setMode('login');
        void loadAccount(null);
        return;
      }

      // Ignore events that do not change the identity or account authorization.
      if (event !== 'INITIAL_SESSION' && event !== 'SIGNED_IN'
        && event !== 'USER_UPDATED' && event !== 'PASSWORD_RECOVERY') return;

      const eventGeneration = ++authEventGeneration.current;
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveryActive(true);
        setMode('reset');
      }

      // Supabase advises keeping auth callbacks synchronous; defer database reads
      // until its internal auth lock has been released.
      window.setTimeout(() => {
        if (!alive || eventGeneration !== authEventGeneration.current) return;
        void (async () => {
          // A first-login activation is granted only after Supabase emitted SIGNED_IN.
          // The database RPC independently validates auth.uid(), session_id and password setup.
          if (event === 'SIGNED_IN' && nextSession) {
            const { error: activationError } = await supabase.rpc('activate_org_member_after_first_login');
            if (activationError) {
              setError('Your sign-in succeeded, but first-login workspace activation could not be verified. Please retry or contact your administrator.');
              setAccountState('error');
              setLoading(false);
              return;
            }
          }
          await loadAccount(nextSession);
        })();
      }, 0);
    });

    return () => {
      alive = false;
      authEventGeneration.current += 1;
      loadGeneration.current += 1;
      inFlightAccountLoad.current = null;
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
      if (password.length < 12) {
        setError('Choose a password with at least 12 characters.');
        return;
      }
      if (password !== inviteConfirmPassword) {
        setError('The passwords do not match.');
        return;
      }
      await runAuth(async () => {
        // Verify the single-use invitation token only after an explicit form
        // submission. This prevents email security scanners from consuming it.
        let activeSession = session;
        if (pendingInviteToken) {
          const { data: verified, error: verificationError } = await supabase.auth.verifyOtp({
            token_hash: pendingInviteToken,
            type: 'invite',
          });
          if (verificationError) {
            setPendingInviteToken(null);
            return { error: verificationError };
          }
          activeSession = verified.session;
          setPendingInviteToken(null);
        }
        if (!activeSession) {
          return { error: new Error('This invitation is invalid, expired, or already used. Ask your Super Admin to send a new invitation.') };
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (!updateError) {
          setPassword('');
          setInviteConfirmPassword('');
          setEmail(activeSession.user.email || email);
          setInviteSetupActive(false);
          setMode('login');
          window.history.replaceState({}, '', '/');
          // Password creation completes invitation setup, but does not activate
          // membership. Require a separate, explicit portal sign-in to create
          // the first eligible session and activate workspace access.
          const { error: signOutError } = await supabase.auth.signOut();
          if (signOutError) return { error: signOutError };
          setMessage('Your password has been created. Please sign in with your new password to activate your workspace access.');
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
          window.history.replaceState({}, '', '/');
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
    window.localStorage.removeItem('oriafuture_active_organization_id');
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
    return <div className="min-h-screen grid place-items-center bg-slate-950 text-white">Securing your Oria Future session…</div>;
  }

  if (value && !recoveryActive && !inviteSetupActive) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  }

  const signedInWithoutWorkspace = !!session && !recoveryActive && !inviteSetupActive
    && (accountState === 'no-membership' || accountState === 'error');

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-8">
        <div className="mb-7">
          <div className="text-xs font-bold tracking-[0.25em] text-indigo-600 uppercase">Oria Future</div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            {inviteSetupActive ? inviteStatus === 'accepted' ? 'Your account is already set up' : inviteStatus === 'checking' ? 'Checking invitation…' : 'Set up your account' : accountState === 'error' && signedInWithoutWorkspace ? 'Unable to verify workspace access' : signedInWithoutWorkspace ? 'Workspace access required' : mode === 'login' ? 'Welcome back' : 'Reset your password'}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {inviteSetupActive
              ? inviteStatus === 'accepted' ? 'This invitation and password setup are complete. Sign in with your new password to activate your workspace access.'
                : inviteStatus === 'checking' ? 'Please wait while we securely check the invitation status.'
                : inviteStatus === 'unavailable' ? 'We could not verify this invitation right now. Please try again.'
                : inviteStatus === 'invalid' ? 'This invitation is expired, revoked, or no longer valid. Ask your Super Admin to send a new invitation.'
                : session ? `Invitation verified for ${session.user.email || 'your email'}. Create your password to activate your workspace account.` : pendingInviteToken ? 'Create a password to continue. Your one-time invitation will be verified securely when you submit this form.' : 'This invitation link could not be verified. It may have expired or already been used; ask your Super Admin to resend it.'
              : signedInWithoutWorkspace
                ? accountState === 'error' ? 'Workspace access could not be verified. Your access has not been assumed or granted. Retry the check or contact your administrator.' : 'This account has no active organization membership. Contact your organization administrator.'
                : mode === 'reset' ? recoveryActive ? 'Choose a new password for your Oria Future account.' : 'Enter your account email and we will send a secure password reset link.' : 'Secure sign-in to your Oria Future workspace.'}
          </p>
        </div>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>}
        {message && <div role="status" className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-sm text-emerald-700">{message}</div>}

        {inviteSetupActive ? (
          inviteStatus === 'accepted' ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
                <div className="font-semibold">Account setup complete</div>
                <p className="mt-1">Your password has already been created. This invitation link cannot be used again. Sign in with your existing account to activate workspace access.</p>
              </div>
              <a href="/" className="block w-full rounded-lg bg-indigo-600 py-3 text-center text-sm font-semibold text-white">Continue to sign in</a>
            </div>
          ) : inviteStatus === 'checking' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-600">Checking whether this invitation has already been used…</div>
          ) : inviteStatus === 'unavailable' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Invitation status could not be checked. No password changes have been made.</p>
              <button type="button" onClick={() => setInviteStatusAttempt(value => value + 1)} className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white">Retry verification</button>
              <a href="/" className="block text-center text-sm text-slate-500">Return to sign in</a>
            </div>
          ) : inviteStatus === 'invalid' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">This invitation is expired, revoked, or invalid. Contact your organization administrator for a new invitation.</p>
              <a href="/" className="block w-full rounded-lg border border-slate-300 py-3 text-center text-sm font-semibold text-slate-700">Return to sign in</a>
            </div>
          ) : session || pendingInviteToken ? (
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
            <p className="text-sm text-slate-600">{accountState === 'error' ? error || 'Workspace access could not be verified. Please retry.' : 'Your sign-in succeeded, but no active organization membership was found. Ask your organization Super Admin to send or renew your invitation.'}</p>
            {(accountState === 'error' || accountState === 'no-membership') && <button onClick={() => { if (session) void loadAccount(session, true); }} className="w-full rounded-lg bg-indigo-600 py-3 text-sm font-semibold text-white">Retry workspace check</button>}
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
                <button type="button" onClick={() => { window.history.pushState({}, '', '/forgot-password'); setMode('reset'); setError(''); setMessage(''); }} className="text-slate-500">
                  Forgot password?
                </button>
              )}
              {mode === 'reset' && (
                <button type="button" onClick={() => { window.history.replaceState({}, '', '/'); setMode('login'); setError(''); setMessage(''); }} className="text-slate-500">Back to sign in</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
