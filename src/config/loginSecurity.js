'use strict';

function integer(value, fallback, min, max) {
  if (!/^\d+$/.test(String(value ?? ''))) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function readLoginSecurityConfig(env = process.env) {
  const identifierMax = integer(env.LOGIN_IDENTIFIER_MAX_FAILURES, 8, 1, 100);
  const windowMs = integer(env.LOGIN_RATE_WINDOW_MS, 900000, 1000, 86400000);
  return {
    // Only bounded hop counts are accepted, never `true`. Direct deployments
    // ignore forwarded headers; Render defaults to its nearest ingress hop.
    trustProxy: integer(env.TRUST_PROXY, env.RENDER === 'true' ? 1 : 0, 0, 5),
    windowMs,
    identifierMax,
    warningAfter: integer(env.LOGIN_WARNING_AFTER_FAILURES, Math.min(5, identifierMax), 1, identifierMax),
    ipMax: integer(env.LOGIN_IP_MAX_FAILURES, 50, 1, 1000),
    emailEnabled: String(env.LOGIN_SECURITY_EMAIL_ENABLED).trim().toLowerCase() !== 'false',
    cooldownMs: Math.max(windowMs, integer(env.LOGIN_SECURITY_EMAIL_COOLDOWN_MS, 900000, 1000, 86400000)),
  };
}

module.exports = { readLoginSecurityConfig };
