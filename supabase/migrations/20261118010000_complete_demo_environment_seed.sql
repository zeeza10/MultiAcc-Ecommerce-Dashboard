-- Complete the Demo environment partition for the existing client-presentation seed.
-- The original demo seed reused the Sandbox WH-01 warehouse for several demo locations,
-- and finance journal rows inherited the default SANDBOX environment before partitioning.
-- This migration moves only deterministic demo-seed records; no Sandbox or Production
-- business records are deleted or reclassified.

DO $demo_seed$
DECLARE
  v_org uuid := 'd1a0a936-a447-4a3e-94a5-1f76b8f09787';
  v_demo_main_warehouse uuid := md5('nexusops-demo-v1:warehouse:wh_main')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'Demo workspace not found; demo environment seed aborted';
  END IF;

  -- Give Demo its own main warehouse instead of sharing the Sandbox WH-01 row.
  INSERT INTO public.warehouses (
    id, organization_id, external_id, name, code, address,
    is_active, created_at, data_environment
  ) VALUES (
    v_demo_main_warehouse,
    v_org,
    'demo:wh_main',
    'Nexus Central Fulfillment Hub',
    'DWH-01',
    '{"address":"Unit 4, Gateway Logistics Park, Milton Keynes, MK17 8EB, UK"}'::jsonb,
    TRUE,
    '2026-11-01T00:00:00Z'::timestamptz,
    'DEMO'::public.data_environment
  )
  ON CONFLICT DO NOTHING;

  -- These deterministic locations were created by the Demo seed but attached to the
  -- pre-existing Sandbox warehouse. Rehome only those known Demo location codes.
  UPDATE public.warehouse_locations
  SET warehouse_id = v_demo_main_warehouse
  WHERE organization_id = v_org
    AND location_code IN (
      'ZONE-A-A1-S01-B01',
      'ZONE-A-A1-S02-B02',
      'ZONE-A-A2-S01-B03',
      'ZONE-A-A2-S02-B04',
      'ZONE-B-B1-S01-P01',
      'ZONE-B-B2-S01-P02',
      'ZONE-B-B3-S01-P03',
      'QUARANTINE-Q1-S01-Q-DMG',
      'RETURNS-BAY-R1-S01-R-INSP'
    );

  -- Re-evaluate ledger rows attached to the moved Demo locations. The existing
  -- environment-inheritance trigger now resolves their location to Demo as well.
  UPDATE public.stock_ledger AS sl
  SET location_id = sl.location_id
  WHERE sl.organization_id = v_org
    AND sl.product_id IN (
      SELECT p.id FROM public.products p
      WHERE p.organization_id = v_org
        AND p.data_environment = 'DEMO'::public.data_environment
    )
    AND sl.location_id IN (
      SELECT wl.id FROM public.warehouse_locations wl
      WHERE wl.organization_id = v_org
        AND wl.warehouse_id = v_demo_main_warehouse
    );

  -- Finance seed journal entries point to Demo invoices, payments, expenses and
  -- goods receipts. Their source_type values are domain names, not DEMO-prefixed,
  -- so the earlier environment backfill left them incorrectly in SANDBOX.
  UPDATE public.journal_entries AS je
  SET data_environment = 'DEMO'::public.data_environment
  WHERE je.organization_id = v_org
    AND (
      (je.source_type = 'INVOICE' AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = je.source_id AND i.organization_id = v_org
          AND i.data_environment = 'DEMO'::public.data_environment
      ))
      OR (je.source_type = 'PAYMENT' AND EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.id = je.source_id AND p.organization_id = v_org
          AND p.data_environment = 'DEMO'::public.data_environment
      ))
      OR (je.source_type = 'EXPENSE' AND EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.id = je.source_id AND e.organization_id = v_org
          AND e.data_environment = 'DEMO'::public.data_environment
      ))
      OR (je.source_type = 'GOODS_RECEIPT' AND EXISTS (
        SELECT 1 FROM public.goods_receipts gr
        WHERE gr.organization_id = v_org
          AND (gr.id = je.source_id OR gr.purchase_order_id = je.source_id)
          AND gr.data_environment = 'DEMO'::public.data_environment
      ))
    );

  -- Journal lines inherit the corrected environment from their parent entry.
  UPDATE public.journal_entry_lines AS jel
  SET data_environment = je.data_environment
  FROM public.journal_entries AS je
  WHERE je.id = jel.journal_entry_id
    AND je.organization_id = v_org
    AND jel.organization_id = v_org
    AND je.data_environment = 'DEMO'::public.data_environment;

  -- Fail the migration rather than silently shipping a partially partitioned demo.
  IF (
    SELECT count(*) FROM public.warehouse_locations
    WHERE organization_id = v_org
      AND data_environment = 'DEMO'::public.data_environment
  ) < 11 THEN
    RAISE EXCEPTION 'Expected at least 11 Demo warehouse locations after seed repair';
  END IF;

  IF (
    SELECT count(*) FROM public.journal_entries
    WHERE organization_id = v_org
      AND data_environment = 'DEMO'::public.data_environment
  ) < 13 THEN
    RAISE EXCEPTION 'Expected at least 13 Demo journal entries after seed repair';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.warehouse_locations
    WHERE organization_id = v_org
      AND location_code IN (
        'ZONE-A-A1-S01-B01',
        'ZONE-A-A1-S02-B02',
        'ZONE-A-A2-S01-B03',
        'ZONE-A-A2-S02-B04',
        'ZONE-B-B1-S01-P01',
        'ZONE-B-B2-S01-P02',
        'ZONE-B-B3-S01-P03',
        'QUARANTINE-Q1-S01-Q-DMG',
        'RETURNS-BAY-R1-S01-R-INSP'
      )
      AND data_environment <> 'DEMO'::public.data_environment
  ) THEN
    RAISE EXCEPTION 'A known Demo warehouse location remains outside the Demo environment';
  END IF;
END
$demo_seed$;
