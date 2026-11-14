import type { RepositoryContext } from '../server/repositories/context';

export type WorkerEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type AuthContext = {
  user: { id: string; email: string; name: string; role: string; clientId?: string };
  organizationId: string;
  permissions: Set<string>;
  repositoryContext: RepositoryContext;
};
