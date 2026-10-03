'use strict';

require('dotenv').config();
const { isEmailConfigured, sendEmail, verifyEmailConnection } = require('../emailService');

async function main() {
  const to = process.argv[2] || process.env.TEST_EMAIL_TO;
  if (!to) throw new Error('Usage: npm run email:test -- recipient@example.com');
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Copy .env.example to .env and set the SMTP_* and EMAIL_FROM values.');
  }

  await verifyEmailConnection();
  const result = await sendEmail({
    to,
    homeownerName: 'SmartHood Test Recipient',
    subject: 'SmartHood email configuration test',
    title: 'Email notifications are working',
    message: 'This test confirms that SmartHood can connect to the configured email provider and deliver transactional notifications.',
    details: [
      { label: 'Environment', value: process.env.NODE_ENV || 'development' },
      { label: 'Sent at', value: new Date().toISOString() },
    ],
  });
  console.log(`Test email accepted for ${to}. Message ID: ${result.messageId}`);
}

main().catch(error => {
  console.error(`Test email failed: ${error.message}`);
  process.exitCode = 1;
});
