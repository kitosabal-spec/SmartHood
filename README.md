# SmartHood

Resident and HOA management application built with Node.js, Express, MySQL,
and browser JavaScript.

Canonical repository: https://github.com/kitosabal-spec/SmartHood.git

## Open the correct folder

Open `C:\Users\96656\Music\San` in VS Code. This folder is the complete
SmartHood checkout; its name does not have to match the GitHub repository.
Do not clone SmartHood into a subfolder of this checkout.

```text
San/
  index.html             Application page
  package.json           Commands and dependencies
  package-lock.json      Reproducible dependency versions
  src/                   Express API, services and configuration
  public/css/            Application styles
  public/js/             Browser modules
  public/images/         Versioned images
  public/uploads/        Runtime community media (ignored)
  private_uploads/       Protected resident files (ignored)
  data/homeowners.seed.json   Fictional development fixtures only
  migrations/            Versioned, one-time database migrations
  docs/                  Production migration and recovery runbooks
  data/backups/          Local database exports (ignored; retain for recovery)
  scripts/               Checks, utilities and maintenance commands
  tests/                 Automated tests and isolated browser fixtures
  .env                   Local configuration and secrets (ignored)
  .env.example           Configuration template
  .local-backups/        Recovery bundles (ignored)
```

## Run locally

Tested with Node.js 24.16.0 and the configured MySQL database. Keep your existing `.env`. For a new
checkout, copy `.env.example` to `.env` and configure the database, unique
session/file secrets, and email settings. For local HTTP, set
`NODE_ENV=development`, `APP_BASE_URL=http://localhost:3000`, and `TRUST_PROXY=0`.
Set `INITIAL_ADMIN_PASSWORD` to a unique password of at least 12 characters and
`INITIAL_ADMIN_EMAIL` to the first administrator's real email before initializing
a new database. Administrators can sign in with their existing username and
password. Complete [administrator email enrollment](docs/ADMINISTRATOR_EMAIL.md)
to also use email sign-in and password resets. Enrollment preserves the existing
account and username login. The preset address is never trusted as verified.
`EMAIL_DISABLED=true` disables notifications and also prevents email enrollment;
use isolated test fixtures when no real email delivery is wanted.

The repository seed must never contain real homeowner information. Import a
real production directory only through the protected operator process in
[`docs/PRODUCTION_MIGRATION.md`](docs/PRODUCTION_MIGRATION.md); import files and
migration reports are Git-ignored.

```powershell
npm.cmd ci
npm.cmd start
```

Open http://localhost:3000. Use `npm.cmd run dev` for automatic restart while
editing. Stop the server with Ctrl+C in its terminal. Do not run two server
instances on the same port. Open the page through the server, not as a local
HTML file.

## Permanent upload storage

