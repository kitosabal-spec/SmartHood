'use strict';

const crypto = require('crypto');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { MySqlRateLimitStore } = require('../services/authSecurityStore');

const INVALID_CREDENTIALS = 'Invalid email address or password.';
const loginIdentifier = body => {
  const value = body?.email || body?.username || '';
  return typeof value === 'string' ? value.trim() : '';
};
const normalizeIdentifier = body => loginIdentifier(body).toLowerCase();
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const clientKey = req => digest(ipKeyGenerator(req.ip || req.socket.remoteAddress));
const invoke = (middleware, req, res) => new Promise((resolve, reject) => {
  middleware(req, res, error => error ? reject(error) : resolve());
});

function createLoginRateLimits({ getPool, config, onRestriction, forgotPasswordResponse, storeFactory }) {
  const makeStore = storeFactory || (scope => new MySqlRateLimitStore(getPool, scope));
  const policies = [
    { name: 'login_identifier', max: config.identifierMax, key: req => digest(`${normalizeIdentifier(req.body)}\0${clientKey(req)}`) },
    { name: 'login_ip', max: config.ipMax, key: clientKey },
  ].map(policy => {
    const store = makeStore(policy.name);
    const limiter = rateLimit({
      windowMs: config.windowMs, limit: policy.max, store,
      keyGenerator: policy.key, requestPropertyName: policy.name,
      standardHeaders: 'draft-6', legacyHeaders: false,
      // Run only after credential failure, then combine both policies in one
      // response. This also avoids success decrements racing with window expiry.
      handler: (req, res, next) => next(),
      passOnStoreError: false,
    });
    return { ...policy, store, limiter };
  });

  function headers(res, states, blocked = false) {
    const active = blocked ? states.filter(state => state.hits >= state.max) : states;
    const selected = [...active].sort((a, b) => blocked
      ? b.resetTime - a.resetTime
      : (a.max - a.hits) - (b.max - b.hits))[0];
    const seconds = Math.max(1, Math.ceil((selected.resetTime - Date.now()) / 1000));
    res.setHeader('RateLimit-Policy', `${selected.max};w=${Math.ceil(config.windowMs / 1000)}`);
    res.setHeader('RateLimit-Limit', selected.max);
    res.setHeader('RateLimit-Remaining', Math.max(0, selected.max - selected.hits));
    res.setHeader('RateLimit-Reset', seconds);
    if (blocked) res.setHeader('Retry-After', seconds);
    return seconds;
  }

  function restrict(req, res, states) {
    const retryAfterSeconds = headers(res, states, true);
    const identifierState = states.find(state => state.name === 'login_identifier' && state.hits >= state.max);
    const triggeringState = identifierState || states.find(state => state.hits >= state.max);
    // Capture only non-secret data, never the request, password, or cookie.
    const event = {
      eventKey: digest(`${triggeringState.name}\0${triggeringState.key}\0${triggeringState.resetTime.getTime()}`),
      identifier: loginIdentifier(req.body),
      identifierRestricted: Boolean(identifierState),
    };
    res.once('finish', () => {
      setImmediate(() => { Promise.resolve().then(() => onRestriction(event)).catch(() => {
        console.error('Login security event processing failed.');
      }); });
    });
    return res.status(429).json({
      error: `Too many failed login attempts. Please wait ${Math.ceil(config.windowMs / 60000)} minutes before trying again.`,
      retryAfterSeconds,
    });
  }

  async function readStates(req) {
    return Promise.all(policies.map(async policy => {
      const key = policy.key(req);
      const entry = await policy.store.get(key);
      return { name: policy.name, max: policy.max, key, hits: entry?.totalHits || 0,
        resetTime: entry?.resetTime || new Date(Date.now() + config.windowMs) };
    }));
  }

  function unavailable(res) {
    console.error('Authentication rate-limit store unavailable.');
    return res.status(503).json({ error: 'Sign in is temporarily unavailable. Please try again later.' });
  }

  const beforeLogin = async (req, res, next) => {
    try {
      const states = await readStates(req);
      if (states.some(state => state.hits >= state.max)) return restrict(req, res, states);
      headers(res, states);
      return next();
    } catch { return unavailable(res); }
  };

  async function failedLogin(req, res, { status = 401, error = INVALID_CREDENTIALS } = {}) {
    try {
      for (const policy of policies) await invoke(policy.limiter, req, res);
      const states = policies.map(policy => ({
        name: policy.name, key: policy.key(req), max: policy.max,
        hits: req[policy.name].used, resetTime: req[policy.name].resetTime,
      }));
      if (states.some(state => state.hits > state.max)) return restrict(req, res, states);
      headers(res, states);
      const identifierFailures = states[0].hits;
      const attemptsRemaining = Math.max(0, Math.min(...states.map(state => state.max - state.hits)));
      const body = { error };
      if (identifierFailures >= config.warningAfter || states[1].hits >= config.ipMax - (config.identifierMax - config.warningAfter)) {
        body.warning = `You have ${attemptsRemaining} login attempts remaining before a temporary restriction.`;
        body.attemptsRemaining = attemptsRemaining;
      }
      return res.status(status).json(body);
    } catch { return unavailable(res); }
  }

  const forgotPasswordLimiter = rateLimit({
    windowMs: 3600000, limit: 5, store: makeStore('forgot_password'),
    keyGenerator: clientKey, standardHeaders: 'draft-6', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ ok: true, message: forgotPasswordResponse }),
    passOnStoreError: false,
  });
  const forgotPassword = (req, res, next) => forgotPasswordLimiter(req, res, error => {
    if (error) return unavailable(res);
    return next();
  });

  const emailChangeLimiter = rateLimit({
    windowMs: 3600000, limit: 10, store: makeStore('admin_email'),
    keyGenerator: clientKey, standardHeaders: 'draft-6', legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many email verification requests. Please try again in an hour.' }),
    passOnStoreError: false,
  });
  const emailChange = (req, res, next) => emailChangeLimiter(req, res, error => error ? unavailable(res) : next());
  return { beforeLogin, failedLogin, forgotPassword, emailChange };
}

module.exports = { createLoginRateLimits, loginIdentifier, normalizeIdentifier, INVALID_CREDENTIALS };
