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
