# Technology Inventory

This inventory reflects dependencies and runtime configuration in this repository. Exact resolved versions are recorded in package-lock.json.

## Languages and formats

| Language / format | Usage |
|---|---|
| TypeScript | Worker, API, domain services, shared types and Node tooling |
| TSX | React components and screens |
| SQL / PLpgSQL | PostgreSQL schema, RLS, functions, triggers and seed migrations |
| JavaScript / ESM | Node validation scripts and configuration |
| CSS | Global styles and Tailwind entry point |
| HTML | SPA document shell |
| JSON / JSONC | npm manifests, lockfile, metadata and Wrangler configuration |
| YAML | GitHub Actions workflows |
| Markdown | Engineering documentation |

## Frameworks, platforms and libraries

| Package / platform | Purpose |
|---|---|
| React 19 / React DOM 19 | Component UI and browser rendering |
| TypeScript | Static typing |
| Vite 8 | Local development and production build |
| Tailwind CSS 4 | Utility-first styling |
| @tailwindcss/vite | Tailwind integration for Vite |
| @vitejs/plugin-react | React transform and Fast Refresh |
| lucide-react | Icon components |
| motion | UI motion and transitions |
| Cloudflare Workers | Production edge runtime |
| @cloudflare/vite-plugin | Worker-aware Vite integration |
| Wrangler 4 | Worker dev, type generation, dry-run and deployment |
| Supabase PostgreSQL | Relational system of record |
| @supabase/supabase-js | Supabase Auth and database API client |
| Supabase Auth | Identity and session lifecycle |
| PostgreSQL RLS | Database-level tenant and row access boundary |
| PostgreSQL RPC / PLpgSQL | Transactional domain operations |
| Express 4 | Legacy/local compatibility server |
| eBay APIs | Marketplace integration |
| OAuth 2.0 | Seller authorization |
| @google/genai | Google GenAI SDK integration |
| Node test runner + tsx | Worker boundary tests |
| GitHub Actions | CI automation |
| CodeQL | Static application security analysis |
| Secret scanning | Credential leakage detection |
| npm audit | Dependency advisory scanning |

## Architecture conventions

- UI: React/TSX and typed domain interfaces.
- Browser authentication: Supabase SDK session.
- Business API: typed facade in src/services/api.ts.
- Production API: Cloudflare Worker in worker/.
- Database: Supabase PostgreSQL with organization scoping and RLS.
- Schema changes: timestamped SQL files in supabase/migrations/.
- Legacy compatibility: Express and file-backed code remain isolated under server/ during migration.

## Dependency policy

1. Keep deployed runtime dependencies in dependencies; keep bundlers, compilers, test runners, type declarations and build plugins in devDependencies.
2. Commit package-lock.json and use npm ci in CI.
3. Review transitive dependency advisories and reachability, not just direct package names.
4. Do not use npm audit fix --force without a reviewed compatibility plan and regression suite.
5. Pin security-sensitive SDKs where reproducibility requires it.
