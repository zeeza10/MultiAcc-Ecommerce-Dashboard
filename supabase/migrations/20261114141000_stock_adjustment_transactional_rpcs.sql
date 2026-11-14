-- Stock adjustments are written only through audited, transactional RPCs.
-- Direct table writes are revoked so clients cannot bypass approval or dual control.

drop policy if exists stock_adjustments_permission_insert on public.stock_adjustments;
drop policy if exists stock_adjustments_permission_update on public.stock_adjustments;
drop policy if exists stock_adjustments_permission_delete on public.stock_adjustments;
drop policy if exists stock_ledger_permission_delete on public.stock_ledger;

revoke insert, update, delete on table public.stock_adjustments from authenticated;
revoke insert, update, delete on table public.stock_ledger from authenticated;
revoke insert, update, delete on table public.audit_logs from authenticated;
grant select on table public.stock_adjustments, public.stock_ledger, public.audit_logs to authenticated;

create or replace function private.submit_stock_adjustment(
  p_organization_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity_delta integer,
  p_target_state text,
  p_reason_code text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_role_code text;
  v_product record;
  v_location_id uuid := p_location_id;
  v_threshold_quantity integer := 10;
  v_threshold_value_minor bigint := 5000;
  v_value_minor numeric;
  v_requires_approval boolean;
  v_next_number bigint;
  v_adjustment_number text;
  v_adjustment public.stock_adjustments%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_organization_id is null or not private.has_org_permission(p_organization_id, 'inventory.adjust') then
    raise exception 'You are not authorized to adjust inventory in this workspace.' using errcode = '42501';
  end if;

  select r.code into v_role_code
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_organization_id
    and m.user_id = v_actor_id
    and m.is_active = true
  limit 1;

  if v_role_code is null then
    raise exception 'Active workspace membership is required.' using errcode = '42501';
  end if;

  if p_quantity_delta is null or p_quantity_delta = 0 then
    raise exception 'Adjustment quantity must be a non-zero whole number.' using errcode = '22023';
  end if;

  if p_target_state not in ('ON_HAND', 'DAMAGED', 'QUARANTINED', 'MISSING') then
    raise exception 'Invalid target stock state.' using errcode = '22023';
  end if;

  if p_reason_code not in ('damage', 'loss', 'found', 'count_correction', 'quarantine', 'write_off') then
    raise exception 'Invalid stock adjustment reason.' using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_note, ''))) = 0 or length(p_note) > 1000 then
    raise exception 'An audit note of 1 to 1000 characters is required.' using errcode = '22023';
  end if;

  select p.id, p.sku, p.name, p.owner_type, p.client_3pl_id, p.cost_price_minor, p.currency
  into v_product
  from public.products p
  where p.id = p_product_id
    and p.organization_id = p_organization_id;

  if not found then
    raise exception 'Product was not found in this workspace.' using errcode = 'P0002';
  end if;

  if v_location_id is not null then
    perform 1
    from public.warehouse_locations l
    where l.id = v_location_id
      and l.organization_id = p_organization_id
      and l.is_active = true;
    if not found then
      raise exception 'The selected warehouse location is not active in this workspace.' using errcode = '22023';
    end if;
  else
    select l.id into v_location_id
    from public.warehouse_locations l
    where l.organization_id = p_organization_id
      and l.is_active = true
    order by l.location_code
    limit 1;
  end if;

  select s.adjustment_approval_threshold_quantity, s.adjustment_approval_threshold_value_minor
  into v_threshold_quantity, v_threshold_value_minor
  from public.system_settings s
  where s.organization_id = p_organization_id;

  if not found then
    v_threshold_quantity := 10;
    v_threshold_value_minor := 5000;
  end if;

  v_value_minor := abs(p_quantity_delta::numeric) * coalesce(v_product.cost_price_minor, 0)::numeric;
  if v_value_minor > 9223372036854775807::numeric then
    raise exception 'Adjustment value exceeds the supported monetary range.' using errcode = '22003';
  end if;

  v_requires_approval :=
    abs(p_quantity_delta::bigint) > coalesce(v_threshold_quantity, 10)
    or v_value_minor > coalesce(v_threshold_value_minor, 5000);

  -- Serialize adjustment numbering per organization to avoid concurrent duplicates.
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));
  select count(*) + 1 into v_next_number
  from public.stock_adjustments
  where organization_id = p_organization_id;
  v_adjustment_number := 'ADJ-' || to_char(current_timestamp, 'YYYY') || '-' || lpad(v_next_number::text, 3, '0');

  select p.full_name into v_actor_name
  from public.profiles p
  where p.id = v_actor_id;
  v_actor_name := coalesce(nullif(v_actor_name, ''), 'Workspace user');

  insert into public.stock_adjustments (
    organization_id,
    adjustment_number,
    product_id,
    location_id,
    quantity_delta,
    target_state,
    reason_code,
    note,
    requested_by,
    requires_approval,
    status,
    approved_by,
    approval_note,
    evaluated_value_minor
  ) values (
    p_organization_id,
    v_adjustment_number,
    v_product.id,
    v_location_id,
    p_quantity_delta,
    p_target_state,
    p_reason_code,
    btrim(p_note),
    v_actor_id,
    v_requires_approval,
    case when v_requires_approval then 'PENDING_APPROVAL' else 'APPROVED' end,
    case when v_requires_approval then null else v_actor_id end,
    case
      when v_requires_approval then null
      else format('Auto-approved within workspace threshold (%s units; %s %s minor units).', abs(p_quantity_delta::bigint), v_product.currency, v_value_minor::bigint)
    end,
    v_value_minor::bigint
  )
  returning * into v_adjustment;

  if not v_requires_approval then
    insert into public.stock_ledger (
      organization_id,
      product_id,
      location_id,
      client_3pl_id,
      quantity_delta,
      stock_state,
      source_type,
      source_id,
      unit_cost_minor,
      note,
      created_by
    ) values (
      p_organization_id,
      v_product.id,
      v_location_id,
      v_product.client_3pl_id,
      p_quantity_delta,
      p_target_state,
      'ADJUSTMENT',
      v_adjustment.id,
      v_product.cost_price_minor,
      format('Approved adjustment %s: %s - %s', v_adjustment.adjustment_number, p_reason_code, btrim(p_note)),
      v_actor_id
    );
  else
    insert into public.notifications (
      organization_id,
      notification_type,
      title,
      message,
      severity,
      reference_url
    ) values (
      p_organization_id,
      'ADJUSTMENT_AWAITING_APPROVAL',
      'Adjustment Needs Approval: ' || v_adjustment.adjustment_number,
      format('%s requested adjustment of %s%s %s (estimated value: %s %s minor units).', v_actor_name, case when p_quantity_delta > 0 then '+' else '' end, p_quantity_delta, v_product.sku, v_product.currency, v_value_minor::bigint),
      'INFO',
      '/stock/adjustments'
    );
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    after_snapshot,
    notes
  ) values (
    p_organization_id,
    v_actor_id,
    'CREATE',
    'StockAdjustment',
    v_adjustment.id::text,
    to_jsonb(v_adjustment),
    format('Submitted adjustment %s (%s).', v_adjustment.adjustment_number, v_adjustment.status)
  );

  return to_jsonb(v_adjustment) || jsonb_build_object('sku', v_product.sku);
