'use strict';

const VEHICLE_TYPES = ['Car', 'Motorcycle', 'Tricycle', 'Van', 'Truck', 'SUV', 'Other'];
const VEHICLE_REGISTRATION_FEES = { homeowner: 200, nonHomeowner: 250 };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VEHICLE_TYPES, VEHICLE_REGISTRATION_FEES };
}
