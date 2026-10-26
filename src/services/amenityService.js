'use strict';

const AMENITIES = ['Basketball Court', 'Clubhouse', 'Chairs', 'Tables', 'Ladder'];
const OCCUPIED = ['Pending', 'Approved'];

function unavailableSettings(value) {
  let settings;
  try { settings = JSON.parse(value); } catch { /* Use the existing Sunday default. */ }
  return {
    weeklyDays: Array.isArray(settings?.weeklyDays)
      ? settings.weeklyDays.map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6) : [0],
    // Public availability never includes rule IDs, remarks, or free-text reasons.
    dateRules: Array.isArray(settings?.dateRules)
      ? settings.dateRules.map(({ amenity, date }) => ({ amenity, date })) : [],
  };
}

function isUnavailable(settings, amenity, date) {
  return settings.weeklyDays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ||
    settings.dateRules.some(rule => rule.date === date && (rule.amenity === 'all' || rule.amenity === amenity));
}

function createAmenityService({ get, all }) {
  async function lock() {
    // Called inside the business/audit transaction; held until commit/rollback.
    // A locking read below sees the latest committed rows, even under MySQL RR.
    const row = await get('SELECT id FROM amenity_availability_lock WHERE id = 1 FOR UPDATE');
    if (!row) throw new Error('Amenity availability migration is missing.');
  }
  async function availability() {
    // Read closures and occupancy in a single statement/snapshot.
    const rows = await all(`SELECT b.amenity, b.bookingDate, b.status, s.value AS unavailableValue
      FROM (SELECT 1 AS singleton) seed
      LEFT JOIN appSettings s ON s.id = 'amenityUnavailable'
      LEFT JOIN amenityBookings b ON b.archived_at IS NULL AND b.status IN ('Pending', 'Approved')`);
    return {
      bookings: rows.filter(row => row.amenity).map(({ amenity, bookingDate, status }) => ({ amenity, bookingDate, status })),
      unavailable: unavailableSettings(rows[0]?.unavailableValue),
    };
  }
  async function validate(booking, res, ignoreId = '') {
    const date = String(booking.bookingDate || '');
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!AMENITIES.includes(booking.amenity) || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
        !['Pending', 'Approved', 'Rejected'].includes(booking.status) || !booking.homeownerId ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.startTime || '') ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(booking.endTime || '') || booking.endTime <= booking.startTime) {
      res.status(400).json({ error: 'Select a valid amenity, date, homeowner, status, and time range.' });
      return false;
    }
    if (!OCCUPIED.includes(booking.status)) return true;
    const setting = await get("SELECT value FROM appSettings WHERE id = 'amenityUnavailable' FOR UPDATE");
    if (isUnavailable(unavailableSettings(setting?.value), booking.amenity, date)) {
      res.status(409).json({ error: 'This amenity is unavailable on that date. Choose another date.' });
      return false;
    }
    const conflict = await get(`SELECT id FROM amenityBookings
      WHERE amenity = ? AND bookingDate = ? AND id <> ? AND archived_at IS NULL
        AND status IN ('Pending', 'Approved') LIMIT 1 FOR UPDATE`, [booking.amenity, date, ignoreId]);
    if (conflict) {
      res.status(409).json({ error: 'This amenity is already booked or pending for that entire date. Choose another date.' });
      return false;
    }
    return true;
  }
  return { lock, availability, validate };
}

module.exports = { createAmenityService, unavailableSettings, isUnavailable };
