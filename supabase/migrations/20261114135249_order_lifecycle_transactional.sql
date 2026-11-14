-- Order lifecycle writes are now restricted to the audited transactional RPCs.
revoke insert, update, delete on table public.orders, public.order_items,
  public.order_status_history, public.order_shipments from public, anon, authenticated;
grant select on table public.orders, public.order_items,
  public.order_status_history, public.order_shipments to authenticated;

-- Transactional order lifecycle: reserve, release, dispatch, history and audit.
create or replace function private.transition_workspace_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_target_status text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_order public.orders%rowtype;
  v_before jsonb;
  v_line record;
  v_product public.products%rowtype;
  v_on_hand bigint;
  v_reserved bigint;
  v_available bigint;
  v_remaining integer;
  v_reserve integer;
  v_allow_negative boolean := false;
  v_location uuid;
  v_cogs numeric := 0;
  v_cogs_account uuid;
  v_inventory_account uuid;
  v_entry_id uuid;
  v_entry_number text;
  v_carrier text := nullif(btrim(coalesce(p_options->>'carrier','')), '');
  v_tracking text := nullif(btrim(coalesce(p_options->>'trackingNumber','')), '');
  v_note text := nullif(btrim(coalesce(p_options->>'note','')), '');
  v_lines jsonb;
  v_now timestamptz := now();
