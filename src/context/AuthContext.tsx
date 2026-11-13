import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  bootstrapOrganization,
  clearPasswordRecoverySession,
  hasPasswordRecoverySession,
  getAuthenticatedUser,
  getActiveOrganizationId,
  isSupabaseConfigured,
  loadMemberships,
  OrganizationMembership,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  SupabaseAuthUser,
  supabaseConfigError,
  updatePassword,
  setActiveOrganizationId,
} from '../services/supabaseAuth';

interface AuthContextValue {
  configured: boolean;
  passwordRecovery: boolean;
  configError: string;
  loading: boolean;
  user: SupabaseAuthUser | null;
  memberships: OrganizationMembership[];
  activeMembership: OrganizationMembership | null;
  error: string;
  clearError: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, fullName: string) => Promise<{ confirmationRequired: boolean }>;
  signOutUser: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
  createOrganization: (name: string, slug: string) => Promise<void>;
  selectOrganization: (organizationId: string) => void;
  reloadMemberships: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SupabaseAuthUser | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [passwordRecovery, setPasswordRecovery] = useState(hasPasswordRecoverySession());

  const hydrate = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    const authenticatedUser = await getAuthenticatedUser();
    setPasswordRecovery(hasPasswordRecoverySession());
    setUser(authenticatedUser);
    if (authenticatedUser) {
      try {
        const rows = await loadMemberships();
        setMemberships(rows);
        const selected = getActiveOrganizationId();
        if (!rows.some((row) => row.organization_id === selected)) {
          if (rows[0]) setActiveOrganizationId(rows[0].organization_id);
          else localStorage.removeItem('nexusops_active_organization_id');
        }
      } catch (err: any) {
        setError(err.message || 'Unable to load organization membership.');
        setMemberships([]);
      }
    } else {
      setMemberships([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void hydrate();
    const listener = () => { void hydrate(); };
    window.addEventListener('nexusops-auth-change', listener);
    const timer = window.setInterval(() => { void hydrate(); }, 4 * 60 * 1000);
    return () => {
      window.removeEventListener('nexusops-auth-change', listener);
      window.clearInterval(timer);
    };
  }, [hydrate]);

  const activeMembership = useMemo(() => {
    const selected = getActiveOrganizationId();
    return memberships.find((row) => row.organization_id === selected) || memberships[0] || null;
  }, [memberships]);

  const value: AuthContextValue = {
    configured: isSupabaseConfigured,
    passwordRecovery,
    configError: supabaseConfigError,
    loading,
    user,
    memberships,
    activeMembership,
    error,
    clearError: () => setError(''),
    signInWithPassword: async (email, password) => {
      setError('');
      await signIn(email, password);
      await hydrate();
    },
    signUpWithPassword: async (email, password, fullName) => {
      setError('');
      const result = await signUp(email, password, fullName);
      if (result.session) await hydrate();
      return { confirmationRequired: !result.session };
    },
    signOutUser: async () => {
      await signOut();
      setUser(null);
      setMemberships([]);
    },
    requestPasswordReset: async (email) => { await sendPasswordReset(email); },
    changePassword: async (password) => { await updatePassword(password); clearPasswordRecoverySession(); setPasswordRecovery(false); },
    createOrganization: async (name, slug) => {
      setError('');
      await bootstrapOrganization(name, slug);
      await hydrate();
    },
    selectOrganization: (organizationId) => {
      if (!memberships.some((row) => row.organization_id === organizationId)) {
        throw new Error('You are not a member of this organization.');
      }
      setActiveOrganizationId(organizationId);
      setMemberships((current) => [...current]);
    },
    reloadMemberships: hydrate,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
