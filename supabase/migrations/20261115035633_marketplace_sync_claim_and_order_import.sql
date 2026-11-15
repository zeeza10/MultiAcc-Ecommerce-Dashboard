-- Server-only marketplace sync queue claiming and atomic, idempotent order import.
CREATE OR REPLACE FUNCTION public.claim_marketplace_sync_jobs(p_limit integer DEFAULT 5)
RETURNS SETOF public.marketplace_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  UPDATE public.marketplace_sync_jobs
  SET status = 'DEAD_LETTER',
      completed_at = now(),
      updated_at = now(),
      last_error_code = COALESCE(last_error_code, 'MAX_ATTEMPTS_REACHED'),
      last_error_message = COALESCE(last_error_message, 'The maximum retry count was reached.')
  WHERE status IN ('QUEUED','FAILED')
    AND scheduled_at <= now()
    AND attempt_count >= max_attempts
    AND (locked_until IS NULL OR locked_until < now());

  RETURN QUERY
  WITH candidates AS (
    SELECT j.id
    FROM public.marketplace_sync_jobs AS j
    WHERE j.status IN ('QUEUED','FAILED')
      AND j.scheduled_at <= now()
      AND j.attempt_count < j.max_attempts
      AND (j.locked_until IS NULL OR j.locked_until < now())
    ORDER BY j.scheduled_at, j.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 5), 1), 20)
  )
  UPDATE public.marketplace_sync_jobs AS j
  SET status = 'RUNNING',
      attempt_count = j.attempt_count + 1,
      locked_until = now() + interval '15 minutes',
      updated_at = now()
  FROM candidates
  WHERE j.id = candidates.id
  RETURNING j.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_marketplace_sync_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_marketplace_sync_jobs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.import_marketplace_order(
  p_organization_id uuid,
  p_marketplace_account_id uuid,
  p_order jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_order_id uuid;
  v_external_order_id text;
  v_order_number text;
  v_item record;
  v_exception_count integer := 0;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  v_external_order_id := NULLIF(p_order ->> 'external_order_id', '');
  v_order_number := NULLIF(p_order ->> 'order_number', '');
  IF p_organization_id IS NULL OR p_marketplace_account_id IS NULL
     OR v_external_order_id IS NULL OR v_order_number IS NULL THEN
    RAISE EXCEPTION 'required marketplace order fields are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_accounts AS a
    WHERE a.id = p_marketplace_account_id
      AND a.organization_id = p_organization_id
      AND a.marketplace IN ('EBAY_UK','EBAY_US','EBAY_DE')
      AND a.is_demo = false
  ) THEN
    RAISE EXCEPTION 'marketplace account is not eligible for live order import';
  END IF;

  INSERT INTO public.orders (
    organization_id, order_number, marketplace_account_id, external_order_id,
    sales_source, owner_type, customer_name, customer_email, shipping_address,
    status, payment_state, total_minor, tax_minor, shipping_charge_minor,
    currency, raw_payload, created_at, updated_at
  ) VALUES (
    p_organization_id, v_order_number, p_marketplace_account_id, v_external_order_id,
    'EBAY', 'OPERATOR',
    COALESCE(NULLIF(p_order ->> 'customer_name',''), 'eBay buyer'),
    NULLIF(p_order ->> 'customer_email',''),
    COALESCE(p_order -> 'shipping_address', '{}'::jsonb),
    COALESCE(NULLIF(p_order ->> 'status',''), 'New'),
    COALESCE(NULLIF(p_order ->> 'payment_state',''), 'PENDING'),
    COALESCE((p_order ->> 'total_minor')::bigint, 0),
    COALESCE((p_order ->> 'tax_minor')::bigint, 0),
    COALESCE((p_order ->> 'shipping_charge_minor')::bigint, 0),
    COALESCE(NULLIF(p_order ->> 'currency',''), 'GBP'),
    COALESCE(p_order -> 'safe_payload', '{}'::jsonb),
    COALESCE(NULLIF(p_order ->> 'created_at','')::timestamptz, now()),
    now()
  )
  ON CONFLICT (marketplace_account_id, external_order_id) DO NOTHING
  RETURNING id INTO v_order_id;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('inserted', false, 'duplicate', true, 'exception_count', 0);
  END IF;

  FOR v_item IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_order -> 'items', '[]'::jsonb))
      AS x(product_id uuid, sku text, product_name text, quantity integer,
           unit_price_minor bigint, tax_amount_minor bigint, total_price_minor bigint,
           raw_item jsonb)
  LOOP
    IF COALESCE(v_item.quantity, 0) <= 0 OR NULLIF(v_item.sku, '') IS NULL OR NULLIF(v_item.product_name, '') IS NULL THEN
      RAISE EXCEPTION 'marketplace order contains an invalid line item';
    END IF;
    IF v_item.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products AS p
      WHERE p.id = v_item.product_id AND p.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'mapped product does not belong to this organization';
    END IF;

    INSERT INTO public.order_items (
      organization_id, order_id, product_id, sku, product_name, quantity,
      unit_price_minor, tax_amount_minor, total_price_minor, is_backordered, reserved_quantity
    ) VALUES (
      p_organization_id, v_order_id, v_item.product_id, v_item.sku, v_item.product_name,
      v_item.quantity, COALESCE(v_item.unit_price_minor, 0),
      COALESCE(v_item.tax_amount_minor, 0), COALESCE(v_item.total_price_minor, 0), false, 0
    );

    IF v_item.product_id IS NULL THEN
      INSERT INTO public.marketplace_exceptions (
        organization_id, marketplace_account_id, exception_type, source,
        reference_id, details, raw_payload_snippet, status
      ) VALUES (
        p_organization_id, p_marketplace_account_id, 'UNMAPPED_SKU', 'EBAY',
        v_external_order_id,
        'An eBay order line contains an SKU that is not mapped to an internal product.',
        COALESCE(v_item.raw_item, jsonb_build_object('sku', v_item.sku, 'title', v_item.product_name))::text,
        'PENDING'
      );
      v_exception_count := v_exception_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', true, 'duplicate', false, 'order_id', v_order_id, 'exception_count', v_exception_count);
END;
$$;

REVOKE ALL ON FUNCTION public.import_marketplace_order(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_marketplace_order(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.claim_marketplace_sync_jobs(integer) IS
  'Atomically claims due marketplace sync jobs with SKIP LOCKED. Service-role only.';
COMMENT ON FUNCTION public.import_marketplace_order(uuid, uuid, jsonb) IS
  'Atomically imports one marketplace order and its line items; duplicate external order IDs are ignored. Service-role only.';
