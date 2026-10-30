'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function fixture() {
  const data = { announcements: [], lostFound: [] };
  const elements = {};
  const context = vm.createContext({
    requestAnimationFrame: () => {},
    db: { get: table => data[table] || [] },
    document: { getElementById: id => elements[id] ||= { innerHTML: '' } },
    escapeHtml: value => String(value),
  });
  for (const file of ['announcements.js', 'lost-found.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../public/js', file), 'utf8'), context);
  }
  return {
    data, elements, context,
    announcements() {
      context.renderPublicAnnouncements();
      return [...elements.pubAnnGrid.innerHTML.matchAll(/class="pub-ann-card-title">([^<]*)</g)].map(m => m[1]);
    },
    reports() {
      context.renderPublicLostFound();
      return [...elements.pubLostFoundGrid.innerHTML.matchAll(/<h3>([^<]*)<\/h3>/g)].map(m => m[1]);
    },
  };
}

function posts() {
  // Intentionally unordered, on the same day: ordering must use time, not date alone.
  return [3, 0, 8, 1, 6, 9, 2, 7, 4, 5].map(hour => ({
    id: `post-${hour}`, title: `Post ${hour}`, itemName: `Post ${hour}`,
    created_at: `2026-10-29T${String(hour).padStart(2, '0')}:00:00Z`,
    createdAt: `2026-10-29T${String(hour).padStart(2, '0')}:00:00Z`,
    date: '2030-01-01', eventDate: '2030-01-01', status: 'Approved',
    is_pinned: hour === 0,
  }));
}

test('public announcements put pinned posts first and restore chronological order when unpinned', () => {
  const f = fixture();
  f.data.announcements = posts();
  f.data.announcements.find(p => p.is_pinned).updated_at = '2035-01-01T00:00:00Z';
  const original = structuredClone(f.data.announcements);
  assert.deepEqual(f.announcements(), ['Post 0', 'Post 9', 'Post 8', 'Post 7', 'Post 6', 'Post 5']);
  assert.deepEqual(f.data.announcements, original, 'rendering preserves all stored records and their order');
  assert.equal(f.context.getSortedAnnouncements().length, 10, 'portal remains unlimited');
  assert.equal(f.context.getSortedAnnouncements()[0].title, 'Post 0', 'portal keeps pinned-first ordering');

  f.data.announcements.find(p => p.is_pinned).is_pinned = false;
  assert.deepEqual(f.announcements(), ['Post 9', 'Post 8', 'Post 7', 'Post 6', 'Post 5', 'Post 4']);
  f.data.announcements.find(p => p.title === 'Post 0').is_pinned = true;
  f.data.announcements.push({ title: 'New publication', created_at: '2026-10-29T09:00:01Z' });
  assert.deepEqual(f.announcements(), ['Post 0', 'New publication', 'Post 9', 'Post 8', 'Post 7', 'Post 6']);
});

test('public reports filter approval before limiting and update on approval or refresh', () => {
  const f = fixture();
  f.data.lostFound = posts();
  for (const status of ['Pending', 'Rejected', 'Claimed', undefined]) {
    f.data.lostFound.push({ itemName: String(status), status, createdAt: '2026-10-30T00:00:00Z' });
  }
  const original = structuredClone(f.data.lostFound);
  assert.deepEqual(f.reports(), ['Post 9', 'Post 8', 'Post 7', 'Post 6', 'Post 5', 'Post 4']);
  assert.deepEqual(f.data.lostFound, original);
  f.context.renderHOCommunityBoard({ innerHTML: '' });
  assert.equal((f.elements.hoLfGrid.innerHTML.match(/class="pub-lostfound-card"/g) || []).length, 10);

  f.data.lostFound.find(p => p.status === 'Pending').status = 'Approved';
  assert.deepEqual(f.reports(), ['Pending', 'Post 9', 'Post 8', 'Post 7', 'Post 6', 'Post 5']);
  // A newly approved older report must still sort by creation, not review time.
  f.data.lostFound.push({ itemName: 'Old newly approved', status: 'Approved',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-12-01T00:00:00Z' });
  assert.equal(f.reports().includes('Old newly approved'), false);
  f.data.lostFound = [{ itemName: 'Refreshed posted report', status: 'Posted', createdAt: '2026-10-31T00:00:00Z' }];
  assert.deepEqual(f.reports(), ['Refreshed posted report']);
});

test('timestamps compare actual instants and safely fall back for legacy or invalid values', () => {
  const f = fixture();
  f.data.announcements = [
    { title: 'Invalid', created_at: 'invalid', date: 'also invalid' },
    { title: 'Missing' },
    { title: 'Offset', created_at: '2026-10-29T10:00:00+08:00' },
    { title: 'UTC', created_at: '2026-10-29T03:00:00Z', date: '2020-01-01' },
    { title: 'Legacy', created_at: 'invalid', date: '2026-10-28' },
  ];
  assert.deepEqual(f.announcements(), ['UTC', 'Offset', 'Legacy', 'Invalid', 'Missing']);
  f.data.lostFound = f.data.announcements.map(p => ({
    itemName: p.title, status: 'Approved', createdAt: p.created_at,
  }));
  assert.deepEqual(f.reports(), ['UTC', 'Offset', 'Invalid', 'Missing', 'Legacy']);
});

test('fewer than six and empty datasets retain existing rendering behavior', () => {
  const f = fixture();
  for (const count of [0, 1, 5, 6]) {
    f.data.announcements = posts().slice(0, count);
    f.data.lostFound = posts().slice(0, count);
    assert.equal(f.announcements().length, count);
    assert.equal(f.reports().length, count);
    if (count === 0) {
      assert.match(f.elements.pubAnnGrid.innerHTML, /No announcements at this time\./);
      assert.match(f.elements.pubLostFoundGrid.innerHTML, /No approved lost and found posts yet\./);
    }
  }
  f.data.lostFound = [{ status: 'Pending' }, { status: 'Rejected' }];
  assert.deepEqual(f.reports(), []);
});
