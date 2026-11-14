-- Transactional return disposition and refund posting.
alter table public.returns
  add column if not exists disposition_idempotency_key text,
  add column if not exists disposition_request_hash text;

create unique index if not exists returns_org_disposition_idempotency_uidx
  on public.returns (organization_id, disposition_idempotency_key)
  where disposition_idempotency_key is not null;

revoke insert, update, delete on table public.returns, public.return_items from public, anon, authenticated;
grant select on table public.returns, public.return_items to authenticated;

create or replace function private.process_workspace_return_disposition(
  p_organization_id uuid,
  p_return_id uuid,
  p_dispositions jsonb,
  p_issue_refund boolean,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_return public.returns%rowtype;
  v_order public.orders%rowtype;
  v_line public.return_items%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_line_id uuid;
  v_quantity_numeric numeric;
  v_disposition text;
  v_seen_lines uuid[] := '{}'::uuid[];
  v_line_count integer;
  v_location_id uuid;
  v_refund_account uuid;
  v_clearing_account uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_request_hash text;
  v_existing_hash text;
  v_before jsonb;
  v_after jsonb;
  v_return_json jsonb;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_organization_id is null
     or not private.has_org_permission(p_organization_id, 'returns.manage') then
    raise exception 'You are not authorized to process returns in this workspace.' using errcode = '42501';
  end if;

  select r.code into v_role
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_organization_id and m.user_id = v_actor and m.is_active = true
  limit 1;
  if v_role is null or v_role = 'CLIENT_USER' then
    raise exception 'Active non-client workspace membership is required.' using errcode = '42501';
  end if;

  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 16
     or length(p_idempotency_key) > 128 then
    raise exception 'A valid return disposition request ID is required.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_dispositions), '') <> 'array'
     or jsonb_array_length(p_dispositions) < 1
     or jsonb_array_length(p_dispositions) > 100 then
    raise exception 'A return disposition must contain between 1 and 100 lines.' using errcode = '22023';
  end if;

  v_request_hash := md5(jsonb_build_object(
    'returnId', p_return_id,
    'dispositions', p_dispositions,
    'issueRefund', coalesce(p_issue_refund, false)
  )::text);
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text), hashtext(btrim(p_idempotency_key)));

  select * into v_return
  from public.returns
  where organization_id = p_organization_id
    and disposition_idempotency_key = btrim(p_idempotency_key)
  limit 1;
  if found then
    v_existing_hash := v_return.disposition_request_hash;
    if v_return.disposition_request_hash is distinct from v_request_hash then
      raise exception 'This return disposition request ID was already used with different contents.' using errcode = '22023';
    end if;
  else
    select * into v_return
    from public.returns
    where id = p_return_id and organization_id = p_organization_id
    for update;
    if not found then
      raise exception 'Return record was not found in this workspace.' using errcode = 'P0002';
    end if;
    if v_return.status not in ('OPEN', 'RECEIVED') then
      raise exception 'Only open or received returns can be inspected.' using errcode = '55000';
    end if;

    select * into v_order
    from public.orders o
    where o.id = v_return.order_id and o.organization_id = p_organization_id;
    if not found then
      raise exception 'The return order does not belong to this workspace.' using errcode = '42501';
    end if;

    select count(*) into v_line_count
    from public.return_items ri
    where ri.organization_id = p_organization_id and ri.return_id = v_return.id;
    if v_line_count <> jsonb_array_length(p_dispositions) then
      raise exception 'Every return line must have exactly one disposition.' using errcode = '22023';
    end if;

    v_before := to_jsonb(v_return) || jsonb_build_object(
      'lines', (
        select coalesce(jsonb_agg(to_jsonb(ri) order by ri.id), '[]'::jsonb)
        from public.return_items ri
        where ri.organization_id = p_organization_id and ri.return_id = v_return.id
      )
    );

    for v_item in select value from jsonb_array_elements(p_dispositions)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Each return disposition must be an object.' using errcode = '22023';
      end if;
      begin
        v_line_id := (v_item->>'lineId')::uuid;
        v_quantity_numeric := (v_item->>'quantity')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Return disposition contains an invalid line ID or quantity.' using errcode = '22023';
      end;
      if v_line_id is null or v_quantity_numeric is null
         or v_quantity_numeric <> trunc(v_quantity_numeric) then
        raise exception 'Every return disposition requires a line ID and whole-number quantity.' using errcode = '22023';
      end if;
      if v_line_id = any(v_seen_lines) then
        raise exception 'A return line may only be dispositioned once.' using errcode = '22023';
      end if;
      v_seen_lines := array_append(v_seen_lines, v_line_id);

      select * into v_line
      from public.return_items ri
      where ri.id = v_line_id
        and ri.organization_id = p_organization_id
        and ri.return_id = v_return.id
      for update;
      if not found then
        raise exception 'A return line does not belong to this return.' using errcode = '42501';
      end if;
      if v_quantity_numeric < 1 or v_quantity_numeric > 1000000 then
        raise exception 'Disposition quantity must be between 1 and 1,000,000.' using errcode = '22023';
      end if;
      if v_quantity_numeric <> v_line.quantity then
        raise exception 'Disposition quantity must match the full returned quantity for SKU %.', v_line.sku using errcode = '22023';
      end if;

      v_disposition := upper(btrim(coalesce(v_item->>'disposition', '')));
      if v_disposition not in ('RESTOCK', 'DAMAGED', 'QUARANTINE', 'DISPOSE') then
        raise exception 'Unsupported return disposition for SKU %.', v_line.sku using errcode = '22023';
      end if;

      select * into v_product
      from public.products p
      where p.id = v_line.product_id and p.organization_id = p_organization_id
      for share;
      if not found then
        raise exception 'Returned product % was not found in this workspace.', v_line.sku using errcode = 'P0002';
      end if;

      if v_disposition = 'RESTOCK' then
        select l.id into v_location_id
        from public.warehouse_locations l
        where l.organization_id = p_organization_id
          and l.is_active = true
          and l.location_type <> 'QUARANTINE'
        order by case when l.location_type = 'RECEIVING' then 0 else 1 end, l.location_code
        limit 1;
        if v_location_id is null then
          raise exception 'Create an active non-quarantine warehouse location before restocking returned goods.' using errcode = '55000';
        end if;
        insert into public.stock_ledger(
          organization_id, product_id, location_id, client_3pl_id,
          quantity_delta, stock_state, source_type, source_id,
          unit_cost_minor, note, created_by
        ) values (
          p_organization_id, v_product.id, v_location_id, v_product.client_3pl_id,
          v_line.quantity, 'ON_HAND', 'RETURN_DISPOSITION', v_return.id,
          v_product.cost_price_minor,
          'Restocked returned goods from ' || v_return.return_number, v_actor
        );
      elsif v_disposition in ('DAMAGED', 'QUARANTINE') then
        select l.id into v_location_id
        from public.warehouse_locations l
        where l.organization_id = p_organization_id
          and l.is_active = true
          and l.location_type = 'QUARANTINE'
        order by l.location_code
        limit 1;
        if v_location_id is null then
          raise exception 'Create an active QUARANTINE warehouse location before recording damaged or quarantined returns.' using errcode = '55000';
        end if;
        insert into public.stock_ledger(
          organization_id, product_id, location_id, client_3pl_id,
          quantity_delta, stock_state, source_type, source_id,
          unit_cost_minor, note, created_by
        ) values (
          p_organization_id, v_product.id, v_location_id, v_order.client_3pl_id,
          v_line.quantity,
          case when v_disposition = 'DAMAGED' then 'DAMAGED' else 'QUARANTINED' end,
          'RETURN_DISPOSITION', v_return.id, v_product.cost_price_minor,
          initcap(v_disposition) || ' returned goods from ' || v_return.return_number, v_actor
        );

        insert into public.notifications(
          organization_id, notification_type, title, message, severity, reference_url
        ) values (
          p_organization_id, 'RETURN_EXCEPTION',
          v_disposition || ' return received: ' || v_line.sku,
          format('%s unit(s) of SKU %s were marked %s on return %s.',
            v_line.quantity, v_line.sku, v_disposition, v_return.return_number),
          'WARNING', '/buying-returns'
        );
      end if;

      update public.return_items
      set disposition = v_disposition
      where id = v_line.id and organization_id = p_organization_id;
    end loop;

    if cardinality(v_seen_lines) <> v_line_count then
      raise exception 'Every return line must have exactly one disposition.' using errcode = '22023';
    end if;

    if coalesce(p_issue_refund, false) and coalesce(v_return.refund_amount_minor, 0) > 0 then
      if v_return.refund_status = 'ISSUED' then
        raise exception 'The refund for this return has already been issued.' using errcode = '55000';
      end if;

      select id into v_refund_account
      from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = '4100'
        and is_active = true
        and (currency is null or btrim(currency::text) = btrim(v_order.currency::text))
      limit 1;
      select id into v_clearing_account
      from public.chart_of_accounts
      where organization_id = p_organization_id and account_code = '1100'
        and is_active = true
        and (currency is null or btrim(currency::text) = btrim(v_order.currency::text))
      limit 1;
      if v_refund_account is null or v_clearing_account is null then
        raise exception 'Configure active chart-of-accounts entries 4100 (Sales Returns) and 1100 (Marketplace Clearing) in % before issuing this refund.',
          btrim(v_order.currency::text) using errcode = '55000';
      end if;

      perform pg_advisory_xact_lock(hashtext(p_organization_id::text));
      select 'JE-' || to_char(current_date, 'YYYY') || '-' ||
             lpad((count(*) + 1)::text, 6, '0')
        into v_journal_number
      from public.journal_entries
      where organization_id = p_organization_id
        and created_at >= date_trunc('year', now());

      insert into public.journal_entries(
        organization_id, entry_number, entry_date, source_type, source_id,
        description, status, idempotency_key, created_by, posted_at
      ) values (
        p_organization_id, v_journal_number, current_date, 'RETURN_REFUND',
        v_return.id, 'Refund issued for return ' || v_return.return_number,
        'POSTED', 'RETURN_REFUND:' || v_return.id::text, v_actor, v_now
      ) returning id into v_journal_id;

      insert into public.journal_entry_lines(
        organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description
      ) values
      (p_organization_id, v_journal_id, v_refund_account, v_return.refund_amount_minor, 0, 'Sales returns and allowances'),
      (p_organization_id, v_journal_id, v_clearing_account, 0, v_return.refund_amount_minor, 'Marketplace refund clearing');

      update public.returns
      set refund_status = 'ISSUED'
      where id = v_return.id and organization_id = p_organization_id
      returning * into v_return;
    end if;

    update public.returns
    set status = 'INSPECTED',
        inspected_at = v_now,
        disposition_idempotency_key = btrim(p_idempotency_key),
        disposition_request_hash = v_request_hash
    where id = v_return.id and organization_id = p_organization_id
    returning * into v_return;

    insert into public.audit_logs(
      organization_id, actor_id, action, entity, entity_id,
      before_snapshot, after_snapshot, notes
    ) values (
      p_organization_id, v_actor, 'UPDATE', 'Return', v_return.id::text,
      v_before,
      to_jsonb(v_return) || jsonb_build_object(
        'lines', (
          select coalesce(jsonb_agg(to_jsonb(ri) order by ri.id), '[]'::jsonb)
          from public.return_items ri
          where ri.organization_id = p_organization_id and ri.return_id = v_return.id
        )
      ),
      'Return dispositions and requested refund were posted transactionally.'
    );
  end if;

  select jsonb_build_object(
    'id', ret.id,
    'returnNumber', ret.return_number,
    'orderId', ret.order_id,
    'orderNumber', ord.order_number,
    'customerName', ord.customer_name,
    'reasonCode', ret.reason_code,
    'status', ret.status,
    'refundAmountMinor', ret.refund_amount_minor,
    'refundStatus', ret.refund_status,
    'createdAt', ret.created_at,
    'inspectedAt', ret.inspected_at,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'productId', ri.product_id,
        'sku', ri.sku,
        'quantity', ri.quantity,
        'disposition', ri.disposition,
        'notes', ri.notes
      ) order by ri.id), '[]'::jsonb)
      from public.return_items ri
      where ri.organization_id = p_organization_id and ri.return_id = ret.id
    )
  ) into v_return_json
  from public.returns ret
  join public.orders ord
    on ord.id = ret.order_id and ord.organization_id = ret.organization_id
  where ret.id = v_return.id and ret.organization_id = p_organization_id;

  return jsonb_build_object(
    'success', true,
    'return', v_return_json,
    'duplicate', (v_existing_hash is not null)
  );
end;
$function$;

create or replace function public.process_workspace_return_disposition(
  p_organization_id uuid,
  p_return_id uuid,
  p_dispositions jsonb,
  p_issue_refund boolean,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.process_workspace_return_disposition(
    p_organization_id, p_return_id, p_dispositions, p_issue_refund, p_idempotency_key
  );
$function$;

grant usage on schema private to authenticated;
grant execute on function private.process_workspace_return_disposition(uuid, uuid, jsonb, boolean, text) to authenticated;

revoke all on function private.process_workspace_return_disposition(uuid, uuid, jsonb, boolean, text) from public, anon;
revoke all on function public.process_workspace_return_disposition(uuid, uuid, jsonb, boolean, text) from public, anon;
grant execute on function public.process_workspace_return_disposition(uuid, uuid, jsonb, boolean, text) to authenticated;
