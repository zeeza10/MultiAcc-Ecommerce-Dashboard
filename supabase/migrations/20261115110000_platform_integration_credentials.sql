-- Platform-level eBay application credentials. These are shared by the application,
-- not owned by any tenant. Only the Worker service role may read ciphertext.
CREATE TABLE IF NOT EXISTS public.platform_integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'EBAY'),
  environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  client_id_ciphertext text NOT NULL,
  client_secret_ciphertext text NOT NULL,
  ru_name_ciphertext text NOT NULL,
  client_id_masked text NOT NULL,
  encryption_key_version text NOT NULL DEFAULT 'v1',
  credential_version integer NOT NULL DEFAULT 1 CHECK (credential_version > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment)
);
ALTER TABLE public.platform_integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_integration_credentials FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_integration_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_integration_credentials TO service_role;

CREATE TABLE IF NOT EXISTS public.platform_integration_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'EBAY'),
  environment text NOT NULL CHECK (environment IN ('SANDBOX','PRODUCTION')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('CREDENTIALS_CREATED','CREDENTIALS_ROTATED')),
  credential_version integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_integration_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_integration_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_integration_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_integration_audit TO service_role;
CREATE INDEX IF NOT EXISTS platform_integration_audit_created_at_idx
  ON public.platform_integration_audit (created_at DESC);

-- Credential write + audit are atomic. Only the Worker service role can call this.
CREATE OR REPLACE FUNCTION public.save_platform_integration_credentials(
  p_environment text,
  p_client_id_ciphertext text,
  p_client_secret_ciphertext text,
  p_ru_name_ciphertext text,
  p_client_id_masked text,
  p_actor_user_id uuid
)
RETURNS TABLE (credential_version integer, action text, saved_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_previous_version integer;
  v_next_version integer;
  v_action text;
  v_saved_at timestamptz := clock_timestamp();
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;
  IF p_environment IS NULL OR p_environment NOT IN ('SANDBOX','PRODUCTION')
     OR p_client_id_ciphertext IS NULL OR p_client_id_ciphertext = ''
     OR p_client_secret_ciphertext IS NULL OR p_client_secret_ciphertext = ''
     OR p_ru_name_ciphertext IS NULL OR p_ru_name_ciphertext = ''
     OR p_client_id_masked IS NULL OR p_client_id_masked = ''
     OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid credential input';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('platform-integration-credentials:' || p_environment));
  SELECT c.credential_version INTO v_previous_version
  FROM public.platform_integration_credentials AS c
  WHERE c.provider = 'EBAY' AND c.environment = p_environment
  FOR UPDATE;
  v_next_version := COALESCE(v_previous_version, 0) + 1;
  v_action := CASE WHEN v_previous_version IS NULL THEN 'CREDENTIALS_CREATED' ELSE 'CREDENTIALS_ROTATED' END;
  INSERT INTO public.platform_integration_credentials (
    provider, environment, client_id_ciphertext, client_secret_ciphertext,
    ru_name_ciphertext, client_id_masked, encryption_key_version,
    credential_version, updated_by, created_at, updated_at
  ) VALUES (
    'EBAY', p_environment, p_client_id_ciphertext, p_client_secret_ciphertext,
    p_ru_name_ciphertext, p_client_id_masked, 'v1',
    v_next_version, p_actor_user_id, v_saved_at, v_saved_at
  )
  ON CONFLICT (provider, environment) DO UPDATE SET
    client_id_ciphertext = EXCLUDED.client_id_ciphertext,
    client_secret_ciphertext = EXCLUDED.client_secret_ciphertext,
    ru_name_ciphertext = EXCLUDED.ru_name_ciphertext,
    client_id_masked = EXCLUDED.client_id_masked,
    encryption_key_version = EXCLUDED.encryption_key_version,
    credential_version = EXCLUDED.credential_version,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;
  INSERT INTO public.platform_integration_audit (
    provider, environment, actor_user_id, action, credential_version, metadata, created_at
  ) VALUES (
    'EBAY', p_environment, p_actor_user_id, v_action, v_next_version,
    jsonb_build_object('clientIdChanged', true, 'clientSecretChanged', true, 'ruNameChanged', true),
    v_saved_at
  );
  RETURN QUERY SELECT v_next_version, v_action, v_saved_at;
END;
$$;
REVOKE ALL ON FUNCTION public.save_platform_integration_credentials(text, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_integration_credentials(text, text, text, text, text, uuid)
  TO service_role;
COMMENT ON FUNCTION public.save_platform_integration_credentials(text, text, text, text, text, uuid) IS
  'Atomically stores encrypted platform eBay application credentials and a metadata-only audit event. Service-role only.';
