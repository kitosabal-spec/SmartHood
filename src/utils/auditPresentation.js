'use strict';
// Presentation shared with the audit screen; parity is checked by pagination tests.
const AMENITIES = ['Basketball Court', 'Clubhouse', 'Chairs', 'Tables', 'Ladder'];
function getAuditEventParts(record) {
  // Parse only the known server-written envelope. Never resolve old events
  // against today's business records: that would rewrite their meaning.
  const action = String(record.action || '');
  const legacy = action.match(/^[a-z_]+ \(([^)]*)\) (.+?) ([A-Za-z_]+) \(([^)]*)\)(?:: ([\s\S]*))?$/);
  let stored = record.new_values;
  if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch { stored = null; } }
  return {
    operation: record.action_type || legacy?.[2] || '',
    entity: record.entity_type || legacy?.[3] || '',
    recordId: record.entity_id || legacy?.[4] || '',
    summary: typeof stored?.summary === 'string' ? stored.summary : legacy?.[5] || '',
  };
}

function getAuditEventTitle(record) {
  const entities = {
    homeowners: 'homeowner', users: 'account', billings: 'billing', payments: 'payment', disbursements: 'disbursement',
    payment_settings: 'payment settings', complaints: 'complaint', amenityBookings: 'amenity booking',
    vehicleRegistrations: 'vehicle registration', lostFound: 'lost and found report',
    announcements: 'announcement', appSettings: 'system settings', schema: 'database schema',
  };
  const action = String(record.action || '');
  if (record.adminId === 'system:migration') {
    if (record.action_type === 'reconciled orphan link' || action.startsWith('system migration reconciled orphan billing link')) {
      return 'Reconciled a legacy payment billing link';
    }
    if (record.action_type === 'finalized legacy backfills' || action.startsWith('system migration finalized typed legacy-date')) {
      return 'Completed legacy database reconciliation';
    }
  }
  // Older server-written records predate the structured event columns.
  const { operation, entity } = getAuditEventParts(record);
  const accountOperations = {
    'created account': 'Created account',
    'reset password for': 'Reset account password',
    'updated account/password for': 'Updated account credentials',
    'reset password using verified reset link': 'Reset password using a verified reset link',
    'request administrator email verification': 'Requested administrator email verification',
    'verify administrator email and change login address': 'Verified administrator email and changed login address',
  };
  if (entity === 'users' && Object.hasOwn(accountOperations, operation)) return accountOperations[operation];
  if (operation && Object.hasOwn(entities, entity)) {
    const title = `${operation} ${entities[entity]}`;
    return title.charAt(0).toUpperCase() + title.slice(1);
  }
  // Do not invent a meaning for unrecognized historical/free-text events.
  return action || 'Audit event';
}

