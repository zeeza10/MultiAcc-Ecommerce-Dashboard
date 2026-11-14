import type { SupabaseClient } from '@supabase/supabase-js';

export interface RepositoryContext {
  supabase: SupabaseClient;
  organizationId: string;
  userId: string;
  permissions: Set<string>;
}
