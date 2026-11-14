-- Store-specific inventory and finance attribution.
-- Physical warehouse stock remains in stock_ledger; this table allocates that stock to a marketplace channel.
ALTER TABLE public.marketplace_accounts
  ADD CONSTRAINT marketplace_accounts_id_org_unique UNIQUE (id, organization_id);

ALTER TABLE public.products
  ADD CONSTRAINT products_id_org_unique UNIQUE (id, organization_id);

CREATE TABLE IF NOT EXISTS public.marketplace_inventory_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  product_id uuid NOT NULL,
  allocated_quantity integer NOT NULL DEFAULT 0 CHECK (allocated_quantity >= 0),
  reserved_quantity integer NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0 AND reserved_quantity <= allocated_quantity),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL','MARKETPLACE_SYNC','DEMO_SEED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_inventory_alloc_account_fk FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_inventory_alloc_product_fk FOREIGN KEY (product_id, organization_id)
    REFERENCES public.products(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_inventory_alloc_unique UNIQUE (marketplace_account_id, product_id)
);

ALTER TABLE public.stock_ledger
  ADD COLUMN IF NOT EXISTS marketplace_account_id uuid;

ALTER TABLE public.stock_ledger
  ADD CONSTRAINT stock_ledger_account_org_fk FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS marketplace_inventory_alloc_org_store_idx
  ON public.marketplace_inventory_allocations(organization_id, marketplace_account_id);
CREATE INDEX IF NOT EXISTS marketplace_inventory_alloc_product_idx
  ON public.marketplace_inventory_allocations(organization_id, product_id);
CREATE INDEX IF NOT EXISTS stock_ledger_org_store_created_idx
  ON public.stock_ledger(organization_id, marketplace_account_id, created_at DESC);

-- Attribute only ledger events whose source is a known marketplace order.
UPDATE public.stock_ledger sl
SET marketplace_account_id = o.marketplace_account_id
FROM public.orders o
WHERE sl.organization_id = o.organization_id
  AND sl.source_id = o.id
  AND sl.marketplace_account_id IS NULL
  AND o.marketplace_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.set_stock_ledger_marketplace_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.marketplace_account_id IS NULL AND NEW.source_id IS NOT NULL THEN
    SELECT o.marketplace_account_id
      INTO NEW.marketplace_account_id
    FROM public.orders o
    WHERE o.organization_id = NEW.organization_id
      AND o.id = NEW.source_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS stock_ledger_marketplace_account_attribution ON public.stock_ledger;
CREATE TRIGGER stock_ledger_marketplace_account_attribution
BEFORE INSERT ON public.stock_ledger
FOR EACH ROW EXECUTE FUNCTION private.set_stock_ledger_marketplace_account();

