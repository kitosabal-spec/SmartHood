'use strict';

const { VEHICLE_TYPES, VEHICLE_REGISTRATION_FEES } = require('../../public/js/vehicle-config');

class VehicleError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const text = value => typeof value === 'string' ? value.trim() : '';
const active = status => status === 'Pending' || status === 'Approved';
const plateConflict = () => new VehicleError(409, 'This plate already has an active registration.');

function createVehicleService({ get, saveRecord, createServerNotification }) {
  async function claimPlate(plate, id = '') {
    const key = plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!key) throw new VehicleError(400, 'Enter a valid plate number.');
    // Pre-migration rows have no key. New and reactivated registrations are
    // protected by the unique index even when simultaneous requests race.
    const legacy = await get(`SELECT id FROM vehicleRegistrations
      WHERE activePlateKey IS NULL AND archived_at IS NULL AND registrationStatus IN ('Pending','Approved')
        AND REGEXP_REPLACE(UPPER(plateNumber), '[^A-Z0-9]', '') = ? AND id <> ? LIMIT 1`, [key, id]);
    if (legacy) throw plateConflict();
    return key;
  }

  async function persist(record) {
    try {
      await saveRecord('vehicleRegistrations', record, { insertOnly: !record.id });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY' && error.message.includes('uq_vehicle_active_plate')) throw plateConflict();
      if (error.code === 'ER_DUP_ENTRY' && /stickerNumber/i.test(error.message)) {
        throw new VehicleError(409, 'That sticker number is already assigned.');
      }
      throw error;
    }
  }

  async function notifyHomeowner(homeownerId, title, message) {
    if (homeownerId) {
      await createServerNotification(title, message, { homeownerId });
    }
  }

  async function register(input, { canManage, ownId }) {
    const behalf = canManage && !input.selfRegistration;
    if (!behalf && (!ownId || (input.homeownerId && input.homeownerId !== ownId))) {
      throw new VehicleError(403, 'You can only submit registrations for your own property.');
    }
    const homeownerId = behalf ? input.homeownerId : ownId;
    const { registrantType, vehicleType } = input;
    const plateNumber = text(input.plateNumber).toUpperCase();
    if (!['homeowner', 'nonHomeowner'].includes(registrantType) || !VEHICLE_TYPES.includes(vehicleType)) {
      throw new VehicleError(400, 'Select a registration type and vehicle type.');
    }
    if (!plateNumber || plateNumber.length > 255 || !/^[A-Z0-9 -]+$/.test(plateNumber)) {
      throw new VehicleError(400, 'Enter a plate number using letters, digits, spaces or hyphens.');
    }
    let property;
    if (homeownerId != null && homeownerId !== '') {
      if (typeof homeownerId !== 'string') throw new VehicleError(400, 'Select a valid property.');
      property = await get('SELECT id, name, block, lot FROM homeowners WHERE id = ? AND archived_at IS NULL FOR UPDATE', [homeownerId]);
      if (!property) throw new VehicleError(400, 'The selected homeowner is no longer available.');
    }
    if (registrantType === 'homeowner' && !property) throw new VehicleError(400, 'Select a homeowner.');
    const registrationLocation = property ? null : text(input.registrationLocation);
    if (!property && (!registrationLocation || registrationLocation.length > 255)) {
      throw new VehicleError(400, 'Enter a reason or location (up to 255 characters).');
    }
    const ownerName = behalf && registrantType === 'homeowner' ? property.name : text(input.ownerName);
    if (!ownerName || ownerName.length > 255) throw new VehicleError(400, 'Enter the vehicle owner’s full name (up to 255 characters).');
    const now = new Date().toISOString();
    const record = {
      homeownerId: property?.id || null, ownerName, registrationLocation,
      block: behalf ? property?.block || '' : text(input.block),
      lot: behalf ? property?.lot || '' : text(input.lot),
      vehicleType, plateNumber, registrantType, fee: VEHICLE_REGISTRATION_FEES[registrantType],
      activePlateKey: await claimPlate(plateNumber), registrationStatus: 'Pending', paymentStatus: 'Unpaid',
      stickerNumber: null, remarks: '', createdAt: now, updatedAt: now, releasedAt: '',
    };
    if (!behalf && (!record.block || !record.lot)) throw new VehicleError(400, 'Enter the block and lot.');
    await persist(record);
    if (behalf) await notifyHomeowner(record.homeownerId, 'Vehicle Registered', `Vehicle ${plateNumber} was registered for your property and is pending review.`);
    else await createServerNotification('Vehicle Registration Submitted', `Vehicle ${plateNumber} was submitted for review.`, { roles: ['admin', 'security'] });
    return record;
  }

  async function manage(id, input) {
    const before = await get('SELECT * FROM vehicleRegistrations WHERE id = ? AND archived_at IS NULL FOR UPDATE', [id]);
    if (!before) throw new VehicleError(404, 'Vehicle registration not found.');
    const registrationStatus = input.registrationStatus ?? before.registrationStatus ?? 'Pending';
    const paymentStatus = input.paymentStatus ?? before.paymentStatus ?? 'Unpaid';
    if (!['Pending', 'Approved', 'Expired', 'Rejected'].includes(registrationStatus) || !['Paid', 'Unpaid'].includes(paymentStatus)) {
      throw new VehicleError(400, 'Select a valid registration and payment status.');
    }
    const stickerNumber = text(input.stickerNumber === undefined ? before.stickerNumber : input.stickerNumber).toUpperCase() || null;
    if (stickerNumber && (stickerNumber.length > 255 || !/[A-Z0-9]/.test(stickerNumber))) {
      throw new VehicleError(400, 'Enter a valid sticker number.');
    }
    const released = Boolean(input.releasedAt === undefined ? before.releasedAt : input.releasedAt);
    if (released && (!stickerNumber || registrationStatus !== 'Approved' || paymentStatus !== 'Paid')) {
      throw new VehicleError(400, 'Sticker release requires approval, paid registration and a unique sticker number.');
    }
    if (stickerNumber && await get('SELECT id FROM vehicleRegistrations WHERE UPPER(TRIM(stickerNumber)) = ? AND id <> ? LIMIT 1', [stickerNumber, id])) {
      throw new VehicleError(409, 'That sticker number is already assigned.');
    }
    const now = new Date().toISOString();
    const changes = { id, paymentStatus, registrationStatus, stickerNumber, updatedAt: now,
      releasedAt: released ? before.releasedAt || now.slice(0, 10) : '' };
    if (input.remarks !== undefined) changes.remarks = text(input.remarks);
    if (!active(registrationStatus)) changes.activePlateKey = null;
    else if (!active(before.registrationStatus)) changes.activePlateKey = await claimPlate(before.plateNumber || '', id);
    await persist(changes);
    await notifyHomeowner(before.homeownerId, 'Vehicle Registration Updated', `${before.plateNumber} is now ${registrationStatus}.`);
    return { before, after: { ...before, ...changes } };
  }

  return { register, manage };
}

module.exports = { createVehicleService, VehicleError };