begin
  if v_actor is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_organization_id is null or not private.has_org_permission(p_organization_id, 'orders.edit') then
    raise exception 'You are not authorized to update orders in this workspace.' using errcode = '42501';
  end if;

  select r.code into v_role
  from public.organization_members m
  join public.roles r on r.id=m.role_id
  where m.organization_id=p_organization_id and m.user_id=v_actor and m.is_active=true
  limit 1;
  if v_role is null or v_role='CLIENT_USER' then
    raise exception 'Active non-client workspace membership is required.' using errcode = '42501';
  end if;
  if p_target_status='Cancelled' and v_role='WAREHOUSE_STAFF' then
    raise exception 'Warehouse staff cannot cancel orders. Operations Manager required.' using errcode = '42501';
  end if;

  select * into v_order
  from public.orders
  where id=p_order_id and organization_id=p_organization_id
  for update;
  if not found then
    raise exception 'Order was not found in this workspace.' using errcode = 'P0002';
  end if;

  if not (
    (v_order.status='New' and p_target_status in ('Confirmed','Cancelled')) or
    (v_order.status='Confirmed' and p_target_status in ('Allocated','Cancelled')) or
    (v_order.status='Allocated' and p_target_status in ('Picked','Cancelled')) or
    (v_order.status='Picked' and p_target_status in ('Packed','Allocated','Cancelled')) or
    (v_order.status='Packed' and p_target_status in ('Shipped','Cancelled')) or
    (v_order.status='Shipped' and p_target_status in ('Delivered','Returned')) or
    (v_order.status='Delivered' and p_target_status='Returned')
  ) then
    raise exception 'Invalid order status transition from % to %.',v_order.status,p_target_status using errcode = '22023';
  end if;
  v_before := to_jsonb(v_order) || jsonb_build_object('lines', (
    select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
    from public.order_items oi
    where oi.organization_id=p_organization_id and oi.order_id=v_order.id
  ));

  select coalesce(s.allow_negative_stock,false) into v_allow_negative
  from public.system_settings s where s.organization_id=p_organization_id limit 1;
  v_allow_negative := coalesce(v_allow_negative,false);

  select l.id into v_location
  from public.warehouse_locations l
  where l.organization_id=p_organization_id and l.is_active=true
  order by l.location_code
  limit 1;

  -- Lock all products in stable order to serialize concurrent reservations/dispatch.
  perform p.id
  from public.products p
  join public.order_items oi on oi.product_id=p.id and oi.organization_id=p.organization_id
  where oi.organization_id=p_organization_id and oi.order_id=v_order.id
  order by p.id
  for update of p;

  if p_target_status in ('Confirmed','Allocated') then
    for v_line in
      select oi.* from public.order_items oi
      where oi.organization_id=p_organization_id and oi.order_id=v_order.id
      order by oi.product_id,oi.id
      for update
    loop
      v_remaining := greatest(0,v_line.quantity-v_line.reserved_quantity);
      if v_remaining=0 then
        update public.order_items set is_backordered=false
        where id=v_line.id and organization_id=p_organization_id;
        continue;
      end if;

      select coalesce(sum(case when sl.stock_state='ON_HAND' then sl.quantity_delta else 0 end),0),
             coalesce(sum(case when sl.stock_state='RESERVED' then sl.quantity_delta else 0 end),0)
      into v_on_hand,v_reserved
      from public.stock_ledger sl
      where sl.organization_id=p_organization_id
        and sl.product_id=v_line.product_id
        and sl.client_3pl_id is not distinct from v_order.client_3pl_id;

      v_available := greatest(0,v_on_hand-v_reserved);
      v_reserve := least(v_remaining,v_available)::integer;

      if v_reserve>0 then
        insert into public.stock_ledger(
          organization_id,product_id,location_id,client_3pl_id,quantity_delta,
          stock_state,source_type,source_id,note,created_by
        ) values (
          p_organization_id,v_line.product_id,v_location,v_order.client_3pl_id,
          v_reserve,'RESERVED','ORDER_RESERVE',v_order.id,
          'Reservation for order '||v_order.order_number,v_actor
        );
      end if;

      update public.order_items
      set reserved_quantity=reserved_quantity+v_reserve,
          is_backordered=(reserved_quantity+v_reserve)<quantity
      where id=v_line.id and organization_id=p_organization_id;

      if v_reserve<v_remaining then
        insert into public.notifications(
          organization_id,notification_type,title,message,severity,reference_url
        ) values (
          p_organization_id,'LOW_STOCK',
          'Order Line Backordered: '||v_line.sku,
          format('Order %s requires %s of %s; %s additional units remain backordered.',
            v_order.order_number,v_line.quantity,v_line.sku,v_remaining-v_reserve),
          'WARNING','/sales/orders'
        );
      end if;
    end loop;
  elsif p_target_status='Cancelled' then
    for v_line in
      select oi.* from public.order_items oi
      where oi.organization_id=p_organization_id and oi.order_id=v_order.id
      order by oi.product_id,oi.id
      for update
    loop
      if v_line.reserved_quantity>0 then
        insert into public.stock_ledger(
          organization_id,product_id,location_id,client_3pl_id,quantity_delta,
          stock_state,source_type,source_id,note,created_by
        ) values (
          p_organization_id,v_line.product_id,v_location,v_order.client_3pl_id,
          -v_line.reserved_quantity,'RESERVED','ORDER_CANCEL',v_order.id,
          'Release reservation for cancelled order '||v_order.order_number,v_actor
        );
        update public.order_items set reserved_quantity=0
        where id=v_line.id and organization_id=p_organization_id;
      end if;
    end loop;
  elsif p_target_status='Shipped' then
    if not v_allow_negative and exists(
      select 1 from public.order_items oi
      where oi.organization_id=p_organization_id and oi.order_id=v_order.id
        and oi.reserved_quantity<oi.quantity
    ) then
      raise exception 'Order contains backordered or unreserved units. Resolve stock shortages before dispatch.' using errcode = '55000';
    end if;

    for v_line in
      select oi.*,p.cost_price_minor,p.client_3pl_id
      from public.order_items oi
      join public.products p on p.id=oi.product_id and p.organization_id=oi.organization_id
      where oi.organization_id=p_organization_id and oi.order_id=v_order.id
      order by oi.product_id,oi.id
      for update of oi,p
    loop
      if v_line.reserved_quantity>0 then
        insert into public.stock_ledger(
          organization_id,product_id,location_id,client_3pl_id,quantity_delta,
          stock_state,source_type,source_id,note,created_by
        ) values (
          p_organization_id,v_line.product_id,v_location,v_order.client_3pl_id,
          -v_line.reserved_quantity,'RESERVED','ORDER_DISPATCH',v_order.id,
          'Clear reservation on dispatch for order '||v_order.order_number,v_actor
        );
      end if;
      insert into public.stock_ledger(
        organization_id,product_id,location_id,client_3pl_id,quantity_delta,
        stock_state,source_type,source_id,unit_cost_minor,note,created_by
      ) values (
        p_organization_id,v_line.product_id,v_location,v_order.client_3pl_id,
        -v_line.quantity,'ON_HAND','ORDER_DISPATCH',v_order.id,v_line.cost_price_minor,
        'Physical dispatch deduction for order '||v_order.order_number,v_actor
      );
      v_cogs := v_cogs + greatest(v_line.cost_price_minor,0)::numeric*v_line.quantity;
      update public.order_items set reserved_quantity=0
      where id=v_line.id and organization_id=p_organization_id;
    end loop;

    if v_cogs>0 then
      if v_cogs>9223372036854775807::numeric then
        raise exception 'Shipment COGS exceeds supported monetary range.' using errcode = '22003';
      end if;
      select id into v_cogs_account from public.chart_of_accounts
      where organization_id=p_organization_id and account_code='5000' and is_active=true limit 1;
      select id into v_inventory_account from public.chart_of_accounts
      where organization_id=p_organization_id and account_code='1300' and is_active=true limit 1;
      if v_cogs_account is null or v_inventory_account is null then
        raise exception 'Configure active chart-of-accounts entries 5000 (COGS) and 1300 (Inventory Asset) before dispatch.' using errcode = '55000';
      end if;
      perform pg_advisory_xact_lock(hashtext(p_organization_id::text));
      select 'JE-'||to_char(current_date,'YYYY')||'-'||lpad((count(*)+1)::text,6,'0')
      into v_entry_number from public.journal_entries
      where organization_id=p_organization_id and created_at>=date_trunc('year',now());
      insert into public.journal_entries(
        organization_id,entry_number,entry_date,source_type,source_id,description,
        status,idempotency_key,created_by,posted_at
      ) values (
        p_organization_id,v_entry_number,current_date,'SHIPMENT',v_order.id,
        'COGS and inventory relief for order '||v_order.order_number,
        'POSTED','ORDER_SHIPMENT:'||v_order.id::text,v_actor,v_now
      ) returning id into v_entry_id;
      insert into public.journal_entry_lines(
        organization_id,journal_entry_id,account_id,debit_minor,credit_minor,description
      ) values
      (p_organization_id,v_entry_id,v_cogs_account,v_cogs::bigint,0,'Cost of goods sold'),
      (p_organization_id,v_entry_id,v_inventory_account,0,v_cogs::bigint,'Inventory asset relief');
    end if;

    insert into public.order_shipments(
      organization_id,order_id,carrier,tracking_number,shipped_at,status
    ) values (
      p_organization_id,v_order.id,v_carrier,v_tracking,v_now,'SHIPPED'
    );
  end if;

  update public.orders
  set status=p_target_status,
      carrier=case when p_target_status='Shipped' then v_carrier else carrier end,
      tracking_number=case when p_target_status='Shipped' then v_tracking else tracking_number end,
      updated_at=v_now
  where id=v_order.id and organization_id=p_organization_id
  returning * into v_order;

  if p_target_status='Delivered' then
    update public.order_shipments set status='DELIVERED',delivered_at=v_now
    where organization_id=p_organization_id and order_id=v_order.id and status='SHIPPED';
  elsif p_target_status='Returned' then
    update public.order_shipments set status='RETURNED'
    where organization_id=p_organization_id and order_id=v_order.id and status in ('SHIPPED','DELIVERED');
  end if;

  insert into public.order_status_history(
    organization_id,order_id,from_status,to_status,changed_by,note
  ) values (
    p_organization_id,v_order.id,v_before->>'status',p_target_status,v_actor,
    coalesce(v_note,'Status updated to '||p_target_status)
  );

  insert into public.audit_logs(
    organization_id,actor_id,action,entity,entity_id,before_snapshot,after_snapshot,notes
  ) values (
    p_organization_id,v_actor,'UPDATE','Order',v_order.id::text,v_before,
    to_jsonb(v_order) || jsonb_build_object('lines', (
      select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id), '[]'::jsonb)
      from public.order_items oi
      where oi.organization_id=p_organization_id and oi.order_id=v_order.id
    )),
    format('Order %s transitioned from %s to %s.',v_order.order_number,v_before->>'status',p_target_status)
  );

  select coalesce(jsonb_agg(to_jsonb(oi) order by oi.id),'[]'::jsonb)
  into v_lines from public.order_items oi
  where oi.organization_id=p_organization_id and oi.order_id=v_order.id;

  return jsonb_build_object('order',to_jsonb(v_order),'lines',v_lines);
end;
$function$;

create or replace function public.transition_workspace_order(
  p_organization_id uuid,
  p_order_id uuid,
  p_target_status text,
  p_options jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.transition_workspace_order(p_organization_id,p_order_id,p_target_status,p_options);
$function$;

revoke all on function private.transition_workspace_order(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.transition_workspace_order(uuid,uuid,text,jsonb) from public,anon;
grant execute on function public.transition_workspace_order(uuid,uuid,text,jsonb) to authenticated;
