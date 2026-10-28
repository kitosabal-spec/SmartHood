# Loading performance review — 28 October 2026

Local work is ready for review. Nothing was deployed or pushed, no hosting settings
were changed, and no production records were written. The starting checkout was
clean at `73f679366d71f51bda891998fd5bb7ca218db820`. No applicable `AGENTS.md` was found
in the project or its parent directories. Existing financial writes, permissions,
file authorization, audit handlers, and migrations were retained.

## What was causing the waits

| Finding checked against the starting code | Evidence |
| --- | --- |
| Startup waits for session and then data | `init()` awaited `/api/session`, then the complete public or authenticated load, before removing the startup overlay. |
| Login loads the complete shared cache | `handleLogin()` awaits `/api/data` before opening the application. This is still required by cross-page dependencies below. |
| Authenticated record groups load sequentially | `loadAllData()` awaited 15 table groups in order. Users and homeowners separately read the same financial-summary view. |
| The public request is slow despite being small | One unauthenticated live GET returned **1,909 bytes in 2.266 seconds**, with first byte at 2.265 seconds. This is a baseline observation, not an after-deployment measurement. |
| Public table reads are already parallel | `/api/public-data` already uses `Promise.all`. The sequential-group finding applies to `/api/data`, not this public endpoint. |
| The hero image is oversized | The referenced `IMG Sat.png` is 2,342,987 bytes, 1543 × 613 pixels. The frequently used logo is another 475,051 bytes. The other large PNGs are not referenced by the current page/scripts/styles and were left alone. |
| Notifications poll every five seconds per tab | An unconditional `setInterval` ran during slow requests and while a tab was hidden. |
| Some public-board reads are redundant | An already-loaded empty array was treated as “not loaded,” causing another `/api/board` request. |
| Compression already works in production | The live `main.js` response was Brotli encoded, 48,429 transferred bytes, 0.205 seconds total; headers showed `Cache-Control: public, max-age=0`. No application compression dependency was added. |

The live response headers identify Render/Cloudflare, but do **not** establish the
service's compute plan. A 2.27-second response alone does not prove a cold start.

## Changes and their boundaries

- **Images:** Added a lossless WebP hero (1,443,150 bytes, **38.4% smaller**) and a
  losslessly recompressed PNG logo (381,494 bytes, **19.7% smaller**). Dimensions,
  visible pixels, transparency and layout are unchanged. Together these save
  **993,394 bytes** for these two assets. Both originals remain in the repository.
  An initial WebP logo was rejected after a browser screenshot comparison found
  small alpha-rendering differences; the final PNG passes exact screenshot equality.
- **Database reads:** Three workers load the same table groups through the existing
  permission filters. A request-local promise shares the identical homeowner summary
  between the users and homeowners loaders. Nothing is cached across requests or
  users. Audited transaction callers still use one sequential worker. Financial
  formulas, assignment scoping, archive filters, private-file presentation and all
  15 result keys remain intact. A failed group fails the response instead of
  returning a partially populated financial cache.
- **Requests:** Concurrent public loads share one pending request. Empty board
  results are accepted as loaded. Post-mutation financial reloads are retained:
  `syncHomeownerBalances()` can write records, so removing its following reload
  would need a separate financial review.
- **Startup:** After session verification says the visitor is signed out, the
  public page and login become usable while community records load. Protected
  startup and successful login still wait for authentication and the full data
  cache. A public-data failure no longer replaces the whole public page; it reports
  the failure while keeping login available.
- **Session races:** Late public/full-data/notification responses cannot repopulate
  a changed session. Late authorization failures cannot sign out a newer session.
  Logout clears protected cache entries and comment-cache records as well as the
  existing protected DOM cleanup; only publicly visible community data is retained.
- **Notifications:** At most one notification request runs at a time. The next
  automatic request starts five seconds after completion. Hidden tabs stop starting
  requests; returning to a visible tab refreshes once. An already-running request
  may finish. Visible tabs still poll independently; no cross-tab leader or server
  push system was introduced.
- **Caching:** HTML stays `no-store`. Its bundled CSS/JS/image URLs receive content
  hashes automatically. Only matching hashes or verified fingerprinted filenames
  get a one-year public immutable cache policy. Unversioned/wrong-version requests
  must revalidate. New file contents produce new URLs. Runtime uploads do not use
  the new policy. A common API middleware applies `private, no-store` before routes
  and JSON parsing; existing stricter no-store headers remain. Existing upload
  authorization and private signed-link behavior are unchanged.

## Shared-cache dependency review

Page-by-page loading was considered and deliberately deferred. Several screens
read cached records synchronously, and the sidebar calculates other pages' badges
even when those pages are not open. Replacing the cache with one page of records
would silently change totals and available actions.

