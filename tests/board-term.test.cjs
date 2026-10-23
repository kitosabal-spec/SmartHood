'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture, database } = require('./helpers/auth-fixture.cjs');

function boardPool() {
  const base = database();
  const settings = new Map([['boardCurrentTerm', '2026 - 2028']]);
  const members = [
    { id: 'bod-1', name: 'One', position: 'President', term_years: '2026 - 2028', display_order: 1, created_at: '2026-01-01', updated_at: '2026-01-01' },
    { id: 'bod-2', name: 'Two', position: 'Secretary', term_years: '2026 - 2028', display_order: 2, created_at: '2026-01-01', updated_at: '2026-01-01' },
  ];

  const execute = async (sql, values = []) => {
    const q = sql.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT value FROM appSettings WHERE id = "boardCurrentTerm"')) {
      const value = settings.get('boardCurrentTerm');
      return [value ? [{ value }] : []];
    }
    if (q.startsWith('SELECT * FROM appSettings WHERE id = ?')) {
      const value = settings.get(values[0]);
      return [value ? [{ id: values[0], value }] : []];
    }
    if (q.startsWith('INSERT INTO appSettings')) {
      settings.set(values[0], values[1]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('UPDATE appSettings SET value = ? WHERE id = ?')) {
      settings.set(values[1], values[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('UPDATE board_of_directors SET term_years')) {
      let affectedRows = 0;
      for (const member of members) {
        if (member.term_years !== values[2]) {
          member.term_years = values[0];
          member.updated_at = values[1];
          affectedRows++;
        }
      }
      return [{ affectedRows }];
    }
    if (q.startsWith('SELECT * FROM board_of_directors ORDER BY')) return [members.map(member => ({ ...member }))];
    if (q.startsWith('SELECT term_years FROM board_of_directors')) return [[{ term_years: members[0]?.term_years }]];
    return base.execute(sql, values);
  };

  return {
    ...base,
    settings,
    members,
    execute,
    async getConnection() {
      const connection = await base.getConnection();
      return { ...connection, execute };
    },
  };
}

async function jsonCall(site, method, route, cookie, body) {
  const response = await fetch(site.base + route, {
    method,
    headers: { cookie: cookie || '', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

test('only an administrator can change the current board term and the change updates every member', async t => {
  const pool = boardPool();
  const site = await fixture(t, { pool });

  assert.deepEqual((await jsonCall(site, 'GET', '/api/board/term')).body, { term_years: '2026 - 2028' });
  assert.equal((await jsonCall(site, 'PUT', '/api/board/term', '', { start_year: 2027, end_year: 2029 })).status, 401);

  const residentLogin = await site.login('resident@example.test', 'Correct-test-password!');
  const residentCookie = residentLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await jsonCall(site, 'PUT', '/api/board/term', residentCookie, { start_year: 2027, end_year: 2029 })).status, 403);

  const adminLogin = await site.login('registered-admin@example.test', 'Correct-test-password!');
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
  const invalid = await jsonCall(site, 'PUT', '/api/board/term', adminCookie, { start_year: 2030, end_year: 2029 });
  assert.equal(invalid.status, 400);

  const updated = await jsonCall(site, 'PUT', '/api/board/term', adminCookie, { start_year: 2027, end_year: 2029 });
  assert.deepEqual(updated, { status: 200, body: { term_years: '2027 - 2029', updated_count: 2 } });
  assert.equal(pool.settings.get('boardCurrentTerm'), '2027 - 2029');
  assert.ok(pool.members.every(member => member.term_years === '2027 - 2029'));
  assert.deepEqual((await jsonCall(site, 'GET', '/api/board/term')).body, { term_years: '2027 - 2029' });
});

test('board management UI exposes one current-term action and uses the shared term for new members', () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/board-of-directors.js'), 'utf8');
  const area = { innerHTML: '' };
  const context = {
    console,
    setTimeout: callback => callback(),
    document: {
      getElementById: id => id === 'contentArea' ? area : null,
      querySelector: () => null,
    },
    dbCache: { board_current_term: '2027 - 2029' },
    db: { get: key => key === 'board_of_directors' ? [] : [], getOne: () => null },
    escapeHtml: value => String(value ?? ''),
    openModal() {},
    closeModal() {},
    showToast() {},
    api: { request: async () => ({}) },
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  context.renderBoardOfDirectorsManagement();
  assert.match(area.innerHTML, /Current Term[\s\S]*?openChangeCurrentTermModal\(\)/);
  assert.match(area.innerHTML, /2027 - 2029/);
  assert.doesNotMatch(area.innerHTML, />Change<\/span>/);
  assert.deepEqual({ ...context.boardTermYears('2028 – 2030') }, { start: '2028', end: '2030' });
  assert.match(source, /formData\.append\('term_years', getCurrentBoardTerm\(\)\)/);
  assert.doesNotMatch(source, /id="bod_term_input"/);
});
