create or replace function private.update_workspace_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_order jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_before jsonb;
  v_address jsonb;
  v_customer_name text;
  v_customer_email text;
  v_notes text;
  v_reason text;
  v_shipping_charge bigint;
  v_vat_rate numeric := 0;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_line jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
  v_unit_price bigint;
  v_line_tax bigint;
  v_line_total bigint;
  v_lines jsonb := '[]'::jsonb;
begin
  if v_actor_id is null then
    raise exception 'Authentication required.' using errcode='42501';
  end if;
  if p_organization_id is null or not private.has_org_permission(p_organization_id,'orders.edit') then
    raise exception 'You are not authorized to edit orders in this workspace.' using errcode='42501';
  end if;
  if private.is_client_user(p_organization_id) then
    raise exception 'Client users cannot edit workspace orders.' using errcode='42501';
  end if;
  if coalesce(jsonb_typeof(p_order),'') <> 'object' then
    raise exception 'Order update payload must be an object.' using errcode='22023';
  end if;

  select * into v_order
  from public.orders o
  where o.id=p_order_id and o.organization_id=p_organization_id
  for update;
  if not found then
    raise exception 'Order not found in this workspace.' using errcode='P0002';
  end if;
  if v_order.status <> 'New' then
    raise exception 'Only new, unallocated orders can be edited. Use the order workflow to change later statuses.' using errcode='22023';
  end if;
  if exists(select 1 from public.order_items oi where oi.organization_id=p_organization_id and oi.order_id=p_order_id and oi.reserved_quantity>0) then
    raise exception 'This order has reserved stock and cannot be edited.' using errcode='22023';
  end if;
  if p_order ? 'status' and coalesce(p_order->>'status',v_order.status) <> v_order.status then
    raise exception 'Order status cannot be changed through the edit form. Use the order status workflow.' using errcode='22023';
  end if;

  v_customer_name := btrim(coalesce(p_order->>'customerName',v_order.customer_name));
  v_customer_email := nullif(btrim(coalesce(p_order->>'customerEmail',v_order.customer_email,'')),'');
  v_address := coalesce(p_order->'shippingAddress',v_order.shipping_address,'{}'::jsonb);
  v_notes := nullif(btrim(coalesce(p_order->>'notes',v_order.notes,'')),'');
  v_reason := btrim(coalesce(p_order->>'reason',''));
  if length(v_customer_name)=0 or length(v_customer_name)>200 then
    raise exception 'Customer name is required and must be at most 200 characters.' using errcode='22023';
  end if;
  if v_customer_email is not null and length(v_customer_email)>320 then
    raise exception 'Customer email is too long.' using errcode='22023';
  end if;
  if coalesce(jsonb_typeof(v_address),'') <> 'object' or length(v_address::text)>10000 then
    raise exception 'Shipping address must be a valid object.' using errcode='22023';
  end if;
  if length(v_reason)<5 or length(v_reason)>1000 then
    raise exception 'A clear edit reason of 5 to 1,000 characters is required.' using errcode='22023';
  end if;
  begin
    v_shipping_charge := coalesce((p_order->>'shippingFeeMinor')::bigint,v_order.shipping_charge_minor);
    if v_shipping_charge<0 then raise exception 'negative'; end if;
  exception when others then
    raise exception 'Shipping charge must be a valid non-negative minor-unit amount.' using errcode='22023';
  end;

  if coalesce(jsonb_typeof(p_order->'items'),'') <> 'array'
     or jsonb_array_length(p_order->'items')<1
     or jsonb_array_length(p_order->'items')>100 then
    raise exception 'An order must contain between 1 and 100 line items.' using errcode='22023';
  end if;
  select coalesce(s.default_vat_rate_percent,0) into v_vat_rate
  from public.system_settings s where s.organization_id=p_organization_id limit 1;
  if v_vat_rate<0 or v_vat_rate>100 then
    raise exception 'Workspace VAT rate is outside the supported range.' using errcode='22023';
  end if;

  v_before := jsonb_build_object('order',to_jsonb(v_order),'lines',coalesce((
    select jsonb_agg(to_jsonb(oi) order by oi.id) from public.order_items oi
    where oi.organization_id=p_organization_id and oi.order_id=p_order_id
  ),'[]'::jsonb));

  for v_line in select value from jsonb_array_elements(p_order->'items')
  loop
    if coalesce(jsonb_typeof(v_line),'')<>'object' then
      raise exception 'Each order line must be an object.' using errcode='22023';
    end if;
    begin
      v_quantity := (v_line->>'quantity')::integer;
      v_unit_price := (v_line->>'unitPriceMinor')::bigint;
    exception when others then
      raise exception 'Order line quantity and unit price must be valid numbers.' using errcode='22023';
    end;
    if v_quantity<1 or v_quantity>1000000 or v_unit_price<0 then
      raise exception 'Order line quantity or unit price is outside the supported range.' using errcode='22023';
    end if;
    select * into v_product from public.products p
    where p.organization_id=p_organization_id and p.sku=btrim(coalesce(v_line->>'sku',''))
      and p.status='ACTIVE'
    order by p.created_at desc limit 1 for share;
    if not found then
      raise exception 'A selected SKU was not found or is inactive in this workspace.' using errcode='P0002';
    end if;
    v_line_tax := round(v_unit_price::numeric*v_quantity*v_vat_rate/100);
    v_line_total := v_unit_price::numeric*v_quantity::numeric;
    if v_line_total>9223372036854775807::numeric or v_line_tax>9223372036854775807::numeric then
      raise exception 'Order line amount exceeds the supported monetary range.' using errcode='22003';
    end if;
    v_subtotal := v_subtotal+v_line_total;
    v_tax := v_tax+v_line_tax;
  end loop;

  if v_subtotal>9223372036854775807::numeric or v_tax>9223372036854775807::numeric
     or v_subtotal+v_shipping_charge>9223372036854775807::numeric then
    raise exception 'Order total exceeds the supported monetary range.' using errcode='22003';
  end if;

  delete from public.order_items where organization_id=p_organization_id and order_id=p_order_id;
  for v_line in select value from jsonb_array_elements(p_order->'items')
  loop
    select * into v_product from public.products p
    where p.organization_id=p_organization_id and p.sku=btrim(coalesce(v_line->>'sku',''))
      and p.status='ACTIVE'
    order by p.created_at desc limit 1;
    v_quantity := (v_line->>'quantity')::integer;
    v_unit_price := (v_line->>'unitPriceMinor')::bigint;
    v_line_tax := round(v_unit_price::numeric*v_quantity*v_vat_rate/100);
    v_line_total := v_unit_price::numeric*v_quantity::numeric;
    insert into public.order_items(
      organization_id,order_id,product_id,sku,product_name,quantity,
      unit_price_minor,tax_amount_minor,total_price_minor,is_backordered,reserved_quantity
    ) values(
      p_organization_id,p_order_id,v_product.id,v_product.sku,v_product.name,v_quantity,
      v_unit_price,v_line_tax,v_line_total,false,0
    );
  end loop;

  update public.orders set
    customer_name=v_customer_name,customer_email=v_customer_email,shipping_address=v_address,
    notes=v_notes,shipping_charge_minor=v_shipping_charge,
    tax_minor=v_tax::bigint,total_minor=(v_subtotal+v_shipping_charge)::bigint,updated_at=now()
  where id=p_order_id and organization_id=p_organization_id
  returning * into v_order;

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb) into v_lines
  from public.order_items oi where oi.organization_id=p_organization_id and oi.order_id=p_order_id;

  insert into public.audit_logs(
    organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes
  ) values(
    p_organization_id,v_actor_id,'UPDATE','Order',p_order_id::text,v_before,
    jsonb_build_object('order',to_jsonb(v_order),'lines',v_lines),v_reason
  );

  return jsonb_build_object('order',to_jsonb(v_order),'lines',v_lines);
end;
$function$;

create or replace function public.update_workspace_order(
  p_organization_id uuid,p_order_id uuid,p_order jsonb
)
returns jsonb
language sql
security invoker
set search_path=public,private,pg_temp
as $function$
  select private.update_workspace_order(p_organization_id,p_order_id,p_order);
$function$;

revoke all on function private.update_workspace_order(uuid,uuid,jsonb) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function public.update_workspace_order(uuid,uuid,jsonb) to authenticated;
