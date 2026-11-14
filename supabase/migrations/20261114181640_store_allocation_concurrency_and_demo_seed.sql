-- Serialize allocation writes to prevent concurrent over-allocation.
CREATE OR REPLACE FUNCTION private.set_marketplace_inventory_allocation(
  p_organization_id uuid,
  p_marketplace_account_id uuid,
  p_product_id uuid,
  p_allocated_quantity integer,
  p_reserved_quantity integer,
  p_source text DEFAULT 'MANUAL'
)
RETURNS public.marketplace_inventory_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_physical integer;
  v_other_allocated integer;
  v_row public.marketplace_inventory_allocations;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id, 'inventory.manage') THEN
    RAISE EXCEPTION 'Not authorized to allocate marketplace inventory' USING ERRCODE='42501';
  END IF;
  IF p_allocated_quantity < 0 OR p_reserved_quantity < 0 OR p_reserved_quantity > p_allocated_quantity THEN
    RAISE EXCEPTION 'Invalid allocated or reserved quantity';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_accounts WHERE id=p_marketplace_account_id AND organization_id=p_organization_id)
     OR NOT EXISTS (SELECT 1 FROM public.products WHERE id=p_product_id AND organization_id=p_organization_id) THEN
    RAISE EXCEPTION 'Store or product does not belong to this organization';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_product_id::text, 0));

  SELECT COALESCE(SUM(quantity_delta),0)::integer INTO v_physical
  FROM public.stock_ledger
  WHERE organization_id=p_organization_id AND product_id=p_product_id AND stock_state='ON_HAND';

  SELECT COALESCE(SUM(allocated_quantity),0)::integer INTO v_other_allocated
  FROM public.marketplace_inventory_allocations
  WHERE organization_id=p_organization_id AND product_id=p_product_id
    AND marketplace_account_id <> p_marketplace_account_id;

  IF v_other_allocated + p_allocated_quantity > v_physical THEN
    RAISE EXCEPTION 'Store allocations exceed physical on-hand stock (% available for this store)', GREATEST(0,v_physical-v_other_allocated);
  END IF;

  INSERT INTO public.marketplace_inventory_allocations(
    organization_id,marketplace_account_id,product_id,allocated_quantity,reserved_quantity,source,updated_at
  ) VALUES (
    p_organization_id,p_marketplace_account_id,p_product_id,p_allocated_quantity,p_reserved_quantity,p_source,now()
  )
  ON CONFLICT (marketplace_account_id,product_id)
  DO UPDATE SET allocated_quantity=EXCLUDED.allocated_quantity,
                reserved_quantity=EXCLUDED.reserved_quantity,
                source=EXCLUDED.source,updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_marketplace_finance_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_org uuid;
  v_amount bigint;
  v_currency text;
  v_existing bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.organization_id::text || ':' || NEW.source_type || ':' || NEW.source_id::text, 0));

  IF NEW.source_type = 'INVOICE' THEN
    SELECT organization_id, total_minor, currency INTO v_org, v_amount, v_currency FROM public.invoices WHERE id=NEW.source_id;
  ELSIF NEW.source_type = 'EXPENSE' THEN
    SELECT organization_id, amount_minor, currency INTO v_org, v_amount, v_currency FROM public.expenses WHERE id=NEW.source_id;
  ELSIF NEW.source_type = 'PAYMENT' THEN
    SELECT organization_id, amount_minor, currency INTO v_org, v_amount, v_currency FROM public.payments WHERE id=NEW.source_id;
  ELSIF NEW.source_type = 'JOURNAL_ENTRY' THEN
    SELECT je.organization_id, COALESCE(SUM(jel.debit_minor),0)::bigint, org.base_currency
      INTO v_org, v_amount, v_currency
    FROM public.journal_entries je
    JOIN public.organizations org ON org.id=je.organization_id
    LEFT JOIN public.journal_entry_lines jel ON jel.journal_entry_id=je.id AND jel.organization_id=je.organization_id
    WHERE je.id=NEW.source_id GROUP BY je.organization_id,org.base_currency;
  END IF;

  IF v_org IS NULL OR v_org <> NEW.organization_id THEN RAISE EXCEPTION 'Finance source does not belong to this organization'; END IF;
  IF upper(trim(v_currency)) <> upper(trim(NEW.currency)) THEN RAISE EXCEPTION 'Finance allocation currency must match its source record'; END IF;

  SELECT COALESCE(SUM(amount_minor),0) INTO v_existing
  FROM public.marketplace_finance_allocations
  WHERE organization_id=NEW.organization_id AND source_type=NEW.source_type AND source_id=NEW.source_id AND id<>NEW.id;
  IF v_existing + NEW.amount_minor > v_amount THEN RAISE EXCEPTION 'Store allocations cannot exceed the source document amount'; END IF;
  RETURN NEW;
END;
$$;

-- Seed only demo inventory from existing demo listing mappings and demo order lines.
-- The physical on-hand ledger remains untouched; allocated quantities never exceed it.
WITH mapped_sales AS (
  SELECT ma.organization_id,ma.id AS marketplace_account_id,msm.product_id,
         COALESCE(SUM(oi.quantity),0)::integer AS sold_units
  FROM public.marketplace_accounts ma
  JOIN public.marketplace_sku_mappings msm
    ON msm.marketplace_account_id=ma.id AND msm.organization_id=ma.organization_id
  JOIN public.orders o
    ON o.marketplace_account_id=ma.id AND o.organization_id=ma.organization_id
  JOIN public.order_items oi
    ON oi.order_id=o.id AND oi.organization_id=o.organization_id AND oi.product_id=msm.product_id
  WHERE ma.is_demo=true
  GROUP BY ma.organization_id,ma.id,msm.product_id
), physical AS (
  SELECT organization_id,product_id,
         GREATEST(0,COALESCE(SUM(quantity_delta) FILTER (WHERE stock_state='ON_HAND'),0))::integer AS on_hand
  FROM public.stock_ledger
  GROUP BY organization_id,product_id
)
INSERT INTO public.marketplace_inventory_allocations(
  organization_id,marketplace_account_id,product_id,allocated_quantity,reserved_quantity,source
)
SELECT s.organization_id,s.marketplace_account_id,s.product_id,
       LEAST(p.on_hand,s.sold_units),0,'DEMO_SEED'
FROM mapped_sales s
JOIN physical p ON p.organization_id=s.organization_id AND p.product_id=s.product_id
WHERE s.sold_units>0 AND p.on_hand>0
ON CONFLICT (marketplace_account_id,product_id) DO NOTHING;
