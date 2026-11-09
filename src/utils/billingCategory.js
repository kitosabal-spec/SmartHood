'use strict';

const BILLING_CATEGORIES = ['monthly_dues', 'vehicle_fees', 'amenity_fees', 'other_charges'];

// Relationships and the financial billing type take precedence over manual labels.
function inferBillingCategory(billing) {
  if (billing.vehicle_registration_id) return 'vehicle_fees';
  if (billing.amenity_booking_id) return 'amenity_fees';
  if (billing.billing_type === 'Monthly Association Dues' ||
      (!billing.billing_type && /^\d{4}-(0[1-9]|1[0-2])$/.test(billing.monthly_dues_month || ''))) return 'monthly_dues';
  return BILLING_CATEGORIES.includes(billing.billing_category) ? billing.billing_category : 'other_charges';
}

function prepareBillingCategory(billing) {
  if (billing.billing_category != null && !BILLING_CATEGORIES.includes(billing.billing_category)) {
    throw new Error('Select a valid billing category.');
  }
  const category = inferBillingCategory(billing);
  if (category === 'monthly_dues' && billing.billing_type !== 'Monthly Association Dues') {
    throw new Error('Use the Monthly Association Dues billing type and select a billing month.');
  }
  billing.billing_category = category;
}

module.exports = { BILLING_CATEGORIES, inferBillingCategory, prepareBillingCategory };
