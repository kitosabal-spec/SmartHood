'use strict';

// Identifiers and expressions are owned by the server. User input is bound only
// as values, including search strings (LIKE metacharacters are literal).
const definitions = {
  homeowners: { sort: ['name', 'block', 'lot', 'balance', 'created_at'], search: ['name', 'block', 'lot'], filters: ['block'] },
  users: { sort: ['name', 'email', 'role', 'status', 'created_at'], search: ['name', 'username', 'email', 'role', 'block', 'lot', 'permissions'], filters: ['role', 'status'] },
  billings: { sort: ['created_at', 'createdAt', 'due_date', 'amount', 'status', 'id'], search: ['id', 'title', 'description', 'monthly_dues_month', 'amount', 'dueDate', 'createdAt', 'billing_type'], filters: ['status', 'billing_type', 'monthly_dues_month'] },
  payments: { sort: ['created_at', 'submittedAt', 'payment_date', 'amount', 'status'], search: ['refNum', 'payment_method', 'remarks', 'monthly_dues_month', 'amount'], filters: ['status', 'payment_method', 'homeownerId', 'billingId', 'monthly_dues_month'] },
  complaints: { sort: ['dateFiled', 'status'], search: ['description', 'category', 'otherCategory'], filters: ['status', 'category', 'homeownerId'] },
  amenityBookings: { sort: ['createdAt', 'bookingDate', 'status'], search: ['amenity', 'purpose', 'bookingDate', 'startTime', 'endTime', 'status'], filters: ['status', 'amenity', 'homeownerId'] },
  vehicleRegistrations: { sort: ['createdAt', 'registrationStatus', 'plateNumber'], search: ['ownerName', 'block', 'lot', 'registrationLocation', 'plateNumber', 'vehicleType', 'stickerNumber', 'registrationStatus', 'paymentStatus'], filters: ['registrationStatus', 'paymentStatus', 'homeownerId'] },
  lostFound: { sort: ['createdAt', 'eventDate', 'status'], search: ['itemName', 'description', 'location', 'contactName', 'contactNumber', 'remarks', 'status', 'reportType', 'itemType'], filters: ['status', 'reportType', 'itemType', 'homeownerId'] },
  auditLog: { sort: ['created_at', 'action_type'], search: ['action', 'actor_name', 'actor_role', 'adminId', 'entity_id', 'id', 'timestamp', 'old_values', 'new_values'], filters: ['action_type', 'entity_type'] },
};

function positiveInteger(value, fallback, maximum) {
  if (!/^\d+$/.test(String(value ?? ''))) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : fallback;
}

function auditTimestampExpression(query) {
  // Audit created_at is the database insertion time, not necessarily the event
  // timestamp (legacy imports and different DB timezones). Sort/filter the
  // event timestamp, just as the existing browser does.
  const offset = Number(query.timezoneOffset);
  const minutes = Number.isInteger(offset) && Math.abs(offset) <= 840 ? offset : 0;
  const local = expression => `DATE_ADD(${expression}, INTERVAL ${minutes} MINUTE)`;
  const iso = "COALESCE(STR_TO_DATE(LEFT(t.timestamp, 23), '%Y-%m-%dT%H:%i:%s.%f'), STR_TO_DATE(LEFT(t.timestamp, 19), '%Y-%m-%dT%H:%i:%s'))";
  const legacy = year => `COALESCE(STR_TO_DATE(REPLACE(t.timestamp, '-', '/'), '%c/%e/${year}, %h:%i:%s %p'), STR_TO_DATE(REPLACE(t.timestamp, '-', '/'), '%c/%e/${year}, %h:%i %p'), STR_TO_DATE(REPLACE(t.timestamp, '-', '/'), '%c/%e/${year} %H:%i:%s'), STR_TO_DATE(REPLACE(t.timestamp, '-', '/'), '%c/%e/${year}'))`;
  return `CASE
    WHEN t.timestamp REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*Z$' THEN ${iso}
    WHEN t.timestamp REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}T.*[+-][0-9]{2}:[0-9]{2}$' THEN CONVERT_TZ(${iso}, RIGHT(t.timestamp, 6), '+00:00')
    WHEN t.timestamp REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN STR_TO_DATE(t.timestamp, '%Y-%m-%d')
    WHEN t.timestamp REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' THEN ${local("STR_TO_DATE(REPLACE(LEFT(t.timestamp, 19), 'T', ' '), '%Y-%m-%d %H:%i:%s')")}
    WHEN t.timestamp REGEXP '^[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{4}' THEN ${local(legacy('%Y'))}
    WHEN t.timestamp REGEXP '^[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2}' THEN ${local(legacy('%y'))}
    ELSE NULL END`;
}

