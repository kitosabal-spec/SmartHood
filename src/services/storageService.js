'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const PREFIXES = Object.freeze({ receipts: 'receipts', complaints: 'complaints', 'profile-photos': 'profiles',
  'resident-documents': 'resident-documents', 'payment-qrcodes': 'qrcodes', announcements: 'announcements', board: 'board', lostfound: 'lostfound' });
const MIMES = Object.freeze({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.pdf': 'application/pdf' });
const KEY_PATTERN = /^(receipts|complaints|profiles|resident-documents|qrcodes|announcements|board|lostfound)\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(jpg|png|webp|mp4|mov|webm|pdf)$/;

function readStorageConfig(env = process.env) {
  const driver = env.STORAGE_DRIVER || 'local';
  if (!['local', 'r2'].includes(driver)) throw new Error('STORAGE_DRIVER must be local or r2.');
  if (driver === 'local') return { driver };
  const required = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT'];
  const missing = required.filter(name => !String(env[name] || '').trim());
  if (missing.length) throw new Error(`Incomplete R2 configuration: missing ${missing.join(', ')}.`);
  let endpoint;
  try { endpoint = new URL(env.R2_ENDPOINT); } catch { throw new Error('R2_ENDPOINT must be a valid HTTPS URL.'); }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') {
    throw new Error('R2_ENDPOINT must be an HTTPS origin without credentials, path, or query.');
  }
  return { driver, endpoint: endpoint.origin, bucket: env.R2_BUCKET, region: 'auto',
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } };
}

function objectKey(kind, extension) {
  const prefix = PREFIXES[kind];
  const ext = extension.toLowerCase() === '.jpeg' ? '.jpg' : extension.toLowerCase();
  if (!prefix || !MIMES[ext] || (ext === '.pdf' && kind !== 'resident-documents')) throw new Error('Unsupported storage category or file type.');
  return `${prefix}/${crypto.randomUUID()}${ext}`;
}
function isObjectKey(value, kind) {
  return typeof value === 'string' && KEY_PATTERN.test(value) && (!kind || value.startsWith(`${PREFIXES[kind]}/`));
}
function communityUrl(value) {
  return isObjectKey(value) && /^(announcements|board|lostfound)\//.test(value) ? `/uploads/${value}` : value;
}
function permanentReference(value) {
  if (typeof value === 'string') {
    const key = value.startsWith('/uploads/') ? value.slice(9) : value;
    return isObjectKey(key) ? key : value;
  }
  if (Array.isArray(value)) return value.map(permanentReference);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, permanentReference(v)]));
  return value;
}
function presentCommunity(value) {
  if (typeof value === 'string') return communityUrl(value);
  if (Array.isArray(value)) return value.map(presentCommunity);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, presentCommunity(v)]));
  return value;
}

function createStorageService({ env = process.env, audit, metadata, client, presign = getSignedUrl, logger = console } = {}) {
  const config = readStorageConfig(env);
  const s3 = client || (config.driver === 'r2' ? new S3Client({ ...config, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' }) : null);
  const input = key => {
    if (!isObjectKey(key)) throw new Error('Invalid object key.');
    if (!s3) throw new Error('R2 storage is not configured for this object.');
    return { Bucket: config.bucket, Key: key };
  };
  // Log only a generated key and a bounded error code, never SDK messages,
  // request objects, filenames, URLs, or credentials.
  function logFailure(key, error) {
    const code = ['AccessDenied', 'NoSuchKey', 'TimeoutError', 'NetworkingError', 'ServiceUnavailable'].includes(error?.name) ? error.name : 'StorageError';
    logger.error('Storage deletion failed', key, code);
  }
  async function remove(key) {
    try { await s3.send(new DeleteObjectCommand(input(key))); return true; }
    catch (error) { logFailure(key, error); return false; }
  }
  async function discard(file) {
    if (!file) return;
    if (file.storageKey) {
      if (await remove(file.storageKey)) delete file.storageKey;
    } else if (file.path) await fs.promises.unlink(file.path).catch(() => {});
  }
  async function store(file, kind) {
    if (!file) throw new Error('Missing upload.');
    if (!audit?.current()) throw new Error('Uploads must be stored inside an audit transaction.');
    if (file.storageReference) return file.storageReference;
    const key = objectKey(kind, path.extname(file.originalname || file.filename));
    const buffer = file.buffer || await fs.promises.readFile(file.path);
    let reference;
    if (config.driver === 'r2') {
      // Register before PUT: a timed-out request may still have stored an object.
      file.storageKey = key;
      audit.afterRollback(() => discard(file));
      try {
        await s3.send(new PutObjectCommand({ ...input(key), Body: buffer, ContentType: file.mimetype,
          CacheControl: 'private, no-store', Metadata: { sha256: crypto.createHash('sha256').update(buffer).digest('hex') } }));
      } catch { throw new Error('Object storage upload failed.'); }
      reference = key;
    } else {
      reference = ['announcements', 'board', 'lostfound'].includes(kind) ? `/uploads/${kind}/${file.filename}` : `private:${kind}/${file.filename}`;
    }
    if (metadata) await metadata({ key: reference, provider: config.driver, originalname: file.originalname,
      mimetype: file.mimetype, size: buffer.length });
    file.storageReference = reference;
    return reference;
  }
  function multerStorage(kind, diskOptions) {
    if (config.driver === 'local') return multer.diskStorage(diskOptions);
    const memory = multer.memoryStorage();
    return { _handleFile(req, file, cb) {
      memory._handleFile(req, file, (error, info) => {
        if (error) return cb(error);
        try { cb(null, { ...info, filename: path.posix.basename(objectKey(kind, path.extname(file.originalname))) }); }
        catch (err) { cb(err); }
      });
    }, _removeFile: memory._removeFile.bind(memory) };
  }
  async function signedUrl(key) {
    try { return await presign(s3, new GetObjectCommand({ ...input(key), ResponseCacheControl: 'private, no-store', ResponseContentDisposition: 'inline' }), { expiresIn: 300 }); }
    catch { throw new Error('Could not generate file access URL.'); }
  }
  async function verifyObject(key, buffer) {
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const head = await s3.send(new HeadObjectCommand(input(key)));
    if (Number(head.ContentLength) !== buffer.length || head.Metadata?.sha256 !== sha256) throw new Error('Object verification failed.');
    const result = await s3.send(new GetObjectCommand(input(key)));
    const downloaded = await result.Body.transformToByteArray();
    if (crypto.createHash('sha256').update(downloaded).digest('hex') !== sha256) throw new Error('Object content verification failed.');
  }
  return { driver: config.driver, store, discard, multerStorage, remove, signedUrl, verifyObject,
    read: file => file.buffer ? Promise.resolve(file.buffer) : fs.promises.readFile(file.path),
    deleteAfterCommit(reference, kind) {
      if (!PREFIXES[kind]) throw new Error('A storage category is required for deletion.');
      const key = permanentReference(reference);
      // Existing local files are retained for a separate verified cleanup.
      if (isObjectKey(key, kind)) return audit.afterCommit(() => remove(key));
    },
    async putVerified(key, buffer, mime) {
      const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      await s3.send(new PutObjectCommand({ ...input(key), Body: buffer, ContentType: mime, CacheControl: 'private, no-store', Metadata: { sha256 } }));
      await verifyObject(key, buffer);
    },
  };
}

module.exports = { createStorageService, readStorageConfig, objectKey, isObjectKey, PREFIXES, MIMES,
  communityUrl, permanentReference, presentCommunity };
