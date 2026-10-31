'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moneyToCents, roundMoney, billingBalance } = require('../src/services/financialService');
const { parseIds } = require('../migrations/004_create_billing_assignments');
const { parseList } = require('../migrations/005_create_notification_recipients');
const { loadMigrations } = require('../src/db/migrationRunner');

const root = path.resolve(__dirname, '..');

test('money calculations use integer cents and preserve partial-payment accuracy', () => {
  assert.equal(moneyToCents('0.1') + moneyToCents('0.2'), moneyToCents('0.30'));
  assert.equal(roundMoney('12.345'), 12.35);
  assert.deepEqual(billingBalance('1000.00', ['300.10', '199.90']), {
    originalAmount: 1000,
    totalPaid: 500,
    remainingBalance: 500,
  });
});

test('legacy assignment and notification arrays parse without losing identifiers', () => {
  assert.deepEqual(parseIds('["h1","h2"]'), ['h1', 'h2']);
  assert.deepEqual(parseIds('h1,h2'), ['h1', 'h2']);
  assert.deepEqual(parseList('["u1","u2"]'), ['u1', 'u2']);
});

test('migrations are ordered, uniquely versioned, and include relational phases', () => {
  const migrations = loadMigrations(path.join(root, 'migrations'));
  assert.deepEqual(migrations.map(item => item.version), ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '011', '012', '013', '014', '015', '016', '017']);
  assert.equal(new Set(migrations.map(item => item.version)).size, migrations.length);
  assert.ok(migrations.every(item => typeof item.up === 'function' && /^[a-f0-9]{64}$/.test(item.checksum)));
});

test('public homeowner seed contains only explicit fictional fixtures', () => {
  const seed = JSON.parse(fs.readFileSync(path.join(root, 'data/homeowners.seed.json'), 'utf8'));
  assert.ok(seed.length > 0);
  assert.ok(seed.every(row => row.id.startsWith('demo-ho-')));
  assert.ok(seed.every(row => /Example|Sample|Fixture/.test(row.name)));
  assert.ok(seed.every(row => row.contact == null && row.balance === 0));
  assert.ok(seed.every(row => !('email' in row) && !('username' in row) && !('password' in row)));
});

test('application uses recipient-scoped notifications, relational assignments and archive paths', () => {
  const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
  assert.match(source, /JOIN billing_assignments ba ON ba\.billing_id = b\.id/);
  assert.match(source, /WHERE nr\.user_id = \? AND nr\.dismissed_at IS NULL/);
  assert.match(source, /SET archived_at = CURRENT_TIMESTAMP\(3\)/);
  assert.match(source, /getScopedTableData\(table, requester, sharedReads\)/);
  assert.doesNotMatch(source.slice(source.indexOf('async function initializeApp')), /createTables\(\)/);
});

test('production TLS verifies certificates and never opts out', () => {
  const source = fs.readFileSync(path.join(root, 'src/config/environment.js'), 'utf8');
  assert.match(source, /rejectUnauthorized:\s*true/);
  assert.doesNotMatch(source, /rejectUnauthorized:\s*false/);
});
