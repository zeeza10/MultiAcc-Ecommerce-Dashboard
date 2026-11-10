-- GitHub <-> Supabase production integration smoke test.
-- Creates a session-local temporary table, verifies a round-trip insert,
-- and drops the table. No persistent application schema or data is changed.

CREATE TEMP TABLE github_integration_smoke_test (
  id integer PRIMARY KEY,
  marker text NOT NULL
);

INSERT INTO github_integration_smoke_test (id, marker)
VALUES (1, 'github-supabase-main-branch-sync-ok');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM github_integration_smoke_test
    WHERE id = 1
      AND marker = 'github-supabase-main-branch-sync-ok'
  ) THEN
    RAISE EXCEPTION 'GitHub/Supabase integration smoke test failed';
  END IF;
END
$$;

DROP TABLE github_integration_smoke_test;
