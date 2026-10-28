'use strict';

// Compares a reviewed Git baseline to the working tree using isolated in-memory
// records and artificial database latency. Never loads .env or a real database.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { auditFixture } = require('../tests/helpers/audit-fixture.cjs');
const baselineRef = process.argv[2];
if (!baselineRef || !/^[a-f0-9]{40}$/.test(baselineRef)) {
  console.error('Usage: node scripts/benchmark-loading.cjs <full baseline commit SHA>');
  process.exit(1);
}

(async () => {
  const baseline = execFileSync('git', ['show', `${baselineRef}:src/app.js`], { encoding: 'utf8' });
  const cleanup = [];
  try {
    async function setup(appSource) {
      const f = await auditFixture({ after: fn => cleanup.push(fn) }, { appSource });
      for (const user of f.pool.users) if (user.admin_email_verified_at) user.admin_email_verified_at = new Date('2026-01-01T00:00:00Z');
      f.pool.users.find(u => u.id === 'resident-1').permissions = '["resident"]';
      f.pool.users.push({ id: 'officer', role: 'hoa_officer', permissions: '["billing","payments","complaints"]', status: 'active' });
      f.pool.tables.homeowners[0].balance = 42.75;
      f.pool.tables.homeowners.push({ id: 'home-2', name: 'Other Fixture', balance: 100 });
      f.pool.tables.billings.push({ id: 'b1', amount: 100, status: 'active', assignedTo: '["home-1","home-2"]' });
      f.pool.tables.payments.push({ id: 'p1', homeownerId: 'home-1', billingId: 'b1', amount: 57.25, status: 'approved' },
        { id: 'p2', homeownerId: 'home-2', billingId: 'b1', amount: 20, status: 'pending' });
      f.pool.tables.complaints.push({ id: 'c1', homeownerId: 'home-1', status: 'Reviewed' }, { id: 'c2', homeownerId: 'home-2', status: 'Resolved' });
      f.pool.tables.lostFound.push({ id: 'lf1', homeownerId: 'home-1', status: 'Pending' }, { id: 'lf2', homeownerId: 'home-2', status: 'Approved' });
      const execute = f.pool.execute;
      const stats = { queries: 0, summaryReads: 0, active: 0, peak: 0 };
      f.pool.execute = async (...args) => {
        assert.match(args[0], /^SELECT /);
        stats.queries++; stats.active++; stats.peak = Math.max(stats.peak, stats.active);
        if (args[0].includes('LEFT JOIN homeowner_financial_summary')) stats.summaryReads++;
        try { await new Promise(resolve => setTimeout(resolve, 30)); return await execute(...args); }
        finally { stats.active--; }
      };
      f.stats = stats;
      return f;
    }
    const before = await setup(baseline), after = await setup();
    for (const user of ['admin-1', 'resident-1', 'officer']) {
      const results = [];
      for (const f of [before, after]) {
        Object.assign(f.stats, { queries: 0, summaryReads: 0, peak: 0 });
        const start = performance.now();
        const response = await f.request('GET', '/api/data', undefined, user);
        assert.equal(response.status, 200, JSON.stringify(f.errors));
        results.push({ data: response.body, milliseconds: Math.round(performance.now() - start), ...f.stats });
      }
      assert.deepEqual(results[1].data, results[0].data, `${user}: full payload must remain identical`);
      console.log(JSON.stringify({ user, payloadIdentical: true,
        before: { ...results[0], data: undefined }, after: { ...results[1], data: undefined } }));
    }
    console.log('Synthetic localhost measurements with 30ms per database query; not production timings.');
  } finally {
    for (const fn of cleanup.reverse()) await fn();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
