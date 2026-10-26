# Administrator email sign-in and enrollment

Administrators sign in with their existing case-sensitive username (such as
`admin`) or a verified email, using their existing password. Username sign-in
works before email enrollment. Password checks, account status, and rate limits
apply to both identifiers. Homeowner and
authorized HOA officer email sign-in is unchanged. Account IDs, roles,
permissions, passwords and related records are not replaced by enrollment or
email changes. No second administrator is created.

## Existing installations: enable email sign-in

Deploy the updated application to restore administrator username sign-in. This
does not change the stored password or require a new database migration. Local
changes do not update the deployed application or its database. Enrollment below
is optional for username sign-in, but required for email sign-in/password resets.

1. Back up the database using your normal operational procedure. Stage this
   release in a separate checkout, pointing to the existing database with the
   normal `.env`. Configure working SMTP and the correct HTTPS `APP_BASE_URL`.
   `EMAIL_DISABLED` and JSON test transport must be off for real enrollment.
2. Keep the old release available for rollback. Arrange a brief maintenance
   window and stop its server so it cannot overwrite account data during
   migrations and enrollment.
3. From the staged release, run `npm run admin:enroll-email` (Windows:
   `npm.cmd run admin:enroll-email`). This applies additive migrations, locates
   the **existing** administrator by username or account ID, and asks for her
   real email and current password. Password and link prompts do not echo and
   are not command-line arguments. It never creates an account or resets data.
4. The administrator receives an email at the new address. Paste its verification
   link into the command's hidden prompt within 30 minutes. Do not open the link
   in the old web application. Wait for **Enrollment complete on the SAME
   account**. The address is now verified on that account.
5. Start the new release and check sign-in using the verified email and unchanged
   password. The existing administrator username still works; the previous email
   fails if it was changed. Enroll other administrators to enable their email login.

If SMTP, verification, or migration fails, fix the cause and rerun enrollment;
the active email is unchanged until verification commits. Existing username
sign-in remains available. A verified account cannot use enrollment again; later
changes go through its profile.

Migration 013 never marks the preset `admin@sanalfonsohomes.com` (or any existing
address) verified. Knowing that string is not proof of mailbox ownership.
It rejects case/whitespace-normalized email collisions before adding its unique
index. If it reports collisions, investigate account ownership and correct the
conflicting email values; never delete, merge, or reset accounts just to pass
the migration. Existing migration files/checksums are unchanged.

To enroll without a web session, run the CLI enrollment command
from the server's terminal. It does not require a web session and uses the
existing username or account ID, current password, and mailbox verification.
An inactive/deactivated account cannot enroll.

## New installation

Set `INITIAL_ADMIN_EMAIL` to the first administrator's real email and
`INITIAL_ADMIN_PASSWORD` to a unique password of at least 12 characters before
first startup. Configure SMTP and HTTPS `APP_BASE_URL`. Start the server once
to initialize its first account. Run `npm run admin:enroll-email` with account
`admin` (or `u001`), that email, and the configured password, then confirm the
emailed verification link.
Configuration alone does not verify the address. Email sign-in requires
verification; username `admin` can sign in with the configured password before it.

These environment values are first-install inputs. Startup detects existing
administrator accounts by role, not username, and never reapplies the configured
email/password to them. Changing `.env` is not an email-change mechanism.

## Later changes from Settings → Admin Profile

Enter the new email and current password, then Save Profile. Validation, duplicate
address, password and delivery errors appear in the profile. The active email
is unchanged while a request is pending. The new email receives a link expiring
in 30 minutes. Open it and explicitly select **Verify email**; mail-scanner GETs
do not change the account. Verification atomically activates the new login/reset
address and invalidates outstanding password-reset links for the old address.
The old email then fails sign-in. The username and password remain usable.

Requesting another link replaces the previous link. Used, expired, or superseded
links fail. Password changes or account deactivation invalidate pending proof.
If another account claims the address before verification, verification reports
the conflict and the old address remains active. Email uniqueness is enforced
across all accounts by a normalized database unique index, including concurrent
writes. A pending address is not reserved until verification.

Requests and completed changes are transactionally audited without passwords,
email values or verification tokens. Tokens are random 256-bit values stored
only as hashes. Enrollment/password failures retain login rate limits; email
verification endpoints have an additional persistent 10-per-IP/hour limit.
Login security alerts resolve active login identifiers and go only to verified
administrator addresses. Forgot-password remains generic and separately rate limited;
unverified administrator addresses cannot receive reset links.

Do not log verification query strings in reverse-proxy access logs or analytics.
Test runs use fake database/email implementations and do not verify production
SMTP delivery. Perform the enrollment above as the deployment acceptance check.
