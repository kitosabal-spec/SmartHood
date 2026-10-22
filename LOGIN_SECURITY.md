# Login rate limits and security alerts

The application uses `express-rate-limit` 8.7.1 (CommonJS, Express >=4.11,
Node >=16) with a shared MySQL/InnoDB store. The test runner requires Node >=22.
No Redis service or additional SMTP configuration is needed.

## Render environment

Add these variables to the Render web service, with the same values on every instance:

```env
TRUST_PROXY=1
LOGIN_RATE_WINDOW_MS=900000
LOGIN_IDENTIFIER_MAX_FAILURES=8
LOGIN_WARNING_AFTER_FAILURES=5
LOGIN_IP_MAX_FAILURES=50
LOGIN_SECURITY_EMAIL_ENABLED=true
LOGIN_SECURITY_EMAIL_COOLDOWN_MS=900000
```

Keep the existing MySQL, SMTP, `EMAIL_FROM`, `APP_BASE_URL`, and stable
`SESSION_SECRET` configuration. `EMAIL_DISABLED=true` still disables the existing
email transport. Deploy with `npm ci` and `npm start`.

`TRUST_PROXY=1` trusts only the nearest ingress hop, using Express's `req.ip`.
It does not read a client-supplied leftmost X-Forwarded-For value. This setting
assumes all external traffic reaches the process through Render's ingress and
that the nearest proxy supplies the client address. Confirm that assumption on
the deployed service, especially if adding another CDN/proxy. Direct hosting
must use `TRUST_PROXY=0`. Never expose a direct route to the process while using
a trusted hop count. These constraints follow
[Express's proxy guidance](https://expressjs.com/en/guide/behind-proxies/).

Only integer hop counts from 0 to 5 are accepted. Missing/invalid proxy settings
default to 1 when Render sets `RENDER=true`, otherwise 0. Numeric limit settings
must be positive integers within bounded ranges; invalid values use the defaults
above. The warning threshold cannot exceed the identifier limit. Email alerts
default to enabled; only `false` disables them. Cooldown is at least the login
window, even if configured lower.

## Behavior

- Eight credential failures are allowed per trimmed, lowercase identifier plus
  client IP; the ninth request is restricted. Login matching itself retains
  case-sensitive administrator usernames and case-insensitive homeowner emails.
- Fifty failures are allowed per IP across identifiers. IPv4-mapped IPv6
  addresses share the IPv4 bucket; IPv6 uses the library's /56 grouping to resist
  address rotation. Counter keys are SHA-256 digests, never raw addresses or
  identifiers.
- Only failed authentication runs the counter middleware. Successful login
  requests do not increment or erase either counter, including concurrent
  requests. Correct passwords for inactive accounts retain the existing 403
  account-status message and count as unsuccessful logins.
- After the eighth failure, subsequent requests are rejected before bcrypt,
  including requests with a correct password, until the window expires. This
  does not change the account's status or invalidate existing sessions.
- Fixed windows start with the first failure, following the
  [express-rate-limit window model](https://express-rate-limit.mintlify.app/reference/configuration).
  Repeated blocked requests never extend the window. `retryAfterSeconds` and
  `Retry-After` report the actual remaining time (up to 900 seconds by default),
  not a freshly restarted 15 minutes on every request. The longest remaining
  active restriction determines the wait if both policies block.
- Warnings start on failure five. `attemptsRemaining` reflects the tighter of
  the two policies; warnings also appear when the shared IP budget is nearly
  exhausted. Standard draft-6 `RateLimit-*` headers accompany responses, with
  `Retry-After` on 429 responses.
- Unknown accounts and wrong passwords receive the same status, JSON fields,
  warnings, and limiter behavior. Unknown accounts also perform dummy bcrypt
  verification. No account details appear in the restriction response.
- Forgot-password has its own shared five-requests-per-IP, one-hour window.
  Limited requests return 429 with the existing generic reset response body and
  headers. This limiter never triggers a login-security email.
- Counter storage failures fail closed with a generic 503; they never allow
  unrestricted password verification.

## Schema, audit, and email deduplication

Startup creates only these three additional tables using `CREATE TABLE IF NOT
EXISTS`; it does not change existing user records for this feature:

| Table | Purpose |
| --- | --- |
| `auth_rate_limits` | Shared counters and expiration timestamps, unique by policy and hashed bucket key. |
| `auth_security_events` | Restriction event key, optional user ID, event type, timestamp, and email status. |
| `auth_security_email_cooldowns` | Atomic email claim, unique by user ID and security-event type. |

The database user needs CREATE TABLE permission on the first deployment, and
SELECT/INSERT/UPDATE/DELETE privileges for these tables. All instances must
connect to the same database. Counters survive application restarts.

InnoDB transactions serialize increments. A restriction queues event processing
after the HTTP response finishes. The matched account comes from the same user
lookup used by login, and the recipient comes exclusively from `users.email`.
Administrator usernames therefore resolve to the administrator's registered
address. Unknown identifiers never receive email.

A transaction inserts a unique restriction event and conditionally claims the
account/event-type cooldown. Only the transaction that obtains that claim sends
an alert. Repeated blocked requests, both limiters triggering together, another
IP, an email/username alias, or another application instance cannot duplicate
that account's alert during the cooldown. IP-only restrictions produce audit
events without security emails.

Email statuses are `pending`, `sent`, `failed`, `disabled`, `suppressed`, or
`no_account`. `sent` means the existing SMTP service accepted the send operation,
not that inbox delivery was confirmed. Failures leave the cooldown and counters
intact and log fixed messages without SMTP exception contents. Alert dispatch
is best effort, with no automatic retry: a process crash after the response or
claim can lose an alert. This favors avoiding duplicate security messages.

Email contains the account name, security guidance, and Philippine date/time
(`Asia/Manila`). It contains no password, hash, session cookie, reset token, or
IP address. Audit records store no submitted identifier or IP. Expired counters
are logically ignored immediately and pruned hourly; audit events are retained
for 30 days. Cooldown rows are reused per account/event type.

## Verification

Run `npm test`. The HTTP tests load the real app and use real Express,
express-rate-limit, bcrypt, shared-store code, and email-claim code, with an
isolated transactional database double and captured email delivery. They do
not read the application `.env`, seed/migrate the configured database, or send
real messages. They exercise the limits, warnings, concurrency, cross-instance
state, deduplication, proxy/IP handling, expiration, SMTP failure/delay, login,
legacy migration, sessions, logout, and password resets. Existing FAQ and report
tests also run.

The tests verify app construction and HTTP startup plus JavaScript syntax.
Deployment-specific MySQL permissions/DDL and Render ingress behavior still
need validation in a staging deployment; the unit/HTTP suite does not establish
those properties. The implementation does not run the application's existing
startup seed/migration routines against production during verification.

Dependency audit: the new limiter and its locked dependencies have no reported
advisories in the installation audit. Twelve findings remain in existing
dependencies, including a proxy-addr subnet-trust advisory (this feature uses
bounded hop counts, not subnet trust). Unrelated dependencies were not upgraded.

## Changed files

| File | Change |
| --- | --- |
| `package.json` | Pinned limiter dependency and `npm test` command. |
| `package-lock.json` | Locked limiter and its required transitive dependencies. |
| `.env.example` | Render proxy and login-security environment settings. |
| `src/config/loginSecurity.js` | Bounded configuration validation and defaults. |
| `src/services/authSecurityStore.js` | MySQL schema, transactional counters, event/cooldown claims, and retention. |
| `src/services/loginSecurityAlerts.js` | Registered-recipient alerts through the existing email service, Philippine time, sanitized failure logging. |
| `src/middleware/loginRateLimit.js` | Identifier/IP limits, warning and retry responses, and separate forgot-password limit. |
| `src/app.js` | Proxy setting, limiter wiring, shared account lookup, dummy bcrypt, and security-table initialization. |
| `public/js/main.js` | Carries error metadata and displays warnings/retry minutes in the existing login error element. |
| `tests/helpers/auth-fixture.cjs` | Isolated HTTP, transactional database, and email fixtures. |
| `tests/login-security.test.cjs` | Authentication and limiter regression tests. |
| `LOGIN_SECURITY.md` | Deployment, behavior, deduplication, verification, and file-change documentation. |
