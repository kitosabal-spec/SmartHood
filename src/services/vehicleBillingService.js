'use strict';

const crypto = require('node:crypto');

function vehicleBillingDetails(vehicle) {
  const details = {
    vehicle_registration_id: vehicle.id,
    assignedTo: [vehicle.homeownerId],
    billing_type: 'Other Billing',
    title: `Vehicle registration - ${vehicle.plateNumber}`,
    description: `Vehicle: ${vehicle.vehicleType}, plate ${vehicle.plateNumber}. Registrant: ${vehicle.ownerName}. Registration fee: ₱${Number(vehicle.fee).toFixed(2)}.`,
  };
  return { ...details, vehicleVersion: crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex') };
}

function createVehicleBillingService({ get, requireAdmin, eligibleIds, validate, save, notify }) {
  async function handle(req, res, create = false) {
    if (!await requireAdmin(req, res)) return;
    const vehicle = await get('SELECT * FROM vehicleRegistrations WHERE id = ? AND archived_at IS NULL FOR UPDATE', [req.params.id]);
    if (!vehicle) return res.status(404).json({ error: 'Vehicle registration not found.' });
    const existing = await get('SELECT * FROM billings WHERE vehicle_registration_id = ? FOR UPDATE', [vehicle.id]);
    if (existing) {
      if (create) return res.status(409).json({ error: 'This vehicle already has a billing. Use View Billing.', billingId: existing.id });
      return res.json({ billing: existing });
    }
    if (vehicle.paymentStatus === 'Paid') return res.status(409).json({ error: 'This vehicle is already marked paid. No new billing can be created.' });
    if (vehicle.registrationStatus !== 'Approved') return res.status(409).json({ error: 'Only approved vehicle registrations can be billed.' });
    if (!vehicle.homeownerId) return res.status(400).json({ error: 'Link this vehicle to a homeowner before creating billing.' });
    const homeowner = await get('SELECT * FROM homeowners WHERE id = ? AND archived_at IS NULL', [vehicle.homeownerId]);
    if (!homeowner || !(await eligibleIds()).has(vehicle.homeownerId)) {
      return res.status(400).json({ error: 'The linked homeowner does not have an eligible Resident Portal account. Enable the Resident Portal module before creating billing.' });
    }
    const details = vehicleBillingDetails(vehicle);
    if (!create) return res.json({ ...details, homeowner: { id: homeowner.id, name: homeowner.name }, fee: vehicle.fee });
    if (req.body.vehicleVersion !== details.vehicleVersion) {
      return res.status(409).json({ error: 'Vehicle details changed. Reopen Create Billing and review the current details.' });
    }
    if (req.body.note != null && (typeof req.body.note !== 'string' || req.body.note.length > 2000)) {
      return res.status(400).json({ error: 'Optional note must be text of at most 2,000 characters.' });
    }
    const note = (req.body.note || '').trim();
    const bill = { ...details, amount: req.body.amount, dueDate: req.body.dueDate, noDueDate: req.body.noDueDate,
      description: details.description + (note ? `\nNote: ${note}` : ''), status: 'active',
      createdAt: new Date().toISOString(), monthly_dues_month: null };
    delete bill.vehicleVersion;
    if (!await validate(bill, res)) return;
    if (bill.amount <= 0 || bill.amount > 9999999999.99) return res.status(400).json({ error: 'Enter a valid positive amount.' });
    try { await save('billings', bill); }
    catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      return res.status(409).json({ error: 'This vehicle already has a billing. Use View Billing.' });
    }
    await notify(bill);
    return res.status(201).json({ billing: bill });
  }
  return { preview: (req, res) => handle(req, res), create: (req, res) => handle(req, res, true) };
}

module.exports = { createVehicleBillingService, vehicleBillingDetails };
