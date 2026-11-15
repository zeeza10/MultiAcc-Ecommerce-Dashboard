-- Marketplace OAuth credentials must never be accessible to browser-authenticated roles.
-- RLS remains enabled with no user-facing policies; trusted server-side integration
-- code will use a narrowly controlled service-role path after explicit authorization.
REVOKE ALL PRIVILEGES ON TABLE public.marketplace_credentials FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.marketplace_credentials IS
  'Server-only encrypted marketplace OAuth credentials. Never expose to browser clients; access only from trusted server-side integration code after organization and account authorization.';