function getAuditEventDetails(record) {
  const { operation, summary } = getAuditEventParts(record);
  const isCreation = /^(created|submitted|generated)\b/.test(operation);
  const labels = {
    status: 'Status', registrationStatus: 'Registration status', paymentStatus: 'Payment status',
    amount: 'Amount', balance: 'Balance', fee: 'Fee', lotArea: 'Lot area',
    dueDate: 'Due date', bookingDate: 'Booking date', payment_date: 'Payment date', monthly_dues_month: 'Dues month',
    role: 'Role', permissions: 'Permissions', payment_method: 'Payment method', payment_type: 'Payment type',
    is_active: 'Active', is_pinned: 'Pinned', urgent: 'Urgent', 'billing status': 'Billing status',
    billing: 'Billing reference', 'homeowner record': 'Homeowner reference',
    amenity: 'Amenity', startTime: 'Start time', endTime: 'End time',
    expense_category: 'Expense category', transaction_date: 'Transaction date',
  };
  const enums = {
    active: 'Active', inactive: 'Inactive', deactivated: 'Deactivated', pending: 'Pending', approved: 'Approved',
    rejected: 'Rejected', paid: 'Paid', partially_paid: 'Partially paid', unpaid: 'Unpaid', voided: 'Voided',
    reviewed: 'Reviewed', 'in progress': 'In progress', resolved: 'Resolved', posted: 'Posted', claimed: 'Claimed',
    released: 'Released', registered: 'Registered', admin: 'Administrator', homeowner: 'Homeowner', hoa_officer: 'HOA officer',
    cash: 'Cash', gcash: 'GCash', other: 'Other', monthly_dues: 'Monthly dues', billing: 'Billing', advance: 'Advance credit',
  };
  function displayValue(field, value) {
    if (value === '(empty)') return 'Not set';
    if (value === '[redacted]') return null;
    if (field === 'amenity') return AMENITIES.includes(value) ? value : null;
    if (field === 'expense_category') return value === 'Hermicide' ? 'Herbicide' : ['Gasoline', 'Payroll', 'Extra Labor', 'Herbicide', 'Papers', 'Utensils', 'Maintenance', 'Water Bill', 'Electric Bill', 'Security Services', 'Internet', 'Remittances (SSS, PhilHealth, Pag-IBIG)', 'Others'].includes(value) ? value : null;
    if (field === 'startTime' || field === 'endTime') {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
      const [hour, minute] = value.split(':').map(Number);
      return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
    }
    if (['amount', 'balance', 'fee', 'lotArea'].includes(field)) {
      if (!/^-?\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) return null;
      return field === 'lotArea' ? `${Number(value)} m²` : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value));
    }
    if (['is_active', 'is_pinned', 'urgent'].includes(field)) return value === '1' ? 'Yes' : value === '0' ? 'No' : null;
    if (['dueDate', 'bookingDate', 'payment_date', 'monthly_dues_month', 'transaction_date'].includes(field)) {
      const match = value.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
      if (!match) return null;
      const date = new Date(`${match[1]}-${match[2]}-${match[3] || '01'}T12:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, match[3] ? 10 : 7) !== value) return null;
      return new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', year: 'numeric', month: 'short', ...(match[3] ? { day: 'numeric' } : {}) }).format(date);
    }
    if (field === 'permissions') {
      const names = { '*': 'Full administrator access', resident: 'Resident', billing: 'Billing', payments: 'Payments', disbursements: 'Disbursements',
        complaints: 'Complaints', vehicles: 'Vehicles', lostfound: 'Lost and found', announcements: 'Announcements',
        amenities: 'Amenities', reports: 'Reports', auditlog: 'Audit log' };
      if (value === '(none)') return 'None';
      const list = value.split(',').map(item => item.trim());
      return list.every(item => Object.hasOwn(names, item)) ? list.map(item => names[item]).join(', ') : null;
    }
    if (field === 'billing' || field === 'homeowner record') {
      if (field === 'billing' && value === '(advance dues)') return 'Advance dues';
      return /^[a-zA-Z0-9_:-]{1,128}$/.test(value) ? value : null;
    }
    return Object.hasOwn(enums, value.toLowerCase()) ? enums[value.toLowerCase()] : null;
  }
  const details = [];
  const privateChanges = new Set();
  for (const part of summary.split('; ')) {
    const match = part.match(/^([A-Za-z_ ]+): (.+)$/);
    if (!match) continue;
    const [, field, change] = match;
    const values = change.split(' -> ');
    if (values.length > 2 || values.every(value => value === '(empty)')) continue;
    if (values.length === 2 && values[0] === values[1] && values[0] !== '[redacted]') continue;
    if (Object.hasOwn(labels, field)) {
      const shown = values.map(value => displayValue(field, value));
      if (shown.every(value => value !== null)) {
        const value = values.length === 2 && (isCreation || values[0] === '(empty)') ? shown[1] : shown.join(' → ');
        details.push(`${labels[field]}: ${value}`);
        continue;
      }
    }
    // A changed private value matters, but its contents do not belong here.
    // Creation already explains that the record and its private fields were added.
    if (!isCreation) {
      if (/password|token/i.test(field)) privateChanges.add('Account credentials changed.');
      else if (/receipt|image|photo|attachment/i.test(field)) privateChanges.add('Attachments changed.');
      else if (/^(homeownerId|homeowner_id|billingId|assignedTo)$/.test(field)) privateChanges.add('Record associations changed.');
      else if (/reason|remarks|response/i.test(field)) privateChanges.add('Private notes recorded or updated.');
      else privateChanges.add('Private details changed.');
    }
  }
  if (record.adminId === 'system:migration' && getAuditEventTitle(record) === 'Reconciled a legacy payment billing link') {
    const action = String(record.action || '');
    if (action.includes('preserved as an unapplied advance credit')) details.push('Payment retained as an unapplied advance credit.');
    else if (action.includes('preserved as a month-specific unlinked payment')) details.push('Payment retained for its dues month; the missing billing link was removed.');
    else if (action.includes('detached from a missing billing')) details.push('Removed a link to a billing record that no longer existed.');
  }
  return [...new Set([...details, ...privateChanges])];
}

function getAuditExportDescription(record) {
  return [getAuditEventTitle(record), ...getAuditEventDetails(record)].join('\n');
}

module.exports = { getAuditEventParts, getAuditExportDescription };