end;
$function$;

create or replace function private.decide_stock_adjustment(
  p_organization_id uuid,
  p_adjustment_id uuid,
  p_decision text,
  p_approval_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_role_code text;
  v_before public.stock_adjustments%rowtype;
  v_adjustment public.stock_adjustments%rowtype;
  v_product record;
  v_decision text := upper(btrim(coalesce(p_decision, '')));
  v_note text := btrim(coalesce(p_approval_note, ''));
begin
  if v_actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if p_organization_id is null or not private.has_org_permission(p_organization_id, 'inventory.adjust') then
    raise exception 'You are not authorized to review inventory adjustments in this workspace.' using errcode = '42501';
  end if;

  select r.code into v_role_code
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_organization_id
    and m.user_id = v_actor_id
    and m.is_active = true
  limit 1;

  if v_role_code not in ('OPS_MANAGER', 'SUPER_ADMIN') then
    raise exception 'Only Operations Manager or Super Admin can approve stock adjustments.' using errcode = '42501';
  end if;

  if v_decision not in ('APPROVE', 'REJECT') then
    raise exception 'Decision must be APPROVE or REJECT.' using errcode = '22023';
  end if;

  if length(v_note) > 1000 then
    raise exception 'Approval note must be at most 1000 characters.' using errcode = '22023';
  end if;

  select a.* into v_before
  from public.stock_adjustments a
  where a.id = p_adjustment_id
    and a.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Stock adjustment was not found in this workspace.' using errcode = 'P0002';
  end if;

  if v_before.status <> 'PENDING_APPROVAL' then
    raise exception 'This stock adjustment has already been reviewed.' using errcode = '55000';
  end if;

  if v_before.requested_by = v_actor_id then
    raise exception 'Separation of duties violation: the requester cannot approve their own adjustment.' using errcode = '42501';
  end if;

  select p.id, p.sku, p.name, p.owner_type, p.client_3pl_id, p.cost_price_minor
  into v_product
  from public.products p
  where p.id = v_before.product_id
    and p.organization_id = p_organization_id;

  if not found then
    raise exception 'The adjustment product no longer exists in this workspace.' using errcode = 'P0002';
  end if;

  select p.full_name into v_actor_name
  from public.profiles p
  where p.id = v_actor_id;
  v_actor_name := coalesce(nullif(v_actor_name, ''), 'Workspace user');

  update public.stock_adjustments
  set status = case when v_decision = 'APPROVE' then 'APPROVED' else 'REJECTED' end,
      approved_by = v_actor_id,
      approval_note = coalesce(nullif(v_note, ''), case when v_decision = 'APPROVE' then 'Approved by Operations Manager.' else 'Rejected by Operations Manager.' end),
      updated_at = now()
  where id = p_adjustment_id
    and organization_id = p_organization_id
    and status = 'PENDING_APPROVAL'
  returning * into v_adjustment;

  if not found then
    raise exception 'This stock adjustment has already been reviewed.' using errcode = '55000';
  end if;

  if v_decision = 'APPROVE' then
    insert into public.stock_ledger (
      organization_id,
      product_id,
      location_id,
      client_3pl_id,
      quantity_delta,
      stock_state,
      source_type,
      source_id,
      unit_cost_minor,
      note,
      created_by
    ) values (
      p_organization_id,
      v_product.id,
      v_adjustment.location_id,
      v_product.client_3pl_id,
      v_adjustment.quantity_delta,
      v_adjustment.target_state,
      'ADJUSTMENT',
      v_adjustment.id,
      v_product.cost_price_minor,
      format('Manager approved adjustment %s: %s - %s', v_adjustment.adjustment_number, v_adjustment.reason_code, v_adjustment.note),
      v_actor_id
    );
  end if;

  insert into public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity,
    entity_id,
    before_snapshot,
    after_snapshot,
    notes
  ) values (
    p_organization_id,
    v_actor_id,
    v_decision,
    'StockAdjustment',
    v_adjustment.id::text,
    to_jsonb(v_before),
    to_jsonb(v_adjustment),
    format('Adjustment %s was %s by %s. Note: %s', v_adjustment.adjustment_number, v_adjustment.status, v_actor_name, v_adjustment.approval_note)
  );

  return to_jsonb(v_adjustment) || jsonb_build_object('sku', v_product.sku);
