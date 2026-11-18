-- Database hardening: cover every currently-unindexed FK, tighten RLS policy
-- composition without changing effective tenant permissions, and remove per-row
-- auth function evaluation from hot RLS predicates.
--
-- No business rows are modified or deleted by this migration.

DO $migration$
DECLARE
  fk RECORD;
  v_index_name TEXT;
  v_columns TEXT;
BEGIN
  FOR fk IN
    WITH foreign_keys AS (
      SELECT
        c.oid,
        c.conrelid,
        t.relname AS table_name,
        c.conname AS constraint_name,
        array_agg(a.attname ORDER BY k.ord) AS column_names,
        array_agg(a.attnum::smallint ORDER BY k.ord) AS column_numbers
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      CROSS JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      WHERE c.contype = 'f'
        AND n.nspname = 'public'
      GROUP BY c.oid, c.conrelid, t.relname, c.conname
    )
    SELECT f.*
    FROM foreign_keys f
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_index i
      WHERE i.indrelid = f.conrelid
        AND i.indisvalid
        AND i.indisready
        AND (
          SELECT array_agg(x.attnum ORDER BY x.ord)
          FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS x(attnum, ord)
          WHERE x.ord <= i.indnkeyatts
        )[1:cardinality(f.column_numbers)] = f.column_numbers
    )
    ORDER BY f.table_name, f.constraint_name
  LOOP
    v_index_name :=
      left('idx_' || fk.table_name || '_' || array_to_string(fk.column_names, '_'), 42)
      || '_' || substr(md5(fk.constraint_name), 1, 8);

    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ord)
      INTO v_columns
    FROM unnest(fk.column_names) WITH ORDINALITY AS cols(column_name, ord);

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%s)',
      v_index_name,
      fk.table_name,
      v_columns
    );
  END LOOP;
END
$migration$;

-- Server-only credential and audit tables: keep RLS enabled and add an explicit
-- restrictive deny for browser roles. service_role remains server-side and
-- bypasses RLS as designed. No client-facing policy is added.
DROP POLICY IF EXISTS platform_integration_credentials_client_deny
  ON public.platform_integration_credentials;
CREATE POLICY platform_integration_credentials_client_deny
  ON public.platform_integration_credentials
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS platform_integration_audit_client_deny
  ON public.platform_integration_audit;
CREATE POLICY platform_integration_audit_client_deny
  ON public.platform_integration_audit
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Split broad ALL policies into explicit write policies. SELECT permissions
-- are expressed once, preserving the previous OR-combination semantics.

DROP POLICY IF EXISTS marketplace_finance_alloc_manage
  ON public.marketplace_finance_allocations;
DROP POLICY IF EXISTS marketplace_finance_alloc_select
  ON public.marketplace_finance_allocations;

CREATE POLICY marketplace_finance_alloc_select
  ON public.marketplace_finance_allocations
  FOR SELECT TO authenticated
  USING (
    (
      private.has_org_permission(organization_id, 'finance.view')
      OR private.has_org_permission(organization_id, 'finance.manage')
    )
    AND NOT private.is_client_user(organization_id)
  );

CREATE POLICY marketplace_finance_alloc_insert
  ON public.marketplace_finance_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_org_permission(organization_id, 'finance.manage')
    AND NOT private.is_client_user(organization_id)
  );

CREATE POLICY marketplace_finance_alloc_update
  ON public.marketplace_finance_allocations
  FOR UPDATE TO authenticated
  USING (
    private.has_org_permission(organization_id, 'finance.manage')
    AND NOT private.is_client_user(organization_id)
  )
  WITH CHECK (
    private.has_org_permission(organization_id, 'finance.manage')
    AND NOT private.is_client_user(organization_id)
  );

CREATE POLICY marketplace_finance_alloc_delete
  ON public.marketplace_finance_allocations
  FOR DELETE TO authenticated
  USING (
    private.has_org_permission(organization_id, 'finance.manage')
    AND NOT private.is_client_user(organization_id)
  );

DROP POLICY IF EXISTS marketplace_inventory_alloc_manage
  ON public.marketplace_inventory_allocations;
DROP POLICY IF EXISTS marketplace_inventory_alloc_select
  ON public.marketplace_inventory_allocations;

CREATE POLICY marketplace_inventory_alloc_select
  ON public.marketplace_inventory_allocations
  FOR SELECT TO authenticated
  USING (
    (
      private.has_org_permission(organization_id, 'inventory.view')
      AND (
        NOT private.is_client_user(organization_id)
        OR product_id IN (
          SELECT p.id
          FROM public.products p
          WHERE p.organization_id = marketplace_inventory_allocations.organization_id
            AND p.client_3pl_id = private.current_user_client_id(marketplace_inventory_allocations.organization_id)
        )
      )
    )
    OR (
      private.has_org_permission(organization_id, 'inventory.manage')
      AND NOT private.is_client_user(organization_id)
    )
  );

CREATE POLICY marketplace_inventory_alloc_insert
  ON public.marketplace_inventory_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_org_permission(organization_id, 'inventory.manage')
    AND NOT private.is_client_user(organization_id)
  );

CREATE POLICY marketplace_inventory_alloc_update
  ON public.marketplace_inventory_allocations
  FOR UPDATE TO authenticated
  USING (
    private.has_org_permission(organization_id, 'inventory.manage')
    AND NOT private.is_client_user(organization_id)
  )
  WITH CHECK (
    private.has_org_permission(organization_id, 'inventory.manage')
    AND NOT private.is_client_user(organization_id)
  );

CREATE POLICY marketplace_inventory_alloc_delete
  ON public.marketplace_inventory_allocations
  FOR DELETE TO authenticated
  USING (
    private.has_org_permission(organization_id, 'inventory.manage')
    AND NOT private.is_client_user(organization_id)
  );

DROP POLICY IF EXISTS members_manage ON public.organization_members;
CREATE POLICY members_insert_manage
  ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_super_admin(organization_id));
CREATE POLICY members_update_manage
  ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.is_org_super_admin(organization_id))
  WITH CHECK (public.is_org_super_admin(organization_id));
CREATE POLICY members_delete_manage
  ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.is_org_super_admin(organization_id));

DROP POLICY IF EXISTS roles_manage ON public.roles;
CREATE POLICY roles_insert_manage
  ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.is_org_super_admin(organization_id)
  );
CREATE POLICY roles_update_manage
  ON public.roles
  FOR UPDATE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_org_super_admin(organization_id)
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND public.is_org_super_admin(organization_id)
  );
CREATE POLICY roles_delete_manage
  ON public.roles
  FOR DELETE TO authenticated
  USING (
    organization_id IS NOT NULL
    AND public.is_org_super_admin(organization_id)
  );

-- Evaluate auth.uid() once per statement instead of once per candidate row.
DROP POLICY IF EXISTS profile_self_read ON public.profiles;
CREATE POLICY profile_self_read
  ON public.profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profile_self_update ON public.profiles;
CREATE POLICY profile_self_update
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS client_tenant_isolation_select ON public.notifications;
CREATE POLICY client_tenant_isolation_select
  ON public.notifications
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    NOT private.is_client_user(organization_id)
    OR user_id = (SELECT auth.uid())
  );

COMMENT ON POLICY platform_integration_credentials_client_deny
  ON public.platform_integration_credentials IS
  'Explicitly denies browser roles; platform credentials are server-only.';
COMMENT ON POLICY platform_integration_audit_client_deny
  ON public.platform_integration_audit IS
  'Explicitly denies browser roles; integration audit is server-only.';

