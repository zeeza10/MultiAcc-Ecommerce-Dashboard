import type { RepositoryContext } from '../server/repositories/context';

export type RateLimitBinding = {
  limit(input: { key: string; delta?: number }): Promise<{ success: boolean }>;
};

export type WorkerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  EBAY_TOKEN_ENCRYPTION_KEY?: string;
  INTEGRATION_CREDENTIALS_ENCRYPTION_KEY?: string;
  API_IP_RATE_LIMITER?: RateLimitBinding;
  API_READ_RATE_LIMITER?: RateLimitBinding;
  API_WRITE_RATE_LIMITER?: RateLimitBinding;
  INVITATION_RATE_LIMITER?: RateLimitBinding;
  EBAY_INTEGRATION_RATE_LIMITER?: RateLimitBinding;
};

export type AuthContext = {
  user: { id: string; email: string; name: string; role: string; clientId?: string };
  assuranceLevel: 'aal1' | 'aal2';
  organizationId: string;
  permissions: Set<string>;
  repositoryContext: RepositoryContext;
};
