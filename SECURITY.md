# Security Policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting / Security Advisories feature for this repository. If private reporting is unavailable, contact maintainers through an established private channel before publishing details. Do not create a public issue for an unpatched vulnerability.

Please include:
- Concise description and impact.
- Affected commit, branch or deployment.
- Reproduction steps or a minimal proof of concept.
- Suggested mitigation, if known.

Do not include seller credentials, OAuth tokens, customer personal data, payment details or other secrets in reports.

## Security expectations

- Never commit credentials, OAuth tokens, private keys, .env or .dev.vars files.
- Store private runtime credentials in Cloudflare Worker Secrets or an approved secret manager.
- Use Supabase publishable keys in browser code; never expose Supabase secret/service-role keys.
- Enforce organization membership, application permissions and PostgreSQL RLS.
- Keep Demo, Sandbox and Production records isolated.
- Validate untrusted input and enforce request size and rate limits.
- Do not log authorization headers, tokens, personal data or payment information.
- Review dependency advisories and CodeQL/secret-scan results before merge.

Maintainers will triage reports and coordinate remediation and disclosure. No response-time SLA is currently published.