`STORAGE_DRIVER=local` (the default) keeps development uploads on disk.
`STORAGE_DRIVER=r2` stores new uploads in a private Cloudflare R2 bucket using
the AWS SDK, with region `auto`. Set all five values from `.env.example`:
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and
`R2_ENDPOINT` (normally `https://<account-id>.r2.cloudflarestorage.com`).
Incomplete R2 configuration stops startup. Use an R2 API token scoped to
object read/write access for the intended bucket; keep it in deployment secrets.
Do not enable a public bucket, an `r2.dev` URL, or a public custom domain.
The backend uploads files, so browser upload CORS configuration is unnecessary.
See [Cloudflare's private presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/).

Install dependencies with `npm ci`. Run `npm run db:migrate` against the intended
database before deploying (normal application startup also applies migrations).
Migration `016_storage_objects` adds upload metadata without removing any existing
columns: permanent reference, provider, original filename, MIME type, and size.
R2 references are opaque keys such as `receipts/<uuid>.png`; expiring URLs are
never saved. Keep the database and bucket together when backing up or restoring.

Receipts, complaint evidence, profile photos, payment QR codes, announcements,
board photos, and lost-and-found media use the shared storage service. Existing
file filters, counts, size limits, and byte checks still apply; R2 uploads use
Multer memory storage. Resident documents have a reserved directory in this
repository but **no existing upload API, table, or UI**. The storage service
supports the `resident-documents` prefix, and the migration recognizes an optional
legacy `resident_documents.file_path` / `storage_key` table if present. No new
document workflow or public document endpoint is introduced.

Private file routes authorize the current session before returning a five-minute
GetObject URL with `Cache-Control: private, no-store`. Homeowners cannot read
another homeowner's receipts, complaint evidence, or profile files, including
accounts with legacy module permissions. Existing officer access to receipts and
complaints and administrator access are retained. Profile reads are now owner or
administrator only, as required for file privacy; HOA QR codes remain available
to authenticated users. Community media keeps its `/uploads/...` application
URLs; those public application routes redirect to short-lived signed URLs.

An audit/database rollback removes newly stored objects; replaced R2 objects are
deleted only after commit. Deletion failures retain the object and log only its
key and a safe error code, for operator retry. Like any database plus external
object store, abrupt process termination can leave an unreferenced object; review
such objects separately before cleanup. Existing local files are never
automatically removed or moved. Old private paths are read through the same
authorized routes, including files still under `public/uploads`; that directory's
private categories remain blocked from static access. Keep `STORAGE_DRIVER=r2`
when serving a database containing R2 references.

### Test one receipt before touching production files

1. Use a separate local/test MySQL database with fictional homeowner and billing
   records. Set `NODE_ENV=development`, `APP_BASE_URL=http://localhost:3000`,
   `TRUST_PROXY=0`, and `STORAGE_DRIVER=local`. Start with `npm start`.
2. Sign in as the test homeowner and submit one small PNG/JPG/WebP payment receipt
   through the normal payment form. Check the pending payment, its audit entry,
   and that the homeowner and administrator can open the receipt. Another
   homeowner must be denied access. This also checks local compatibility.
3. Create a separate **private test R2 bucket** and configure the five R2 values
   locally. Change only `STORAGE_DRIVER=r2`, restart, and replace that test receipt
   through the normal correction flow (or submit a second test payment).
4. Check that `payments.receipt` is `receipts/<uuid>.<ext>`, the corresponding
   `storage_objects` row contains metadata, and the bucket contains that object.
   The application file request should respond with a 302, `private, no-store`,
   and a signed URL with `X-Amz-Expires=300`. Check owner/admin access and denial
   for the second homeowner again. The original local receipt must still exist.
5. Run `npm run check` and `npm test`. The automated storage tests inject upload,
   audit, transaction, and verification failures without using real R2 or MySQL.

### One-time local upload migration

Back up MySQL and both upload directories first. Run from a checkout with the
actual local files and the matching database. Pause application writes during
the real migration. Built-in board portraits are application assets and are
excluded. Unreferenced files are left alone, including resident documents with
no ownership/database records; never guess their owners.

```powershell
# Preview only: no R2 credentials needed, no uploads or database writes.
npm run storage:migrate
# Or explicitly:
npm run storage:migrate -- --dry-run

# After reviewing the preview, configure R2 and explicitly confirm execution:
npm run storage:migrate -- --execute --confirm=UPLOAD_TO_R2
```

The script uses the right category prefix, verifies length and SHA-256 metadata
and downloads the uploaded object to verify its actual bytes, then updates
references and metadata in one database transaction. It locks and rereads target
records so unrelated edits are preserved. A migration lock prevents simultaneous
runs. Deterministic opaque keys and a unique legacy-reference mapping make retries
safe after interruptions; completed references are skipped and existing mappings
are verified before reuse. A failed transaction leaves local references intact;
an already uploaded object can be reused on retry. No local file is deleted.

`r2-migration-report.json` contains only object keys, stages, safe failure codes,
and counts. It is Git-ignored. Correct missing files/configuration/permissions and
rerun the same command if failures occur. Verify migrated downloads and backups
before planning a **separate** local cleanup operation; this tool has no cleanup
option. Restart the application in R2 mode after migration.

## Verify changes

```powershell
npm.cmd run check
npm.cmd test
npm.cmd run db:migration-issues
npm.cmd run db:verify
```

The database verification commands print aggregate counts only. They do not
print homeowner names, contacts, payment references, or attachment paths.

`check` verifies JavaScript syntax, local page assets, merge markers, and
nested repositories. `test` runs isolated authentication, audit, export,
FAQ, runtime and UI checks without changing the configured database or
sending real email. Tests need localhost socket access and temporary files.

Optional Chrome/Chromium checks use Playwright installed separately. Set
`PLAYWRIGHT_MODULE` to its installed module path if it is not available by
normal Node module resolution. Set `REPORT_BROWSER_EXECUTABLE` to Chrome's
executable if Playwright's managed browser is not installed, then run:

```powershell
npm.cmd run test:browser
```

These browser checks cover public pages, administrator/resident screens,
FAQ across eight size/theme combinations, and actual XLSX/CSV downloads.
API data is synthetic. They do not prove every production workflow or
external service is working.

Older integration scripts under `scripts/test-*` that are not included in
`npm test` depend on historical test accounts or write to MySQL. Do not run
them against your working database. Likewise, `clear-all-billings.js` and
`clear-empty-tables.js` are explicit maintenance utilities, not setup steps.

## Git workflow

The cleanup preserves local login-security/audit work and the GitHub main
history. It does not publish changes to GitHub.

Before committing, inspect `git status` and `git diff`. Use descriptive
commit messages. Never resolve a rejected push with a force push merely to
make it succeed: fetch and review the diverging changes first. Keep `.env`,
uploads, database exports, `node_modules`, logs, and recovery bundles out of
commits.

Recovery bundles from the cleanup are in `.local-backups/`:
`before-cleanup.bundle` contains the original root history;
`nested-smarthood.bundle` contains the removed duplicate checkout's history.
They can be cloned into a separate directory for recovery. The two existing
database exports remain in `data/backups/` but are no longer tracked. Their
old versions still exist in Git history.

See [the setup guide](BEGINNER_SETUP_GUIDE.md), [login security](LOGIN_SECURITY.md),
[audit logging](AUDIT_LOG.md), [production migration and recovery](docs/PRODUCTION_MIGRATION.md),
and [report exports](REPORT_EXPORTS.md).
