# Admin Payment Management verification

Payments derive their category from the existing billing category helper. Unlinked advance dues use `monthly_dues`. The history API supplies derived category and closed-billing metadata for records whose bill is archived. No payment category is persisted, and no migration or financial calculation changes are required.

Summary cards count matching records across all pages. Category counts respect search, status, source and dates. Dates preserve the existing payment-or-submission-date behavior. Changing a filter resets pagination; reviewing a payment retains filters and clamps the current page.

## Checks

```powershell
npm test
npm run check
node tests/payment-management-browser.cjs
node tests/billing-categories-browser.cjs
node tests/resident-billing-browser.cjs
node tests/payment-progress-browser.cjs
```

Browser scripts accept `PLAYWRIGHT_MODULE` and `REPORT_BROWSER_EXECUTABLE` for an existing Playwright installation and Chromium browser. Screenshots are written to `output/playwright/payment-management-*.png` and `payment-review-*.png` using synthetic records.

The browser check covers combined categories/search/status/source/dates, advance payments, pagination and counts, one Review action per row, modal details, required rejection reasons, duplicate click guards, read-only permissions, and light/dark layouts from 320 to 1280 pixels, including a narrower content column beside the sidebar.

## Real MySQL check

```powershell
$env:PAYMENT_MYSQL_INTEGRATION = '1'
node --test tests/payment-management-mysql.test.cjs
```

This opt-in test requires a local MySQL connection configured in `.env` and permission to create/drop a disposable database. It copies table structures only, recreates the financial summary view, and inserts synthetic records. All mutation requests target the disposable schema, emails are stubbed, and cleanup removes the test database and temporary uploads. It checks category inheritance (including archived bills), manual/partial balances, overpayment rejection, required rejection reasons, permissions, concurrent duplicate approvals, approval/rejection races, audit counts, and the SQL financial balance view.

Verified November 10, 2026: the standard suite passed 258 tests with 10 optional tests skipped before the new opt-in MySQL test was added; all UI simulations, all four browser scripts above, and the dedicated MySQL check passed. The older optional `financial-integration.cjs` cannot seed its legacy `hoa_officer` role under the current `chk_users_role` constraint; this change leaves that unrelated test and role rules untouched. The new MySQL check uses current administrator and homeowner roles.
