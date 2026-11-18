-- Store an explicit server-side verification timestamp for the eBay app keypair.
-- Existing rows remain unverified until the owner successfully verifies and replaces them.
ALTER TABLE public.platform_integration_credentials
  ADD COLUMN IF NOT EXISTS credentials_verified_at timestamptz;

CREATE OR REPLACE FUNCTION public.save_platform_integration_credentials(
  p_environment text,
  p_expected_version integer,
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
     OR p_expected_version IS NULL OR p_expected_version < 0
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
  IF COALESCE(v_previous_version, 0) <> p_expected_version THEN
    RAISE EXCEPTION 'credential version conflict';
  END IF;
  v_next_version := COALESCE(v_previous_version, 0) + 1;
  v_action := CASE WHEN v_previous_version IS NULL THEN 'CREDENTIALS_CREATED' ELSE 'CREDENTIALS_ROTATED' END;
  INSERT INTO public.platform_integration_credentials (
    provider, environment, client_id_ciphertext, client_secret_ciphertext,
    ru_name_ciphertext, client_id_masked, encryption_key_version,
    credential_version, credentials_verified_at, updated_by, created_at, updated_at
  ) VALUES (
    'EBAY', p_environment, p_client_id_ciphertext, p_client_secret_ciphertext,
    p_ru_name_ciphertext, p_client_id_masked, 'v1',
    v_next_version, v_saved_at, p_actor_user_id, v_saved_at, v_saved_at
  )
  ON CONFLICT (provider, environment) DO UPDATE SET
    client_id_ciphertext = EXCLUDED.client_id_ciphertext,
    client_secret_ciphertext = EXCLUDED.client_secret_ciphertext,
    ru_name_ciphertext = EXCLUDED.ru_name_ciphertext,
    client_id_masked = EXCLUDED.client_id_masked,
    encryption_key_version = EXCLUDED.encryption_key_version,
    credential_version = EXCLUDED.credential_version,
    credentials_verified_at = EXCLUDED.credentials_verified_at,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;
  INSERT INTO public.platform_integration_audit (
    provider, environment, actor_user_id, action, credential_version, metadata, created_at
  ) VALUES (
    'EBAY', p_environment, p_actor_user_id, v_action, v_next_version,
    jsonb_build_object('clientIdChanged', true, 'clientSecretChanged', true, 'ruNameChanged', true, 'credentialsVerified', true),
    v_saved_at
  );
  RETURN QUERY SELECT v_next_version, v_action, v_saved_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_platform_integration_credentials(text, integer, text, text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_platform_integration_credentials(text, integer, text, text, text, text, uuid)
  TO service_role;
COMMENT ON FUNCTION public.save_platform_integration_credentials(text, integer, text, text, text, text, uuid) IS
  'Atomically stores encrypted platform eBay application credentials only after eBay OAuth client-credentials verification, and writes a metadata-only audit event. Service-role only.';
