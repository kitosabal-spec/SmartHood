'use strict';

function moneyToCents(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new TypeError('Money value must be a finite decimal number.');
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole, fraction = ''] = unsigned.split('.');
  const thousandths = Number((fraction + '000').slice(0, 3));
  let cents = (BigInt(whole) * 100n) + BigInt(Math.floor(thousandths / 10));
  if (thousandths % 10 >= 5) cents += 1n;
  return negative ? -cents : cents;
}

function centsToNumber(cents) {
  const value = Number(cents) / 100;
  if (!Number.isSafeInteger(Number(cents))) throw new RangeError('Money value exceeds the safe application range.');
  return value;
}

function roundMoney(value) {
  try {
    return centsToNumber(moneyToCents(value));
  } catch {
    return 0;
  }
}

function billingBalance(assignedAmount, approvedPayments) {
  const billed = moneyToCents(assignedAmount);
  const paid = approvedPayments.reduce((sum, payment) => sum + moneyToCents(payment), 0n);
  return {
    originalAmount: centsToNumber(billed),
    totalPaid: centsToNumber(paid),
    remainingBalance: centsToNumber(billed > paid ? billed - paid : 0n),
  };
}

module.exports = { moneyToCents, centsToNumber, roundMoney, billingBalance };
