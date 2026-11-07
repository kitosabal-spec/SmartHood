# Homeowner accounts and opening balances

Migrations 019 and 020 implement the requested one-time reset. Migration 019
creates audit storage and historical account/billing markers. Migration 020
contains only transactional data changes; its migration ledger entry commits
with the reset. Restarting the server does not reset new registrations or bills.

Resident-only accounts are archived, their credentials and reset tokens removed,
and their original homeowner links retained in `historical_homeowner_id` and
`homeowner_reset_audit`. User IDs remain intact for comments, reactions,
notifications, payments and audit references. Register Account creates a new user
ID, so previous signed sessions remain invalid permanently. The existing frontend
reloads the server data after registration and displays Registered only after
success.

Legacy HOA officers also use `role = 'homeowner'`. Accounts with any management
permission are protected, as are administrators and other roles. Protected
officers continue to display Registered. Only accounts with resident-only or
legacy `ho-*` permissions are retired; unknown permission formats are preserved.

All existing billing assignments are archived, and their billing records are
archived and marked `balance_reset_at`. Original amounts, monthly uniqueness
keys, and payment records are retained. Monthly generation recognizes cleared
months and does not recreate them. API guards prevent editing archived bills,
restoring their assignments, submitting payments, or approving old pending
payments against them. New charges for new periods work normally.

Balances are read from `homeowner_financial_summary`; browser calculations can
no longer write balances into profiles. All cached homeowner balances are reset
to zero. Payment history retains original billing titles and amounts and labels
cleared obligations as Balance Cleared, without recording fictitious payments.
Old payment statuses, receipts, transaction records, and existing audit entries
are unchanged. Historical comment authors still resolve through the saved link.

Before applying this to another database, stop application writers and run:

```powershell
node scripts/reset-homeowner-opening-state.js --apply
```

This creates a full, git-ignored backup under `.local-backups`, applies the
migrations, compares preserved records, and verifies zero balances and migration
idempotency. Backups contain private database data and credentials and must stay
private. The wrapper refuses to reset again after migration 020. To repeat the
immediate post-reset comparison without resetting data:

```powershell
node scripts/reset-homeowner-opening-state.js --verify <backup-directory>
```

Do not use that comparison after legitimate new transactions or registrations:
it deliberately expects the immediate reset state. Do not remove the migration
ledger entry or rerun 020 manually. Recovery requires a controlled restore from
the backup; do not automatically reactivate old credentials.

Validation: `npm test`, `npm run check`, and the isolated local MySQL test:

```powershell
$env:TEST_LOCAL_MYSQL = '1'
node --test tests/homeowner-reset-mysql.test.cjs
```
