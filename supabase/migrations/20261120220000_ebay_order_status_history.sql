-- Store provider-origin metadata without rewriting existing order history.
-- This migration is code only; it must be reviewed and explicitly deployed before it affects any database.
ALTER TABLE public.order_status_history
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'WORKSPACE',
  ADD COLUMN IF NOT EXISTS source_timestamp timestamptz;

COMMENT ON COLUMN public.order_status_history.source IS
  'Origin of the status record: WORKSPACE for an operator workflow action, EBAY for a provider snapshot/change.';
COMMENT ON COLUMN public.order_status_history.source_timestamp IS
  'Provider-supplied timestamp when available. For eBay this is order.lastModifiedDate, not a guaranteed status-transition timestamp.';

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
  v_marketplace_status text;
  v_previous_marketplace_status text;
  v_source_timestamp timestamptz;
  v_inserted boolean := false;
  v_status_changed boolean := false;
  v_history_recorded boolean := false;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'service role required';
  END IF;

  v_external_order_id := NULLIF(p_order ->> 'external_order_id', '');
  v_order_number := NULLIF(p_order ->> 'order_number', '');
  v_marketplace_status := COALESCE(
    NULLIF(p_order ->> 'marketplace_status', ''),
    NULLIF(p_order ->> 'status', ''),
    'Unknown'
  );
  v_source_timestamp := NULLIF(p_order ->> 'marketplace_status_updated_at', '')::timestamptz;

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

  v_inserted := v_order_id IS NOT NULL;

  IF v_inserted THEN
    -- This is an initial provider snapshot, not an invented earlier transition.
    INSERT INTO public.order_status_history(
      organization_id, order_id, from_status, to_status, changed_by, note,
      source, source_timestamp
    ) VALUES (
      p_organization_id, v_order_id, NULL, v_marketplace_status, NULL,
      'Initial eBay status snapshot; eBay does not provide the earlier transition history.',
      'EBAY', v_source_timestamp
    );
    v_history_recorded := true;
  ELSE
    -- Existing live order: lock it and update only marketplace-owned fields.
    SELECT o.id INTO v_order_id
    FROM public.orders AS o
    WHERE o.organization_id = p_organization_id
      AND o.marketplace_account_id = p_marketplace_account_id
      AND o.external_order_id = v_external_order_id
    FOR UPDATE;

    IF v_order_id IS NULL THEN
      RAISE EXCEPTION 'existing marketplace order could not be reloaded';
    END IF;

    SELECT h.to_status INTO v_previous_marketplace_status
    FROM public.order_status_history AS h
    WHERE h.organization_id = p_organization_id
      AND h.order_id = v_order_id
      AND h.source = 'EBAY'
    ORDER BY h.changed_at DESC, h.id DESC
    LIMIT 1;

    IF v_previous_marketplace_status IS NULL THEN
      -- Existing orders get one current snapshot only; no historical transitions are fabricated.
      INSERT INTO public.order_status_history(
        organization_id, order_id, from_status, to_status, changed_by, note,
        source, source_timestamp
      ) VALUES (
        p_organization_id, v_order_id, NULL, v_marketplace_status, NULL,
        'First eBay status snapshot captured after history tracking was enabled; prior transitions are unknown.',
        'EBAY', v_source_timestamp
      );
      v_history_recorded := true;
    ELSIF v_previous_marketplace_status IS DISTINCT FROM v_marketplace_status THEN
      INSERT INTO public.order_status_history(
        organization_id, order_id, from_status, to_status, changed_by, note,
        source, source_timestamp
      ) VALUES (
        p_organization_id, v_order_id, v_previous_marketplace_status, v_marketplace_status, NULL,
        'Status change observed in the eBay Fulfillment API. Provider lastModifiedDate is the order last-modified time, not a guaranteed status-transition time.',
        'EBAY', v_source_timestamp
      );
      v_history_recorded := true;
      v_status_changed := true;
    END IF;

    UPDATE public.orders AS o
    SET
      -- Keep workspace workflow status independent; only refresh marketplace-owned fields.
      payment_state = COALESCE(NULLIF(p_order ->> 'payment_state',''), o.payment_state),
      raw_payload = COALESCE(p_order -> 'safe_payload', o.raw_payload),
      updated_at = now()
    WHERE o.id = v_order_id
      AND o.organization_id = p_organization_id;
  END IF;

  IF v_inserted THEN
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
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'duplicate', NOT v_inserted,
    'order_id', v_order_id,
    'exception_count', v_exception_count,
    'status_changed', v_status_changed,
    'history_recorded', v_history_recorded
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_marketplace_order(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_marketplace_order(uuid, uuid, jsonb) TO service_role;

COMMENT ON FUNCTION public.import_marketplace_order(uuid, uuid, jsonb) IS
  'Imports new eBay orders and records source-aware status snapshots/changes. Existing orders update only marketplace-owned fields; workspace workflow status is never overwritten. Service-role only.';


-- Notification provenance: existing/legacy rows are deliberately not deleted.
-- Only newly generated, verified eBay Production order alerts are exposed by the UI.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN IF NOT EXISTS source_event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_event_key_uidx
  ON public.notifications (organization_id, source_event_key)
  WHERE source_event_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_push_subscription_endpoint_https CHECK (endpoint LIKE 'https://%'),
  CONSTRAINT web_push_subscription_key_lengths CHECK (length(p256dh) BETWEEN 80 AND 200 AND length(auth_secret) BETWEEN 16 AND 100)
);

ALTER TABLE public.web_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.web_push_subscriptions FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.web_push_subscriptions TO authenticated;

DROP POLICY IF EXISTS web_push_subscriptions_select_self ON public.web_push_subscriptions;
CREATE POLICY web_push_subscriptions_select_self
  ON public.web_push_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.has_org_permission(organization_id, 'dashboard.view'));

DROP POLICY IF EXISTS web_push_subscriptions_insert_self ON public.web_push_subscriptions;
CREATE POLICY web_push_subscriptions_insert_self
  ON public.web_push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_org_permission(organization_id, 'dashboard.view'));

DROP POLICY IF EXISTS web_push_subscriptions_delete_self ON public.web_push_subscriptions;
CREATE POLICY web_push_subscriptions_delete_self
  ON public.web_push_subscriptions FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.has_org_permission(organization_id, 'dashboard.view'));

COMMENT ON TABLE public.web_push_subscriptions IS
  'Per-user browser push endpoints. Subscription keys are only readable by their owning authenticated user and service_role.';
