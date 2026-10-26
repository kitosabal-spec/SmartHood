'use strict';

const crypto = require('node:crypto');

function bookingBillingDetails(booking) {
  const details = {
    amenity_booking_id: booking.id,
    assignedTo: [booking.homeownerId],
    billing_type: 'Other Billing',
    title: `${booking.amenity} reservation - ${booking.bookingDate}`,
    description: `Amenity: ${booking.amenity}. Reservation: ${booking.bookingDate}, ${booking.startTime} - ${booking.endTime}.`,
  };
  return { ...details, bookingVersion: crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex') };
}

// Both handlers run inside the existing audit transaction. Locking reads are
// current reads under MySQL REPEATABLE READ, including after authorization.
function createAmenityBillingService({ get, requireAdmin, eligibleIds, validate, save, notify }) {
  async function handle(req, res, create = false) {
    if (!await requireAdmin(req, res)) return;
    const booking = await get('SELECT * FROM amenityBookings WHERE id = ? AND archived_at IS NULL FOR UPDATE', [req.params.id]);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const existing = await get('SELECT * FROM billings WHERE amenity_booking_id = ? FOR UPDATE', [booking.id]);
    // Archived bills still count, so archiving cannot enable double charging.
    if (existing) {
      if (create) return res.status(409).json({ error: 'This booking already has a billing. Use View Billing.', billingId: existing.id });
      return res.json({ billing: existing });
    }
    if (booking.status !== 'Approved') return res.status(409).json({ error: 'Only approved bookings can be billed.' });
    const homeowner = await get('SELECT * FROM homeowners WHERE id = ? AND archived_at IS NULL', [booking.homeownerId]);
    if (!homeowner || !(await eligibleIds()).has(booking.homeownerId)) {
      return res.status(400).json({ error: 'This requesting homeowner does not have an eligible Resident Portal account. Enable the Resident Portal module on their homeowner account before creating billing. The approved date remains reserved.' });
    }
    const details = bookingBillingDetails(booking);
    if (!create) return res.json({ ...details, homeowner: { id: homeowner.id, name: homeowner.name } });
    if (req.body.bookingVersion !== details.bookingVersion) {
      return res.status(409).json({ error: 'Booking details changed. Reopen Create Billing and review the current details.' });
    }
    if (req.body.note != null && (typeof req.body.note !== 'string' || req.body.note.length > 2000)) {
      return res.status(400).json({ error: 'Optional note must be text of at most 2,000 characters.' });
    }
    const note = (req.body.note || '').trim();
    const bill = {
      ...details, amount: req.body.amount, dueDate: req.body.dueDate, noDueDate: req.body.noDueDate,
      description: details.description + (note ? `\nNote: ${note}` : ''),
      status: 'active', createdAt: new Date().toISOString(), monthly_dues_month: null,
    };
    delete bill.bookingVersion;
    if (!await validate(bill, res)) return;
    if (bill.amount <= 0 || bill.amount > 9999999999.99) return res.status(400).json({ error: 'Enter an amount between ₱0.01 and ₱9,999,999,999.99.' });
    try {
      await save('billings', bill);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      return res.status(409).json({ error: 'This booking already has a billing. Use View Billing.' });
    }
    await notify(bill);
    return res.status(201).json({ billing: bill });
  }
  return { preview: (req, res) => handle(req, res), create: (req, res) => handle(req, res, true) };
}

module.exports = { createAmenityBillingService, bookingBillingDetails };
