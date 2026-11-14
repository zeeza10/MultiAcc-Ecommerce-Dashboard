-- Transactional manual order creation. Inventory is reserved only when the
-- order enters Confirmed / Allocated, matching the existing order state machine.

create or replace function private.create_workspace_order(
  p_organization_id uuid,
  p_order jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_sales_source text;
  v_customer_name text;
  v_customer_email text;
  v_address jsonb;
  v_notes text;
  v_shipping_charge bigint := 0;
  v_vat_rate numeric := 0;
  v_currency char(3) := 'GBP';
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_line jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_unit_price bigint;
  v_line_tax bigint;
  v_line_total bigint;
  v_order public.orders%rowtype;
  v_order_number text;
  v_line_count integer := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_organization_id is null or not private.has_org_permission(p_organization_id, 'orders.create') then
    raise exception 'You are not authorized to create orders in this workspace.' using errcode = '42501';
  end if;
  if coalesce(jsonb_typeof(p_order), '') <> 'object' then
    raise exception 'Order payload must be an object.' using errcode = '22023';
  end if;

  v_sales_source := upper(btrim(coalesce(p_order->>'salesSource', 'MANUAL')));
  if v_sales_source not in ('MANUAL', 'DIRECT') then
    raise exception 'Unsupported order sales source.' using errcode = '22023';
  end if;
  v_customer_name := btrim(coalesce(p_order->>'customerName', ''));
  v_customer_email := nullif(btrim(coalesce(p_order->>'customerEmail', '')), '');
  v_notes := nullif(btrim(coalesce(p_order->>'notes', '')), '');
  v_address := coalesce(p_order->'shippingAddress', '{}'::jsonb);
  if length(v_customer_name) = 0 or length(v_customer_name) > 200 then
    raise exception 'Customer name is required and must be at most 200 characters.' using errcode = '22023';
  end if;
  if v_customer_email is not null and length(v_customer_email) > 320 then
    raise exception 'Customer email is too long.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(v_address), '') <> 'object' or length(v_address::text) > 10000 then
    raise exception 'Shipping address must be an object.' using errcode = '22023';
  end if;
  if coalesce(jsonb_typeof(p_order->'lines'), '') <> 'array'
     or jsonb_array_length(p_order->'lines') < 1
     or jsonb_array_length(p_order->'lines') > 100 then
    raise exception 'An order must contain between 1 and 100 line items.' using errcode = '22023';
  end if;

  begin
    if coalesce((p_order->>'shippingChargeMinor')::numeric, 0) < 0 then
      raise exception 'negative shipping charge';
    end if;
    v_shipping_charge := coalesce((p_order->>'shippingChargeMinor')::bigint, 0);
  exception when others then
    raise exception 'Shipping charge must be a valid non-negative minor-unit amount.' using errcode = '22023';
  end;

  select coalesce(s.default_vat_rate_percent, 0), coalesce(s.base_currency, 'GBP')
    into v_vat_rate, v_currency
  from public.system_settings s
  where s.organization_id = p_organization_id
  limit 1;
  if not found then
    v_vat_rate := 0;
    v_currency := 'GBP';
  end if;

  if v_vat_rate < 0 or v_vat_rate > 100 then
    raise exception 'Workspace VAT rate is outside the supported range.' using errcode = '22023';
  end if;

  -- Lock products in a stable order so concurrent order submissions cannot
  -- observe partially edited catalog rows. Reservation happens on confirmation.
  perform pg_advisory_xact_lock(hashtext(p_organization_id::text));
  select 'ORD-' || to_char(current_date, 'YYYY') || '-' ||
         lpad((count(*) + 1)::text, 6, '0')
    into v_order_number
  from public.orders
  where organization_id = p_organization_id
    and created_at >= date_trunc('year', now());

  insert into public.orders (
    organization_id, order_number, sales_source, owner_type, client_3pl_id,
    customer_name, customer_email, shipping_address, status, payment_state,
    total_minor, tax_minor, shipping_charge_minor, currency, notes
  ) values (
    p_organization_id, v_order_number, v_sales_source, 'OPERATOR', null,
    v_customer_name, v_customer_email, v_address, 'New', 'PENDING',
    0, 0, v_shipping_charge, v_currency, v_notes
  ) returning * into v_order;

  for v_line in select value from jsonb_array_elements(p_order->'lines')
  loop
    v_line_count := v_line_count + 1;
    if jsonb_typeof(v_line) <> 'object' then
      raise exception 'Each order line must be an object.' using errcode = '22023';
    end if;

    begin
      v_quantity := (v_line->>'quantity')::integer;
      if nullif(v_line->>'productId', '') is null then
        raise exception 'Missing product id.';
      end if;
      select * into v_product
      from public.products p
      where p.id = (v_line->>'productId')::uuid
        and p.organization_id = p_organization_id
        and p.status = 'ACTIVE'
      for share;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Order line contains an invalid product id or quantity.' using errcode = '22023';
    end;

    if not found then
      raise exception 'A selected product was not found or is inactive in this workspace.' using errcode = 'P0002';
    end if;
    if v_quantity is null or v_quantity < 1 or v_quantity > 1000000 then
      raise exception 'Order line quantity must be between 1 and 1,000,000.' using errcode = '22023';
    end if;

    -- The catalog price is authoritative; client-supplied price/SKU/name are ignored.
    if v_product.selling_price_minor < 0 then
      raise exception 'The selected product has an invalid selling price.' using errcode = '22023';
    end if;
    v_unit_price := v_product.selling_price_minor;
    v_line_tax := round(v_unit_price::numeric * v_quantity * v_vat_rate / 100);
    v_line_total := v_unit_price::numeric * v_quantity::numeric;
    if v_line_total > 9223372036854775807::numeric or v_line_tax > 9223372036854775807::numeric then
      raise exception 'Order line amount exceeds the supported monetary range.' using errcode = '22003';
    end if;

    insert into public.order_items (
      organization_id, order_id, product_id, sku, product_name, quantity,
      unit_price_minor, tax_amount_minor, total_price_minor,
      is_backordered, reserved_quantity
    ) values (
      p_organization_id, v_order.id, v_product.id, v_product.sku, v_product.name,
      v_quantity, v_unit_price, v_line_tax, v_line_total, false, 0
    );

    v_subtotal := v_subtotal + v_line_total;
    v_tax := v_tax + v_line_tax;
  end loop;

  v_total := v_subtotal + v_shipping_charge;
  if v_subtotal > 9223372036854775807::numeric or v_total > 9223372036854775807::numeric or v_tax > 9223372036854775807::numeric then
    raise exception 'Order total exceeds the supported monetary range.' using errcode = '22003';
  end if;

  update public.orders
  set total_minor = v_total::bigint, tax_minor = v_tax::bigint, updated_at = now()
  where id = v_order.id
  returning * into v_order;

  insert into public.order_status_history (
    organization_id, order_id, from_status, to_status, changed_by, note
  ) values (
    p_organization_id, v_order.id, null, 'New', v_actor_id, 'Order created'
  );

  insert into public.audit_logs (
    organization_id, actor_id, action, entity, entity_id,
    after_snapshot, notes
  ) values (
    p_organization_id, v_actor_id, 'CREATE', 'Order', v_order.id::text,
    to_jsonb(v_order), 'Created order ' || v_order.order_number
  );

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
    into v_lines
  from public.order_items oi
  where oi.organization_id = p_organization_id
    and oi.order_id = v_order.id;

  return jsonb_build_object('order', to_jsonb(v_order), 'lines', v_lines);
end;
$function$;

create or replace function public.create_workspace_order(
  p_organization_id uuid,
  p_order jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.create_workspace_order(p_organization_id, p_order);
$function$;

revoke all on function private.create_workspace_order(uuid, jsonb) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function public.create_workspace_order(uuid, jsonb) to authenticated;
