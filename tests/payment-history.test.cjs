'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture(payments, billings = [{ id: 'bill', title: 'Community dues', amount: 1000 }]) {
  const data = { payments, billings };
  const context = vm.createContext({
    db: { get: key => data[key] || [], getOne: (key, id) => (data[key] || []).find(row => row.id === id) },
    getCurrentHomeownerId: () => 'home-1',
    toMoneyNumber: value => Number(value || 0),
  });
  const main = fs.readFileSync(require.resolve('../public/js/main.js'), 'utf8');
  vm.runInContext(main.slice(main.indexOf('function getBillingPaymentSummary('), main.indexOf('function getBillingCollectionStatus(')), context);
  vm.runInContext(fs.readFileSync(require.resolve('../public/js/billing.js'), 'utf8'), context);
  return { context, data, groups: () => context.getResidentPaymentHistoryGroups() };
}
const payment = (id, amount, status, extras = {}) => ({ id, homeownerId: 'home-1', billingId: 'bill', amount, status,
  submittedAt: '2026-10-01', ...extras });

test('one full payment and three approved partial payments reuse the shared billing totals without mutation', () => {
  for (const payments of [[payment('p1', 1000, 'approved')],
    [payment('p1', 300, 'approved'), payment('p2', 200, 'approved'), payment('p3', 500, 'approved')]]) {
    const before = JSON.stringify(payments);
    const f = fixture(payments);
    const groups = f.groups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].payments.length, payments.length);
    assert.equal(groups[0].summary.originalAmount, 1000);
    assert.equal(groups[0].summary.totalPaid, 1000);
    assert.equal(groups[0].summary.remainingBalance, 0);
    assert.equal(groups[0].progress, 100);
    assert.match(f.context.renderResidentBillingStatus(groups[0]), /Fully Paid/);
    assert.equal(JSON.stringify(payments), before);
  }
});

test('approved, pending, rejected, and resubmitted payments retain independent progress and approved-only balance', () => {
  const f = fixture([payment('p3', 500, 'pending', { created_at: '2026-10-03T09:00:00Z' }),
    payment('p1', 300, 'approved'), payment('p2', 200, 'approved', { created_at: '2026-10-02T09:00:00Z' })]);
  let group = f.groups()[0];
  assert.deepEqual(Array.from(group.payments, p => p.id), ['p1', 'p2', 'p3']);
  assert.equal(group.summary.totalPaid, 500);
  assert.equal(group.summary.remainingBalance, 500);
  assert.equal(group.progress, 50);
  assert.match(f.context.renderResidentBillingStatus(group), /Partially Paid.*For Verification/);
  let steps = group.payments.map(p => f.context.renderSavedPaymentProgress(p, group.summary, true));
  assert.deepEqual(Array.from(steps, html => (html.match(/ is-complete/g) || []).length), [4, 4, 2]);
  assert.match(steps[2], /aria-current="step"[\s\S]*For Verification/);
  f.data.payments[0].status = 'rejected';
  group = f.groups()[0];
  assert.equal(group.summary.remainingBalance, 500);
  assert.equal(group.progress, 50);
  assert.match(f.context.renderSavedPaymentProgress(group.payments[2], group.summary, true), /is-rejected[\s\S]*Rejected/);
  f.data.payments.push(payment('p4', 500, 'approved', { created_at: '2026-10-04T09:00:00Z' }));
  group = f.groups()[0];
  assert.equal(group.progress, 100);
  assert.equal(group.payments.length, 4);
  assert.equal(group.payments[2].status, 'rejected');
  assert.match(f.context.renderResidentBillingStatus(group), /Fully Paid.*Rejected payment/);
  const restored = fixture(JSON.parse(JSON.stringify(f.data.payments)));
  assert.equal(restored.groups()[0].progress, 100);
});

