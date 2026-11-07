'use strict';

const { randomBytes } = require('node:crypto');

// Run manually for initial deployment, never as a build/start hook: queued email
// must use the same encryption key across restarts and across instances.
for (const name of ['SESSION_SECRET', 'FILE_ACCESS_SECRET', 'EMAIL_QUEUE_SECRET']) {
  console.log(`${name}=${randomBytes(32).toString('hex')}`);
}
