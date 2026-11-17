# Contributing

## Branch and pull request workflow

1. Start from the latest main.
2. Create a focused feature or fix branch.
3. Keep changes scoped; avoid unrelated refactors.
4. Add or update tests for changed behavior.
5. For SQL changes, document environment impact, RLS/grants, rollback considerations and post-migration verification.
6. Open a pull request against main.
7. Wait for every required GitHub check to complete successfully.
8. Merge only after reviewing the diff, CI results and database impact.

Do not merge while a required check is pending, unexpectedly skipped or failing.

## Local validation

```bash
npm ci
npm run check:migrations
npm run lint
npm test
npm run build
npm run cf:dry-run
```

## TypeScript and React conventions

- Prefer explicit domain types over any.
- Keep browser API calls in src/services/api.ts; do not duplicate auth/fetch logic inside screens.
- Keep Worker domain handlers under worker/routes/.
- Validate input at API boundaries and return consistent JSON errors.
- Keep organization and environment scoping explicit in database queries.
- Distinguish loading, empty, error and success states in UI.
- Never swallow request errors and render a misleading empty state.

## Database and security conventions

- Use timestamped, descriptive SQL migration names.
- Prefer additive, idempotent migrations.
- Add integrity assertions for critical seed data and financial invariants.
- Never mix Demo, Sandbox and Production records.
- Never use service-role credentials for ordinary user requests.
- Do not weaken CI security checks just to obtain a green build.
- Do not run destructive SQL against Production without explicit approval.

Update documentation when changing dependencies, runtime architecture, environment variables, migrations, permissions, deployment or CI.