test('billing identity and homeowner identity isolate identical titles and foreign payments', () => {
  const f = fixture([payment('p1', 300, 'approved'), payment('p2', 1000, 'approved', { homeownerId: 'home-2' }),
    payment('p3', 200, 'pending', { billingId: 'other-bill' })],
  [{ id: 'bill', title: 'Same title', amount: 1000 }, { id: 'other-bill', title: 'Same title', amount: 200 }]);
  assert.equal(f.groups().length, 2);
  assert.equal(f.groups().find(g => g.billingId === 'bill').summary.totalPaid, 300);
  assert.ok(f.groups().every(g => g.payments.every(p => p.homeownerId === 'home-1')));
  f.context.getCurrentHomeownerId = () => null;
  assert.equal(f.groups().length, 0);
});

test('explicit advances group by obligation/month; unrelated N/A, ambiguous legacy, and missing billing stay visible', () => {
  const advance = { billingId: null, payment_type: 'monthly_dues', monthly_dues_month: '2026-11', payment_source: 'resident_submission' };
  const f = fixture([payment('a1', 1000, 'rejected', advance), payment('a2', 1000, 'approved', advance),
    payment('a3', 1000, 'pending', { ...advance, monthly_dues_month: '2026-12' }),
    payment('l1', 300, 'approved', { billingId: null }), payment('l2', 200, 'pending', { billingId: null }),
    payment('l3', 300, 'approved', { billingId: null, monthly_dues_month: '2026-11' }),
    payment('m1', 400, 'approved', { billingId: 'missing' }), payment('m2', 200, 'pending', { billingId: 'missing' }),
    payment('wrong-type', 900, 'approved', { ...advance, payment_type: 'billing' })]);
  let groups = f.groups();
  assert.equal(groups.length, 7);
  const november = groups.find(g => g.advance && g.payments[0].monthly_dues_month === '2026-11');
  assert.equal(november.payments.length, 2);
  assert.equal(november.summary.totalPaid, 1000);
  assert.equal(november.progress, 100);
  assert.equal(groups.find(g => g.billingId === 'missing').summary.originalAmount, null);
  assert.equal(groups.find(g => g.payments[0].id === 'l1').progress, null);
  // Existing approval links the same record, not a copied payment. The view must
  // rebuild from its saved billing ID and never also count it as an advance.
  f.data.payments.find(p => p.id === 'a2').billingId = 'bill';
  groups = f.groups();
  assert.equal(groups.flatMap(g => g.payments).filter(p => p.id === 'a2').length, 1);
  assert.equal(groups.find(g => g.billingId === 'bill').summary.totalPaid, 1000);
  assert.equal(groups.find(g => g.advance && g.payments[0].id === 'a1').summary.totalPaid, 0);
});

test('conflicting advance amounts do not fabricate historical dues; cash and unknown status remain truthful', () => {
  const advance = { billingId: null, payment_type: 'monthly_dues', monthly_dues_month: '2026-11', payment_source: 'resident_submission' };
  const f = fixture([payment('a1', 900, 'rejected', advance), payment('a2', 1000, 'pending', advance),
    payment('cash', 500, 'approved', { payment_method: 'Cash', payment_source: 'manual_admin' })]);
  assert.equal(f.groups().find(g => g.advance).summary.originalAmount, null);
  const group = f.groups().find(g => g.billingId === 'bill');
  const html = f.context.renderSavedPaymentProgress(group.payments[0], group.summary, true);
  assert.match(html, /Payment Recorded/);
  assert.equal((html.match(/ is-complete/g) || []).length, 4);
  const unknown = f.context.renderSavedPaymentProgress(payment('old', 20, 'legacy'), null, true);
  assert.equal((unknown.match(/ is-complete/g) || []).length, 0);
  assert.match(unknown, /progress is unavailable/);
});

test('dates, money, rounding, and overpayment progress stay readable and bounded', () => {
  const f = fixture([payment('p1', '1000.01', 'approved')]);
  assert.equal(f.groups()[0].progress, 100);
  assert.equal(f.groups()[0].summary.remainingBalance, 0);
  assert.equal(f.context.formatResidentPaymentMoney(1000), '₱1,000.00');
  assert.equal(f.context.formatResidentPaymentMoney(null), 'Unavailable');
  assert.match(f.context.formatResidentPaymentDate('2026-10-29T12:00:00Z'), /Oct.*29.*2026/);
  assert.equal(f.context.formatResidentPaymentDate(null), '—');
});