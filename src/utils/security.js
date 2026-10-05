const crypto = require('crypto');

function isBcryptHash(value) {
  return typeof value === 'string' && /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

function hashPasswordResetToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function isPasswordResetToken(token) {
  return typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
}

module.exports = { isBcryptHash, hashPasswordResetToken, isPasswordResetToken };
