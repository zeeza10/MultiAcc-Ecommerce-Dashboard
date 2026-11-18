-- Keep public PostgREST RPC names stable, but move their privileged
-- SECURITY DEFINER implementations into the non-exposed private schema.
-- Public entry points become SECURITY INVOKER wrappers with an empty search_path.
DO $migration$
DECLARE
  f RECORD;
  v_private_definition TEXT;
  v_call_args TEXT;
  v_volatility TEXT;
  v_wrapper TEXT;
BEGIN
  REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
  REVOKE CREATE ON SCHEMA private FROM PUBLIC, anon, authenticated, service_role;
  REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
  GRANT USAGE ON SCHEMA private TO authenticated, service_role;

  FOR f IN
    SELECT
      p.oid,
      p.proname,
      p.pronargs,
      pg_get_function_arguments(p.oid) AS argument_declarations,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments,
      pg_get_function_result(p.oid) AS result_type,
      p.provolatile
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname IN (
        'assign_org_member_role',
        'create_org_invitation',
        'get_org_employee_access',
        'is_org_super_admin',
        'manage_org_role',
        'set_org_member_active',
        'set_org_member_permission_overrides'
      )
    ORDER BY p.proname
  LOOP
    v_private_definition := replace(
      pg_get_functiondef(f.oid),
      'FUNCTION public.',
      'FUNCTION private.'
    );
    EXECUTE v_private_definition;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon',
      f.proname,
      f.identity_arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION private.%I(%s) TO authenticated, service_role',
      f.proname,
      f.identity_arguments
    );

    SELECT string_agg('$' || g::text, ', ' ORDER BY g)
      INTO v_call_args
    FROM generate_series(1, f.pronargs) AS g;

    v_volatility := CASE f.provolatile
      WHEN 'i' THEN 'IMMUTABLE'
      WHEN 's' THEN 'STABLE'
      ELSE 'VOLATILE'
    END;

    v_wrapper := format(
      'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql %s SECURITY INVOKER SET search_path TO '''' AS %L',
      f.proname,
      f.argument_declarations,
      f.result_type,
      v_volatility,
      'SELECT private.' || quote_ident(f.proname) || '(' || v_call_args || ')'
    );
    EXECUTE v_wrapper;

    EXECUTE format(
      'REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
      f.proname,
      f.identity_arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
      f.proname,
      f.identity_arguments
    );

    EXECUTE format(
      'COMMENT ON FUNCTION public.%I(%s) IS %L',
      f.proname,
      f.identity_arguments,
      'SECURITY INVOKER API wrapper. Privileged implementation is isolated in the non-exposed private schema and performs organization authorization.'
    );
  END LOOP;
END
$migration$;
