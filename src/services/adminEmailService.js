'use strict';

const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { normalizeEmail, isValidEmail } = require('../utils/email');
const { isBcryptHash } = require('../utils/security');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const TTL = 30 * 60 * 1000;
class AdminEmailError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const reject = (status, message) => { throw new AdminEmailError(status, message); };
const activeAdmin = user => user?.role === 'admin' && !['inactive', 'deactivated'].includes(user.status);

// Call inside a transaction. The user lock serializes replacement requests and
// single-use verification. The global normalized email index arbitrates races
// with account creation/profile changes as well as other administrators.
function createAdminEmailService({ get, run, record, sendEmail, isEmailConfigured, baseUrl }) {
  async function request({ userId, email, password, enrollment = false }) {
    const user = await get('SELECT * FROM users WHERE id = ? FOR UPDATE', [userId]);
    const valid = activeAdmin(user) && typeof password === 'string' &&
      (isBcryptHash(user.password) ? await bcrypt.compare(password, user.password) : password === user.password);
    if (!valid || (enrollment && user.admin_email_verified_at)) reject(401, 'Administrator account or current password is incorrect, or enrollment is already complete.');
    email = normalizeEmail(email);
    if (!isValidEmail(email)) reject(400, 'Enter a valid email address.');
    if (user.admin_email_verified_at && email === normalizeEmail(user.email)) reject(400, 'This is already your verified email address.');
    if (await get('SELECT id FROM users WHERE normalized_email = ? AND id != ?', [email, user.id])) reject(409, 'Email address is already registered to another account.');
    if (!isEmailConfigured() || !baseUrl()) reject(503, 'Verification email is unavailable. Your current email has not changed. Contact the system operator.');
    const token = crypto.randomBytes(32).toString('hex');
    await run(`UPDATE users SET pending_admin_email = ?, admin_email_token_hash = ?,
      admin_email_token_expires_at = ?, admin_email_password_tag = ? WHERE id = ?`,
    [email, digest(token), new Date(Date.now() + TTL), digest(user.password), user.id]);
    await record(user, 'request administrator email verification');
    try {
      const result = await sendEmail({ to: email, homeownerName: user.name,
        subject: 'Verify your SmartHood administrator email', title: 'Verify your email address',
        message: 'Confirm this address to use it for administrator sign-in and password resets. This link expires in 30 minutes. Your current login remains unchanged until you confirm. If you did not request this, ignore this message.',
        actionPath: `?admin_email_token=${token}#verify-admin-email`, actionLabel: 'Verify email' });
      if (result?.rejected?.length) throw new Error('Recipient rejected');
    } catch { reject(503, 'Verification email could not be sent. Your current email has not changed. Please try again.'); }
    return { ok: true, message: 'Verification email sent. Open the link within 30 minutes. Your current email remains unchanged until verification succeeds.' };
  }

  async function verify(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) reject(400, 'This verification link is invalid or has expired. Request a new link.');
    const user = await get('SELECT * FROM users WHERE admin_email_token_hash = ? FOR UPDATE', [digest(token)]);
    if (!activeAdmin(user) || !user.pending_admin_email ||
        new Date(user.admin_email_token_expires_at).getTime() <= Date.now() ||
        !user.admin_email_token_expires_at || user.admin_email_password_tag !== digest(user.password)) {
      reject(400, 'This verification link is invalid or has expired. Request a new link.');
    }
    if (await get('SELECT id FROM users WHERE normalized_email = ? AND id != ?', [user.pending_admin_email, user.id])) reject(409, 'This email is now registered to another account. Request verification for a different email.');
    try {
      await run(`UPDATE users SET email = ?, admin_email_verified_at = CURRENT_TIMESTAMP(3),
        pending_admin_email = NULL, admin_email_token_hash = NULL, admin_email_token_expires_at = NULL,
        admin_email_password_tag = NULL, reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?`,
      [user.pending_admin_email, user.id]);
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') reject(409, 'This email is now registered to another account. Request verification for a different email.');
      throw error;
    }
    await record(user, 'verify administrator email and change login address');
    return { ok: true, message: 'Email verified. Sign in with your verified email or administrator username and existing password. Your previous email can no longer sign in.' };
  }
  return { request, verify };
}

module.exports = { createAdminEmailService, AdminEmailError };
