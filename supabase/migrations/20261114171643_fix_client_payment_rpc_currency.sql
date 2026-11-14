CREATE OR REPLACE FUNCTION public.get_client_finance_payments(p_organization_id uuid)
RETURNS TABLE(
  id uuid,payment_number text,amount_minor bigint,currency text,payment_method text,payment_date date,
  reference text,payer_name text,unallocated_credit_minor bigint,recorded_by uuid,created_at timestamptz,allocations jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,private
AS $$
DECLARE v_client_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id,'finance.view')
     OR NOT private.is_client_user(p_organization_id) THEN
    RAISE EXCEPTION 'Not authorized to read client payments' USING ERRCODE='42501';
  END IF;
  v_client_id := private.current_user_client_id(p_organization_id);
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Client account is not linked' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT p.id,p.payment_number,SUM(pa.amount_minor)::bigint,p.currency::text,p.payment_method,p.payment_date,p.reference,
         COALESCE(MAX(i.recipient_name),''),0::bigint,p.recorded_by,p.created_at,
         jsonb_agg(jsonb_build_object('invoiceId',i.id,'invoiceNumber',i.invoice_number,'amountMinor',pa.amount_minor) ORDER BY i.invoice_number)
  FROM public.payments p
  JOIN public.payment_allocations pa ON pa.payment_id=p.id AND pa.organization_id=p_organization_id
  JOIN public.invoices i ON i.id=pa.invoice_id AND i.organization_id=p_organization_id
  WHERE p.organization_id=p_organization_id
    AND i.recipient_type='CLIENT'
    AND i.recipient_id=v_client_id
  GROUP BY p.id
  ORDER BY p.payment_date DESC,p.created_at DESC;
END;
$$;
