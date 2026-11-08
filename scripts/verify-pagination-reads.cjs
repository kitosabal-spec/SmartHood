'use strict';

// SELECT-only diagnostic; importing app.js would run startup migrations/seeds.
// Prints timings/counts only, never records or connection configuration.
const { readPage } = require('../src/services/pagedDataService');
async function main() {
  if (!process.argv.includes('--read-only')) throw new Error('Pass --read-only to run this diagnostic.');
  const { DB_CONFIG } = require('../src/config/environment');
  const pool = require('mysql2/promise').createPool({ ...DB_CONFIG, connectionLimit: 1, connectTimeout: 10000 });
  const all = async (sql, params = []) => {
    if (!/^SELECT\s/i.test(sql)) throw new Error('Only SELECT is permitted.');
    return (await pool.execute(sql, params))[0];
  };
  const services = { all, get: async (...args) => (await all(...args))[0],
    userHasPermission: (u, p) => u.permissions?.includes(p), requesterHomeownerId: u => u.homeowner_id,
    deserializeRow: (_t, row) => row, presentPrivateFiles: (_t, row) => row,
    presentHomeownerAccountStatus: row => row, mergeUserWithHomeowner: row => row,
    attachComplaintResponses: async rows => {
      if (rows.length) await all(`SELECT id FROM complaint_responses WHERE complaint_id IN (${rows.map(() => '?').join(', ')})`, rows.map(row => row.id));
      return rows;
    } };
  try {
    for (const table of ['homeowners', 'users', 'billings', 'payments', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound', 'auditLog']) {
      const start = performance.now();
      const first = await readPage(table, { pageSize: '5' }, { role: 'admin' }, services);
      const second = await readPage(table, { page: '2', pageSize: '5' }, { role: 'admin' }, services);
      if (first.items.length > 5 || second.items.length > 5) throw new Error('Unbounded page');
      if (second.page === 2 && second.items.some(row => first.items.some(prior => prior.id === row.id))) throw new Error('Overlapping pages');
      await readPage(table, { q: 'nonexistent-pagination-probe_%!', pageSize: '5' }, { role: 'admin' }, services);
      if (first.items.length) await readPage(table, { ids: JSON.stringify(first.items.map(row => row.id)), pageSize: '5' }, { role: 'admin' }, services);
      if (table === 'billings') for (const collectionStatus of ['paid', 'partially_paid', 'unpaid', 'overdue']) {
        await readPage(table, { collectionStatus, today: '2026-11-08', q: 'No due date', startDate: '2020-01-01', endDate: '2030-12-31', pageSize: '5' }, { role: 'admin' }, services);
      }
      if (table === 'payments') await readPage(table, { startDate: '2020-01-01', endDate: '2030-12-31', pageSize: '5' }, { role: 'admin' }, services);
      console.log(JSON.stringify({ table, total: first.total, pageRows: first.items.length, milliseconds: Math.round(performance.now() - start) }));
    }
    await all('SELECT p.id, p.homeownerId, p.billingId, p.amount, p.status, p.submittedAt, p.reviewedAt, p.payment_date, p.verified_at, p.created_at, p.monthly_dues_month, p.payment_type, p.payment_source, p.archived_at, p.voided_at FROM payments p WHERE p.archived_at IS NULL LIMIT 5');
    const [homeowner] = await all('SELECT id FROM homeowners WHERE archived_at IS NULL LIMIT 1');
    if (homeowner) {
      const resident = { role: 'homeowner', homeowner_id: homeowner.id, permissions: ['resident'] };
      for (const table of ['homeowners', 'billings', 'payments', 'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound']) {
        const page = await readPage(table, { pageSize: '5', q: '%' }, resident, services);
        if (table === 'billings' && page.items.some(row => row.assignedTo.some(id => id !== homeowner.id))) throw new Error('Assignment scope violation');
        if (['payments', 'complaints', 'amenityBookings', 'vehicleRegistrations'].includes(table) && page.items.some(row => row.homeownerId !== homeowner.id)) throw new Error('Ownership scope violation');
      }
      console.log('PASS: resident query execution and scoped page checks.');
    }
  } finally { await pool.end(); }
}
main().catch(error => { console.error('Pagination read diagnostic failed:', error.code || error.message); process.exitCode = 1; });
