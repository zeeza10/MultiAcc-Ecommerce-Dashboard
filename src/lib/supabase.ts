import { createClient } from '@supabase/supabase-js';

// These are browser-safe Supabase project settings. The publishable key is
// intentionally public; never place a service-role or secret key in VITE_*.
const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  'https://nmlwnezlsqystjrvszcd.supabase.co';
const supabasePublishableKey =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  'sb_publishable_nWi20G57zq7F1aryRHEIjg_UEcyrZeI';

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Workspace connection settings are missing. Please contact your system administrator.');
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});
