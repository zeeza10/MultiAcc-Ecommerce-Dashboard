import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const environmentMigration = read('supabase/migrations/20261118010000_complete_demo_environment_seed.sql');
const financeMigration = read('supabase/migrations/20261118020000_complete_demo_finance_and_payments_seed.sql');
const financeView = read('src/components/FinanceView.tsx');
const payoutsView = read('src/components/EbayPayoutsView.tsx');

const assertions = [
  ['Demo warehouse partition', /DEMO/i.test(environmentMigration) && /warehouse_locations/i.test(environmentMigration)],
  ['Demo journal environment correction', /journal_entries/i.test(environmentMigration) && /journal_entry_lines/i.test(environmentMigration)],
  ['Overdue Demo invoice seed', /inv_005/i.test(financeMigration) && /INSERT INTO public\.invoices/i.test(financeMigration)],
  ['Pending Demo expense seed', /exp_005/i.test(financeMigration) && /INSERT INTO public\.expenses/i.test(financeMigration)],
  ['Double-entry journal seed', /INSERT INTO public\.journal_entries/i.test(financeMigration) && /INSERT INTO public\.journal_entry_lines/i.test(financeMigration)],
  ['Seller-account finance allocations', /INSERT INTO public\.marketplace_finance_allocations/i.test(financeMigration)],
  ['Synthetic bank statement seed', /INSERT INTO public\.bank_transactions/i.test(financeMigration) && /\[DEMO\]/i.test(financeMigration)],
  ['Bank transaction integrity assertion', /Expected at least eight Demo bank statement transactions/i.test(financeMigration)],
  ['Finance allocation integrity assertion', /Expected full UK Demo store finance allocations/i.test(financeMigration)],
  ['Finance screen exposes load failures', /role="alert"/.test(financeView) && /setLoadError/.test(financeView)],
  ['Payout screen exposes load failures', /role="alert"/.test(payoutsView) && /setLoadError/.test(payoutsView)],
];

const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name);
for (const [name, passed] of assertions) console.log(`${passed ? 'PASS' : 'FAIL'}: ${name}`);
if (failures.length) throw new Error(`Demo finance seed validation failed: ${failures.join(', ')}`);
console.log(`Verified ${assertions.length} Demo finance migration and UI error-state invariants.`);
