# Supabase migration history

The migration filenames in this directory are aligned to the version numbers recorded in the live Supabase project's `supabase_migrations.schema_migrations` ledger.

During the November 2026 reconciliation:
- Missing migration sources were recovered from the ledger's stored `statements` arrays.
- Recovered SQL was compared byte-for-byte with the ledger statements.
- Existing mismatched filenames were replaced with their exact applied version/name.
- No live migration was re-applied and no database records were changed.
- Duplicate ledger entries were preserved as separate versioned files because the live project recorded both applications.

Run `npm run check:migrations` to validate that every migration filename has a 14-digit version and that no version is duplicated in the repository.
