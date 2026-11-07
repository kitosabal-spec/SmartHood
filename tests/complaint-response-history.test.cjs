'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

test('complaint responses append and remain visible after a fresh data load', async t => {
  const f = await auditFixture(t);
  f.pool.tables.complaints.push({
    id: 'case-1', homeownerId: 'home-1', category: 'Maintenance', description: 'Broken light',
    status: 'Reviewed', adminResponse: 'Existing legacy response', dateFiled: '2026-11-01',
  });
  f.pool.tables.complaint_responses.push({
    id: 'legacy-case-1', complaint_id: 'case-1', message: 'Existing legacy response',
    sender_id: null, sender_name: 'Administrator', created_at: '2026-11-01T08:00:00.000Z',
  });

  let response = await f.request('PUT', '/api/complaints/case-1', {
    status: 'In Progress', newResponse: 'The maintenance team has been notified.',
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.responses.map(item => item.message), [
    'Existing legacy response', 'The maintenance team has been notified.',
  ]);

  response = await f.request('PUT', '/api/complaints/case-1', {
    status: 'Resolved', newResponse: 'The light was replaced this afternoon.',
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.responses.map(item => item.message), [
    'Existing legacy response',
    'The maintenance team has been notified.',
    'The light was replaced this afternoon.',
  ]);
  assert.equal(f.pool.tables.complaints[0].adminResponse, 'Existing legacy response');

  const reloaded = await f.request('GET', '/api/data');
  assert.equal(reloaded.status, 200, JSON.stringify(reloaded.body));
  const complaint = reloaded.body.complaints.find(item => item.id === 'case-1');
  assert.deepEqual(complaint.responses.map(item => item.message), response.body.responses.map(item => item.message));
  assert.ok(complaint.responses.every(item => item.sender && item.createdAt));
});

test('homeowners receive response history only for their own complaints', async t => {
  const f = await auditFixture(t);
  f.pool.tables.complaints.push(
    { id: 'own', homeownerId: 'home-1', category: 'Noise', description: 'Own', status: 'Reviewed', dateFiled: '2026-11-01' },
    { id: 'other', homeownerId: 'home-2', category: 'Noise', description: 'Other', status: 'Reviewed', dateFiled: '2026-11-01' },
  );
  f.pool.tables.complaint_responses.push(
    { id: 'r1', complaint_id: 'own', message: 'Visible', sender_name: 'Admin', created_at: '2026-11-01T08:00:00.000Z' },
    { id: 'r2', complaint_id: 'other', message: 'Private', sender_name: 'Admin', created_at: '2026-11-01T09:00:00.000Z' },
  );

  const response = await f.request('GET', '/api/data', undefined, 'resident-1');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.complaints.map(item => item.id), ['own']);
  assert.deepEqual(response.body.complaints[0].responses.map(item => item.message), ['Visible']);
});

test('only complaint managers can edit and delete responses', async t => {
  const f = await auditFixture(t);
  f.pool.users.push({
    id: 'complaints-officer', username: 'complaints', name: 'Complaints Officer', role: 'hoa_officer',
    permissions: ['complaints'], status: 'active',
  });
  f.pool.tables.complaints.push({
    id: 'case-1', homeownerId: 'home-1', category: 'Noise', description: 'Loud music',
    status: 'Reviewed', adminResponse: 'Legacy text remains for compatibility', dateFiled: '2026-11-01',
  });
  f.pool.tables.complaint_responses.push({
    id: 'legacy-r1', complaint_id: 'case-1', message: 'Original response',
    sender_id: 'admin-1', sender_name: 'Administrator', created_at: '2026-11-01T08:00:00.000Z',
  });

  let response = await f.request('PATCH', '/api/complaints/case-1/responses/legacy-r1', {
    message: 'Edited by the complaints officer',
  }, 'complaints-officer');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.responses[0].message, 'Edited by the complaints officer');
  assert.equal(f.pool.tables.complaints[0].adminResponse, 'Edited by the complaints officer');

  response = await f.request('PATCH', '/api/complaints/case-1/responses/legacy-r1', {
    message: 'Resident must not edit this',
  }, 'resident-1');
  assert.equal(response.status, 403);

  response = await f.request('DELETE', '/api/complaints/case-1/responses/legacy-r1', undefined, 'resident-1');
  assert.equal(response.status, 403);

  response = await f.request('DELETE', '/api/complaints/case-1/responses/legacy-r1', undefined, 'admin-1');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.deepEqual(response.body.responses, []);
  assert.equal(f.pool.tables.complaint_responses.length, 0);
  assert.equal(f.pool.tables.complaints[0].adminResponse, null);
  assert.match(f.pool.tables.auditLog.at(-2).action, /edited response/);
  assert.match(f.pool.tables.auditLog.at(-1).action, /deleted response/);
  assert.doesNotMatch(JSON.stringify(f.pool.tables.auditLog), /Edited by the complaints officer|Original response/);
});
