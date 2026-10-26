'use strict';

// noDueDate is a request choice, not a stored sentinel. SQL NULL represents
// an absent deadline in both the legacy and typed billing date columns.
function resolveBillingDeadline(payload, { defaultDueDate = null, allowMissing = false } = {}) {
  if (payload.noDueDate !== undefined && typeof payload.noDueDate !== 'boolean') {
    throw new Error('No due date must be a boolean choice.');
  }
  const value = payload.dueDate;
  if (value != null && typeof value !== 'string') {
    throw new Error('Due date must be a valid date in YYYY-MM-DD format.');
  }
  const date = (value || '').trim();
  if (payload.noDueDate === true) {
    if (date) throw new Error('Choose either a due date or No due date, not both.');
    return null;
  }
  const resolved = date || defaultDueDate;
  if (!resolved) {
    if (allowMissing && payload.noDueDate === undefined) return null;
    throw new Error('Select a due date or explicitly choose No due date.');
  }
  const parsed = new Date(`${resolved}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(resolved) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== resolved) {
    throw new Error('Due date must be a valid date in YYYY-MM-DD format.');
  }
  return resolved;
}

module.exports = { resolveBillingDeadline };
