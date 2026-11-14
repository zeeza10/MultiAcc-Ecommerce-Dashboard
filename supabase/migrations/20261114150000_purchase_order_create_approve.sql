-- Purchase order creation and approval are atomic, authenticated database operations.
alter table public.purchase_orders
  add column if not exists idempotency_key text,
  add column if not exists request_hash text;

create unique index if not exists purchase_orders_org_idempotency_key_uidx
  on public.purchase_orders (organization_id, idempotency_key)
  where idempotency_key is not null;

create or replace function private.create_workspace_purchase_order(
  p_organization_id uuid,
  p_order jsonb,
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
  v_supplier public.suppliers%rowtype;
  v_po public.purchase_orders%rowtype;
  v_po_id uuid;
  v_po_number text;
  v_line jsonb;
  v_product public.products%rowtype;
  v_product_id uuid;
  v_seen_products uuid[] := '{}'::uuid[];
  v_quantity integer;
  v_quantity_numeric numeric;
  v_unit_cost bigint;
  v_unit_cost_numeric numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_expected_date date;
  v_notes text;
  v_currency char(3);
  v_request_hash text;
  v_existing_hash text;
  v_line_count integer := 0;
  v_supplier_name text;
  v_po_json jsonb;
  v_before jsonb;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_organization_id is null
     or not private.has_org_permission(p_organization_id, 'purchasing.manage') then
    raise exception 'You are not authorized to create purchase orders in this workspace.' using errcode = '42501';
  end if;

  select r.code into v_role
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_organization_id and m.user_id = v_actor and m.is_active = true
  limit 1;
  if v_role is null or v_role = 'CLIENT_USER' then
    raise exception 'Active non-client workspace membership is required.' using errcode = '42501';
  end if;

  if coalesce(jsonb_typeof(p_order), '') <> 'object' then
    raise exception 'Purchase order payload must be an object.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_order->'lines'), '') <> 'array'
     or jsonb_array_length(p_order->'lines') < 1
     or jsonb_array_length(p_order->'lines') > 100 then
    raise exception 'A purchase order must contain between 1 and 100 lines.' using errcode = '22023';
  end if;
  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 16
     or length(p_idempotency_key) > 128 then
    raise exception 'A valid purchase order request ID is required.' using errcode = '22023';
  end if;

  v_notes := nullif(btrim(coalesce(p_order->>'notes', '')), '');
  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'Purchase order notes must be at most 2,000 characters.' using errcode = '22023';
  end if;
  begin
    v_expected_date := nullif(p_order->>'expectedDate', '')::date;
    v_supplier.id := (p_order->>'supplierId')::uuid;
    v_tax := coalesce((p_order->>'taxMinor')::numeric, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Purchase order contains an invalid supplier, date, or tax amount.' using errcode = '22023';
  end;
  if v_supplier.id is null then
    raise exception 'Select a supplier for this purchase order.' using errcode = '22023';
  end if;
  if v_tax < 0 or v_tax <> trunc(v_tax) or v_tax > 9223372036854775807::numeric then
    raise exception 'Purchase order tax must be a non-negative supported amount.' using errcode = '22023';
  end if;

  v_request_hash := md5(jsonb_build_object(
    'order', p_order,
    'organizationId', p_organization_id
  )::text);
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text), hashtext(btrim(p_idempotency_key)));

  select * into v_po
  from public.purchase_orders
  where organization_id = p_organization_id
    and idempotency_key = btrim(p_idempotency_key)
  limit 1;
  if found then
    v_existing_hash := v_po.request_hash;
    if v_po.request_hash is distinct from v_request_hash then
      raise exception 'This purchase order request ID was already used with different contents.' using errcode = '22023';
    end if;
    v_po_id := v_po.id;
  else
    select * into v_supplier
    from public.suppliers s
    where s.id = v_supplier.id
      and s.organization_id = p_organization_id
      and s.is_active = true;
    if not found then
      raise exception 'The selected supplier is not active in this workspace.' using errcode = 'P0002';
    end if;
    v_currency := v_supplier.currency;

    perform pg_advisory_xact_lock(hashtext(p_organization_id::text), extract(year from current_date)::integer);
    select 'PO-' || to_char(current_date, 'YYYY') || '-' ||
           lpad((count(*) + 1)::text, 6, '0')
      into v_po_number
    from public.purchase_orders
    where organization_id = p_organization_id
      and created_at >= date_trunc('year', now());

    insert into public.purchase_orders(
      organization_id, po_number, supplier_id, status,
      subtotal_minor, tax_minor, total_minor, currency, notes,
      expected_date, created_by, idempotency_key, request_hash
    ) values (
      p_organization_id, v_po_number, v_supplier.id, 'DRAFT',
      0, v_tax::bigint, 0, v_currency, v_notes,
      v_expected_date, v_actor, btrim(p_idempotency_key), v_request_hash
    ) returning * into v_po;
    v_po_id := v_po.id;

    for v_line in select value from jsonb_array_elements(p_order->'lines')
    loop
      if jsonb_typeof(v_line) <> 'object' then
        raise exception 'Each purchase order line must be an object.' using errcode = '22023';
      end if;
      begin
        v_product_id := (v_line->>'productId')::uuid;
        v_quantity_numeric := (v_line->>'orderedQty')::numeric;
        v_unit_cost_numeric := (v_line->>'unitCostMinor')::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Purchase order line contains an invalid product, quantity, or unit cost.' using errcode = '22023';
      end;
      if v_product_id is null then
        raise exception 'Every purchase order line must identify a product.' using errcode = '22023';
      end if;
      if v_quantity_numeric is null or v_unit_cost_numeric is null
         or v_quantity_numeric <> trunc(v_quantity_numeric)
         or v_unit_cost_numeric <> trunc(v_unit_cost_numeric)
         or v_quantity_numeric > 2147483647
         or v_unit_cost_numeric > 9223372036854775807::numeric then
        raise exception 'Purchase order quantity and unit cost must be whole minor-unit amounts.' using errcode = '22023';
      end if;
      v_quantity := v_quantity_numeric::integer;
      v_unit_cost := v_unit_cost_numeric::bigint;
      if v_product_id = any(v_seen_products) then
        raise exception 'A product may appear only once in a purchase order. Combine duplicate lines.' using errcode = '22023';
      end if;
      v_seen_products := array_append(v_seen_products, v_product_id);
      if v_quantity is null or v_quantity < 1 or v_quantity > 1000000 or v_unit_cost < 0 then
        raise exception 'Purchase order quantity must be 1 to 1,000,000 and unit cost cannot be negative.' using errcode = '22023';
      end if;

      select * into v_product
      from public.products p
      where p.id = v_product_id
        and p.organization_id = p_organization_id
        and p.status = 'ACTIVE'
      for share;
      if not found then
        raise exception 'A selected product was not found or is inactive in this workspace.' using errcode = 'P0002';
      end if;

      v_line_total := v_quantity::numeric * v_unit_cost::numeric;
      if v_line_total > 9223372036854775807::numeric then
        raise exception 'Purchase order line value exceeds the supported monetary range.' using errcode = '22003';
      end if;
      v_subtotal := v_subtotal + v_line_total;
      if v_subtotal > 9223372036854775807::numeric then
        raise exception 'Purchase order subtotal exceeds the supported monetary range.' using errcode = '22003';
      end if;

      insert into public.purchase_order_items(
        organization_id, purchase_order_id, product_id, sku, product_name,
        ordered_qty, received_qty, unit_cost_minor, total_cost_minor
      ) values (
        p_organization_id, v_po.id, v_product.id, v_product.sku, v_product.name,
        v_quantity, 0, v_unit_cost, v_line_total::bigint
      );
      v_line_count := v_line_count + 1;
    end loop;

    if v_line_count = 0 then
      raise exception 'A purchase order must contain at least one valid product line.' using errcode = '22023';
    end if;

    v_total := v_subtotal + v_tax;
    if v_total > 9223372036854775807::numeric then
      raise exception 'Purchase order total exceeds the supported monetary range.' using errcode = '22003';
    end if;

    update public.purchase_orders
    set subtotal_minor = v_subtotal::bigint,
        total_minor = v_total::bigint,
        updated_at = v_now
    where id = v_po.id and organization_id = p_organization_id
    returning * into v_po;

    insert into public.audit_logs(
      organization_id, actor_id, action, entity, entity_id,
      before_snapshot, after_snapshot, notes
    ) values (
      p_organization_id, v_actor, 'CREATE', 'PurchaseOrder', v_po.id::text,
      null, to_jsonb(v_po) || jsonb_build_object('lineCount', v_line_count),
      'Draft purchase order created.'
    );
  end if;

  select s.name into v_supplier_name
  from public.suppliers s
  where s.id = v_po.supplier_id and s.organization_id = p_organization_id;

  select jsonb_build_object(
    'id', po.id,
    'poNumber', po.po_number,
    'supplierId', po.supplier_id,
    'supplierName', coalesce(v_supplier_name, ''),
    'status', po.status,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', poi.id,
        'poId', poi.purchase_order_id,
        'productId', poi.product_id,
        'sku', poi.sku,
        'productName', poi.product_name,
        'orderedQty', poi.ordered_qty,
        'receivedQty', poi.received_qty,
        'unitCostMinor', poi.unit_cost_minor,
        'totalCostMinor', poi.total_cost_minor
      ) order by poi.id), '[]'::jsonb)
      from public.purchase_order_items poi
      where poi.organization_id = p_organization_id and poi.purchase_order_id = po.id
    ),
    'subtotalMinor', po.subtotal_minor,
    'taxMinor', po.tax_minor,
    'totalMinor', po.total_minor,
    'currency', btrim(po.currency::text),
    'notes', po.notes,
    'expectedDate', po.expected_date,
    'createdAt', po.created_at,
    'approvedBy', po.approved_by,
    'updatedAt', po.updated_at
  ) into v_po_json
  from public.purchase_orders po
  where po.id = v_po_id and po.organization_id = p_organization_id;

  return jsonb_build_object(
    'success', true,
    'purchaseOrder', v_po_json,
    'duplicate', (v_existing_hash is not null)
  );
