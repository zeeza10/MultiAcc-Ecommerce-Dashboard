ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS active_release_phase text NOT NULL DEFAULT 'ALL';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.system_settings'::regclass
      AND conname = 'system_settings_active_release_phase_check'
  ) THEN
    ALTER TABLE public.system_settings
      ADD CONSTRAINT system_settings_active_release_phase_check
      CHECK (active_release_phase IN ('P1','P2','P3','P4','P5','ALL'));
  END IF;
END $$;

DROP POLICY IF EXISTS system_settings_permission_select ON public.system_settings;
DROP POLICY IF EXISTS system_settings_member_select ON public.system_settings;
CREATE POLICY system_settings_member_select
  ON public.system_settings
  FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id));
