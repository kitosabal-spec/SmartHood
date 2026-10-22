# Server audit logging

Audit records are server written. `/api/auditLog` remains readable by administrators and active accounts with the `auditlog` permission; that permission grants no write access. All client mutation methods, including bulk replacement, are rejected before the CRUD routes. Application reset preserves existing audit history.

The existing schema and UI are retained. New `adminId` values contain the authenticated actor's actual account ID, regardless of role. The action includes the actor's actual role, operation, affected table and record ID, and a safe change summary. New timestamps are server-generated ISO timestamps. Existing timestamp parsing/search/filtering continues to support older records. Historical actor names are not reconstructed if an account was deleted; the stored ID remains visible. Older records are preserved as originally recorded, without claiming that their historical client-supplied identity was verified.

## Covered paths

- Generic single-record create/update/delete and bulk replacement: homeowners, users/accounts, billings, payments (where generic operations are allowed), payment settings, complaints, amenity bookings, vehicle registrations, lost and found, announcements, and system settings.
- Homeowner profile and photo changes, linked account registration, activation/deactivation, deletion, roles/permissions, administrator password resets, self-service password changes, and verified reset-link password resets.
- Monthly dues generation records each created billing ID. Linking an existing pending payment is a separate payment change. Repeating generation without creating/changing records does not create success entries for nonexistent changes.
- Payment proof submission/replacement, manual recording, approval, rejection, and payment-settings/QR changes.
- Dedicated announcement creation/editing/deletion/pinning and lost-and-found moderation, as well as decisions made through generic complaint, amenity and vehicle updates.
- Application reset records removed/recreated records and its system reset event without clearing audit history.

The browser's `logAction()` is a compatibility no-op for existing module callers. The audit screen refreshes from the authorized server endpoint. It cannot manufacture a local success record. Browser-only report downloads are not audit events; no server operation confirms those downloads.

## Integrity and privacy

`auditService.js` owns transaction context, actor resolution and durable writes. `saveRecord()` creates one audit entry per actual record change inside an audited transaction. Dedicated routes that use SQL directly explicitly write their event in that transaction. Manual payment and approval retain their existing locked financial transactions and write the audit entry on the same connection before commit.

Mutation responses are sent only after commit; validation failures and required audit-write failures roll back the database change. In-app notifications, outgoing homeowner emails, old-file deletion, and staged-upload claims wait for commit. Failed upload transactions remove newly uploaded files. Anonymous public lost-and-found submissions retain their existing behavior; they are not attributed to a fabricated user. Authenticated submissions and moderation are audited.

Change summaries use a value allowlist. Statuses, permissions, financial amounts and dates can be recorded; free text, personal/contact/account details, credentials, complaint content, payment references and attachment paths are redacted. Passwords, hashes, reset tokens, cookies and proof bytes are never included. The reset-link route resolves its actor from the verified token owner, even if another account has a browser session.

## Audit Log Excel export

The page header's **Export Excel** button downloads a single `Audit Log` worksheet
using the existing local ExcelJS bundle. `getFilteredAuditLogs()` is shared by the
table and export; it preserves newest-first array order and includes all matching
pagination pages. The export fetches records from `/api/auditLog` with caching
disabled, then captures the selected filters, matching records, displayed actor
names and generation time together before loading ExcelJS. A second authorized
read after generation must succeed before a download starts. Expired sessions,
denied or revoked permissions, session changes and network failures cancel the
download; cached records are never a fallback. No browser audit write is made.

Stored audit and actor IDs remain literal text. Actor names use the same current
account lookup as the screen: missing actors retain their stored ID, and an empty
actor remains `System`. Full action text and redaction markers are preserved.
Formula-like values are literal Excel strings. No additional account fields are
exported. Empty results notify without producing a workbook.

Dates use the existing `parseLogTimestamp()` behavior for compatibility: ISO
timestamps with an offset represent absolute instants; timezone-free legacy
date-times are interpreted in the browser's local timezone. Native ISO date-only
strings are interpreted as UTC by JavaScript. Legacy slash dates use the existing
month/day/year convention. The export converts parsed instants to explicitly
labeled Asia/Manila strings, preserving unparseable values verbatim. Date filters
continue using the browser's local calendar, also identified in the workbook.
Generation time and the filename always use Asia/Manila.

`public/js/audit-workbook.js` provides compact branding, teal headers, alternating
rows, text wrapping, frozen report/table headers, AutoFilter and landscape print
settings with repeated table headers and page numbers. Branding is text-only, so
no image fetch can block export. Row heights stop at Excel's 409-point limit;
exceptionally long values remain available in the cell/formula bar. Values over
Excel's 32,767-character cell limit cancel export with an error instead of silently
truncating audit text.

Run `node --test tests/audit-export.test.cjs tests/audit-log.test.cjs tests/report-exports.test.cjs`.
The export tests reopen generated XLSX bytes and check content, types, styling,
filters and print settings, alongside filter parity, pagination, empty results,
snapshot stability, duplicate clicks, account fallbacks and failure handling.

## Verification and operational follow-up

Run `npm test`. Audit HTTP regression tests use the real Express routes with an isolated transactional SQL double and temporary upload files. They cover write rejection, read permissions and legacy filters, actor spoofing, redaction, generic/bulk CRUD, dedicated decisions, financial rollback, account lifecycle, reset-token ownership, monthly generation, settings and multipart submission. Existing authentication and report tests remain included.

No live data migration is required. Deploy/restart the server to load the changes. Before production rollout, run a staging MySQL smoke test and verify the existing business and audit tables use a transactional engine (normally InnoDB); the SQL double cannot verify the installed database engine, privileges or storage behavior. Database administrators/direct SQL access remain outside the HTTP audit boundary. File deletion and email delivery are post-commit side effects and are not transactional with MySQL; a cleanup/delivery failure cannot undo the committed business/audit records.