| Feature or consumer | Required cache/dependencies retained |
| --- | --- |
| Session restoration, routing, role menus, current-user refresh, profile/avatar and account management | `users`, linked `homeowners`; role/permission data from the verified server session. Profile edits also update both cached groups. |
| Resident directory, homeowner detail modals, registration/account linkage and balance filters | `homeowners`, `users`, `billings`, `payments`, `complaints`; shared homeowner lookup helpers are also used by operational modules. |
| Administrator/resident dashboards, collection trends, recent activity and resident account summaries | `homeowners`, `users`, `billings`, `payments`, `complaints`, `announcements` and the shared financial helpers. |
| Billing list/details/create/edit/archive, monthly dues, assigned-homeowner names and status calculations | Complete authorized `billings`, `payments`, `homeowners`, `users`, `appSettings`; approvals/pending payments influence status. |
| Pay Now, partial/advance payments, payment history, payment details/receipts and management | `billings`, `payments`, `homeowners`, `users`, `appSettings`, `payment_settings`; dedicated payment-settings API remains in use too. |
| Reports, date/year filters, collection totals, homeowner balances, complaint summaries, CSV/XLSX exports | Complete authorized `billings`, `payments`, `homeowners`, `users`, `complaints`; exporters consume report snapshots produced from those records. |
| Complaints, amenity bookings, vehicle registrations and lost/found management/resident views | Their respective `complaints`, `amenityBookings`, `vehicleRegistrations`, `lostFound` arrays, plus homeowner/account lookup helpers and relevant status/financial links. |
| Amenity availability and booking validation UI | Separately fetched `amenityAvailability` and `amenityAvailabilityRules`, alongside `amenityBookings`. These must not be replaced with just the current resident's bookings. |
| Public/signed-in announcements, search, authors, comments and reactions | `announcements`, `users`; comment/reaction counts and comment threads also use dedicated APIs and separate client caches. `announcement_comments` remains in the full payload even though current thread rendering uses the dedicated cache/API. |
| Public lost/found and board, board administration and term display | Public subset of `lostFound`, `board_of_directors`, `board_current_term` from public-data and/or `appSettings.boardCurrentTerm`; board mutation refreshes are retained. |
| Notification list, unread badge, toast detection, dismiss actions | `notifications`, current account/role/homeowner identifiers and per-user seen IDs. Existing audience/dismiss filters remain. |
| Sidebar badges across pages, including pages not currently open | `users`, `homeowners`, `billings`, `payments`, `complaints`, `amenityBookings`, `vehicleRegistrations`, `lostFound`, `announcements`, `auditLog`, plus per-user seen IDs. |
| Audit list and exports | `auditLog` participates in badges; list/export flows still refresh/re-authorize through `/api/auditLog`. No authorization fallback to stale cache was added. |
| Settings, dues rate, board term and payment QR/account settings | `appSettings`, `payment_settings`, current-user data; dedicated settings APIs and their permissions remain. |
| FAQ, legal pages, navigation and theme | Mostly static content; use current authentication/permissions and theme state, not a partial financial dataset. |

A future page-loading change would first need explicit aggregate/badge endpoints,
complete financial/report query contracts, and cache freshness rules after every
mutation. The existing paginated endpoint is insufficient by itself for these
cross-page consumers.

## Measurements and checks

**Real local database, reads only:** `scripts/measure-data-reads.cjs --read-only
--explain` connected to the configured local database without importing app startup,
running migrations, or writing records. It emitted only timings, row counts and
safe query-plan fields. Connection/first SELECT: 359 ms; warm SELECT: 1 ms;
announcements: 29 ms; lost/found: 16 ms; board: 6 ms; term setting: 7 ms;
homeowner summary: 59 ms for 722 rows. The summary plan used indexed joins for
assignments/billings and scanned the small payment input (14 estimated rows).
This did not justify speculative indexes or a rewritten financial view. It does
not describe the production database's region, pool waits or query plans.

**Local before/after comparison, synthetic data:** The original app source at the
baseline commit and current source ran through the same HTTP fixtures with 30 ms
of artificial latency per database query. Full JSON payloads compared equal,
including record visibility and balances, for all three roles below.

| Synthetic account | Before | After | SQL reads before → after | Financial summary reads |
| --- | ---: | ---: | ---: | ---: |
| Administrator | 820 ms | 261 ms | 19 → 18 | 2 → 1 |
| Resident | 653 ms | 233 ms | 17 → 17 | 1 → 1 |
| Officer with billing/payments/complaints | 496 ms | 171 ms | 16 → 15 | 2 → 1 |

Peak concurrent SQL reads in that fixture were five (admin/officer) and three
(resident). These measurements demonstrate reduced serial waiting, **not** a
prediction of production latency. The ten-connection pool remains unchanged.

