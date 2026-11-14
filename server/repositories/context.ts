import type { SupabaseClient } from '@supabase/supabase-js';
import type { User } from '../types';

export interface AuthenticatedApiContext {
  supabase: SupabaseClient;
  organizationId: string;
  user: User;
  permissions: Set<string>;
}
