'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const crypto = require('node:crypto');

const AUDITED_TABLES = new Set([
  'homeowners', 'users', 'billings', 'payments', 'payment_settings',
  'complaints', 'amenityBookings', 'vehicleRegistrations', 'lostFound',
  'announcements', 'appSettings',
]);
const ignoredFields = new Set(['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']);
const visibleEnums = new Set([
  'active', 'inactive', 'deactivated', 'pending', 'approved', 'rejected', 'paid',
  'partially_paid', 'unpaid', 'Pending', 'Approved', 'Rejected', 'Reviewed',
  'In Progress', 'Resolved', 'Posted', 'Claimed', 'Released', 'Registered',
  'admin', 'homeowner', 'Cash', 'GCash', 'Other', 'monthly_dues', 'billing',
]);
const enumFields = new Set(['status', 'role', 'registrationStatus', 'paymentStatus', 'payment_method', 'payment_type']);
const numberFields = new Set(['amount', 'balance', 'lotArea', 'fee', 'is_active', 'is_pinned', 'urgent']);
const permissionValues = new Set(['*', 'resident', 'billing', 'payments', 'complaints', 'vehicles', 'lostfound', 'announcements', 'amenities', 'reports', 'auditlog']);
const dateFields = new Set(['dueDate', 'monthly_dues_month', 'payment_date', 'bookingDate']);

// Values are denied by default. Free text (including complaint content,
// remarks, account numbers, file keys and credentials) never enters the log.
function safeValue(field, value) {
  if (value === undefined || value === null || value === '') return '(empty)';
  if (enumFields.has(field) && visibleEnums.has(value)) return value;
  if (numberFields.has(field) && (typeof value === 'boolean' || Number.isFinite(Number(value)))) return String(Number(value));
  if (dateFields.has(field) && /^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) return value;
  if (field === 'permissions') {
    let list = value;
    if (typeof list === 'string') { try { list = JSON.parse(list); } catch { return '[redacted]'; } }
    if (Array.isArray(list) && list.every(p => permissionValues.has(p))) return list.join(', ') || '(none)';
  }
  return '[redacted]';
}

function changeSummary(before, after, columns) {
  return columns.filter(field => !ignoredFields.has(field) && after[field] !== undefined)
    .filter(field => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after[field] ?? null))
    .map(field => `${field}: ${safeValue(field, before?.[field])} -> ${safeValue(field, after[field])}`)
    .join('; ');
}

function createAuditService({ getPool, resolveActor }) {
  const context = new AsyncLocalStorage();
  function current() { return context.getStore(); }
  function afterCommit(work) {
    const state = current();
    if (state) state.afterCommit.push(work);
    else return work();
  }
  function afterRollback(work) {
    if (!current()) throw new Error('Rollback cleanup requires a transaction.');
    current().afterRollback.push(work);
  }
  async function transaction(req, work) {
    if (current()) return work();
    // Snapshot identity before changing/deleting an account. The reset route
    // replaces this snapshot with the verified one-time token's owner.
    const actor = await resolveActor(req);
    const connection = await getPool().getConnection();
    const state = { req, actor, connection, afterCommit: [], afterRollback: [], failed: false };
    let result;
    try {
      await connection.beginTransaction();
      result = await context.run(state, work);
      if (state.failed) throw new Error('Required audit write failed.');
      await connection.commit();
    } catch (error) {
      await connection.rollback().catch(() => {});
      for (const task of state.afterRollback) {
        try { await task(); } catch { console.error('Audit transaction rollback cleanup failed.'); }
      }
      throw error;
    } finally {
      connection.release();
    }
    // Files and outgoing email must not be removed/sent for rolled-back work.
    for (const task of state.afterCommit) {
      try { await task(); } catch { console.error('Post-commit audit transaction cleanup failed.'); }
    }
    return result;
  }
  async function record(req, { table, id: recordId, operation, summary = '' }, connection) {
    const state = current();
    const actor = state?.actor || await resolveActor(req);
    if (!actor?.id || !actor?.role) {
      if (state) state.failed = true;
      throw new Error('An authenticated actor is required for audit logging.');
    }
    const action = `${actor.role} (${actor.id}) ${operation} ${table} (${recordId})${summary ? ': ' + summary : ''}`;
    try {
      await (connection || state?.connection || getPool()).execute(
        'INSERT INTO auditLog (id, action, adminId, timestamp) VALUES (?, ?, ?, ?)',
        ['l' + Date.now().toString(36) + crypto.randomBytes(6).toString('hex'), action, actor.id, new Date().toISOString()]
      );
    } catch (error) {
      if (state) state.failed = true;
      throw error;
    }
  }
  // Only use for handlers that finish with JSON. Delay sending that response
  // until COMMIT; validation/error responses roll back any earlier writes too.
  function handler(work) {
    return async (req, res, next) => {
      const json = res.json;
      let response;
      const abort = new Error('Request rejected');
      res.json = body => { response = body; return res; };
      try {
        await transaction(req, async () => {
          await work(req, res);
          if (res.statusCode >= 400) throw abort;
        });
        res.json = json;
        return res.json(response);
      } catch (error) {
        res.json = json;
        if (error === abort) return res.json(response);
        res.statusCode = 500;
        return next(error);
      }
    };
  }
  return { current, transaction, record, handler, afterCommit, afterRollback };
}

module.exports = { AUDITED_TABLES, changeSummary, createAuditService };
