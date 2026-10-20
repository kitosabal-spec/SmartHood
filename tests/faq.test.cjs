// Run: node --test tests/faq.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const faq = fs.readFileSync(path.join(root, 'public/js/faq.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'public/js/main.js'), 'utf8');
const context = vm.createContext({ document: { addEventListener() {} } });
vm.runInContext(faq, context);
const evaluate = source => vm.runInContext(source, context);

test('all 28 required questions have unique IDs and complete content', () => {
  assert.equal(evaluate('FAQ_ITEMS.length'), 28);
  assert.equal(evaluate('new Set(FAQ_ITEMS.map(item => item.id)).size'), 28);
  assert.equal(evaluate('new Set(FAQ_ITEMS.map(item => item.category)).size'), 7);
  assert.ok(evaluate('FAQ_ITEMS.every(item => item.question && item.answer)'));
});

test('search matches answers, ignores case and whitespace, and combines with category', () => {
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '  15 MINUTES ', '').length"), 1);
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '15 minutes', 'Billing and Payments').length"), 0);
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '', 'Billing and Payments').length"), 7);
  assert.equal(evaluate("filterFAQItems(FAQ_ITEMS, '<script>', '').length"), 0);
});

test('public and resident content excludes staff guidance; admin and assigned officer include it', () => {
  assert.equal(evaluate("getFAQItems('public').length"), 25);
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