end;
$function$;

create or replace function private.approve_workspace_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_po public.purchase_orders%rowtype;
  v_supplier_name text;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_organization_id is null
     or not private.has_org_permission(p_organization_id, 'purchasing.manage') then
    raise exception 'You are not authorized to approve purchase orders in this workspace.' using errcode = '42501';
  end if;
  select r.code into v_role
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_organization_id and m.user_id = v_actor and m.is_active = true
  limit 1;
  if v_role is null or v_role = 'CLIENT_USER' then
    raise exception 'Active non-client workspace membership is required.' using errcode = '42501';
  end if;

  select * into v_po
  from public.purchase_orders
  where id = p_purchase_order_id and organization_id = p_organization_id
  for update;
  if not found then
    raise exception 'Purchase Order was not found in this workspace.' using errcode = 'P0002';
  end if;
  if v_po.status = 'APPROVED' then
    -- Approval is idempotent: repeating it does not create a second audit event.
    null;
  elsif v_po.status <> 'DRAFT' then
    raise exception 'Only draft purchase orders can be approved.' using errcode = '55000';
  else
    if not exists (
      select 1 from public.purchase_order_items poi
      where poi.organization_id = p_organization_id
        and poi.purchase_order_id = v_po.id
    ) then
      raise exception 'A purchase order must contain at least one line before approval.' using errcode = '55000';
    end if;
    v_before := to_jsonb(v_po);
    update public.purchase_orders
    set status = 'APPROVED', approved_by = v_actor, updated_at = v_now
    where id = v_po.id and organization_id = p_organization_id
    returning * into v_po;
    insert into public.audit_logs(
      organization_id, actor_id, action, entity, entity_id,
      before_snapshot, after_snapshot, notes
    ) values (
      p_organization_id, v_actor, 'APPROVE', 'PurchaseOrder', v_po.id::text,
      v_before, to_jsonb(v_po), 'Purchase order approved.'
    );
  end if;

  select s.name into v_supplier_name
  from public.suppliers s
  where s.id = v_po.supplier_id and s.organization_id = p_organization_id;

  select jsonb_build_object(
    'id', po.id,
    'poNumber', po.po_number,
    'supplierId', po.supplier_id,
    'supplierName', coalesce(v_supplier_name, ''),
    'status', po.status,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', poi.id,
        'poId', poi.purchase_order_id,
        'productId', poi.product_id,
        'sku', poi.sku,
        'productName', poi.product_name,
        'orderedQty', poi.ordered_qty,
        'receivedQty', poi.received_qty,
        'unitCostMinor', poi.unit_cost_minor,
        'totalCostMinor', poi.total_cost_minor
      ) order by poi.id), '[]'::jsonb)
      from public.purchase_order_items poi
      where poi.organization_id = p_organization_id and poi.purchase_order_id = po.id
    ),
    'subtotalMinor', po.subtotal_minor,
    'taxMinor', po.tax_minor,
    'totalMinor', po.total_minor,
    'currency', btrim(po.currency::text),
    'notes', po.notes,
    'expectedDate', po.expected_date,
    'createdAt', po.created_at,
    'approvedBy', po.approved_by,
    'updatedAt', po.updated_at
  ) into v_after
  from public.purchase_orders po
  where po.id = v_po.id and po.organization_id = p_organization_id;

  return jsonb_build_object('success', true, 'purchaseOrder', v_after);
end;
$function$;

create or replace function public.create_workspace_purchase_order(
  p_organization_id uuid,
  p_order jsonb,
  p_idempotency_key text
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.create_workspace_purchase_order(p_organization_id, p_order, p_idempotency_key);
$function$;

create or replace function public.approve_workspace_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.approve_workspace_purchase_order(p_organization_id, p_purchase_order_id);
$function$;

grant usage on schema private to authenticated;
grant execute on function private.create_workspace_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function private.approve_workspace_purchase_order(uuid, uuid) to authenticated;

revoke all on function public.create_workspace_purchase_order(uuid, jsonb, text) from public, anon;
revoke all on function public.approve_workspace_purchase_order(uuid, uuid) from public, anon;
grant execute on function public.create_workspace_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function public.approve_workspace_purchase_order(uuid, uuid) to authenticated;
