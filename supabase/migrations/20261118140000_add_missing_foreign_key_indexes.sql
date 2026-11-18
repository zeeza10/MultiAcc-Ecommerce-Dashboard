-- Add B-tree indexes for public foreign-key columns that are not already
-- covered by a valid, non-partial index with the FK columns as its leading keys.
-- This supports parent-row updates/deletes and tenant-scoped joins without changing data.
SET lock_timeout = '5s';
SET statement_timeout = '5min';

CREATE INDEX IF NOT EXISTS idx_fk_roles_organization_id ON public.roles (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_role_permissions_role_id ON public.role_permissions (role_id);
CREATE INDEX IF NOT EXISTS idx_fk_clients_3pl_organization_id ON public.clients_3pl (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_organization_members_organization_id ON public.organization_members (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_organization_members_user_id ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_fk_user_invitations_organization_id ON public.user_invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_rate_cards_organization_id ON public.rate_cards (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_accounts_organization_id ON public.marketplace_accounts (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_product_categories_organization_id ON public.product_categories (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_products_organization_id ON public.products (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_sku_mappings_marketplace_account_id ON public.marketplace_sku_mappings (marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_customers_organization_id ON public.customers (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_orders_marketplace_account_id ON public.orders (marketplace_account_id);
CREATE INDEX IF NOT EXISTS idx_fk_orders_organization_id ON public.orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_warehouses_organization_id ON public.warehouses (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_warehouse_locations_warehouse_id ON public.warehouse_locations (warehouse_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_ledger_organization_id ON public.stock_ledger (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_stock_adjustments_organization_id ON public.stock_adjustments (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_suppliers_organization_id ON public.suppliers (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_purchase_orders_organization_id ON public.purchase_orders (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_goods_receipts_organization_id ON public.goods_receipts (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_returns_organization_id ON public.returns (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_storage_snapshots_client_3pl_id ON public.storage_snapshots (client_3pl_id);
CREATE INDEX IF NOT EXISTS idx_fk_invoices_organization_id ON public.invoices (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_payments_organization_id ON public.payments (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_payment_allocations_payment_id ON public.payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_fk_expenses_organization_id ON public.expenses (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_chart_of_accounts_organization_id ON public.chart_of_accounts (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_journal_entries_organization_id ON public.journal_entries (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_payouts_organization_id ON public.marketplace_payouts (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_payout_orders_payout_id ON public.payout_orders (payout_id);
CREATE INDEX IF NOT EXISTS idx_fk_bank_transactions_organization_id ON public.bank_transactions (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_financial_reconciliations_organization_id ON public.financial_reconciliations (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_packaging_jobs_organization_id ON public.packaging_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_shipping_jobs_organization_id ON public.shipping_jobs (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_dropshipping_calculations_organization_id ON public.dropshipping_calculations (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_notifications_organization_id ON public.notifications (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_audit_logs_organization_id ON public.audit_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_inventory_allocations_organization_id ON public.marketplace_inventory_allocations (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_finance_allocations_organization_id ON public.marketplace_finance_allocations (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_organization_member_permission_overrides_organization_id ON public.organization_member_permission_overrides (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_integration_events_organization_id ON public.marketplace_integration_events (organization_id);
CREATE INDEX IF NOT EXISTS idx_fk_marketplace_sync_jobs_organization_id ON public.marketplace_sync_jobs (organization_id);

ANALYZE public.roles,
  public.role_permissions,
  public.clients_3pl,
  public.organization_members,
  public.user_invitations,
  public.rate_cards,
  public.marketplace_accounts,
  public.product_categories,
  public.products,
  public.marketplace_sku_mappings,
  public.customers,
  public.orders,
  public.warehouses,
  public.warehouse_locations,
  public.stock_ledger,
  public.stock_adjustments,
  public.suppliers,
  public.purchase_orders,
  public.goods_receipts,
  public.returns,
  public.storage_snapshots,
  public.invoices,
  public.payments,
  public.payment_allocations,
  public.expenses,
  public.chart_of_accounts,
  public.journal_entries,
  public.marketplace_payouts,
  public.payout_orders,
  public.bank_transactions,
  public.financial_reconciliations,
  public.packaging_jobs,
  public.shipping_jobs,
  public.dropshipping_calculations,
  public.notifications,
  public.audit_logs,
  public.marketplace_inventory_allocations,
  public.marketplace_finance_allocations,
  public.organization_member_permission_overrides,
  public.marketplace_integration_events,
  public.marketplace_sync_jobs;
