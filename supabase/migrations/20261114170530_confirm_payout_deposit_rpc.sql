CREATE OR REPLACE FUNCTION public.confirm_payout_deposit(
  p_organization_id uuid,
  p_payout_id uuid,
  p_bank_reference text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_payout public.marketplace_payouts%ROWTYPE;
  v_reference text := btrim(COALESCE(p_bank_reference, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_org_permission(p_organization_id, 'finance.manage') THEN
    RAISE EXCEPTION 'Not authorized to confirm payout deposits' USING ERRCODE = '42501';
  END IF;
  IF v_reference = '' OR length(v_reference) > 128 THEN
    RAISE EXCEPTION 'A valid bank reference is required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_payout
  FROM public.marketplace_payouts
  WHERE organization_id = p_organization_id AND id = p_payout_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout not found in this workspace' USING ERRCODE = 'P0002';
  END IF;
  IF v_payout.bank_deposit_status IN ('RECONCILED','BANK_CONFIRMED') THEN
    RAISE EXCEPTION 'This payout has already been confirmed' USING ERRCODE = '23505';
  END IF;
  UPDATE public.marketplace_payouts
  SET status = 'BANK_CONFIRMED',
      bank_deposit_status = 'RECONCILED',
      bank_reference = v_reference
  WHERE id = p_payout_id AND organization_id = p_organization_id
  RETURNING * INTO v_payout;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity, entity_id, before_snapshot, after_snapshot, notes
  ) VALUES (
    p_organization_id, auth.uid(), 'PAYOUT_DEPOSIT_CONFIRMED', 'marketplace_payouts', p_payout_id::text,
    jsonb_build_object('status', 'PENDING', 'bank_deposit_status', 'PENDING'),
    jsonb_build_object('status', v_payout.status, 'bank_deposit_status', v_payout.bank_deposit_status, 'bank_reference', v_reference),
    'Bank deposit confirmation recorded.'
  );
  RETURN to_jsonb(v_payout);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_payout_deposit(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_payout_deposit(uuid,uuid,text) TO authenticated;
