-- PRODUCTION MIGRATION
-- Server-only storage for eBay application signing keys used by the Finances API.
-- Private keys are encrypted with EBAY_TOKEN_ENCRYPTION_KEY and never exposed to clients.

CREATE TABLE IF NOT EXISTS public.ebay_application_signing_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  environment text NOT NULL CHECK (environment = 'PRODUCTION'),
  signing_key_id text NOT NULL UNIQUE,
  signing_key_cipher text NOT NULL CHECK (signing_key_cipher = 'ED25519'),
  private_key_ciphertext text NOT NULL,
  public_key_jwe text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ebay_application_signing_keys_one_active_idx
  ON public.ebay_application_signing_keys (environment)
  WHERE is_active = true;

ALTER TABLE public.ebay_application_signing_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_application_signing_keys FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ebay_application_signing_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ebay_application_signing_keys TO service_role;

COMMENT ON TABLE public.ebay_application_signing_keys IS
  'Server-only eBay Production digital signing keys. Private key material is encrypted at rest and never returned by application APIs.';
