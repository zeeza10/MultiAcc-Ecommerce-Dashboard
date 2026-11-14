CREATE OR REPLACE FUNCTION public.record_finance_payment(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_amount_minor bigint,
  p_payment_method text,
  p_payment_date date,
  p_reference text DEFAULT NULL,
  p_payer_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_payment_id uuid := gen_random_uuid();
  v_journal_id uuid := gen_random_uuid();
  v_suffix text := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_bank_account uuid;
  v_ar_account uuid;
  v_method text := upper(btrim(COALESCE(p_payment_method,'')));
  v_ref text := nullif(btrim(COALESCE(p_reference,'')),'');
  v_payer text := nullif(btrim(COALESCE(p_payer_name,'')),'');
  v_outstanding bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id, 'finance.manage') THEN
    RAISE EXCEPTION 'Not authorized to record finance payments' USING ERRCODE = '42501';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero' USING ERRCODE = '22023';
  END IF;
  IF v_method NOT IN ('BANK_TRANSFER','CASH','CARD','PAYPAL','OTHER') THEN
    RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_invoice FROM public.invoices
  WHERE organization_id=p_organization_id AND id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found in this workspace' USING ERRCODE = 'P0002'; END IF;
  IF v_invoice.status IN ('VOID','VOIDED') THEN RAISE EXCEPTION 'A void invoice cannot receive a payment' USING ERRCODE = '23514'; END IF;
  v_outstanding := GREATEST(0, v_invoice.total_minor - v_invoice.paid_amount_minor);
  IF p_amount_minor > v_outstanding THEN RAISE EXCEPTION 'Payment exceeds the invoice outstanding balance' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.payments(id,organization_id,payment_number,amount_minor,currency,payment_method,payment_date,reference,payer_name,unallocated_credit_minor,recorded_by)
  VALUES(v_payment_id,p_organization_id,'PAY-'||to_char(COALESCE(p_payment_date,current_date),'YYYYMMDD')||'-'||v_suffix,p_amount_minor,v_invoice.currency,v_method,COALESCE(p_payment_date,current_date),v_ref,COALESCE(v_payer,v_invoice.recipient_name),0,auth.uid())
  RETURNING * INTO v_payment;

  INSERT INTO public.payment_allocations(organization_id,payment_id,invoice_id,amount_minor)
  VALUES(p_organization_id,v_payment_id,p_invoice_id,p_amount_minor);

  UPDATE public.invoices
  SET paid_amount_minor=paid_amount_minor+p_amount_minor,
      status=CASE WHEN paid_amount_minor+p_amount_minor >= total_minor THEN 'PAID' ELSE 'PARTIALLY_PAID' END,
      is_immutable=CASE WHEN paid_amount_minor+p_amount_minor >= total_minor THEN true ELSE is_immutable END
  WHERE organization_id=p_organization_id AND id=p_invoice_id;

  SELECT id INTO v_bank_account FROM public.chart_of_accounts WHERE organization_id=p_organization_id AND account_code='1000' AND is_active LIMIT 1;
  SELECT id INTO v_ar_account FROM public.chart_of_accounts WHERE organization_id=p_organization_id AND account_code='1200' AND is_active LIMIT 1;
  IF v_bank_account IS NULL OR v_ar_account IS NULL THEN RAISE EXCEPTION 'Required bank or receivables ledger accounts are missing'; END IF;

  INSERT INTO public.journal_entries(id,organization_id,entry_number,entry_date,source_type,source_id,description,status,idempotency_key,created_by,posted_at)
  VALUES(v_journal_id,p_organization_id,'JE-'||v_suffix,COALESCE(p_payment_date,current_date),'PAYMENT',v_payment_id,'Payment received for invoice '||v_invoice.invoice_number,'POSTED','finance-payment:'||v_payment_id::text,auth.uid(),now());
  INSERT INTO public.journal_entry_lines(organization_id,journal_entry_id,account_id,debit_minor,credit_minor,description)
  VALUES
  (p_organization_id,v_journal_id,v_bank_account,p_amount_minor,0,'Bank receipt'),
  (p_organization_id,v_journal_id,v_ar_account,0,p_amount_minor,'Accounts receivable settlement');

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,after_snapshot,notes)
  VALUES(p_organization_id,auth.uid(),'PAYMENT_RECORDED','payments',v_payment_id::text,to_jsonb(v_payment),'Payment allocated to invoice '||v_invoice.invoice_number);
  RETURN to_jsonb(v_payment);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_finance_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_original public.journal_entries%ROWTYPE;
  v_reversal_id uuid := gen_random_uuid();
  v_reason text := btrim(COALESCE(p_reason,''));
  v_suffix text := upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id, 'finance.manage') THEN
    RAISE EXCEPTION 'Not authorized to void invoices' USING ERRCODE = '42501';
  END IF;
  IF v_reason = '' OR length(v_reason) > 500 THEN RAISE EXCEPTION 'A void reason is required (maximum 500 characters)' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_invoice FROM public.invoices
  WHERE organization_id=p_organization_id AND id=p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found in this workspace' USING ERRCODE = 'P0002'; END IF;
  IF v_invoice.status IN ('VOID','VOIDED') THEN RAISE EXCEPTION 'Invoice is already void' USING ERRCODE = '23505'; END IF;
  IF v_invoice.paid_amount_minor > 0 OR EXISTS(
    SELECT 1 FROM public.payment_allocations WHERE organization_id=p_organization_id AND invoice_id=p_invoice_id
  ) THEN RAISE EXCEPTION 'An invoice with allocated payments cannot be voided; reverse or refund the payment first' USING ERRCODE = '23514'; END IF;

  SELECT * INTO v_original FROM public.journal_entries
  WHERE organization_id=p_organization_id AND source_type='INVOICE' AND source_id=p_invoice_id AND status='POSTED'
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  UPDATE public.invoices SET status='VOID',void_reason=v_reason,is_immutable=true
  WHERE organization_id=p_organization_id AND id=p_invoice_id RETURNING * INTO v_invoice;

  IF v_original.id IS NOT NULL THEN
    INSERT INTO public.journal_entries(id,organization_id,entry_number,entry_date,source_type,source_id,description,status,idempotency_key,created_by,posted_at)
    VALUES(v_reversal_id,p_organization_id,'REV-'||v_suffix,current_date,'INVOICE_VOID',p_invoice_id,'Reversal of invoice '||v_invoice.invoice_number,'POSTED','void-invoice:'||p_invoice_id::text,auth.uid(),now());
    INSERT INTO public.journal_entry_lines(organization_id,journal_entry_id,account_id,debit_minor,credit_minor,description)
    SELECT p_organization_id,v_reversal_id,account_id,credit_minor,debit_minor,'Void reversal: '||COALESCE(description,'')
    FROM public.journal_entry_lines WHERE organization_id=p_organization_id AND journal_entry_id=v_original.id;
  END IF;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes)
  VALUES(p_organization_id,auth.uid(),'INVOICE_VOIDED','invoices',p_invoice_id::text,
    jsonb_build_object('status',v_original.status,'total_minor',v_invoice.total_minor),
    jsonb_build_object('status',v_invoice.status,'void_reason',v_reason),'Invoice voided with ledger reversal where applicable.');
  RETURN to_jsonb(v_invoice);
END;
$$;

REVOKE ALL ON FUNCTION public.record_finance_payment(uuid,uuid,bigint,text,date,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.void_finance_invoice(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_finance_payment(uuid,uuid,bigint,text,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_finance_invoice(uuid,uuid,text) TO authenticated;
