'use strict';

// Historical verification targeted seeded usernames and modified live accounts.
// Keep this entry point safe and aligned with verified email authentication.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const result = spawnSync(process.execPath, ['--test', 'tests/admin-email.test.cjs', 'tests/login-security.test.cjs'], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit',
});
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
