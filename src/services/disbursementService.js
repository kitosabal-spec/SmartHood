'use strict';
const crypto = require('node:crypto');

const EXPENSE_CATEGORIES = Object.freeze([
  'Gasoline', 'Payroll', 'Extra Labor', 'Hermicide', 'Papers', 'Utensils',
  'Maintenance', 'Water Bill', 'Electric Bill', 'Security Services', 'Internet',
  'Remittances (SSS, PhilHealth, Pag-IBIG)', 'Others',
]);

function validateDisbursement(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['expense_category', 'transaction_date', 'amount'].includes(key))) {
    throw new Error('Only expense category, transaction date and amount can be submitted.');
  }
  const { expense_category, transaction_date, amount } = body;
  if (!EXPENSE_CATEGORIES.includes(expense_category)) throw new Error('Select a valid expense category.');
  if (typeof transaction_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(transaction_date) ||
      transaction_date < '1000-01-01' || !Number.isFinite(Date.parse(transaction_date)) ||
      new Date(transaction_date).toISOString().slice(0, 10) !== transaction_date) throw new Error('Enter a valid transaction date.');
  if (!['string', 'number'].includes(typeof amount) || !/^\d{1,10}(?:\.\d{1,2})?$/.test(String(amount)) ||
      Number(amount) <= 0 || Number(amount) > 9999999999.99) throw new Error('Enter an amount greater than zero, with at most two decimal places.');
  return { expense_category, transaction_date, amount: Number(amount).toFixed(2) };
}

function presentDisbursement(row) {
  const value = row.transaction_date;
  const transaction_date = value instanceof Date
    ? [value.getFullYear(), String(value.getMonth() + 1).padStart(2, '0'), String(value.getDate()).padStart(2, '0')].join('-')
    : String(value).slice(0, 10);
  return { ...row, transaction_date };
}

// Dedicated routes deliberately stay outside generic CRUD and bulk replacement.
function registerDisbursementRoutes(app, { all, get, run, requirePermission, requireFinancialAdmin, asyncHandler, auditedHandler, recordAuditLog, changeSummary }) {
  const columns = ['expense_category', 'transaction_date', 'amount'];
  const active = async () => (await all('SELECT id, expense_category, transaction_date, amount FROM disbursements WHERE voided_at IS NULL ORDER BY transaction_date DESC, id DESC')).map(presentDisbursement);
  app.get('/api/disbursements', asyncHandler(async (req, res) => {
    if (!await requirePermission(req, res, 'disbursements')) return;
    res.json({ categories: EXPENSE_CATEGORIES, records: await active() });
  }));
  app.get('/api/reports/disbursements', asyncHandler(async (req, res) => {
    if (!await requirePermission(req, res, 'reports')) return;
    // Reports permission exposes only the financial projection, never receipts or resident identities.
    const [records, collections] = await Promise.all([
      active(), all("SELECT amount, reviewedAt, payment_date, submittedAt, created_at FROM payments WHERE status = 'approved' AND archived_at IS NULL"),
    ]);
    res.json({ records, collections: collections.map(p => ({ amount: p.amount, date: p.reviewedAt || p.payment_date || p.submittedAt || p.created_at })) });
  }));
  app.post('/api/disbursements', auditedHandler(async (req, res) => {
    const actor = await requireFinancialAdmin(req, res);
    if (!actor) return;
    let values;
    try { values = validateDisbursement(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    const id = 'd' + crypto.randomUUID();
    await run('INSERT INTO disbursements (id, expense_category, transaction_date, amount, created_by) VALUES (?, ?, ?, ?, ?)',
      [id, values.expense_category, values.transaction_date, values.amount, actor.id]);
    await recordAuditLog(req, { table: 'disbursements', id, operation: 'created', summary: changeSummary(null, values, columns) });
    res.status(201).json({ id, ...values });
  }));
  app.put('/api/disbursements/:id', auditedHandler(async (req, res) => {
    if (!await requireFinancialAdmin(req, res)) return;
    let values;
    try { values = validateDisbursement(req.body); } catch (error) { return res.status(400).json({ error: error.message }); }
    const before = await get('SELECT * FROM disbursements WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!before) return res.status(404).json({ error: 'Disbursement not found.' });
    if (before.voided_at) return res.status(409).json({ error: 'Voided disbursements cannot be edited.' });
    await run('UPDATE disbursements SET expense_category = ?, transaction_date = ?, amount = ? WHERE id = ?',
      [values.expense_category, values.transaction_date, values.amount, before.id]);
    await recordAuditLog(req, { table: 'disbursements', id: before.id, operation: 'updated', summary: changeSummary(presentDisbursement(before), values, columns) });
    res.json({ id: before.id, ...values });
  }));
  app.post('/api/disbursements/:id/void', auditedHandler(async (req, res) => {
    const actor = await requireFinancialAdmin(req, res);
    if (!actor) return;
    const before = await get('SELECT * FROM disbursements WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!before) return res.status(404).json({ error: 'Disbursement not found.' });
    if (before.voided_at) return res.status(409).json({ error: 'Disbursement is already voided.' });
    await run('UPDATE disbursements SET voided_at = CURRENT_TIMESTAMP(3), voided_by = ? WHERE id = ?', [actor.id, before.id]);
    await recordAuditLog(req, { table: 'disbursements', id: before.id, operation: 'voided', summary: changeSummary(null, presentDisbursement(before), columns) });
    res.json({ success: true });
  }));
}

module.exports = { EXPENSE_CATEGORIES, validateDisbursement, presentDisbursement, registerDisbursementRoutes };
