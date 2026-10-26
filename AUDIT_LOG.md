# Server audit logging

Audit records are server written. `/api/auditLog` remains readable by administrators and active accounts with the `auditlog` permission; that permission grants no write access. All client mutation methods, including bulk replacement, are rejected before the CRUD routes. Application reset preserves existing audit history.

New `adminId` values contain the authenticated actor's actual account ID, regardless of role. The action includes the actor's actual role, operation, affected table and record ID, and a safe change summary. New timestamps are server-generated ISO timestamps. Existing timestamp parsing/search/filtering continues to support older records. Event-time `actor_name` snapshots take priority over current account names. Older records without a snapshot fall back to the current account name or stored ID; missing historical identities are not invented. Older records are preserved as originally recorded, without claiming that their historical client-supplied identity was verified.

The audit table and Excel export explicitly sort by parsed event time, newest first, with IDs used only to break timestamp ties. Unparseable legacy timestamps appear last, unchanged. Database row order and random migration IDs are not chronological. The page shows readable event titles and meaningful details: statuses, amounts, dates, permissions and booking information. Creation shows the recorded values; updates show meaningful before/after changes. Empty-to-empty fields and repeated redaction markers are omitted from the presentation. Changes to protected values are described without revealing their contents, such as "Private details changed" or "Attachments changed". Reference IDs are expandable. The original immutable action text remains stored for investigation; it is not shown as a technical paragraph on the page or copied into the normal report. Unrecognized historical messages remain literal text rather than receiving an invented interpretation.

Dates are formatted in the browser's timezone, explicitly named above the table; the raw timestamp remains in the tooltip. Date-picker defaults and filters use that same local calendar. Migration events remain visible as historical system activity with a readable explanation of the recorded repair, even after the underlying issue has been resolved. No historic amenity, time, personal value or outcome is reconstructed from current records.

Audit reads use `Cache-Control: private, no-store`. A failed page refresh clears stale audit content. Audit IP addresses use Express's `req.ip` and its configured trust-proxy boundary rather than trusting a raw `X-Forwarded-For` header.

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

Change summaries use a value allowlist. Statuses, permissions, financial amounts, dates, the system's predefined amenities and valid HH:MM booking times can be recorded; free text, personal/contact/account details, credentials, complaint content, payment references and attachment paths are redacted. Passwords, hashes, reset tokens, cookies and proof bytes are never included. The reset-link route resolves its actor from the verified token owner, even if another account has a browser session.

## Audit Log Excel export

The page header's **Export Excel** button downloads a single `Audit Log` worksheet
using the existing local ExcelJS bundle. `getFilteredAuditLogs()` is shared by the
table and export; it sorts by event time newest first and includes all matching
pagination pages. The export fetches records from `/api/auditLog` with caching
disabled, then captures the selected filters, matching records, displayed actor
names and generation time together before loading ExcelJS. A second authorized
read after generation must succeed before a download starts. Expired sessions,
denied or revoked permissions, session changes and network failures cancel the
download; cached records are never a fallback. No browser audit write is made.

Stored audit and actor IDs remain literal text. Actor names use the same event-time
snapshot and legacy account fallback as the screen. `system:migration` displays as
`Database migration`; missing actors retain their stored ID, and an empty actor
remains `System`. Action / Event uses the same readable title and meaningful
details as the page. Record ID is a separate seventh column; Audit Log ID and
Actor Account ID remain available for traceability. The original technical action
remains in the database rather than in the normal report.
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

`npm run test:browser` also checks populated audit records, chronological pagination, actor snapshots, readable details, escaped reference IDs, XLSX download contents, and desktop/mobile layouts. The opt-in `TEST_LOCAL_MYSQL=1` migration test uses randomly named disposable local schemas to verify real InnoDB business/audit commit and rollback, immutable audit UPDATE/DELETE triggers, legacy migration recovery and repeated startup. It never uses the application's `.env` database.

No live data migration is required. Deploy/restart the server to load the changes. Before production rollout, run a staging MySQL smoke test and verify the existing business and audit tables use a transactional engine (normally InnoDB); the SQL double cannot verify the installed database engine, privileges or storage behavior. Database administrators/direct SQL access remain outside the HTTP audit boundary. File deletion and email delivery are post-commit side effects and are not transactional with MySQL; a cleanup/delivery failure cannot undo the committed business/audit records.
