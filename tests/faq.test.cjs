// Run: node --test tests/faq.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const faq = fs.readFileSync(path.join(root, 'public/js/faq.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(faq, context);
const evaluate = source => vm.runInContext(source, context);

test('all 28 required questions have unique IDs and complete content', () => {
  assert.equal(evaluate('FAQ_ITEMS.length'), 28);
  assert.equal(evaluate('new Set(FAQ_ITEMS.map(item => item.id)).size'), 28);
  assert.equal(evaluate('new Set(FAQ_ITEMS.map(item => item.category)).size'), 7);
  assert.ok(evaluate('FAQ_ITEMS.every(item => item.question && item.answer)'));
});

test('public FAQ uses one dialog and trigger with no navigation link or landing section', () => {
  assert.equal((html.match(/id="publicFAQButton"/g) || []).length, 1);
  assert.equal((html.match(/<dialog[^>]*id="publicFAQModal"/g) || []).length, 1);
  assert.doesNotMatch(html, /data-faq-navigation|data-pub-section="faq"|<section[^>]*id="faq"/);
  assert.match(html, /aria-label="Open frequently asked questions"/);
  assert.match(html, /id="sidebarFAQ"/);
});

test('profile menu links every authenticated user to Help & FAQ', () => {
  assert.match(html, /onclick="handleProfileHelpFAQ\(event\)"[^>]*role="menuitem"/);
  assert.match(html, /<span class="profile-dropdown-label">Help &amp; FAQ<\/span>/);
  assert.match(main, /function handleProfileHelpFAQ\(e\)[\s\S]*?navigate\('help-faq'\);\s*\n}/);
});

test('search matches answers, ignores case and whitespace, and combines with category', () => {
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '  15 MINUTES ', '').length"), 1);
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '15 minutes', 'Billing and Payments').length"), 0);
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '', 'Billing and Payments').length"), 7);
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '<script>', '').length"), 0);
});

test('public includes every category; portal guidance retains role-based filtering', () => {
  assert.equal(evaluate("getFAQItems('public').length"), 28);
  assert.equal(evaluate("getFAQItems('portal', {role:'homeowner', permissions:['resident']}).length"), 25);
  assert.equal(evaluate("getFAQItems('portal', {role:'admin'}).length"), 28);
  assert.equal(evaluate("getFAQItems('portal', {role:'homeowner', permissions:['payments']}).length"), 28);
});

test('FAQ access requires an active session but no module permission', () => {
  const access = main.match(/function canAccessView\(viewId\) \{[\s\S]*?\n\}/)[0];
  vm.runInContext(`
    let currentUser = null;
    const ADMIN_ONLY_MODULES = ['users', 'settings'];
    function isAdmin() { return currentUser?.role === 'admin'; }
    function userHasModulePermission(id) { return currentUser.permissions.includes(id); }
    function getNavForRole() { return []; }
    ${access}`, context);
  for (const role of ['admin', 'homeowner', 'officer']) {
    evaluate(`currentUser = {role:'${role}', permissions:[]}`);
    assert.ok(evaluate("canAccessView('help-faq')"));
  }
  evaluate("currentUser = {role:'officer', permissions:['payments']}");
  assert.ok(evaluate("canAccessView('payments')"));
  assert.equal(evaluate("canAccessView('users')"), false);
  assert.equal(evaluate("canAccessView('ho-billing')"), false);
  evaluate("currentUser.status = 'inactive'");
  assert.equal(evaluate("canAccessView('help-faq')"), false);
  evaluate('currentUser = null');
  assert.equal(evaluate("canAccessView('help-faq')"), false);
});
