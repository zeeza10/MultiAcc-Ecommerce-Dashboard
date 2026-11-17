-- Complete the Finance & Payments demonstration for the flagship Demo UK store.
-- All records are synthetic and explicitly partitioned to DEMO. This migration is
-- additive/idempotent: it does not touch Sandbox or Production records.

DO $finance_demo$
DECLARE
  v_org uuid := 'd1a0a936-a447-4a3e-94a5-1f76b8f09787';
  v_actor uuid;
  v_uk uuid := md5('nexusops-demo-v1:marketplace:mkt_ebay_uk')::uuid;
  v_us uuid := md5('nexusops-demo-v1:marketplace:mkt_ebay_us')::uuid;
  v_de uuid := md5('nexusops-demo-v1:marketplace:mkt_ebay_de')::uuid;
  v_invoice_005 uuid := md5('nexusops-demo-v1:invoice:inv_005')::uuid;
  v_expense_005 uuid := md5('nexusops-demo-v1:expense:exp_005')::uuid;
  v_journal_005 uuid := md5('nexusops-demo-v1:journal:invoice:inv_005')::uuid;
BEGIN
  SELECT user_id INTO v_actor
  FROM public.organization_members
  WHERE organization_id = v_org AND is_active
  ORDER BY joined_at LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'No active Demo workspace member; Finance seed aborted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.marketplace_accounts
    WHERE id = v_uk AND organization_id = v_org AND is_demo = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_accounts
    WHERE id = v_us AND organization_id = v_org AND is_demo = TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public.marketplace_accounts
    WHERE id = v_de AND organization_id = v_org AND is_demo = TRUE
  ) THEN
    RAISE EXCEPTION 'Expected Demo UK, US and DE marketplace accounts; Finance seed aborted';
  END IF;

  -- Keep invoice paid balances consistent with the already seeded payment allocations.
  UPDATE public.invoices i
  SET paid_amount_minor = COALESCE((
        SELECT SUM(pa.amount_minor)
        FROM public.payment_allocations pa
        WHERE pa.organization_id = v_org AND pa.invoice_id = i.id
          AND pa.data_environment = 'DEMO'::public.data_environment
      ), 0),
      status = CASE
        WHEN COALESCE((SELECT SUM(pa.amount_minor) FROM public.payment_allocations pa
          WHERE pa.organization_id = v_org AND pa.invoice_id = i.id
            AND pa.data_environment = 'DEMO'::public.data_environment), 0) >= i.total_minor
          AND i.total_minor > 0 THEN 'PAID'
        WHEN COALESCE((SELECT SUM(pa.amount_minor) FROM public.payment_allocations pa
          WHERE pa.organization_id = v_org AND pa.invoice_id = i.id
            AND pa.data_environment = 'DEMO'::public.data_environment), 0) > 0 THEN 'PARTIALLY_PAID'
        ELSE i.status
      END
  WHERE i.organization_id = v_org
    AND i.data_environment = 'DEMO'::public.data_environment
    AND i.external_id IN ('demo:inv_001','demo:inv_002');

  -- Add a clear overdue receivable example so the receivables ageing report has
  -- paid, partially paid, current and overdue cases.
  INSERT INTO public.invoices (
    id, organization_id, external_id, invoice_number, invoice_type,
    recipient_type, recipient_id, recipient_name, issue_date, due_date,
    subtotal_minor, vat_rate_percent, vat_amount_minor, total_minor,
    paid_amount_minor, currency, status, is_immutable, created_by,
    created_at, data_environment
  ) VALUES (
    v_invoice_005, v_org, 'demo:inv_005', 'INV-2026-005', 'SALES',
    'CLIENT', md5('nexusops-demo-v1:client:client_apex')::uuid,
    'Apex Electronics Ltd', '2026-10-20', '2026-11-05',
    12500, 20, 2500, 15000, 0, 'GBP', 'OVERDUE', FALSE, v_actor,
    '2026-10-20T10:00:00Z'::timestamptz, 'DEMO'::public.data_environment
  ) ON CONFLICT DO NOTHING;

  INSERT INTO public.invoice_items (
    id, organization_id, invoice_id, description, quantity,
    unit_price_minor, total_minor, data_environment
  ) VALUES
  (md5('nexusops-demo-v1:invoiceline:inv_005:0')::uuid,v_org,v_invoice_005,
   'Monthly account management and order reconciliation service',1,8500,8500,'DEMO'),
  (md5('nexusops-demo-v1:invoiceline:inv_005:1')::uuid,v_org,v_invoice_005,
   'Returns inspection and restocking service',2,2000,4000,'DEMO')
  ON CONFLICT DO NOTHING;

  -- Add a pending supplier/operational expense for the approval workflow.
  INSERT INTO public.expenses (
    id, organization_id, external_id, expense_number, category, supplier_name,
    expense_date, amount_minor, vat_minor, currency, allocated_to, status,
    approved_by, note, created_at, data_environment
  ) VALUES (
    v_expense_005, v_org, 'demo:exp_005', 'DEMO-EXP_005',
    'COURIER_SERVICES', 'DHL Express UK', '2026-11-12',
    38500, 7700, 'GBP', 'OPERATIONS', 'PENDING_APPROVAL',
    NULL, '[DEMO] DHL Express monthly cross-border dispatch invoice awaiting finance approval.',
    '2026-11-12T10:00:00Z'::timestamptz, 'DEMO'::public.data_environment
  ) ON CONFLICT DO NOTHING;

  -- Complete the double-entry ledger for the additional overdue invoice.
  INSERT INTO public.journal_entries (
    id, organization_id, entry_number, entry_date, source_type, source_id,
    description, status, idempotency_key, created_by, posted_at, created_at,
    data_environment
  ) VALUES (
    v_journal_005, v_org, 'DEMO-JE-INV-INV-2026-005', '2026-10-20',
    'INVOICE', v_invoice_005, '[DEMO] Invoice INV-2026-005',
    'POSTED', 'demo-seed:invoice:inv_005', v_actor,
    '2026-10-20T10:00:00Z'::timestamptz, '2026-10-20T10:00:00Z'::timestamptz,
    'DEMO'::public.data_environment
  ) ON CONFLICT DO NOTHING;

  INSERT INTO public.journal_entry_lines (
    id, organization_id, journal_entry_id, account_id,
    debit_minor, credit_minor, description, data_environment
  )
  SELECT md5('nexusops-demo-v1:journalline:invoice:inv_005:ar')::uuid,
         v_org, v_journal_005, coa.id, 15000, 0,
         'Accounts receivable - INV-2026-005', 'DEMO'
  FROM public.chart_of_accounts coa
  WHERE coa.organization_id = v_org AND coa.account_code = '1200'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.journal_entry_lines (
    id, organization_id, journal_entry_id, account_id,
    debit_minor, credit_minor, description, data_environment
  )
  SELECT md5('nexusops-demo-v1:journalline:invoice:inv_005:revenue')::uuid,
         v_org, v_journal_005, coa.id, 0, 12500,
         'Sales revenue - INV-2026-005', 'DEMO'
  FROM public.chart_of_accounts coa
  WHERE coa.organization_id = v_org AND coa.account_code = '4000'
  ON CONFLICT DO NOTHING;

  INSERT INTO public.journal_entry_lines (
    id, organization_id, journal_entry_id, account_id,
    debit_minor, credit_minor, description, data_environment
  )
  SELECT md5('nexusops-demo-v1:journalline:invoice:inv_005:vat')::uuid,
         v_org, v_journal_005, coa.id, 0, 2500,
         'VAT output liability - INV-2026-005', 'DEMO'
  FROM public.chart_of_accounts coa
  WHERE coa.organization_id = v_org AND coa.account_code = '2200'
  ON CONFLICT DO NOTHING;

  -- Allocate finance documents and their journals to the flagship UK Demo store.
  -- This enables store-filtered Invoices, Expenses and General Ledger views.
  INSERT INTO public.marketplace_finance_allocations (
    id, organization_id, marketplace_account_id, source_type, source_id,
    amount_minor, currency, note, created_by
  )
  SELECT md5('nexusops-demo-v1:finance-allocation:INVOICE:' || i.id::text)::uuid,
         v_org, v_uk, 'INVOICE', i.id, i.total_minor, i.currency,
         '[DEMO] Allocated to Nexus Tech Direct UK demonstration store', v_actor
  FROM public.invoices i
  WHERE i.organization_id = v_org AND i.data_environment = 'DEMO'
  ON CONFLICT (organization_id, marketplace_account_id, source_type, source_id) DO NOTHING;

  INSERT INTO public.marketplace_finance_allocations (
    id, organization_id, marketplace_account_id, source_type, source_id,
    amount_minor, currency, note, created_by
  )
  SELECT md5('nexusops-demo-v1:finance-allocation:PAYMENT:' || p.id::text)::uuid,
         v_org, v_uk, 'PAYMENT', p.id, p.amount_minor, p.currency,
         '[DEMO] Allocated to Nexus Tech Direct UK demonstration store', v_actor
  FROM public.payments p
  WHERE p.organization_id = v_org AND p.data_environment = 'DEMO'
  ON CONFLICT (organization_id, marketplace_account_id, source_type, source_id) DO NOTHING;

  INSERT INTO public.marketplace_finance_allocations (
    id, organization_id, marketplace_account_id, source_type, source_id,
    amount_minor, currency, note, created_by
  )
  SELECT md5('nexusops-demo-v1:finance-allocation:EXPENSE:' || e.id::text)::uuid,
         v_org, v_uk, 'EXPENSE', e.id, e.amount_minor, e.currency,
         '[DEMO] Allocated to Nexus Tech Direct UK demonstration store', v_actor
  FROM public.expenses e
  WHERE e.organization_id = v_org AND e.data_environment = 'DEMO'
  ON CONFLICT (organization_id, marketplace_account_id, source_type, source_id) DO NOTHING;

  INSERT INTO public.marketplace_finance_allocations (
    id, organization_id, marketplace_account_id, source_type, source_id,
    amount_minor, currency, note, created_by
  )
  SELECT md5('nexusops-demo-v1:finance-allocation:JOURNAL_ENTRY:' || je.id::text)::uuid,
         v_org, v_uk, 'JOURNAL_ENTRY', je.id,
         GREATEST(SUM(jel.debit_minor), 1), 'GBP',
         '[DEMO] Allocated to Nexus Tech Direct UK demonstration store', v_actor
  FROM public.journal_entries je
  JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.organization_id = v_org
    AND je.data_environment = 'DEMO'
    AND jel.organization_id = v_org
    AND jel.data_environment = 'DEMO'
  GROUP BY je.id
  ON CONFLICT (organization_id, marketplace_account_id, source_type, source_id) DO NOTHING;

  -- Simulated bank feed: four marketplace settlement credits plus four operational
  -- debits. These are synthetic bank statement rows, not real bank integrations.
  INSERT INTO public.bank_transactions (
    id, organization_id, bank_account_name, transaction_date, amount_minor,
    currency, reference, description, external_transaction_id, imported_at,
    data_environment
  ) VALUES
  (md5('nexusops-demo-v1:bank:uk:payout-081')::uuid,v_org,'Barclays Business GBP','2026-11-04',415909,'GBP','BARCLAYS-DEP-88419','[DEMO] eBay UK payout EP-2026-UK-081','demo:bank:uk:payout-081','2026-11-04T12:10:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:uk:payout-082')::uuid,v_org,'Barclays Business GBP','2026-11-06',204092,'GBP','BARCLAYS-DEP-88502','[DEMO] eBay UK payout EP-2026-UK-082','demo:bank:uk:payout-082','2026-11-06T12:10:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:us:payout-041')::uuid,v_org,'Chase Business USD','2026-11-03',421404,'USD','CHASE-WIRE-55102','[DEMO] eBay US payout EP-2026-US-041','demo:bank:us:payout-041','2026-11-03T14:40:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:de:payout-019')::uuid,v_org,'Deutsche Bank EUR','2026-11-05',287928,'EUR','DEUTSCHE-SEPA-9931','[DEMO] eBay DE payout EP-2026-DE-019','demo:bank:de:payout-019','2026-11-05T10:25:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:uk:expense-001')::uuid,v_org,'Barclays Business GBP','2026-11-02',-145000,'GBP','DEMO-EXP_001','[DEMO] Royal Mail weekly dispatch statement','demo:bank:uk:expense-001','2026-11-02T16:00:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:uk:expense-002')::uuid,v_org,'Barclays Business GBP','2026-11-03',-57600,'GBP','DEMO-EXP_002','[DEMO] Rajapack packaging materials including VAT','demo:bank:uk:expense-002','2026-11-03T16:00:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:uk:expense-003')::uuid,v_org,'Barclays Business GBP','2026-11-04',-89200,'GBP','DEMO-EXP_003','[DEMO] eBay UK marketplace fees','demo:bank:uk:expense-003','2026-11-04T16:00:00Z','DEMO'),
  (md5('nexusops-demo-v1:bank:uk:expense-004')::uuid,v_org,'Barclays Business GBP','2026-11-05',-78000,'GBP','DEMO-EXP_004','[DEMO] Warehouse utilities including VAT','demo:bank:uk:expense-004','2026-11-05T16:00:00Z','DEMO')
  ON CONFLICT (organization_id, external_transaction_id) DO NOTHING;

  -- Ensure the additional invoice's journal is fully balanced and all seeded bank
  -- statement rows are visible in the Demo environment.
  IF NOT EXISTS (
    SELECT 1 FROM public.journal_entries je
    WHERE je.id = v_journal_005 AND je.data_environment = 'DEMO'
  ) OR (
    SELECT COALESCE(SUM(debit_minor),0) - COALESCE(SUM(credit_minor),0)
    FROM public.journal_entry_lines WHERE journal_entry_id = v_journal_005
      AND data_environment = 'DEMO'
  ) <> 0 THEN
    RAISE EXCEPTION 'Demo invoice 005 journal is missing or unbalanced';
  END IF;

  IF (SELECT count(*) FROM public.bank_transactions
      WHERE organization_id = v_org AND data_environment = 'DEMO') < 8 THEN
    RAISE EXCEPTION 'Expected at least eight Demo bank statement transactions';
  END IF;

  IF (SELECT count(*) FROM public.marketplace_finance_allocations
      WHERE organization_id = v_org AND marketplace_account_id = v_uk) < 20 THEN
    RAISE EXCEPTION 'Expected full UK Demo store finance allocations';
  END IF;
END
$finance_demo$;
