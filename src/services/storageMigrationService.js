'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PREFIXES, MIMES, isObjectKey } = require('./storageService');

// Fixed identifiers only. No names, contacts or payment references are selected.
const REFERENCES = Object.freeze({
  payments: { receipt: 'receipts' },
  complaints: { attachment: 'complaints', media_url: 'complaints', attachments: 'complaints' },
  users: { profile_photo: 'profile-photos' },
  homeowners: { profile_photo: 'profile-photos' },
  payment_settings: { qr_code_path: 'payment-qrcodes' },
  announcements: { image_path: 'announcements', images: 'announcements' },
  board_of_directors: { photo: 'board' },
  lostFound: { image: 'lostfound', images: 'lostfound' },
  // Optional legacy installations may have this table; the current repository
  // has only the reserved directory, with no document upload UI or table.
  resident_documents: { file_path: 'resident-documents', storage_key: 'resident-documents' },
});
const JSON_FIELDS = new Set(['attachments', 'images']);
const MEDIA_FIELDS = new Set(['url', 'media_url', 'attachment', 'image', 'storage_key']);

function legacyReference(value, kind) {
  if (typeof value !== 'string' || isObjectKey(value)) return null;
  const folder = { 'profile-photos': 'profile', 'payment-qrcodes': 'qrcodes' }[kind] || kind;
  for (const prefix of [`private:${kind}/`, `/uploads/${folder}/`]) {
    if (!value.startsWith(prefix)) continue;
    const filename = value.slice(prefix.length);
    if (filename && /^[A-Za-z0-9._-]+$/.test(filename) && filename !== '.' && filename !== '..') return { filename, folder };
  }
  return null;
}
function mapMedia(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map(v => mapMedia(v, fn));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,
    MEDIA_FIELDS.has(k) ? mapMedia(v, fn) : v]));
  return value;
}
function transformField(value, field, fn) {
  if (JSON_FIELDS.has(field) && typeof value === 'string') {
    let parsed;
    try { parsed = JSON.parse(value); } catch { return value; }
    return JSON.stringify(mapMedia(parsed, fn));
  }
  return mapMedia(value, fn);
}
function migrationKey(reference, kind) {
  const ext = path.extname(reference).toLowerCase().replace('.jpeg', '.jpg');
  if (!MIMES[ext] || (ext === '.pdf' && kind !== 'resident-documents')) throw new Error('Unsupported legacy media type.');
  // Deterministic but opaque: interruptions between PUT and DB commit reuse
  // exactly the same object, and never reveal the original filename.
  const h = crypto.createHash('sha256').update(`smarthood-r2-v1:${kind}:${reference}`).digest('hex');
  return `${PREFIXES[kind]}/${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}${ext}`;
}
async function resolveLocal(reference, kind, paths) {
  const legacy = legacyReference(reference, kind);
  if (!legacy) throw new Error('Unsupported legacy reference.');
  const privateKind = !['announcements', 'board', 'lostfound'].includes(kind);
  const roots = privateKind ? [path.join(paths.PRIVATE_UPLOAD_DIR, kind), path.join(paths.PUBLIC_UPLOAD_DIR, legacy.folder)] : [path.join(paths.PUBLIC_UPLOAD_DIR, legacy.folder)];
  for (const root of roots) {
    const candidate = path.join(root, legacy.filename);
    try {
      const stat = await fs.promises.lstat(candidate);
      if (!stat.isFile() || stat.isSymbolicLink()) continue;
      const realRoot = await fs.promises.realpath(root);
      const realFile = await fs.promises.realpath(candidate);
      if (!realFile.startsWith(realRoot + path.sep)) continue;
      return { path: candidate, size: stat.size, originalname: legacy.filename };
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  // Built-in board portraits belong to the application, never R2 migration.
  if (kind === 'board' && paths.PUBLIC_DIR && fs.existsSync(path.join(paths.PUBLIC_DIR, 'images', 'board', legacy.filename))) return null;
  throw new Error('Local file unavailable.');
}

function createMigrationRepository(pool) {
  const quote = name => '`' + name + '`';
  async function catalog() {
    const [columns] = await pool.execute('SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name FROM information_schema.columns WHERE table_schema = DATABASE()');
    return Object.entries(REFERENCES).flatMap(([table, fields]) => {
      const available = new Set(columns.filter(c => c.table_name === table).map(c => c.column_name));
      return available.has('id') ? Object.entries(fields).filter(([field]) => available.has(field)).map(([field, kind]) => ({ table, field, kind })) : [];
    });
  }
  return {
    async entries() {
      const entries = new Map();
      for (const { table, field, kind } of await catalog()) {
        const [rows] = await pool.execute(`SELECT ${quote('id')}, ${quote(field)} FROM ${quote(table)} WHERE ${quote(field)} IS NOT NULL`);
        for (const row of rows) transformField(row[field], field, reference => {
          if (legacyReference(reference, kind)) {
            if (!entries.has(reference)) entries.set(reference, { reference, kind, targets: [] });
            entries.get(reference).targets.push({ table, field, id: row.id });
          }
          return reference;
        });
      }
      return [...entries.values()];
    },
    async transaction(work) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await work({
          async mapping(reference) {
            const [rows] = await connection.execute('SELECT object_key FROM storage_objects WHERE legacy_reference = ? FOR UPDATE', [reference]);
            return rows[0]?.object_key;
          },
          async save(entry) {
            await connection.execute(`INSERT INTO storage_objects
              (object_key, provider, original_name, mime_type, size_bytes, legacy_reference) VALUES (?, 'r2', ?, ?, ?, ?)`,
            [entry.key, entry.originalname, entry.mime, entry.size, entry.reference]);
          },
          async replace(entry, key) {
            // Lock and reread: never overwrite unrelated concurrent edits.
            const seen = new Set();
            for (const { table, field, id } of entry.targets) {
              const identity = JSON.stringify([table, field, id]);
              if (seen.has(identity)) continue;
              seen.add(identity);
              const [rows] = await connection.execute(`SELECT ${quote(field)} FROM ${quote(table)} WHERE id = ? FOR UPDATE`, [id]);
              if (!rows.length) continue;
              const original = rows[0][field];
              const updated = transformField(original, field, value => value === entry.reference ? key : value);
              if (JSON.stringify(original) !== JSON.stringify(updated)) {
                await connection.execute(`UPDATE ${quote(table)} SET ${quote(field)} = ? WHERE id = ?`,
                  [typeof updated === 'object' ? JSON.stringify(updated) : updated, id]);
              }
            }
          },
        });
        await connection.commit();
        return result;
      } catch (error) { await connection.rollback().catch(() => {}); throw error; }
      finally { connection.release(); }
    },
  };
}

