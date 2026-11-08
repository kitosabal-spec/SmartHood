'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

function registrationBrowser(checked, submit) {
  const fields = { ra_email: { value: 'new@example.test' }, ra_mobile: { value: '09171234567' },
    ra_password: { value: 'ExamplePassword123!' }, ra_legal_consent: { checked } };
  const toasts = [];
  const context = vm.createContext({ window: {}, document: {
    getElementById: id => fields[id], querySelectorAll: () => [{ value: 'resident' }],
  }, api: { registerHomeownerAccount: submit, loadAll: async () => {} },
  showToast: (...args) => toasts.push(args), showLoading() {}, hideLoading() {}, closeModal() {}, renderHomeowners() {} });
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/legal.js'), 'utf8'), context);
  const source = fs.readFileSync(require.resolve('../public/js/residents.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('async function registerHomeownerAccount('),
    source.indexOf('\nfunction openResetPasswordModal(')), context);
  return { context, toasts };
}

test('checked registration submits the displayed policy version and records consent through the API', async t => {
  const f = await auditFixture(t);
  f.pool.tables.homeowners.push({ id: 'consent-home', name: 'Consent Resident', lotArea: 100 });
  let response;
  const browser = registrationBrowser(true, async (id, body) => {
    response = await f.request('POST', `/api/homeowners/${id}/account`, body);
    if (response.status !== 201) throw new Error(response.body.error);
  });
  await browser.context.registerHomeownerAccount('consent-home');
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(browser.toasts.at(-1)[1], 'Account Registered');
  const account = f.pool.tables.users.find(u => u.id === response.body.id);
  assert.equal(account.terms_version, browser.context.window.LEGAL_POLICY_VERSION);
  assert.equal(account.privacy_version, browser.context.window.LEGAL_POLICY_VERSION);
  assert.ok(account.terms_accepted_at);
  assert.ok(account.privacy_acknowledged_at);
  assert.equal(account.legal_consent_recorded_by, 'admin-1');
});

test('unchecked consent prevents the browser from submitting registration', async () => {
  let submitted = false;
  const browser = registrationBrowser(false, async () => { submitted = true; });
  await browser.context.registerHomeownerAccount('consent-home');
  assert.equal(submitted, false);
  assert.equal(browser.toasts.at(-1)[1], 'Consent Required');
});

test('API rejects missing, false, non-boolean, and outdated consent without creating an account', async t => {
  const f = await auditFixture(t);
  f.pool.tables.homeowners.push({ id: 'consent-home', name: 'Consent Resident', lotArea: 100 });
  const browser = registrationBrowser(true, async () => {});
  const body = { email: 'new@example.test', mobile: '09171234567', password: 'ExamplePassword123!',
    permissions: ['resident'], termsAccepted: true, privacyAcknowledged: true,
    policyVersion: browser.context.window.LEGAL_POLICY_VERSION };
  for (const override of [{ termsAccepted: false }, { privacyAcknowledged: false },
    { termsAccepted: undefined }, { privacyAcknowledged: undefined }, { termsAccepted: 'true' },
    { policyVersion: undefined }, { policyVersion: '2026-10-06' }]) {
    const response = await f.request('POST', '/api/homeowners/consent-home/account', { ...body, ...override });
    assert.equal(response.status, 400, JSON.stringify(response.body));
    assert.match(response.body.error, /must be accepted/);
    assert.equal(f.pool.tables.users.some(u => u.homeowner_id === 'consent-home'), false);
  }
});
