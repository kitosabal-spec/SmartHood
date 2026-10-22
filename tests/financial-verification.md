# Financial permission verification

Billing and Payments module assignments grant non-admins read access. Financial management requires an active administrator. Resident Portal submissions and receipt corrections remain restricted to the homeowner's own records.

## Regular checks

```powershell
node --test tests/financial-permissions.test.cjs tests/audit-log.test.cjs
npm run test:ui
npm run check
```

## Live MySQL and browser check

`financial-integration.cjs` uses the database connection in `.env`. It requires permission to create/drop a temporary database, MySQL schema-copy access, Playwright, and a Chromium browser. It is opt-in and skips unless `FINANCIAL_INTEGRATION=1`.

```powershell
$env:FINANCIAL_INTEGRATION = '1'
# Set these only if Playwright or its browser is not installed in the default location:
$env:PLAYWRIGHT_MODULE = 'C:\path\to\node_modules\playwright'
$env:REPORT_BROWSER_EXECUTABLE = 'C:\path\to\msedge.exe'
node --test tests/financial-integration.cjs
```

The test creates a randomly named `smarthood_permission_test_...` database and copies table structures only. It inserts synthetic accounts and financial records, runs the real Express handlers and real SQL transactions, and exercises the officer pages in a headless browser against that API. Email delivery is stubbed. Receipt uploads use a temporary directory. Normal completion and assertion failures clean up the database and uploads; forcibly terminating the process can interrupt cleanup.

Coverage includes administrator/officer/resident/no-permission reads, `/api/data` filtering, generic CRUD and bulk write denial, dedicated management routes, resident proof submission and correction, receipt authorization, and administrator management actions. Browser checks cover officer search, status filtering, pagination visibility, billing/payment details, and absence of management controls.

Verified on 2026-10-23 with local MySQL and Microsoft Edge. This does not deploy or restart the application service.
