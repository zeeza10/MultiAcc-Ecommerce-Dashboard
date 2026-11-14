-- Transactional purchase receiving with append-only stock and double-entry accounting.
-- Also repair order RPC wrappers: authenticated callers must not need direct EXECUTE
-- on private SECURITY DEFINER implementation functions.

create or replace function public.create_workspace_order(
  p_organization_id uuid,
  p_order jsonb
)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  select private.create_workspace_order(p_organization_id, p_order);
$function$;

revoke all on function public.create_workspace_order(uuid, jsonb) from public, anon;
grant execute on function public.create_workspace_order(uuid, jsonb) to authenticated;

create or replace function public.transition_workspace_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_target_status text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  select private.transition_workspace_order(p_organization_id, p_order_id, p_target_status, p_options);
$function$;

revoke all on function public.transition_workspace_order(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.transition_workspace_order(uuid, uuid, text, jsonb) to authenticated;

alter table public.goods_receipts
  add column if not exists idempotency_key text,
  add column if not exists request_hash text;

create unique index if not exists goods_receipts_org_idempotency_key_uidx
  on public.goods_receipts (organization_id, idempotency_key)
  where idempotency_key is not null;

-- Purchasing, receipt, and journal writes must go through validated transactions.
revoke insert, update, delete on table
  public.purchase_orders,
  public.purchase_order_items,
  public.goods_receipts,
  public.goods_receipt_items,
  public.journal_entries,
  public.journal_entry_lines
from public, anon, authenticated;

grant select on table
  public.purchase_orders,
  public.purchase_order_items,
  public.goods_receipts,
  public.goods_receipt_items,
  public.journal_entries,
  public.journal_entry_lines
to authenticated;

create or replace function private.receive_workspace_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_items jsonb,
  p_discrepancy_note text,
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
  v_po public.purchase_orders%rowtype;
  v_receipt public.goods_receipts%rowtype;
  v_po_line public.purchase_order_items%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_seen_products uuid[] := '{}'::uuid[];
  v_receipt_id uuid;
  v_receipt_number text;
  v_request_hash text;
  v_existing_hash text;
  v_location_id uuid;
  v_requested_location uuid;
  v_received_qty integer;
  v_damaged_qty integer;
  v_shortage_qty integer;
  v_new_received_qty integer;
  v_good_qty integer;
  v_line_count integer := 0;
  v_total_value numeric := 0;
  v_line_value numeric;
  v_inventory_account uuid;
  v_grni_account uuid;
  v_journal_id uuid;
  v_journal_number text;
  v_supplier_name text;
  v_receipt_json jsonb;
  v_po_json jsonb;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_organization_id is null or p_purchase_order_id is null
     or not private.has_org_permission(p_organization_id, 'purchasing.manage') then
    raise exception 'You are not authorized to receive purchase orders in this workspace.' using errcode = '42501';
  end if;

  select r.code into v_role
  from public.organization_members m
  join public.roles r on r.id = m.role_id
  where m.organization_id = p_organization_id
    and m.user_id = v_actor
    and m.is_active = true
  limit 1;
  if v_role is null or v_role = 'CLIENT_USER' then
    raise exception 'Active non-client workspace membership is required.' using errcode = '42501';
  end if;

  if p_idempotency_key is null or length(btrim(p_idempotency_key)) < 16
     or length(p_idempotency_key) > 128 then
    raise exception 'A valid receipt request ID is required.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_items), '') <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100 then
    raise exception 'A receipt must contain between 1 and 100 item rows.' using errcode = '22023';
  end if;
  if p_discrepancy_note is not null and length(p_discrepancy_note) > 2000 then
    raise exception 'Discrepancy note must be at most 2,000 characters.' using errcode = '22023';
  end if;

  v_request_hash := md5(jsonb_build_object(
    'purchaseOrderId', p_purchase_order_id,
    'items', p_items,
    'discrepancyNote', coalesce(p_discrepancy_note, '')
  )::text);

  -- A retried request with the same key returns its original result and cannot
  -- post stock or accounting a second time.
  select * into v_receipt
  from public.goods_receipts
  where organization_id = p_organization_id
    and idempotency_key = btrim(p_idempotency_key)
  limit 1;
  if found then
    if v_receipt.request_hash is distinct from v_request_hash then
      raise exception 'This receipt request ID was already used with different contents.' using errcode = '22023';
    end if;
    v_receipt_id := v_receipt.id;
    select * into v_po
    from public.purchase_orders
    where id = v_receipt.purchase_order_id
      and organization_id = p_organization_id;
  else
    select * into v_po
    from public.purchase_orders
    where id = p_purchase_order_id
      and organization_id = p_organization_id
    for update;
    if not found then
      raise exception 'Purchase Order was not found in this workspace.' using errcode = 'P0002';
    end if;
    if v_po.status not in ('APPROVED', 'SENT', 'PARTIALLY_RECEIVED') then
      raise exception 'Only approved or sent purchase orders can receive stock.' using errcode = '55000';
    end if;

    perform pg_advisory_xact_lock(hashtext(p_organization_id::text), extract(year from current_date)::integer);
    select 'GRN-' || to_char(current_date, 'YYYY') || '-' ||
           lpad((count(*) + 1)::text, 6, '0')
      into v_receipt_number
    from public.goods_receipts
    where organization_id = p_organization_id
      and received_at >= date_trunc('year', now());

    insert into public.goods_receipts(
      organization_id, receipt_number, purchase_order_id, received_by,
      received_at, discrepancy_note, idempotency_key, request_hash
    ) values (
      p_organization_id, v_receipt_number, v_po.id, v_actor,
      v_now, nullif(btrim(coalesce(p_discrepancy_note, '')), ''),
      btrim(p_idempotency_key), v_request_hash
    ) returning * into v_receipt;

    v_receipt_id := v_receipt.id;
    v_before := to_jsonb(v_po);

    for v_item in select value from jsonb_array_elements(p_items)
    loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception 'Each receipt item must be an object.' using errcode = '22023';
      end if;

      begin
        v_product.id := (v_item->>'productId')::uuid;
        v_received_qty := coalesce((v_item->>'receivedQty')::integer, 0);
        v_damaged_qty := coalesce((v_item->>'damagedQty')::integer, 0);
        v_requested_location := nullif(v_item->>'locationId', '')::uuid;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Receipt item contains an invalid product, quantity, or location.' using errcode = '22023';
      end;

      if v_product.id is null then
        raise exception 'Every receipt item must identify a product.' using errcode = '22023';
      end if;
      if v_received_qty = 0 and v_damaged_qty = 0 then
        continue;
      end if;
      if v_received_qty < 1 or v_received_qty > 1000000
         or v_damaged_qty < 0 or v_damaged_qty > v_received_qty then
        raise exception 'Received quantity must be 1 to 1,000,000 and damaged quantity cannot exceed received quantity.' using errcode = '22023';
      end if;
      if v_product.id = any(v_seen_products) then
        raise exception 'A product may appear only once in a receipt. Combine duplicate purchase-order lines first.' using errcode = '22023';
      end if;
      v_seen_products := array_append(v_seen_products, v_product.id);

      select count(*) into v_line_count
      from public.purchase_order_items poi
      where poi.organization_id = p_organization_id
        and poi.purchase_order_id = v_po.id
        and poi.product_id = v_product.id;
      if v_line_count <> 1 then
        raise exception 'The product must match exactly one line on this purchase order.' using errcode = '22023';
      end if;

      select * into v_po_line
      from public.purchase_order_items poi
      where poi.organization_id = p_organization_id
        and poi.purchase_order_id = v_po.id
        and poi.product_id = v_product.id
      for update;

      select * into v_product
      from public.products p
      where p.id = v_po_line.product_id
        and p.organization_id = p_organization_id
      for share;
      if not found then
        raise exception 'A purchase-order product no longer exists in this workspace.' using errcode = 'P0002';
      end if;

      v_new_received_qty := v_po_line.received_qty + v_received_qty;
      if v_new_received_qty > v_po_line.ordered_qty then
        raise exception 'Receipt quantity exceeds the remaining quantity for SKU %.', v_po_line.sku using errcode = '22023';
      end if;
      v_shortage_qty := v_po_line.ordered_qty - v_new_received_qty;
      v_good_qty := v_received_qty - v_damaged_qty;

      if v_requested_location is null then
        select l.id into v_location_id
        from public.warehouse_locations l
        where l.organization_id = p_organization_id and l.is_active = true
        order by l.location_code
        limit 1;
      else
        select l.id into v_location_id
        from public.warehouse_locations l
        where l.id = v_requested_location
          and l.organization_id = p_organization_id
          and l.is_active = true;
      end if;
      if v_location_id is null then
        raise exception 'No active warehouse location is available. Create or select an active location before receiving stock.' using errcode = '55000';
      end if;

      if v_po_line.unit_cost_minor < 0 then
        raise exception 'Purchase-order unit cost cannot be negative.' using errcode = '22023';
      end if;
      v_line_value := v_received_qty::numeric * v_po_line.unit_cost_minor::numeric;
      if v_line_value > 9223372036854775807::numeric then
        raise exception 'Receipt value exceeds the supported monetary range.' using errcode = '22003';
      end if;
      v_total_value := v_total_value + v_line_value;
      if v_total_value > 9223372036854775807::numeric then
        raise exception 'Total receipt value exceeds the supported monetary range.' using errcode = '22003';
      end if;

      insert into public.goods_receipt_items(
        organization_id, goods_receipt_id, product_id, location_id,
        received_qty, shortage_qty, damaged_qty
      ) values (
        p_organization_id, v_receipt_id, v_product.id, v_location_id,
        v_received_qty, v_shortage_qty, v_damaged_qty
      );

      update public.purchase_order_items
      set received_qty = v_new_received_qty
      where id = v_po_line.id and organization_id = p_organization_id;

      if v_good_qty > 0 then
        insert into public.stock_ledger(
          organization_id, product_id, location_id, client_3pl_id,
          quantity_delta, stock_state, source_type, source_id,
          unit_cost_minor, note, created_by
        ) values (
          p_organization_id, v_product.id, v_location_id, v_product.client_3pl_id,
          v_good_qty, 'ON_HAND', 'PO_RECEIPT', v_receipt_id,
          v_po_line.unit_cost_minor,
          'Usable units received on ' || v_receipt_number || ' against PO ' || v_po.po_number,
          v_actor
        );
      end if;

      if v_damaged_qty > 0 then
        insert into public.stock_ledger(
          organization_id, product_id, location_id, client_3pl_id,
          quantity_delta, stock_state, source_type, source_id,
          unit_cost_minor, note, created_by
        ) values (
          p_organization_id, v_product.id, v_location_id, v_product.client_3pl_id,
          v_damaged_qty, 'DAMAGED', 'PO_RECEIPT', v_receipt_id,
          v_po_line.unit_cost_minor,
          'Damaged units segregated on ' || v_receipt_number || ' against PO ' || v_po.po_number,
          v_actor
        );

        insert into public.notifications(
          organization_id, notification_type, title, message, severity, reference_url
        ) values (
          p_organization_id, 'DAMAGED_STOCK',
          'Damaged goods received: ' || v_po_line.sku,
          format('%s damaged unit(s) were recorded on receipt %s for PO %s.',
            v_damaged_qty, v_receipt_number, v_po.po_number),
          'WARNING', '/purchasing/receipts'
        );
      end if;
    end loop;

    if cardinality(v_seen_products) = 0 then
      raise exception 'Enter at least one positive received quantity.' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.purchase_order_items poi
      where poi.organization_id = p_organization_id
        and poi.purchase_order_id = v_po.id
        and poi.received_qty < poi.ordered_qty
    ) then
      update public.purchase_orders
      set status = 'PARTIALLY_RECEIVED', updated_at = v_now
      where id = v_po.id and organization_id = p_organization_id
      returning * into v_po;
    else
      update public.purchase_orders
      set status = 'RECEIVED', updated_at = v_now
      where id = v_po.id and organization_id = p_organization_id
      returning * into v_po;
    end if;

    if v_total_value > 0 then
      select id into v_inventory_account
      from public.chart_of_accounts
      where organization_id = p_organization_id
        and account_code = '1300'
        and is_active = true
        and (currency is null or btrim(currency::text) = btrim(v_po.currency::text))
      limit 1;

      select id into v_grni_account
      from public.chart_of_accounts
      where organization_id = p_organization_id
        and account_code = '2050'
        and is_active = true
        and (currency is null or btrim(currency::text) = btrim(v_po.currency::text))
      limit 1;

      if v_inventory_account is null or v_grni_account is null then
        raise exception 'Configure active chart-of-accounts entries 1300 (Inventory Asset) and 2050 (GRNI) in % before receiving this purchase order.',
          btrim(v_po.currency::text) using errcode = '55000';
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
        p_organization_id, v_journal_number, current_date, 'GOODS_RECEIPT',
        v_receipt_id, 'Inventory received and GRNI accrued for ' || v_receipt_number,
        'POSTED', 'GOODS_RECEIPT:' || v_receipt_id::text, v_actor, v_now
      ) returning id into v_journal_id;

      insert into public.journal_entry_lines(
        organization_id, journal_entry_id, account_id, debit_minor, credit_minor, description
      ) values
      (p_organization_id, v_journal_id, v_inventory_account, v_total_value::bigint, 0, 'Inventory received'),
      (p_organization_id, v_journal_id, v_grni_account, 0, v_total_value::bigint, 'Goods received not invoiced');
    end if;

    insert into public.audit_logs(
      organization_id, actor_id, action, entity, entity_id,
      before_snapshot, after_snapshot, notes
    ) values (
      p_organization_id, v_actor, 'CREATE', 'GoodsReceipt', v_receipt_id::text,
      null, jsonb_build_object(
        'receiptId', v_receipt_id,
        'receiptNumber', v_receipt_number,
        'purchaseOrderId', v_po.id,
        'purchaseOrderStatus', v_po.status,
        'totalValueMinor', v_total_value
      ),
      'Goods receipt posted with stock ledger and accounting entries in one transaction.'
    );
  end if;

  select s.name into v_supplier_name
  from public.suppliers s
  where s.id = v_po.supplier_id and s.organization_id = p_organization_id;

  select jsonb_build_object(
    'id', gr.id,
    'receiptNumber', gr.receipt_number,
    'poId', gr.purchase_order_id,
    'poNumber', v_po.po_number,
    'receivedBy', coalesce((select p.full_name from public.profiles p where p.id = gr.received_by), gr.received_by::text, ''),
    'receivedAt', gr.received_at,
    'discrepancyNote', gr.discrepancy_note,
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'productId', gri.product_id,
        'sku', poi.sku,
        'receivedQty', gri.received_qty,
        'shortageQty', gri.shortage_qty,
        'damagedQty', gri.damaged_qty,
        'locationId', gri.location_id
      ) order by gri.id), '[]'::jsonb)
      from public.goods_receipt_items gri
      join public.purchase_order_items poi
        on poi.organization_id = gri.organization_id
       and poi.purchase_order_id = gr.purchase_order_id
       and poi.product_id = gri.product_id
      where gri.organization_id = p_organization_id
        and gri.goods_receipt_id = gr.id
    )
  ) into v_receipt_json
  from public.goods_receipts gr
  where gr.id = v_receipt_id and gr.organization_id = p_organization_id;

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
      where poi.organization_id = p_organization_id
        and poi.purchase_order_id = po.id
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
  where po.id = v_po.id and po.organization_id = p_organization_id;

  return jsonb_build_object(
    'success', true,
    'receipt', v_receipt_json,
    'purchaseOrder', v_po_json,
    'duplicate', (v_existing_hash is not null)
  );
end;
$function$;

create or replace function public.receive_workspace_purchase_order(
  p_organization_id uuid,
  p_purchase_order_id uuid,
  p_items jsonb,
  p_discrepancy_note text,
  p_idempotency_key text
)
returns jsonb
language sql
security definer
set search_path = public, private, pg_temp
as $function$
  select private.receive_workspace_purchase_order(
    p_organization_id, p_purchase_order_id, p_items, p_discrepancy_note, p_idempotency_key
  );
$function$;

revoke all on function private.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) from public, anon;
grant execute on function public.receive_workspace_purchase_order(uuid, uuid, jsonb, text, text) to authenticated;
