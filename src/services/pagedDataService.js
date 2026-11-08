'use strict';
const { buildPageQuery } = require('./paginationService');

async function readPage(table, query, requester, services) {
  const { all, get, userHasPermission, requesterHomeownerId, deserializeRow, presentPrivateFiles,
    attachComplaintResponses, presentHomeownerAccountStatus, mergeUserWithHomeowner } = services;
  const auditSearch = table === 'auditLog' && typeof query.q === 'string' && query.q.trim();
  const plan = buildPageQuery(table, auditSearch ? { ...query, q: '' } : query, requester, userHasPermission);
  if (!plan) return null;
  const from = `\`${table}\` t`;
  if (auditSearch) {
    // Historical audit text includes formatted dates, labels, redaction and
    // legacy event envelopes. Preserve its exact search semantics. Scan in
    // bounded batches only for free-text searches; ordinary paging uses LIMIT.
    const { getAuditEventParts, getAuditExportDescription } = require('../utils/auditPresentation');
    const needle = query.q.trim().toLowerCase();
    let offset = 0, total = 0, items = [], lastPage = [];
    for (;;) {
      const rows = await all(`SELECT t.* FROM ${from}${plan.where} ORDER BY ${plan.order} LIMIT ? OFFSET ?`, [...plan.params, 250, offset]);
      const actorIds = [...new Set(rows.filter(row => !row.actor_name && row.adminId && row.adminId !== 'system:migration').map(row => row.adminId))];
      const canViewDirectory = requester.role === 'admin' || ['billing', 'payments', 'complaints', 'vehicles', 'amenities', 'lostfound'].some(permission => userHasPermission(requester, permission));
      const visibleActors = canViewDirectory ? actorIds : actorIds.filter(id => id === requester.id);
      const actors = visibleActors.length ? await all(`SELECT id, name, username FROM users WHERE id IN (${visibleActors.map(() => '?').join(', ')}) AND archived_at IS NULL`, visibleActors) : [];
      const names = new Map(actors.map(actor => [actor.id, actor.name || actor.username || actor.id]));
      for (const row of rows) {
        const actor = row.actor_name || (row.adminId === 'system:migration' ? 'Database migration' : row.adminId ? names.get(row.adminId) || row.adminId : 'System');
        const action = `${row.action || ''} ${getAuditExportDescription(row)} ${row.id || ''} ${getAuditEventParts(row).recordId}`;
        if (![action, actor, row.adminId || '', row.timestamp || ''].some(value => String(value).toLowerCase().includes(needle))) continue;
        if (total % plan.pageSize === 0) lastPage = [];
        lastPage.push(row);
        if (Math.floor(total / plan.pageSize) + 1 === plan.page) items.push(row);
        total++;
      }
      if (rows.length < 250) break;
      offset += rows.length;
    }
    const totalPages = Math.ceil(total / plan.pageSize);
    const page = Math.min(plan.page, Math.max(1, totalPages));
    if (page !== plan.page) items = lastPage;
    return { items: items.map(row => deserializeRow(table, row)), total, totalPages, page, pageSize: plan.pageSize };
  }
  const count = await get(`SELECT COUNT(*) AS total FROM ${from}${plan.where}`, plan.params);
  const total = Number(count.total);
  const totalPages = Math.ceil(total / plan.pageSize);
  const page = Math.min(plan.page, Math.max(1, totalPages));
  let select = 't.*';
  let joins = '';
  if (table === 'payments') {
    select += ', b.title AS historical_billing_title, b.amount AS historical_billing_amount, b.balance_reset_at AS billing_balance_reset_at';
    joins = ' LEFT JOIN billings b ON b.id = t.billingId';
  } else if (table === 'amenityBookings' || table === 'vehicleRegistrations') {
    select += ', b.id AS billingId, b.status AS billingStatus, b.archived_at AS billingArchivedAt';
    joins = ` LEFT JOIN billings b ON b.${table === 'amenityBookings' ? 'amenity_booking_id' : 'vehicle_registration_id'} = t.id`;
  } else if (table === 'homeowners') {
    select += ', COALESCE(s.remaining_balance, 0) AS balance, COALESCE(s.total_billed, 0) AS total_billed, COALESCE(s.total_approved_payments, 0) AS total_approved_payments';
    joins = ' LEFT JOIN homeowner_financial_summary s ON s.homeowner_id = t.id';
    if (query.sort === 'balance') plan.order = plan.order.replace('t.`balance`', 'COALESCE(s.remaining_balance, 0)');
  }
  const rows = await all(`SELECT ${select} FROM ${from}${joins}${plan.where} ORDER BY ${plan.order} LIMIT ? OFFSET ?`,
    [...plan.params, plan.pageSize, (page - 1) * plan.pageSize]);
  let items = rows.map(row => deserializeRow(table, row));
  if (items.length) {
    const ids = items.map(item => item.id);
    const placeholders = ids.map(() => '?').join(', ');
    if (table === 'billings') {
      const canManage = requester.role === 'admin' || userHasPermission(requester, 'billing');
      const assignments = canManage ? await all(`SELECT billing_id, homeowner_id FROM billing_assignments WHERE billing_id IN (${placeholders}) AND status <> 'archived'`, ids) : [];
      const byBilling = new Map();
      for (const row of assignments) {
        if (!byBilling.has(row.billing_id)) byBilling.set(row.billing_id, []);
        byBilling.get(row.billing_id).push(row.homeowner_id);
      }
      items = items.map(item => ({ ...item, assignedTo: canManage ? byBilling.get(item.id) || [] : [requesterHomeownerId(requester)] }));
    } else if (table === 'complaints') {
      items = await attachComplaintResponses(items);
    } else if (table === 'homeowners') {
      const accounts = await all(`SELECT id, homeowner_id, email, mobile, status FROM users WHERE role = 'homeowner' AND archived_at IS NULL AND homeowner_id IN (${placeholders})`, ids);
      const byHomeowner = new Map(accounts.map(account => [account.homeowner_id, account]));
      items = items.map(item => presentHomeownerAccountStatus(item, byHomeowner.get(item.id)));
    } else if (table === 'users') {
      const homeownerIds = [...new Set(items.map(item => item.homeowner_id).filter(Boolean))];
      if (homeownerIds.length) {
        const homeowners = await all(`SELECT h.*, COALESCE(s.remaining_balance, 0) AS balance FROM homeowners h LEFT JOIN homeowner_financial_summary s ON s.homeowner_id = h.id WHERE h.id IN (${homeownerIds.map(() => '?').join(', ')}) AND h.archived_at IS NULL`, homeownerIds);
        const byHomeowner = new Map(homeowners.map(homeowner => [homeowner.id, homeowner]));
        items = items.map(item => mergeUserWithHomeowner(item, byHomeowner.get(item.homeowner_id)));
      }
    }
  }
  items = items.map(item => presentPrivateFiles(table, item, requester));
  return { items, page, pageSize: plan.pageSize, total, totalPages };
}

module.exports = { readPage };
