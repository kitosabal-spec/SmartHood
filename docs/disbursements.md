# Disbursement Management

Disbursements appears under Management immediately after Payments. The form has exactly three fields: Expense Category, Transaction Date and Amount (PHP). Desktop uses three equal-width columns; smaller screens stack them. All thirteen requested categories are supplied by the server, including `Hermicide` and `Remittances (SSS, PhilHealth, Pag-IBIG)`.

## Architecture and access

- `src/services/disbursementService.js` registers dedicated Express routes through `src/app.js`. The feature deliberately stays outside generic table CRUD and bulk replacement APIs.
- Active administrators can create, edit and void. The assignable `disbursements` permission grants read access only. The existing Accounts & Roles permission selectors and all server permission allowlists include it.
- `reports` grants access to the financial report endpoint, without granting disbursement management access. Its collection projection contains only approved amounts and activity dates, not homeowner identities or receipt URLs.
- Each mutation and its audit entry commit in the same transaction. Audit failures roll back the mutation. Updates and voids lock the record, and already voided records cannot be edited or voided again.
- Browser inputs and backend validation restrict writes to the original three fields. Creator IDs, timestamps and void metadata are server-owned. SQL values are parameterized.

## Database and deployment

New migration `017_create_disbursements.js` creates a separate InnoDB table with a unique string ID, category, transaction DATE, positive DECIMAL(12,2) amount, creator ID, creation/update timestamps, void timestamp/actor, and date/category indexes. Historical migrations are unchanged. Actor IDs remain recorded even if an account is later removed.

Deploy the changed files and apply the new migration with the existing `npm run db:migrate` workflow, then restart the application. Normal application startup also runs pending migrations automatically. No manual SQL, data reset, package installation or new environment variable is required. Follow the existing backup/deployment process in `PRODUCTION_MIGRATION.md`.

Development verification used a randomly named disposable local MySQL schema. The configured SmartHood database was not migrated or modified during implementation.

## Reports and exports

The existing Reports & Analytics date filter also controls the new Financial Summary, Expenses by Category, Monthly Disbursement Chart and paginated Disbursement Transaction History. Expense filters use transaction dates, never creation/update dates. Collections use the existing report precedence: review date, payment date, submission date, then creation date. Totals sum integer cents before formatting.

Financial Summary displays Total Collections, Total Disbursements and Net Cash Movement (collections minus disbursements). It explicitly states that net cash movement is not the HOA bank balance. Voided records are excluded from all expense totals but remain in the database and audit history. Reports and exports fetch current financial data when opened/generated.

The Excel workbook retains its existing worksheets and adds Disbursements, Expense Summary and Financial Summary, with numeric currency cells, totals and the selected reporting period. The download selector also offers separate Disbursements, Expense Summary and Financial Summary CSVs. The existing rectangular Collections CSV remains compatible. Billing amounts, homeowner outstanding balances and collection calculation rules are unchanged.

## Verification

- `npm test`: existing regression suite plus validation, HTTP authorization, audit rollback, create/edit/void, report calculations and Excel round-trip tests.
- `npm run check`: JavaScript syntax, asset references and merge-marker checks.
- `node tests/disbursements-browser.cjs`: isolated Chrome test for three-field desktop layout, create/edit/cancel/void, fresh server reads, filters, pagination, sidebar order, report integration, CSVs, viewer controls, mobile layout and dark-mode screenshots. Set `REPORT_BROWSER_EXECUTABLE` to use another Chrome/Edge installation. No Playwright dependency is required.
- PowerShell: `$env:TEST_LOCAL_MYSQL='1'; node --test tests/disbursements-mysql.test.cjs`: opt-in local MySQL test for retry-safe migration, DECIMAL precision, persistence after reconnect, DATE serialization, positive-amount constraint and retained void metadata. It uses local root with an empty password, matching the repository's other opt-in database tests; it never loads application credentials.

Created files: the migration, service, `public/js/disbursements.js`, `public/css/disbursements.css`, three disbursement test files and this guide. Updated files: `src/app.js`, `src/services/auditService.js`, `public/js/main.js`, `public/js/report-workbook.js`, `index.html`, the audit test fixture and migration inventory test. Shared dashboard and global CSS files were left unchanged.