function buildPageQuery(table, query, requester, hasPermission) {
  const definition = definitions[table];
  if (!definition) return null;
  const column = name => {
    if (table === 'users' && ['name', 'block', 'lot'].includes(name)) {
      return `COALESCE((SELECT h.\`${name}\` FROM homeowners h WHERE h.id = t.homeowner_id AND h.archived_at IS NULL), t.\`${name}\`)`;
    }
    if (table === 'users' && name === 'status') return "COALESCE(t.status, 'active')";
    return `t.\`${name}\``;
  };
  const clauses = table === 'auditLog' ? [] : ['t.archived_at IS NULL'];
  const params = [];
  if (typeof query.id === 'string' && query.id) { clauses.push('t.id = ?'); params.push(query.id); }
  // Report totals are tied to a complete financial snapshot. Resolve only its
  // current page of detail IDs, still intersecting with current authorization.
  if (query.ids !== undefined) {
    let ids;
    try { ids = JSON.parse(query.ids); } catch { ids = null; }
    if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => typeof id !== 'string' || id.length > 128)) {
      const error = new Error('Invalid page record IDs.'); error.status = 400; throw error;
    }
    if (!ids.length) clauses.push('1 = 0');
    else { clauses.push(`t.id IN (${ids.map(() => '?').join(', ')})`); params.push(...ids); }
  }
  const homeownerId = requester?.homeowner_id || requester?.homeownerId || null;
  const manager = permission => requester?.role === 'admin' || Boolean(requester && hasPermission(requester, permission));
  const permissions = { payments: 'payments', complaints: 'complaints', amenityBookings: 'amenities', vehicleRegistrations: 'vehicles', lostFound: 'lostfound' };
  if (permissions[table] && !manager(permissions[table])) {
    clauses.push(table === 'lostFound' ? "(t.status IN ('Approved', 'Posted', 'Claimed') OR t.homeownerId = ?)" : 't.homeownerId = ?');
    params.push(homeownerId);
  }
  if (table === 'billings' && !manager('billing')) {
    clauses.push("EXISTS (SELECT 1 FROM billing_assignments ba WHERE ba.billing_id = t.id AND ba.homeowner_id = ? AND ba.status = 'active')");
    params.push(homeownerId);
  }
  if (table === 'homeowners' && requester?.role !== 'admin' &&
      !['billing', 'payments', 'complaints', 'vehicles', 'amenities', 'lostfound'].some(manager)) {
    clauses.push('t.id = ?'); params.push(homeownerId);
  }
  for (const name of definition.filters) {
    if (typeof query[name] !== 'string' || !query[name]) continue;
    if (table === 'complaints' && name === 'status' && query[name] === 'Reviewed') {
      clauses.push("t.status IN ('Reviewed', 'Open')");
    } else if (table === 'complaints' && name === 'category' && query[name] === 'Others') {
      clauses.push("t.category LIKE 'Others%'");
    } else {
      clauses.push(`${column(name)} = ?`); params.push(query[name]);
    }
  }
  if (table === 'homeowners' && ['registered', 'not-registered'].includes(query.registration)) {
    clauses.push(`${query.registration === 'not-registered' ? 'NOT ' : ''}EXISTS (SELECT 1 FROM users u WHERE u.homeowner_id = t.id AND u.role = 'homeowner' AND u.archived_at IS NULL)`);
  }
  if (table === 'billings' && ['paid', 'partially_paid', 'overdue', 'unpaid'].includes(query.collectionStatus)) {
    const assignments = "ba.billing_id = t.id AND ba.status <> 'archived'";
    const paidAmount = "(SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.billingId = t.id AND p.homeownerId = ba.homeowner_id AND p.status = 'approved' AND p.archived_at IS NULL)";
    const collected = `CASE
      WHEN NOT EXISTS (SELECT 1 FROM billing_assignments ba WHERE ${assignments}) THEN 'inactive'
      WHEN t.balance_reset_at IS NULL AND t.amount > 0 AND NOT EXISTS (SELECT 1 FROM billing_assignments ba WHERE ${assignments} AND ROUND(${paidAmount}, 2) < t.amount) THEN 'paid'
      WHEN EXISTS (SELECT 1 FROM payments p JOIN billing_assignments ba ON ba.homeowner_id = p.homeownerId AND ba.billing_id = p.billingId WHERE ${assignments} AND p.status = 'pending' AND p.archived_at IS NULL) THEN 'pending'
      WHEN EXISTS (SELECT 1 FROM billing_assignments ba WHERE ${assignments} AND ${paidAmount} > 0) THEN 'partially_paid'
      WHEN NULLIF(t.dueDate, '') < ? THEN 'overdue'
      WHEN t.status = 'inactive' THEN 'inactive' ELSE 'active' END`;
    const today = /^\d{4}-\d{2}-\d{2}$/.test(query.today || '') ? query.today : new Date().toISOString().slice(0, 10);
    if (query.collectionStatus === 'partially_paid') {
      clauses.push(`(${collected}) = 'partially_paid'`); params.push(today);
    } else {
      const paid = `(COALESCE(t.status, '') = 'paid' OR (${collected}) = 'paid')`;
      if (query.collectionStatus === 'paid') { clauses.push(paid); params.push(today); }
      else {
        clauses.push(`NOT ${paid}`); params.push(today);
        clauses.push(query.collectionStatus === 'overdue' ? "NULLIF(t.dueDate, '') < ?" : "(NULLIF(t.dueDate, '') IS NULL OR t.dueDate >= ?)");
        params.push(today);
      }
    }
  }
  const start = /^\d{4}-\d{2}-\d{2}$/.test(query.startDate || '') ? query.startDate : null;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(query.endDate || '') ? query.endDate : null;
  if ((start || end) && ['billings', 'payments'].includes(table)) {
    const dates = table === 'billings'
      ? ['DATE(NULLIF(t.dueDate, \'\'))', 'DATE(NULLIF(t.createdAt, \'\'))', "CASE WHEN DATE(NULLIF(t.dueDate, '')) IS NULL AND DATE(NULLIF(t.createdAt, '')) IS NULL THEN DATE(CONCAT(t.monthly_dues_month, '-01')) END"]
      : ["DATE(NULLIF(t.payment_date, ''))", "DATE(NULLIF(t.submittedAt, ''))", "CASE WHEN DATE(NULLIF(t.payment_date, '')) IS NULL AND DATE(NULLIF(t.submittedAt, '')) IS NULL THEN DATE(t.created_at) END", "CASE WHEN DATE(NULLIF(t.payment_date, '')) IS NULL AND DATE(NULLIF(t.submittedAt, '')) IS NULL THEN DATE(NULLIF(t.reviewedAt, '')) END"];
    clauses.push('(' + dates.map(date => {
      const range = [];
      if (start) { range.push(`${date} >= ?`); params.push(start); }
      if (end) { range.push(`${date} <= ?`); params.push(end); }
      return '(' + range.join(' AND ') + ')';
    }).join(' OR ') + ')');
  }
  if (table === 'auditLog') {
    // Browser-local calendar boundaries are sent as UTC instants. Comparing
    // instants keeps Today/Week/Month consistent across deployment timezones.
    for (const [key, operator] of [['fromInstant', '>='], ['toInstant', '<']]) {
      if (typeof query[key] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(query[key]) && Number.isFinite(Date.parse(query[key]))) {
        clauses.push(`(${auditTimestampExpression(query)}) ${operator} ?`);
        params.push(query[key].replace('T', ' ').replace('Z', ''));
      }
    }
  }
  if (typeof query.q === 'string' && query.q.trim()) {
    const fields = definition.search.map(column);
    if (table === 'billings') fields.push("FORMAT(t.amount, 2)", "CONCAT('₱', FORMAT(t.amount, 2))", "COALESCE(NULLIF(t.dueDate, ''), 'No due date')", "DATE_FORMAT(CONCAT(t.monthly_dues_month, '-01'), '%M %Y')");
    if (table === 'users') fields.push("CASE t.role WHEN 'admin' THEN 'Administrator' WHEN 'homeowner' THEN 'Resident' ELSE t.role END");
    let expression = `LOWER(CONCAT_WS(' ', ${fields.join(', ')})) LIKE ? ESCAPE '!'`;
    const needle = `%${query.q.trim().toLowerCase().replace(/[!%_]/g, '!$&')}%`;
    params.push(needle);
    if (table === 'homeowners') {
      expression += " OR EXISTS (SELECT 1 FROM users u WHERE u.homeowner_id = t.id AND u.role = 'homeowner' AND u.archived_at IS NULL AND LOWER(u.email) LIKE ? ESCAPE '!')";
      params.push(needle);
    }
    if (['complaints', 'amenityBookings', 'payments'].includes(table)) {
      expression += " OR EXISTS (SELECT 1 FROM homeowners h WHERE h.id = t.homeownerId AND h.archived_at IS NULL AND LOWER(CONCAT_WS(' ', h.name, h.block, h.lot)) LIKE ? ESCAPE '!')";
      params.push(needle);
    }
    if (table === 'billings') {
      expression += " OR EXISTS (SELECT 1 FROM billing_assignments ba JOIN homeowners h ON h.id = ba.homeowner_id LEFT JOIN users u ON u.homeowner_id = h.id AND u.role = 'homeowner' AND u.archived_at IS NULL WHERE ba.billing_id = t.id AND ba.status <> 'archived' AND h.archived_at IS NULL AND LOWER(CONCAT_WS(' ', h.name, h.block, h.lot, u.email)) LIKE ? ESCAPE '!'";
      params.push(needle);
      if (!manager('billing')) { expression += ' AND ba.homeowner_id = ?'; params.push(homeownerId); }
      expression += ')';
    }
    if (table === 'payments') {
      expression += " OR EXISTS (SELECT 1 FROM billings b WHERE b.id = t.billingId AND LOWER(b.title) LIKE ? ESCAPE '!')";
      params.push(needle);
    }
    clauses.push(`(${expression})`);
  }
  const sort = definition.sort.includes(query.sort) ? query.sort : definition.sort[0];
  const direction = String(query.direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const pageSize = positiveInteger(query.pageSize, 25, 100);
  const page = positiveInteger(query.page, 1, Math.floor(Number.MAX_SAFE_INTEGER / pageSize));
  const order = table === 'auditLog' && sort === 'created_at'
    ? `(${auditTimestampExpression(query)}) ${direction}, t.id ${direction}`
    : table === 'complaints' && query.sort === 'priority'
    ? "CASE t.status WHEN 'Reviewed' THEN 0 WHEN 'Open' THEN 0 WHEN 'In Progress' THEN 1 WHEN 'Resolved' THEN 2 WHEN 'Rejected' THEN 3 ELSE 4 END ASC, t.id ASC"
    : `${column(sort)} ${direction}, t.id ${direction}`;
  return { page, pageSize, params, where: clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '', order };
}

module.exports = { buildPageQuery, positiveInteger };