CREATE TABLE IF NOT EXISTS public.marketplace_finance_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketplace_account_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('INVOICE','EXPENSE','PAYMENT','JOURNAL_ENTRY')),
  source_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency char(3) NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_finance_alloc_account_org_fk FOREIGN KEY (marketplace_account_id, organization_id)
    REFERENCES public.marketplace_accounts(id, organization_id) ON DELETE CASCADE,
  CONSTRAINT marketplace_finance_alloc_unique UNIQUE (organization_id, marketplace_account_id, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS marketplace_finance_alloc_org_store_idx
  ON public.marketplace_finance_allocations(organization_id, marketplace_account_id, source_type);
CREATE INDEX IF NOT EXISTS marketplace_finance_alloc_source_idx
  ON public.marketplace_finance_allocations(organization_id, source_type, source_id);

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
  IF NEW.source_type = 'INVOICE' THEN
    SELECT organization_id, total_minor, currency INTO v_org, v_amount, v_currency
    FROM public.invoices WHERE id = NEW.source_id;
  ELSIF NEW.source_type = 'EXPENSE' THEN
    SELECT organization_id, amount_minor, currency INTO v_org, v_amount, v_currency
    FROM public.expenses WHERE id = NEW.source_id;
  ELSIF NEW.source_type = 'PAYMENT' THEN
    SELECT organization_id, amount_minor, currency INTO v_org, v_amount, v_currency
    FROM public.payments WHERE id = NEW.source_id;
  ELSIF NEW.source_type = 'JOURNAL_ENTRY' THEN
    SELECT je.organization_id, COALESCE(SUM(jel.debit_minor),0)::bigint, org.base_currency
      INTO v_org, v_amount, v_currency
    FROM public.journal_entries je
    JOIN public.organizations org ON org.id=je.organization_id
    LEFT JOIN public.journal_entry_lines jel
      ON jel.journal_entry_id = je.id AND jel.organization_id = je.organization_id
    WHERE je.id = NEW.source_id
    GROUP BY je.organization_id, org.base_currency;
  END IF;

  IF v_org IS NULL OR v_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Finance source does not belong to this organization';
  END IF;
  IF upper(trim(v_currency)) <> upper(trim(NEW.currency)) THEN
    RAISE EXCEPTION 'Finance allocation currency must match its source record';
  END IF;

  SELECT COALESCE(SUM(amount_minor),0) INTO v_existing
  FROM public.marketplace_finance_allocations
  WHERE organization_id = NEW.organization_id
    AND source_type = NEW.source_type AND source_id = NEW.source_id
    AND id <> NEW.id;
  IF v_existing + NEW.amount_minor > v_amount THEN
    RAISE EXCEPTION 'Store allocations cannot exceed the source document amount';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS marketplace_finance_allocation_validate ON public.marketplace_finance_allocations;
CREATE TRIGGER marketplace_finance_allocation_validate
BEFORE INSERT OR UPDATE ON public.marketplace_finance_allocations
FOR EACH ROW EXECUTE FUNCTION private.validate_marketplace_finance_allocation();

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

CREATE OR REPLACE FUNCTION public.set_marketplace_inventory_allocation(
  p_organization_id uuid,
  p_marketplace_account_id uuid,
  p_product_id uuid,
  p_allocated_quantity integer,
  p_reserved_quantity integer DEFAULT 0,
  p_source text DEFAULT 'MANUAL'
)
RETURNS public.marketplace_inventory_allocations
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.set_marketplace_inventory_allocation(
    p_organization_id,p_marketplace_account_id,p_product_id,p_allocated_quantity,p_reserved_quantity,p_source
  );
$$;

CREATE OR REPLACE FUNCTION private.allocate_marketplace_finance(
  p_organization_id uuid,
  p_marketplace_account_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_amount_minor bigint,
  p_currency char(3),
  p_note text DEFAULT NULL
)
RETURNS public.marketplace_finance_allocations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE v_row public.marketplace_finance_allocations;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id, 'finance.manage') THEN
    RAISE EXCEPTION 'Not authorized to allocate marketplace finance' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketplace_accounts WHERE id=p_marketplace_account_id AND organization_id=p_organization_id) THEN
    RAISE EXCEPTION 'Marketplace account does not belong to this organization';
  END IF;
  INSERT INTO public.marketplace_finance_allocations(
    organization_id,marketplace_account_id,source_type,source_id,amount_minor,currency,note,created_by,updated_at
  ) VALUES (
    p_organization_id,p_marketplace_account_id,upper(p_source_type),p_source_id,p_amount_minor,p_currency,p_note,auth.uid(),now()
  )
  ON CONFLICT (organization_id,marketplace_account_id,source_type,source_id)
  DO UPDATE SET amount_minor=EXCLUDED.amount_minor,currency=EXCLUDED.currency,note=EXCLUDED.note,updated_at=now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_marketplace_finance(
  p_organization_id uuid,
  p_marketplace_account_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_amount_minor bigint,
  p_currency char(3),
  p_note text DEFAULT NULL
)
RETURNS public.marketplace_finance_allocations
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, private
AS $$
  SELECT private.allocate_marketplace_finance(
    p_organization_id,p_marketplace_account_id,p_source_type,p_source_id,p_amount_minor,p_currency,p_note
  );
$$;

ALTER TABLE public.marketplace_inventory_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_finance_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_inventory_alloc_select ON public.marketplace_inventory_allocations;
CREATE POLICY marketplace_inventory_alloc_select ON public.marketplace_inventory_allocations
FOR SELECT TO authenticated USING (
  private.has_org_permission(organization_id,'inventory.view')
  AND (NOT private.is_client_user(organization_id) OR product_id IN (
    SELECT p.id FROM public.products p WHERE p.organization_id=marketplace_inventory_allocations.organization_id
      AND p.client_3pl_id=private.current_user_client_id(marketplace_inventory_allocations.organization_id)
  ))
);
DROP POLICY IF EXISTS marketplace_inventory_alloc_manage ON public.marketplace_inventory_allocations;
CREATE POLICY marketplace_inventory_alloc_manage ON public.marketplace_inventory_allocations
FOR ALL TO authenticated USING (
  private.has_org_permission(organization_id,'inventory.manage')
  AND NOT private.is_client_user(organization_id)
) WITH CHECK (
  private.has_org_permission(organization_id,'inventory.manage')
  AND NOT private.is_client_user(organization_id)
);

DROP POLICY IF EXISTS marketplace_finance_alloc_select ON public.marketplace_finance_allocations;
CREATE POLICY marketplace_finance_alloc_select ON public.marketplace_finance_allocations
FOR SELECT TO authenticated USING (
  private.has_org_permission(organization_id,'finance.view')
  AND NOT private.is_client_user(organization_id)
);
DROP POLICY IF EXISTS marketplace_finance_alloc_manage ON public.marketplace_finance_allocations;
CREATE POLICY marketplace_finance_alloc_manage ON public.marketplace_finance_allocations
FOR ALL TO authenticated USING (
  private.has_org_permission(organization_id,'finance.manage')
  AND NOT private.is_client_user(organization_id)
) WITH CHECK (
  private.has_org_permission(organization_id,'finance.manage')
  AND NOT private.is_client_user(organization_id)
);

REVOKE ALL ON FUNCTION private.set_marketplace_inventory_allocation(uuid,uuid,uuid,integer,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.allocate_marketplace_finance(uuid,uuid,text,uuid,bigint,char,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.set_marketplace_inventory_allocation(uuid,uuid,uuid,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.allocate_marketplace_finance(uuid,uuid,text,uuid,bigint,char,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketplace_inventory_allocation(uuid,uuid,uuid,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_marketplace_finance(uuid,uuid,text,uuid,bigint,char,text) TO authenticated;

GRANT SELECT ON public.marketplace_inventory_allocations TO authenticated;
GRANT SELECT ON public.marketplace_finance_allocations TO authenticated;
