# Reports & Analytics tabs

Reports & Analytics remains one sidebar module. Opening it selects **Overview**. The page header, existing export-format selector, Download Report, Print Report and shared date filter remain above four horizontal tabs.

| Tab | Contents |
| --- | --- |
| Overview | Five financial cards, compact collections-versus-disbursements comparison, financial breakdown and net-cash-movement explanation. No transaction tables. |
| Collections | Existing monthly collections/analysis year, payment status counts, Collection by Billing and Homeowner Balance Report. The existing homeowners-with-activity count is retained as a short note. |
| Disbursements | Expense total/count, recorded categories, chronological monthly disbursements and paginated transaction history. No expense entry form. |
| Community Reports | Existing normalized complaint status chart and complete Complaint Summary. |

## State, data and accessibility

Tab changes only toggle the mounted panels. They do not reload the page, refetch records or rebuild tables. Search values, status filters, page sizes, current pages, the selected reporting period and the report snapshot remain intact.

The existing shared date filter still supports Today, This Week, This Month, This Year, All Time, Choose Date and Date Range. Applying a period rebuilds the report snapshot using the original date rules and preserves the active tab. Expense data is loaded through the existing authorized endpoint, with stale-response protection. Switching tabs does not issue that request again.

The navigation uses tablist/tab/tabpanel roles, linked labels, `aria-selected`, roving tab stops, Left/Right arrows, Home and End. Hidden panels are removed from display and keyboard navigation. The selected tab stays within the horizontally scrollable mobile tab strip. Transitions honor reduced-motion preferences.

All production values still come from SmartHood's existing data cache and report API. `getReportsData()`, financial calculation helpers, billing collection rates, homeowner balances, complaint normalization and expense calculations are preserved. Only approved collections and active, non-voided expenses contribute to net cash movement. Outstanding balances retain their existing rules. Net cash movement is not represented as the HOA bank balance.

## Export and print

The existing Excel and CSV workflow is unchanged. Exports use the full filtered report snapshot regardless of the selected tab or current table page. All nine Excel worksheets, including the three expense/financial worksheets, remain available; no export modal was added.

Print Report prints the selected tab with its name and reporting period. Collections and Disbursements temporarily expand their tables to the full filtered dataset for printing, then restore the original on-screen pages. Tabs, controls and pagination are hidden in print. Expense-dependent printing waits for the financial snapshot and reports an error if that data is unavailable.

## Files and verification

This UI restructuring modifies `public/js/main.js`, the report-rendering portion of `public/js/disbursements.js`, `index.html`, `tests/disbursements-browser.cjs` and `tests/report-exports-browser.cjs`. It adds scoped `public/css/reports.css`, `tests/reports-tabs.test.cjs` and this guide. Shared dashboard rendering, global theme CSS, report workbook calculations, backend routes and migrations do not require changes for this redesign.

- `npm test`: 212 passed, zero failed, five optional database tests skipped; existing UI simulations also passed.
- `node --test tests/reports-tabs.test.cjs tests/report-exports.test.cjs`: tab state, keyboard navigation, date updates, access restrictions, stale responses, full-dataset printing/restoration and export regressions passed.
- `node tests/disbursements-browser.cjs`: isolated browser tests passed at 1440px, 820px and 390px, including light/dark styling, active-panel visibility, unchanged fetch count on tab switches, searches/pagination, print styling and real nine-sheet Excel generation from every tab. Synthetic test records are used only in tests.

Deploy the updated frontend assets and clear any external asset cache if applicable. This redesign requires no database migration and changes no stored records.