end;
$function$;

-- Only authenticated callers can reach the private definer functions through
-- the public SECURITY INVOKER wrappers. The private functions validate auth.uid(),
-- active membership, permissions, role and dual-control before any write.
create or replace function public.submit_stock_adjustment(
  p_organization_id uuid,
  p_product_id uuid,
  p_location_id uuid,
  p_quantity_delta integer,
  p_target_state text,
  p_reason_code text,
  p_note text
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.submit_stock_adjustment(
    p_organization_id, p_product_id, p_location_id, p_quantity_delta,
    p_target_state, p_reason_code, p_note
  );
$function$;

create or replace function public.decide_stock_adjustment(
  p_organization_id uuid,
  p_adjustment_id uuid,
  p_decision text,
  p_approval_note text
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.decide_stock_adjustment(
    p_organization_id, p_adjustment_id, p_decision, p_approval_note
  );
$function$;

grant usage on schema private to authenticated;
revoke all on function private.submit_stock_adjustment(uuid, uuid, uuid, integer, text, text, text) from public, anon;
revoke all on function private.decide_stock_adjustment(uuid, uuid, text, text) from public, anon;
grant execute on function private.submit_stock_adjustment(uuid, uuid, uuid, integer, text, text, text) to authenticated;
grant execute on function private.decide_stock_adjustment(uuid, uuid, text, text) to authenticated;

revoke all on function public.submit_stock_adjustment(uuid, uuid, uuid, integer, text, text, text) from public, anon;
revoke all on function public.decide_stock_adjustment(uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_stock_adjustment(uuid, uuid, uuid, integer, text, text, text) to authenticated;
grant execute on function public.decide_stock_adjustment(uuid, uuid, text, text) to authenticated;
