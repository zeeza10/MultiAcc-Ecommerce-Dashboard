
-- Tighten role permission RLS and provision profiles on Supabase Auth signup.
do $$
declare t text; rp text; ip text; up text; dp text;
begin
 foreach t in array array['clients_3pl','rate_cards','marketplace_accounts','marketplace_credentials','marketplace_sync_runs','marketplace_exceptions','product_categories','products','marketplace_sku_mappings','customers','customer_addresses','orders','order_items','order_status_history','order_shipments','warehouses','warehouse_locations','stock_ledger','stock_adjustments','suppliers','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items','returns','return_items','storage_snapshots','invoices','invoice_items','payments','payment_allocations','expenses','chart_of_accounts','journal_entries','journal_entry_lines','marketplace_payouts','payout_orders','bank_transactions','financial_reconciliations','packaging_jobs','shipping_jobs','dropshipping_calculations','notifications','audit_logs','system_settings','import_jobs','export_jobs'] loop
  execute format('drop policy if exists %I on public.%I',t||'_org_select',t);
  execute format('drop policy if exists %I on public.%I',t||'_org_insert',t);
  execute format('drop policy if exists %I on public.%I',t||'_org_update',t);
  execute format('drop policy if exists %I on public.%I',t||'_org_delete',t);
  rp := case when t in ('invoices','invoice_items','payments','payment_allocations','expenses','chart_of_accounts','journal_entries','journal_entry_lines','marketplace_payouts','payout_orders','bank_transactions','financial_reconciliations') then 'finance.view'
   when t in ('clients_3pl','rate_cards','storage_snapshots','packaging_jobs','shipping_jobs') then 'fulfilment.view'
   when t in ('suppliers','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items') then 'purchasing.view'
   when t in ('marketplace_accounts','marketplace_sync_runs','marketplace_exceptions') then 'marketplace.view'
   when t='marketplace_credentials' then 'marketplace.manage'
   when t='marketplace_sku_mappings' then 'products.view'
   when t in ('warehouses','warehouse_locations','stock_ledger','stock_adjustments') then 'inventory.view'
   when t in ('returns','return_items') then 'returns.view' when t='audit_logs' then 'audit.view'
   when t='system_settings' then 'settings.manage' when t in ('import_jobs','export_jobs') then 'reports.view'
   when t='notifications' then 'dashboard.view' else 'orders.view' end;
  ip := case when t in ('invoices','invoice_items','payments','payment_allocations','expenses','chart_of_accounts','journal_entries','journal_entry_lines','marketplace_payouts','payout_orders','bank_transactions','financial_reconciliations') then 'finance.manage'
   when t in ('clients_3pl','rate_cards','storage_snapshots','packaging_jobs','shipping_jobs') then 'fulfilment.manage'
   when t in ('suppliers','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items') then 'purchasing.manage'
   when t in ('marketplace_accounts','marketplace_sync_runs','marketplace_exceptions','marketplace_credentials') then 'marketplace.manage'
   when t in ('warehouses','warehouse_locations','stock_ledger','stock_adjustments') then 'inventory.adjust'
   when t in ('returns','return_items') then 'returns.manage'
   when t in ('orders','order_items','order_status_history','order_shipments') then 'orders.create'
   when t='audit_logs' then 'audit.view' when t='system_settings' then 'settings.manage'
   when t in ('import_jobs','export_jobs') then 'reports.export' when t='notifications' then 'dashboard.view' else 'products.create' end;
  up := case when t in ('invoices','invoice_items','payments','payment_allocations','expenses','chart_of_accounts','journal_entries','journal_entry_lines','marketplace_payouts','payout_orders','bank_transactions','financial_reconciliations') then 'finance.manage'
   when t in ('clients_3pl','rate_cards','storage_snapshots','packaging_jobs','shipping_jobs') then 'fulfilment.manage'
   when t in ('suppliers','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items') then 'purchasing.manage'
   when t in ('marketplace_accounts','marketplace_sync_runs','marketplace_exceptions','marketplace_credentials') then 'marketplace.manage'
   when t in ('warehouses','warehouse_locations','stock_ledger','stock_adjustments') then 'inventory.adjust'
   when t in ('returns','return_items') then 'returns.manage'
   when t in ('orders','order_items','order_status_history','order_shipments') then 'orders.edit'
   when t='audit_logs' then 'audit.view' when t='system_settings' then 'settings.manage'
   when t in ('import_jobs','export_jobs') then 'reports.export' when t='notifications' then 'dashboard.view' else 'products.edit' end;
  dp := case when t in ('invoices','invoice_items','payments','payment_allocations','expenses','chart_of_accounts','journal_entries','journal_entry_lines','marketplace_payouts','payout_orders','bank_transactions','financial_reconciliations') then 'finance.manage'
   when t in ('clients_3pl','rate_cards','storage_snapshots','packaging_jobs','shipping_jobs') then 'fulfilment.manage'
   when t in ('suppliers','purchase_orders','purchase_order_items','goods_receipts','goods_receipt_items') then 'purchasing.manage'
   when t in ('marketplace_accounts','marketplace_sync_runs','marketplace_exceptions','marketplace_credentials') then 'marketplace.manage'
   when t in ('warehouses','warehouse_locations','stock_ledger','stock_adjustments') then 'inventory.adjust'
   when t in ('returns','return_items') then 'returns.manage'
   when t in ('orders','order_items','order_status_history','order_shipments') then 'orders.delete'
   when t in ('audit_logs','journal_entries','journal_entry_lines','stock_ledger') then null
   when t='system_settings' then 'settings.manage' when t in ('import_jobs','export_jobs') then 'reports.export'
   when t='notifications' then 'dashboard.view' else 'products.delete' end;
  if t='marketplace_credentials' then continue; end if;
  execute format('create policy %I on public.%I for select to authenticated using(public.has_org_permission(organization_id,%L))',t||'_permission_select',t,rp);
  if t not in ('stock_ledger','journal_entries','journal_entry_lines','audit_logs') then
   execute format('create policy %I on public.%I for insert to authenticated with check(public.has_org_permission(organization_id,%L))',t||'_permission_insert',t,ip);
   execute format('create policy %I on public.%I for update to authenticated using(public.has_org_permission(organization_id,%L)) with check(public.has_org_permission(organization_id,%L))',t||'_permission_update',t,up,up);
  end if;
  if dp is not null then execute format('create policy %I on public.%I for delete to authenticated using(public.has_org_permission(organization_id,%L))',t||'_permission_delete',t,dp); end if;
 end loop;
end $$;
create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin insert into public.profiles(id,full_name) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','')) on conflict(id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute procedure public.handle_new_auth_user();
drop policy if exists profile_self_update on public.profiles;
revoke update on public.profiles from authenticated;
grant update(full_name,phone) on public.profiles to authenticated;
create policy profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
