# Supabase Authentication Setup

## Project
- Project ref: `nmlwnezlsqystjrvszcd`
- Project URL: `https://nmlwnezlsqystjrvszcd.supabase.co`
- The publishable key in `.env.example` and `wrangler.jsonc` is designed for browser/client use. Never substitute a service-role or secret key.

## Local development and Google AI Studio
The browser and Express API now have safe defaults for this Supabase project's public URL and publishable key. The login screen therefore does not depend on manually injecting Vite variables into an AI Studio preview.

For local overrides, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. For the Express server, set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `.env`.

Run `npm install`, then `npm run dev`. If the preview is already running, restart it or reload after syncing the latest `main` branch..

## Supabase Dashboard settings
1. Open Authentication → Providers → Email and ensure Email provider is enabled.
2. Choose whether email confirmation is required. If enabled, users must click the verification link before signing in.
3. Open Authentication → URL Configuration.
4. Set Site URL to the actual deployed application URL.
5. Add each trusted application origin to Redirect URLs, including the local development origin (normally `http://localhost:3000`) and the production/preview origins you actually use.

## First organization owner
1. Open the application and create the first account with your own business email.
2. Confirm the email if confirmation is enabled.
3. Sign in. Since the account has no organization membership, the Organization Setup screen appears.
4. Create the first organization. The database RPC atomically creates the organization, grants its creator the system SUPER_ADMIN role, and inserts default system settings.
5. Do not share the first owner account. Invite other users only through a future administrator invitation workflow.

## Cloudflare Worker
The project URL and publishable key are non-secret client credentials and are included in `wrangler.jsonc` vars. No service-role key is configured or required by the browser. Keep any future marketplace OAuth client secrets and encryption keys in Cloudflare secrets, not vars or source control.

## Current migration boundary
Supabase sign-in, sign-up, email confirmation redirects, password reset, password update, session refresh, organization bootstrap, and organization membership verification are scaffolded. The old JSON-backed business endpoints are deliberately returning HTTP 503 after successful authentication until each module is migrated to organization-scoped Supabase queries. This prevents authenticated users from accidentally receiving shared demo data during the migration.
