# Billing deadlines

The Create Billing form (Monthly Association Dues or Other Billing, including
amenity charges) and Generate Monthly Dues form offer a date or **No due date**.
Monthly dues still require a billing month, independently of the deadline.

## Request contract

- Manual creation: send a valid `dueDate` in `YYYY-MM-DD`, or
  `{ "noDueDate": true, "dueDate": null }`.
- `POST /api/billings/generate-monthly-dues`: also send `month` in `YYYY-MM`.
  An explicit `noDueDate: true` saves no deadline. For compatibility, an omitted,
  null, or empty date without that explicit choice still defaults to month-end.
- `noDueDate` must be a boolean. A date and `noDueDate: true` together are rejected.
  Invalid calendar dates are rejected before writes.
- Missing manual dates require the explicit choice. Existing undated bills can
  receive unrelated updates without having a deadline added.

`noDueDate` is request-only. The existing `dueDate` and `due_date` columns both
store SQL NULL for no deadline; a new sentinel value or schema migration is not
needed. Existing rows are not rewritten. Changes to a deadline synchronize both
columns. `monthly_dues_month` and billing assignments retain the billing period
and existing duplicate protection.

An undated billing contributes to outstanding balances and accepts partial or
full payments as usual. It is never overdue. Billing and payment views and new
billing notifications display **No due date**. Financial CSV and Excel exports
include an appended Due Date column; advance payments without a billing are
labelled separately.

Focused coverage: `node --test tests/billing-deadline.test.cjs tests/report-exports.test.cjs`.
