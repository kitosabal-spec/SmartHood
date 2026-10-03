'use strict';

const nodemailer = require('nodemailer');

let transporter;

function envFlag(name, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isEmailConfigured() {
  if (envFlag('EMAIL_DISABLED')) return false;
  if (envFlag('EMAIL_JSON_TRANSPORT')) return true;
  const password = String(process.env.SMTP_PASS || '').trim();
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    password &&
    password !== 'PASTE_GOOGLE_APP_PASSWORD_HERE' &&
    process.env.EMAIL_FROM
  );
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isEmailConfigured()) {
    throw new Error('Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and EMAIL_FROM.');
  }

  if (envFlag('EMAIL_JSON_TRANSPORT')) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  const port = Number(process.env.SMTP_PORT || 587);
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: envFlag('SMTP_SECURE', port === 465),
    requireTLS: envFlag('SMTP_REQUIRE_TLS', port === 587),
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    pool: true,
    maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 3),
    maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 100),
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
  });
  return transporter;
}

function renderEmail({ homeownerName, title, message, details = [], actionPath = '' }) {
  const appName = cleanHeader(process.env.APP_NAME || 'SmartHood');
  const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
  const actionUrl = baseUrl && actionPath ? `${baseUrl}/${String(actionPath).replace(/^\//, '')}` : baseUrl;
  const detailRows = details
    .filter(item => item && item.label && item.value !== undefined && item.value !== null && item.value !== '')
    .map(item => `<tr><td style="padding:7px 12px;color:#64748b;vertical-align:top">${escapeHtml(item.label)}</td><td style="padding:7px 12px;color:#0f172a;font-weight:600">${escapeHtml(item.value)}</td></tr>`)
    .join('');

  return `<!doctype html>
<html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#0f766e;color:#ffffff;padding:22px 28px;font-size:22px;font-weight:700">${escapeHtml(appName)}</div>
      <div style="padding:28px">
        <p style="margin:0 0 18px">Hello ${escapeHtml(homeownerName || 'Homeowner')},</p>
        <h1 style="font-size:22px;margin:0 0 14px">${escapeHtml(title)}</h1>
        <p style="line-height:1.6;margin:0 0 20px">${escapeHtml(message)}</p>
        ${detailRows ? `<table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;margin:0 0 22px">${detailRows}</table>` : ''}
        ${actionUrl ? `<a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:11px 18px;border-radius:7px;font-weight:700">Open ${escapeHtml(appName)}</a>` : ''}
        <p style="font-size:12px;color:#64748b;line-height:1.5;margin:26px 0 0">This is an automated service notification. Please do not send sensitive payment information by replying to this email.</p>
      </div>
    </div>
  </div>
</body></html>`;
}

async function sendEmail({ to, homeownerName, subject, title, message, details, actionPath }) {
  const recipient = cleanHeader(to);
  if (!recipient) throw new Error('A recipient email address is required.');
  const safeSubject = cleanHeader(subject || title);
  const appName = cleanHeader(process.env.APP_NAME || 'SmartHood');
  const info = await getTransporter().sendMail({
    from: process.env.EMAIL_FROM || `${appName} <no-reply@example.invalid>`,
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
    to: recipient,
    subject: safeSubject,
    text: [`Hello ${homeownerName || 'Homeowner'},`, '', message, ...(details || []).map(item => `${item.label}: ${item.value}`), '', process.env.APP_BASE_URL || ''].filter(Boolean).join('\n'),
    html: renderEmail({ homeownerName, title: title || safeSubject, message, details, actionPath }),
  });
  return { messageId: info.messageId, accepted: info.accepted || [], rejected: info.rejected || [] };
}

async function verifyEmailConnection() {
  if (envFlag('EMAIL_JSON_TRANSPORT')) return true;
  return getTransporter().verify();
}

module.exports = {
  escapeHtml,
  isEmailConfigured,
  renderEmail,
  sendEmail,
  verifyEmailConnection,
};
