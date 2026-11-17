# Finance Demo Data — Integrity and Verification

## Application areas

- **Finance:** Invoices, Payments & Allocations, Operating Expenses, Append-Only Ledger and Order Profitability.
- **eBay Payouts & Reconciliation:** Payouts, Reconciliation and a financial ledger tab.

There is no separate Vendor Bills screen or standalone bank-feed management screen at present. The bank_transactions table can store statement rows for reconciliation, but table rows do not create a UI screen or a live bank integration.

## Environment and store filtering

Finance requests accept an optional accountId. The Worker resolves the data environment from the selected marketplace account:
- Demo account → DEMO
- Sandbox account → SANDBOX
- Production account → PRODUCTION
- Missing account / ALL → current API fallback is SANDBOX

Account-specific invoices, payments, expenses and journal entries also depend on marketplace_finance_allocations. A Demo invoice may exist in the database but will not appear in a selected Demo store view if its seller-account allocation is missing.

## Required Demo finance coverage

The flagship UK Demo store should include:
- Sales invoices and invoice line items with paid, partially paid and overdue states.
- Payments and invoice allocations consistent with invoice paid balances.
- Approved and pending operating expenses.
- Posted double-entry journals with total debits equal to total credits.
- Store allocations for invoices, payments, expenses and journal entries.
- eBay payout examples and reconciliation records.
- Synthetic, clearly labelled Demo bank statement rows.
- Finance report source data.

Synthetic records must remain in Demo and must never be associated with a real Production seller account.

## Migration sequence

1. 20261118010000_complete_demo_environment_seed.sql — dedicated Demo warehouse and correction of Demo journal entries previously classified as Sandbox.
2. 20261118020000_complete_demo_finance_and_payments_seed.sql — additional invoice, expense, journal, finance allocation and synthetic bank transaction records.

These migrations were dry-run together inside an explicit transaction and rolled back. A successful dry-run is not the same as applying the migrations to the connected Supabase project.

## Live database audit — 2026-11-18

A read-only query against the connected Supabase Production project confirmed:
- Both migration versions above were absent from supabase_migrations.schema_migrations.
- Demo invoices: 4.
- Demo payments: 2.
- Demo expenses: 4.
- Demo journal entries: 0; 13 journal entries were still classified as Sandbox.
- Demo journal lines: 0; 30 journal lines were still classified as Sandbox.
- Demo bank transactions: 0.
- Demo payouts: 6.
- Demo reconciliations: 3.
- UK Demo seller-account finance allocations: 0.

This explains why store-filtered invoices, payments, expenses and general-ledger screens can appear empty even though some Demo source records exist. Those views rely on account allocations, and the completion migrations had not been applied.

## Post-migration verification

After the migrations are approved and applied, verify:

| Check | Expected |
|---|---|
| Migration 20261118010000 | Present in migration ledger |
| Migration 20261118020000 | Present in migration ledger |
| Demo invoices | At least 5 |
| Demo expenses | At least 5 |
| Demo journal entries | At least 14 |
| Demo journal lines | At least 33 |
| Demo bank transactions | At least 8 |
| UK Demo finance allocations | At least 20 |
| Invoice paid balances | Equal valid payment allocations |
| Posted journal entries | All balanced |
| Environment isolation | No Sandbox/Production records moved into Demo |
| Store isolation | Only selected account allocations shown |

Then select the UK Demo store and test every Finance and Payouts tab. Inspect visible counts and browser/network errors. A green CI run validates code; it does not prove a Production database migration has been applied or live data is visible.