Validation completed:

- `npm run check`: 122 JavaScript files parse; referenced assets exist; no merge
  markers or nested repositories.
- `npm test`: **178 passed, 0 failed, 4 skipped** out of 182 tests, plus the existing
  UI simulation scripts. The four opt-in real-MySQL migration/amenity tests were
  not enabled. Authentication, financial permissions/calculations, uploads/storage,
  reports and audit regressions are included in the passing suite.
- Nine focused loading/cache regression tests cover overlap, hidden tabs, retry,
  late session responses, request-local financial reads, complete payload keys,
  failed reads, private caching, asset version invalidation and scheduler parity.
- `npm run test:browser`: passes in headless installed Chrome with synthetic APIs.
  Covers 24 administrator/resident views, role denial, profile escaping, audit
  chronology/search/pagination/export, FAQ at 320/375/768/1440 pixels in both themes,
  delayed startup and login, logout cleanup, exact rendered hero/logo comparisons,
  and actual XLSX/CSV downloads with financial/filter assertions. The existing smoke
  fixture needed one missing `/api/amenity-availability` mock; product availability
  code was not altered.
- `git diff --check`: passed.

After the final adjustment to share one hero-image URL between CSS and HTML, the
nine focused tests and startup/image browser checks were rerun and passed. Command
logs are retained locally in `.local-backups/loading-performance-2026-10-28/`
(Git-ignored).

Reproduce without running the real application:

```powershell
npm.cmd run check
npm.cmd test
node scripts/benchmark-loading.cjs 73f679366d71f51bda891998fd5bb7ca218db820
# Browser checks need Playwright and Chrome; set PLAYWRIGHT_MODULE and
# REPORT_BROWSER_EXECUTABLE if they are not installed in their default locations.
npm.cmd run test:browser
# Optional SELECT/EXPLAIN-only diagnostic of the configured database:
node scripts/measure-data-reads.cjs --read-only --explain
```

Image regeneration is optional: `node scripts/optimize-public-images.cjs` uses
`SHARP_MODULE` (or an installed `sharp`) and verifies decoded pixels before writing
new fingerprinted assets. No new runtime package is required.

## Remaining risks and unverified behavior

There has been **no production after-measurement** because this work has not been
deployed. Production login, payments, uploads, external email/R2 and real concurrent
usage were not exercised. The tests provide evidence for the covered behavior,
not a guarantee that every workflow or browser cannot break.

The complete authenticated dataset is still loaded. Its size and the unpaginated
audit/notification collections can remain a scaling limit. Three concurrent table
workers can increase database contention under heavy traffic; monitor pool/query
latency during a later reviewed rollout. Visible tabs still poll separately.
As before, a full GET does not take one database transaction snapshot across all
tables, so other users' edits can occur during the load.
Modern browsers support WebP; legacy clients outside the tested Chrome environment
have not been checked.

The live public-data bottleneck is still not isolated. Server-side production
query/pool timing and service/database region information would be needed to
distinguish database latency from hosting/network overhead. Compression was already
working and was left in place. If this is a Free web service, Render documents
spin-down after 15 minutes idle and a wake-up of about one minute; client changes
cannot eliminate that wait. The actual plan remains unconfirmed. See
[Render's Free service documentation](https://render.com/docs/free#spinning-down-on-idle).

## Rollback

No schema, data or hosting rollback is needed. Originals remain available.
Before undoing code, save any changes made after this review. Restore **only these
tracked files** from `73f679366d71f51bda891998fd5bb7ca218db820` using the review UI or
`git restore --source=<that SHA> -- <file paths>`:

`index.html`, `package.json`, `public/css/style.css`,
`public/js/board-of-directors.js`, `public/js/main.js`, `src/app.js`,
`src/controllers/pageController.js`, `tests/browser-smoke.cjs`,
`tests/database-architecture.test.cjs`, `tests/helpers/auth-fixture.cjs`.

Move the newly added files listed below into a local backup directory (or remove
only these files after saving them):

- `public/images/entrance.72d14dc29d8dbaa7.webp`
- `public/images/smarthood-logo.3da4610d563b231c.png`
- `src/utils/publicAssetCache.js`
- `scripts/optimize-public-images.cjs`
- `scripts/measure-data-reads.cjs`
- `scripts/benchmark-loading.cjs`
- `tests/loading-performance.test.cjs`
- `tests/loading-browser.cjs`

This review document may be retained. Restart the local server and rerun the
baseline checks. Restored HTML references the original images and old asset URLs,
so the new immutable-cache URLs will not be reused. Do not use `git reset --hard`,
database reset endpoints or maintenance deletion scripts for this rollback.