async function migrateUploads({ repository, storage, paths, execute = false, confirmed = false, report = () => {} }) {
  if (execute && !confirmed) throw new Error('Real migration requires --execute --confirm=UPLOAD_TO_R2.');
  const summary = { planned: 0, migrated: 0, reused: 0, skipped: 0, failed: 0 };
  for (const entry of await repository.entries()) {
    let key;
    let stage = 'resolve-local-file';
    try {
      key = migrationKey(entry.reference, entry.kind);
      const local = await resolveLocal(entry.reference, entry.kind, paths);
      if (!local) { summary.skipped++; continue; }
      if (!execute) { summary.planned++; report({ key, status: 'planned', bytes: local.size }); continue; }
      if (storage.driver !== 'r2') throw new Error('Migration requires R2.');
      stage = 'database-transaction';
      await repository.transaction(async tx => {
        const mapped = await tx.mapping(entry.reference);
        const buffer = await fs.promises.readFile(local.path);
        if (mapped) {
          stage = 'verify-existing-object';
          await storage.verifyObject(mapped, buffer);
          stage = 'update-references';
          await tx.replace(entry, mapped);
          summary.reused++;
          return;
        }
        const mime = MIMES[path.extname(key)];
        stage = 'upload-and-verify';
        await storage.putVerified(key, buffer, mime);
        stage = 'update-references';
        await tx.save({ ...entry, ...local, key, mime, size: buffer.length });
        await tx.replace(entry, key);
      });
      summary.migrated++;
      report({ key, status: 'migrated' });
    } catch {
      summary.failed++;
      // No raw database/SDK errors, record IDs or source paths in reports.
      report({ key: key || null, status: 'failed', stage, error: 'MigrationFailed' });
    }
  }
  return summary;
}

module.exports = { REFERENCES, legacyReference, transformField, migrationKey, resolveLocal, createMigrationRepository, migrateUploads };
