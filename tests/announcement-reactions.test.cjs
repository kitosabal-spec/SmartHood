'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fixture, database } = require('./helpers/auth-fixture.cjs');

function reactionPool() {
  const base = database();
  const reactions = new Set();
  const announcements = new Set(['post-1']);
  const execute = async (sql, values = []) => {
    const q = sql.replace(/`/g, '').replace(/\s+/g, ' ').trim();
    if (q.startsWith('SELECT COALESCE(h.name')) {
      return [base.users.filter(user => reactions.has(`${values[0]}:${user.id}`)).map(user => ({ name: user.name || 'Community member' }))];
    }
    if (q.startsWith('SELECT id FROM announcements WHERE id')) return [[...announcements.has(values[0]) ? [{ id: values[0] }] : []]];
    if (q.startsWith('SELECT * FROM announcements WHERE id')) return [[...announcements.has(values[0]) ? [{ id: values[0] }] : []]];
    if (q.startsWith('INSERT IGNORE INTO announcement_reactions')) {
      const key = `${values[0]}:${values[1]}`;
      const had = reactions.has(key);
      reactions.add(key);
      return [{ affectedRows: had ? 0 : 1 }];
    }
    if (q.startsWith('DELETE FROM announcement_reactions')) {
      for (const key of reactions) {
        if (q.includes('AND user_id') ? key === `${values[0]}:${values[1]}` : key.startsWith(`${values[0]}:`)) reactions.delete(key);
      }
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('SELECT COUNT(*) AS count') && q.includes('announcement_reactions')) {
      const matches = [...reactions].filter(key => key.startsWith(`${values[1]}:`));
      return [[{ count: matches.length, reacted: matches.includes(`${values[1]}:${values[0]}`) ? 1 : 0 }]];
    }
    if (q.startsWith('SELECT announcement_id, COUNT(*) AS count') && q.includes('announcement_reactions')) {
      const rows = [...announcements].map(id => ({ announcement_id: id, count: [...reactions].filter(key => key.startsWith(`${id}:`)).length, reacted: reactions.has(`${id}:${values[0]}`) ? 1 : 0 }));
      return [rows.filter(row => row.count)];
    }
    if (q.startsWith('DELETE FROM announcements WHERE id')) {
      announcements.delete(values[0]);
      return [{ affectedRows: 1 }];
    }
    if (q.startsWith('DELETE FROM announcement_comments')) return [{ affectedRows: 1 }];
    return base.execute(sql, values);
  };
  return { ...base, reactions, announcements, execute, async getConnection() {
    const connection = await base.getConnection();
    return { ...connection, execute };
  } };
}

test('reaction API uses sessions, persists state, prevents duplicates, and cleans up on delete', async t => {
  const pool = reactionPool();
  const site = await fixture(t, { pool });
  async function call(method, route, cookie, body) {
    const response = await fetch(site.base + route, { method, headers: { cookie: cookie || '', 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  const route = '/api/announcements/post-1/reaction';
  assert.equal((await call('GET', '/api/announcements/post-1/likes')).status, 401);
  assert.equal((await call('POST', route)).status, 401);
  assert.equal((await call('GET', route)).body.count, 0);
  const residentLogin = await site.login('resident@example.test', 'Correct-test-password!');
  const residentCookie = residentLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('POST', '/api/announcements/missing/reaction', residentCookie)).status, 404);
  assert.deepEqual((await call('POST', route, residentCookie, { user_id: 'admin-1' })).body, { count: 1, reacted: true });
  assert.deepEqual((await call('POST', route, residentCookie)).body, { count: 1, reacted: true });
  assert.equal(pool.reactions.size, 1);
  assert.equal((await call('GET', route, residentCookie)).body.reacted, true);
  assert.equal((await call('GET', '/api/announcements/reactions', residentCookie)).body['post-1'].count, 1);
  const adminLogin = await site.login('registered-admin@example.test', 'Correct-test-password!');
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0];
  assert.deepEqual((await call('POST', route, adminCookie)).body, { count: 2, reacted: true });
  const likes = await call('GET', '/api/announcements/post-1/likes', residentCookie);
  assert.equal(likes.status, 200);
  assert.deepEqual(likes.body.map(person => person.name).sort(), ['Administrator', 'Resident']);
  assert.ok(likes.body.every(person => Object.keys(person).join(',') === 'name'));
  assert.equal((await call('GET', '/api/announcements/missing/likes', residentCookie)).status, 404);
  assert.deepEqual((await call('DELETE', route, residentCookie)).body, { count: 1, reacted: false });
  assert.deepEqual((await call('DELETE', route, residentCookie)).body, { count: 1, reacted: false });
  assert.equal((await call('POST', route, residentCookie)).body.count, 2);
  const restartedSite = await fixture(t, { pool });
  const restartedState = await fetch(restartedSite.base + route, { headers: { cookie: residentCookie } });
  assert.deepEqual(await restartedState.json(), { count: 2, reacted: true });
  const deleted = await call('DELETE', '/api/announcements/post-1', adminCookie);
  assert.equal(deleted.status, 200, JSON.stringify({ deleted, errors: site.errors.map(args => args.map(String)) }));
  assert.equal(pool.reactions.size, 0);
  assert.equal((await call('GET', route, residentCookie)).status, 404);
});

test('reaction schema enforces one account heart per announcement', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8');
  assert.match(source, /CREATE TABLE IF NOT EXISTS announcement_reactions[\s\S]*?UNIQUE KEY announcement_reaction_account \(announcement_id, user_id\)/);
});

test('inactive and unauthorized accounts cannot heart announcements', async t => {
  const pool = reactionPool();
  pool.users.push({ id: 'officer-1', username: 'officer', email: 'officer@example.test', role: 'officer', status: 'active', permissions: '["announcements"]', password: pool.users[0].password });
  pool.users.push({ id: 'guest-1', username: 'guest', email: 'guest@example.test', role: 'guest', status: 'active', permissions: '[]', password: pool.users[0].password });
  const site = await fixture(t, { pool });
  for (const [email, expected] of [['guest@example.test', 403], ['officer@example.test', 200]]) {
    const login = await site.login(email, 'Correct-test-password!');
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const response = await fetch(site.base + '/api/announcements/post-1/reaction', { method: 'POST', headers: { cookie } });
    assert.equal(response.status, expected, email);
    const likes = await fetch(site.base + '/api/announcements/post-1/likes', { headers: { cookie } });
    assert.equal(likes.status, expected, email);
  }
  const activeLogin = await site.login('registered-admin@example.test', 'Correct-test-password!');
  const cookie = activeLogin.headers.get('set-cookie').split(';')[0];
  pool.users[0].status = 'inactive';
  const inactiveResponse = await fetch(site.base + '/api/announcements/post-1/reaction', { method: 'POST', headers: { cookie } });
  assert.equal(inactiveResponse.status, 403);
  assert.equal((await fetch(site.base + '/api/announcements/post-1/likes', { headers: { cookie } })).status, 403);
});

test('shared card and click handlers keep both feeds synchronized', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../public/js/announcements.js'), 'utf8');
  const button = { attributes: {}, classList: { toggle() {} }, setAttribute(name, value) { this.attributes[name] = value; } };
  const count = { textContent: '' };
  const card = { querySelector(selector) { return selector.includes('heart-btn') ? button : count; } };
  const adminList = { innerHTML: '' };
  const homeownerArea = { innerHTML: '' };
  const calls = [];
  let fail = false;
  const context = { console, setTimeout, clearTimeout, currentUser: { id: 'resident-1' }, announcementCommentsCache: {},
    db: { get: () => [{ id: 'post-1', title: 'Update' }], getOne: () => ({ name: 'Admin' }) },
    document: { getElementById: id => ({ 'announcement-card-post-1': card, announcementsList: adminList, contentArea: homeownerArea })[id] || null },
    api: { getCommentCounts: async () => ({}), getAnnouncementReactions: async () => ({}), addAnnouncementReaction: async id => { calls.push('add'); if (fail) throw Error('offline'); return { count: 1, reacted: true }; }, removeAnnouncementReaction: async id => { calls.push('remove'); return { count: 0, reacted: false }; } },
    avatarHTML: () => '', escapeHtml: value => String(value || ''), showToast: () => {},
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const html = vm.runInContext("communityPostCardHTML({ id: 'post-1', title: 'Update' }, false)", context);
  assert.match(html, /community-post-heart-btn[\s\S]*?<span>Like<\/span>[\s\S]*?<button[^>]*onclick="openCommentModal/);
  assert.match(html, /ondblclick="handleAnnouncementPostDoubleClick/);
  assert.match(html, /onclick="openAnnouncementLikes\('post-1'\)"/);
  assert.match(source, /announcements\.map\(a => communityPostCardHTML\(a, canManage\)\)/);
  assert.match(source, /loadAnnouncementReactions\(\)/);
  context.renderAnnouncementCards();
  context.renderHOAnnouncements();
  assert.match(adminList.innerHTML, /community-post-heart-btn/);
  assert.match(homeownerArea.innerHTML, /community-post-heart-btn/);
  await context.toggleAnnouncementReaction('post-1');
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(count.textContent, '1 like');
  context.handleAnnouncementPostDoubleClick({ target: { closest: () => null } }, 'post-1');
  await new Promise(setImmediate);
  assert.equal(button.attributes['aria-pressed'], 'false');
  context.handleAnnouncementPostDoubleClick({ target: { closest: () => ({}) } }, 'post-1');
  await new Promise(setImmediate);
  assert.deepEqual(calls, ['add', 'remove']);
  fail = true;
  await context.toggleAnnouncementReaction('post-1');
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(count.textContent, '0 likes');
  fail = false;
  let viewerOpens = 0;
  context.openAnnouncementLightbox = () => { viewerOpens++; };
  context.handleAnnouncementMediaClick({}, 'post-1', 0);
  context.handleAnnouncementMediaClick({}, 'post-1', 0);
  context.handleAnnouncementPostDoubleClick({ target: { closest: () => null } }, 'post-1');
  await new Promise(setImmediate);
  assert.equal(button.attributes['aria-pressed'], 'true');
  await new Promise(resolve => setTimeout(resolve, 310));
  assert.equal(viewerOpens, 0);
  context.handleAnnouncementMediaClick({}, 'post-1', 0);
  await new Promise(resolve => setTimeout(resolve, 310));
  assert.equal(viewerOpens, 1);
  await context.toggleAnnouncementReaction('post-1');
  let release;
  context.api.addAnnouncementReaction = async () => { calls.push('add'); await new Promise(resolve => { release = resolve; }); return { count: 1, reacted: true }; };
  const first = context.toggleAnnouncementReaction('post-1');
  const second = context.toggleAnnouncementReaction('post-1');
  assert.equal(button.attributes['aria-pressed'], 'false');
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls.slice(-2), ['add', 'remove']);
  assert.equal(count.textContent, '0 likes');
});
