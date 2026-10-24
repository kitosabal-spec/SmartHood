'use strict';

const crypto = require('crypto');
const { sendEmail } = require('./emailService');

function createLoginSecurityAlerts({ repository, findUser, config, deliver = sendEmail, logger = console }) {
  return async ({ eventKey, identifier, identifierRestricted }) => {
    const eventType = identifierRestricted ? 'login_identifier_restriction' : 'login_ip_restriction';
    try {
      // Resolve through the same DB lookup as login. No recipient comes from
      // request data, and IP-only restrictions never send login alerts.
      const user = identifierRestricted ? await findUser(identifier) : null;
      // Keep unmatched identifiers separate from matched account events.
      eventKey = crypto.createHash('sha256').update(`${eventKey}\0${user?.id || ''}`).digest('hex');
      const claimed = await repository.claimEvent({
        eventKey,
        userId: user?.id,
        eventType,
        emailEnabled: config.emailEnabled && identifierRestricted && Boolean(user?.email),
        cooldownMs: config.cooldownMs,
      });
      if (!claimed) return;
      let status = 'sent';
      try {
        await deliver({
          to: user.email,
          homeownerName: user.name || user.username || 'SmartHood user',
          subject: 'Security Alert: Multiple Failed SmartHood Login Attempts',
          title: 'Multiple failed login attempts',
          message: `SmartHood detected multiple unsuccessful login attempts for your account. Login attempts have been temporarily restricted for ${Math.ceil(config.windowMs / 60000)} minutes to help protect your account. If these attempts were made by you, wait for the temporary restriction to expire or use the Forgot Password option. If you did not attempt to sign in, reset your password immediately and contact the San Alfonso Homes administrator. SmartHood will never ask you to send your password by email.`,
          details: [{
            label: 'Date and time (Philippines)',
            value: new Intl.DateTimeFormat('en-PH', {
              timeZone: 'Asia/Manila', dateStyle: 'full', timeStyle: 'long',
            }).format(new Date()),
          }],
        });
      } catch {
        status = 'failed';
        // SMTP errors can contain addresses/credentials: never log the error.
        logger.error('Login security email delivery failed.');
      }
      await repository.markEmail(eventKey, status);
    } catch {
      logger.error('Login security event processing failed.');
    }
  };
}

module.exports = { createLoginSecurityAlerts };
