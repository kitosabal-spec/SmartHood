'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'amenities.js'), 'utf8');
const homeowners = {
  h1: { id: 'h1', name: 'Keith Bernard Osabal', block: 'Block 1', lot: 'Lot 2' },
  h2: { id: 'h2', name: 'Maria Santos', block: 'Block 2', lot: 'Lot 7' },
};
const context = {
  getHomeownerById: id => homeowners[id] || null,
};
vm.createContext(context);
vm.runInContext(source, context);

const bookings = [
  { id: 'b1', homeownerId: 'h1', amenity: 'Basketball Court', purpose: 'Training', bookingDate: '2026-10-14', status: 'Pending' },
  { id: 'b2', homeownerId: 'h1', amenity: 'Basketball Court', purpose: 'Playing', bookingDate: '2026-10-08', status: 'Approved' },
  { id: 'b3', homeownerId: 'h2', amenity: 'Clubhouse', purpose: 'Meeting', bookingDate: '2026-05-30', status: 'Approved' },
];

test('amenity request filters combine search, status, and amenity', () => {
  assert.deepEqual(
    context.getFilteredAdminAmenityBookings(bookings, { search: 'maria', status: 'Approved', amenity: 'Clubhouse' }).map(item => item.id),
    ['b3']
  );
});

test('amenity request search includes homeowner location, purpose, and date', () => {
  assert.deepEqual(context.getFilteredAdminAmenityBookings(bookings, { search: 'block 1' }).map(item => item.id), ['b1', 'b2']);
  assert.deepEqual(context.getFilteredAdminAmenityBookings(bookings, { search: 'training' }).map(item => item.id), ['b1']);
  assert.deepEqual(context.getFilteredAdminAmenityBookings(bookings, { search: '2026-05-30' }).map(item => item.id), ['b3']);
});
