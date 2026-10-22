# Reports & Analytics exports

Audit Log has its own **Export Excel** action and single-sheet builder in
`public/js/audit-workbook.js`, sharing the ExcelJS loader and Reports palette.
See [AUDIT_LOG.md](AUDIT_LOG.md#audit-log-excel-export) for filtering, authorization,
timestamp assumptions and verification. It does not change financial exports.

The Administrator report now offers **Excel (.xlsx)** and **CSV (.csv)** next to
Download Report. Restart the Node server after installing dependencies with
`npm ci`, then reload the page.

## Implementation and dependency

- `public/js/main.js`: shared report snapshot and balance-filter helpers;
  rectangular CSV generation; safe text handling; period-based filenames;
  asynchronous Excel download, notifications, access checks, and audit logging.
- `public/js/report-workbook.js`: the six styled worksheets, branding/logo,
  Manila generation timestamp, numeric peso formats, text identifiers, filters,
  frozen headers, print settings, and reconciliation explanations.
- `index.html`: load the workbook builder and update the main-script cache key.
- `src/app.js`: serve only ExcelJS's browser bundle at
  `/public/vendor/exceljs-4.4.0.min.js`. No `node_modules` directory is exposed.
- `package.json` and `package-lock.json`: pin `exceljs` to `4.4.0` and lock its
  dependencies. The browser bundle loads on demand; no CDN or build step is
  required. The small workbook builder loads with the existing scripts.
- `tests/report-exports.test.cjs` and `tests/report-exports-browser.cjs`: synthetic
  calculation/file tests and optional real-browser download integration tests.

ExcelJS produces actual OOXML XLSX files and supports the required styling and
print metadata: <https://github.com/exceljs/exceljs#readme>.

The npm advisory check reports a moderate transitive `uuid` advisory through
ExcelJS (`GHSA-w5hq-g745-h8pq`, supplied buffers in v3/v5/v6). This export does not
use those APIs or conditional formatting; ExcelJS's conditional-formatting code
uses v4. The pinned upstream browser bundle is unchanged. Other existing project
advisories were not repaired as part of the export work.

## Preserved financial rules and differences

No financial rules were changed to make totals agree. Summary uses the same
calculations as `renderReports()`. Financial Collections and CSV retain the old
collection-export calculations. The Summary worksheet quantifies their
differences for the exported snapshot and explains the causes.

| Topic | Existing behavior retained |
| --- | --- |
| Billed | Page Summary sums billing amount × assigned homeowners. Financial Collections additionally treats approved unlinked monthly-dues advances as both billed and collected. |
| Collected | Summary includes all approved payments in the period. Financial Collections includes approved payments linked to selected billings plus unlinked monthly-dues advances. A payment reviewed this period for a billing created outside it can appear only in Summary. Unlinked non-dues payments likewise appear only in Summary. |
| Outstanding | Summary clamps the period-wide billed-minus-collected result to zero. Financial Collections clamps each billing before summing. Homeowner Balances rounds and clamps per homeowner and uses only payments linked to selected billings. Overpayments and advance dues can therefore produce different totals. |
| Partial payments | Approved partial amounts count as collections. A homeowner remains in the not-fully-paid billing-account count until `getBillingPaymentSummary()` reports paid. |
| Homeowner counts | Summary counts distinct current homeowner records with billing assignments or payments of any status in the selected period. Financial account counts repeat a homeowner for each billing or advance month; the labels explicitly identify these as billing accounts. |
| Monthly chart | Date filtering happens first. Allocation prefers `monthly_dues_month`, otherwise payment date, reviewed date, then submitted date. The report's derived analysis year can differ from the dashboard's saved year or the payment review year. |
| Complaint statuses | The four exported statuses match the page legend, including legacy `Open` normalized to `Reviewed`. Unknown statuses can be counted by the page donut center but not its legend; the worksheet identifies the difference. |

For example, the synthetic regression fixture has Summary billed **PHP 250**,
collected **PHP 285**, and outstanding **PHP 0**. The legacy financial schedule
has billed **PHP 290**, collected **PHP 260**, and outstanding **PHP 60**.
Unlinked advances add PHP 40 to schedule billed; PHP 25 of approved payments
are outside its billing scope; per-billing clamping differs from global netting.
Homeowner balances sum to PHP 30. Three paid billing-account occurrences belong
to only two active homeowners. These are deliberately retained differences.

## Dates, filters, text, and downloads

- Billings use `createdAt`, then `dueDate`; payments use `reviewedAt`,
  `payment_date`, `submittedAt`, then `createdAt`; complaints use `dateFiled`,
  `createdAt`, then `dateOfOccurrence`.
- Range boundaries and date parsing remain browser-local, exactly as on the
  page. Only the generation timestamp is explicitly Asia/Manila. Changing the
  page's date semantics would be a separate business change.
- Exports use the displayed report snapshot, not paginated table rows. The
  balance worksheet applies the same name/username/email/block/lot search and
  status filter, records both filters, and includes every match. Its clearance
  status is period-specific, not an independent all-time clearance certificate.
- Currency cells in XLSX are numbers with peso/two-decimal formatting; counts
  are integers. IDs, block/lot values, and user text are string cells, never
  formula objects. Individual payment reference numbers are not included in
  these aggregate schedules.
- CSV contains one header, financial rows, and one totals row, all seven
  columns wide, with a UTF-8 BOM and CRLF record endings. Quoting handles commas,
  quotes, and embedded line breaks. Currency values have two decimal places.
  Formula-like text and identifiers receive an apostrophe text marker. Some CSV
  readers display that marker: CSV has no portable cell-type metadata. XLSX
  preserves the original text exactly without the marker.
- Empty financial/balance worksheets say no matching records; CSV keeps headers
  and zero totals and displays an empty-results download notification.
- Exports retain permission checks and audit/download notifications; Excel
  rechecks access after asynchronous serialization. Failed generation restores
  the button. Exporting is read-only; it no longer repeats the page's unrelated
  balance synchronization write. Page synchronization remains unchanged.

## Verification

Run `node tests/report-exports.test.cjs`. It exercises partial payments,
overpayments, unlinked advances, out-of-period billings, repeat homeowners,
year allocation, both balance filters, pagination, empty results, access denial,
permission revocation during generation, write failure, download/audit callbacks,
CSV escaping/BOM/rectangularity, and XLSX write/read retention of all six sheets,
numeric/text types, logo, colors, pane/filter settings, and print metadata.
Synthetic files are saved to the OS temporary directory, or to
`REPORT_TEST_OUTPUT` if set. No production financial records are needed.

For a real browser integration test, use the same `REPORT_TEST_OUTPUT`, supply
an available Playwright install with `PLAYWRIGHT_MODULE` if needed, and optionally
set `REPORT_BROWSER_EXECUTABLE` to Chrome/Chromium. Run
`node tests/report-exports-browser.cjs`. It starts an isolated localhost server,
renders the report controls using synthetic data, downloads both formats,
reopens XLSX, checks the active balance filter and embedded logo, and verifies
audit callbacks. It does not connect to the application database.
Both export test scripts passed on this host, including actual Chrome downloads.

The existing revenue-year persistence test passes. Two existing test failures
were reproduced against the original `HEAD` version of `main.js`: three billing
search checks use homeowner fixtures in `users` instead of `homeowners`, and the
payment-date test fails because `getHomeownerById` is absent from its harness.

Native application verification remains incomplete on this host: Excel desktop
automation failed with window-targeting/geometry errors before the sample could
be opened, and LibreOffice is not installed. OOXML/style round-trip checks are
not a substitute for those native checks. Before official distribution, open a
download in Excel and LibreOffice and check all six tabs, peso/text formatting,
filters/frozen rows, and print preview (orientation, repeated row 7, page numbers,
and no clipped text). No native compatibility claim is made by these tests.
