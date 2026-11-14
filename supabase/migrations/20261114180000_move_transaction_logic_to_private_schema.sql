DO $migration$
DECLARE
  v_name text;
  v_oid oid;
  v_definition text;
  v_arguments text;
  v_identity text;
  v_result text;
  v_arg_expr text;
  v_body text;
  v_is_set boolean;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'confirm_payout_deposit',
    'create_packaging_job',
    'create_shipping_job',
    'get_client_finance_payments',
    'record_finance_payment',
    'void_finance_invoice'
  ] LOOP
    SELECT p.oid, p.proretset INTO v_oid, v_is_set
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=v_name;
    IF v_oid IS NULL THEN RAISE EXCEPTION 'Expected public RPC % was not found',v_name; END IF;
    v_definition := pg_get_functiondef(v_oid);
    v_definition := replace(v_definition,'FUNCTION public.'||v_name||'(','FUNCTION private.'||v_name||'(');
    IF v_definition = pg_get_functiondef(v_oid) THEN RAISE EXCEPTION 'Could not relocate function definition for %',v_name; END IF;
    EXECUTE v_definition;
    SELECT pg_get_function_arguments(p.oid),pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
      (SELECT string_agg('$'||g::text,', ' ORDER BY g) FROM generate_series(1,p.pronargs) g)
    INTO v_arguments,v_identity,v_result,v_arg_expr
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname=v_name;
    IF v_is_set THEN v_body:=format('SELECT * FROM private.%I(%s)',v_name,coalesce(v_arg_expr,''));
    ELSE v_body:=format('SELECT private.%I(%s)',v_name,coalesce(v_arg_expr,'')); END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE sql SECURITY INVOKER SET search_path TO public, private, pg_temp AS %L',v_name,v_arguments,v_result,v_body);
    EXECUTE format('REVOKE ALL ON FUNCTION private.%I(%s) FROM PUBLIC, anon, authenticated',v_name,v_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION private.%I(%s) TO authenticated',v_name,v_identity);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',v_name,v_identity);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',v_name,v_identity);
  END LOOP;
END;
$migration$;