# Background email delivery

SmartHood records encrypted email jobs in `email_outbox` using the same MySQL
transaction as the business change. Only committed jobs are visible to workers.
SMTP outages no longer hold up billing, payments, complaints, booking/vehicle/
lost-and-found status updates, password reset or administrator verification.
Recipients, message templates, escaping, SMTP/TLS settings and permissions remain
in their existing services. Login security alert claims and queue inserts commit
together, preserving account cooldowns.

## Deploy

Follow the existing migration backup/review runbook. Migration **023** adds only
the outbox table; it does not rewrite accounts or financial data. Review all other
pending migrations before starting an older installation. This implementation
does not apply migrations to the configured application database.

Set `EMAIL_QUEUE_SECRET` to a strong, persistent random secret on every instance.
If absent, the configured `SESSION_SECRET` is used. Do not rotate that key while
pending/failed jobs need delivery: AES-256-GCM content cannot be decrypted without
the original key. Keep the key separate from database backups. Startup fails with
a configuration error if email is enabled and neither persistent key is set.

`npm start` starts the worker after successful initialization/migration. Every
instance may run a worker: conditional claims, five-minute leases, 30-second lease
renewals and fenced updates coordinate delivery. Each instance sends sequentially
and processes up to ten jobs per polling cycle (one second when idle). There is no
Redis dependency. The enrollment CLI also starts a worker after committing its
verification request. Graceful server shutdown drains requests and active delivery;
crashed workers' jobs become available when their leases expire.

## Delivery and recovery

Failures (including rejected SMTP recipients) retry up to eight attempts, with
exponential delays starting at 30 seconds, capped at one hour, plus jitter.
Reset/verification emails receive priority and are checked before each delivery
against the current account, token hash, original expiry and recipient. Verification
also checks its password tag. No retry extends a token's lifetime. Used, replaced,
expired or deactivated-account links are canceled. Request a new link if an outage
outlasts its existing 15-minute reset or 30-minute verification lifetime.

SMTP provides at-least-once delivery: a crash after provider acceptance but before
recording success can produce a duplicate. Retries reuse a stable Message-ID, but
mailbox deduplication is not guaranteed. Single-use token validation still applies.

Successful/canceled jobs immediately erase their encrypted content. Failed jobs
retain encrypted content for operator recovery. Nothing exposes the table through
the application API. Logs and the operations CLI omit recipients, content and
provider errors. Login event `queued` means durably enqueued; outbox status records
actual delivery progress.

* `npm run email:queue -- status`: counts, oldest timestamps and failed job IDs.
* After fixing delivery: `npm run email:queue -- retry <job UUID>` for a failed job.
* `npm run email:queue -- prune`: delete up to 1,000 terminal jobs older than 30 days.
  Run daily through your deployment scheduler; repeat if there is a larger backlog.

Monitor failed jobs and oldest pending timestamps. `EMAIL_DISABLED=true` pauses
workers and preserves existing queued jobs; normal homeowner notifications remain
skipped while disabled, as before. Authentication email requests still report
unavailability when SMTP is unconfigured. A failed outbox database write rolls back
the associated change rather than claiming success and silently losing its email.

## Verification

`npm test` runs workflow/security regression and queue unit tests. For real MySQL
commit visibility, rollback, retries and competing workers, set
`TEST_LOCAL_MYSQL=1` and run `node --test tests/email-queue-mysql.test.cjs`.
That test uses a temporary synthetic schema on localhost (root with empty password),
never the application's configured database. SMTP is stubbed in tests; verify the
production provider separately with the existing `npm run email:test` command.
