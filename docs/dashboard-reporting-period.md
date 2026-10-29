# Administrator Dashboard reporting period

This enhancement is confined to `renderAdminDashboard()` and its scoped CSS.
It reads the existing `db` API cache and does not save, delete, or rewrite records.
The filter lives in memory for the current browser page session and survives SPA
navigation. Reset clears its dates and restores All Time. Existing routing,
permissions, homeowner dashboard, six-card arrangement, and revenue-year storage
are unchanged.

The header shows a single filter icon button. Clicking it opens a compact panel
containing Period, Reset, and the custom-date controls. Escape or an outside click
closes the panel; applying a selection closes it and returns focus to the icon.

## Date policy

All Time includes every record, including records without a valid date. Restricted
periods exclude records without a usable date for the relevant metric.

- This Week covers Monday through Sunday, including weeks crossing months or years.
- This Month and Last Month cover complete calendar months; This Year covers
  January 1 through December 31. The current calendar date is determined in the
  Philippines (UTC+08:00), independently of the browser's timezone.
- Custom ranges require both real `YYYY-MM-DD` dates and From <= To. A single-day
  range is valid. An invalid draft leaves the applied filter and results unchanged.
- Both endpoints are inclusive. Offset-bearing ISO timestamps are converted to
  Philippine dates. Date-only strings and timezone-less SQL/ISO timestamps are
  interpreted as Philippine local dates/times. Impossible dates, invalid times,
  missing values, and ambiguous formats such as `10/11/2026` are rejected.
- No creation/submission dates are inferred from another field. Recent lists use
  the specified date, descending, with undated/invalid records last in All Time.
  Same-date payment and complaint order remains stable; billing ties retain
  descending IDs. Limits remain five billings, five payments, four complaints.

| Display | Scope/date |
| --- | --- |
| Total Homeowners | Current total, unaffected by Period |
| Total Collected | Currently approved payments; first valid `payment_date`, `verified_at`, `reviewedAt`, then `submittedAt`; sum actual payment amounts, including partial payments |
| Total Billed | `createdAt`; retains `getBillingTotal()` and assigned-homeowner multiplication |
| Outstanding Balance | Current API/cache balance, unaffected by Period |
| Pending Payments | Currently pending records with `submittedAt` in period |
| Reviewed Complaints | Currently normalized Reviewed records with `dateFiled` in period; not the number of review actions during the period |
| Payment Status | Records with `submittedAt` in period; their current Approved/Pending/Rejected status determines segments, counts and total |
| Recent Billings / Payments / Complaints | `createdAt` / `submittedAt` / `dateFiled` respectively |

`src/app.js` maps all four payment dates without renaming them. Manual administrator
payments store the chosen transaction date in `payment_date`, `submittedAt`, and
`reviewedAt`, while `verified_at` records the later entry/verification instant.
Resident submissions store `payment_date` separately from submission; approval
sets `verified_at` and `reviewedAt`. Thus a valid `payment_date` takes precedence
even when verification happened later. For legacy records without it, verification,
review, and submission dates are documented proxies, in that order, rather than
claims that an exact transaction date is known. The UI tooltip describes this order.
The dues month is never used for Total Collected.

Some existing server paths store UTC-truncated date-only submission/review values.
Their lost time/offset cannot be recovered. This filter respects the recorded date
instead of guessing or rewriting it. Explicit timestamps do receive UTC+08 conversion.

The homeowners API already supplies balances from `homeowner_financial_summary`.
The previous dashboard render called `syncHomeownerBalances()`, which could write
homeowner records. That call is removed from this dashboard so reporting is read-only;
the summary continues to use the current supplied balances.

## Monthly Revenue investigation

`buildMonthlyRevenueData()` in `public/js/main.js` deliberately gives
`monthly_dues_month` priority over financial dates. For non-dues records it uses
`payment_date || reviewedAt || submittedAt` and the existing date conversion.
For example, an approved October 2026 payment for January 2027 dues appears in
October's Total Collected but January 2027's Monthly Revenue bar. Consequently,
the existing chart represents allocation to dues periods for those records, and
is not a pure cash-receipts chart. This enhancement preserves that behavior and
describes the independent year scope and billing-month grouping in the chart title's tooltip.
Its dropdown, previous/next buttons, and localStorage keys remain intact.

## Verification

- `node --test tests/dashboard-period.test.cjs`: covers all six options, Philippine
  midnight/month/year boundaries, leap days, invalid/missing dates, inclusive
  custom endpoints, field precedence, partial payments, assigned billing totals,
  unchanged current balances, zero results, list limits/order, navigation state,
  independent revenue persistence, and read-only/repeated rendering.
- `node tests/dashboard-period-browser.cjs`: optional Playwright integration using
  actual page assets and isolated API fixtures. Rejects writes; checks controls,
  validation, donut totals, navigation, year buttons/dropdown, mobile table labels,
  Reset, homeowner isolation, and no horizontal overflow at 320/390/768/1024/1440px
  in both themes. Uses a Los Angeles browser timezone to detect timezone dependence.
  Like the existing browser tests, accepts `PLAYWRIGHT_MODULE` and
  `REPORT_BROWSER_EXECUTABLE`. Optional `DASHBOARD_SCREENSHOT_DIR` saves screenshots.
- `npm test`: 188 passed, four opt-in tests skipped, zero failures; existing UI
  simulations also passed, including revenue-year persistence and payment filters.
- `npm run check`: project JavaScript syntax and asset checks passed.

Browser fixtures are test-only. Production rendering continues to use actual API
data; no live database changes or migrations are required.
