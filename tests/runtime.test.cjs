'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { moveLegacyPrivateUploads } = require('../src/services/uploadService');

test('database SSL respects explicit settings and recognizes loopback addresses', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/config/environment.js'), 'utf8');
  function config(env) {
    const sandbox = { process: { env }, module: { exports: {} }, require(name) {
      if (name === 'dotenv') return { config() {} };
      if (name === './paths') return { ROOT_DIR: os.tmpdir() };
      return require(name);
    } };
    vm.runInNewContext(source, sandbox);
    return sandbox.module.exports.DB_CONFIG;
  }
  for (const host of ['localhost', '127.0.0.1', '::1']) {
    assert.equal(config({ MYSQL_HOST: host }).ssl, undefined);
    assert.ok(config({ MYSQL_HOST: host, MYSQL_SSL: 'true' }).ssl);
  }
  assert.equal(config({ MYSQL_HOST: 'database.internal', MYSQL_SSL: 'false' }).ssl, undefined);
  assert.ok(config({ MYSQL_HOST: 'database.internal' }).ssl);
  assert.ok(config({ MYSQL_HOST: 'database.internal', MYSQL_SSL: 'true' }).ssl);
});

test('private upload compatibility copy retains all local originals, including duplicates and collisions', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'smarthood-migration-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacy = path.join(root, 'legacy');
  const target = path.join(root, 'private');
  fs.mkdirSync(legacy);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(legacy, '.gitkeep'), '');
  fs.writeFileSync(path.join(legacy, 'new.txt'), 'new receipt');
  for (const dir of [legacy, target]) fs.writeFileSync(path.join(dir, 'same.txt'), 'same receipt');
  fs.writeFileSync(path.join(legacy, 'collision.txt'), 'legacy receipt');
  fs.writeFileSync(path.join(target, 'collision.txt'), 'private receipt');
  moveLegacyPrivateUploads(legacy, target);
  assert.equal(fs.readFileSync(path.join(target, 'new.txt'), 'utf8'), 'new receipt');
  assert.equal(fs.existsSync(path.join(legacy, 'new.txt')), true);
  assert.equal(fs.existsSync(path.join(legacy, 'same.txt')), true);
  assert.equal(fs.readFileSync(path.join(target, 'same.txt'), 'utf8'), 'same receipt');
  assert.equal(fs.readFileSync(path.join(legacy, 'collision.txt'), 'utf8'), 'legacy receipt');
  assert.equal(fs.readFileSync(path.join(target, 'collision.txt'), 'utf8'), 'private receipt');
  assert.ok(fs.existsSync(path.join(legacy, '.gitkeep')));
});

test('server startup failure exits unsuccessfully instead of appearing healthy', async () => {
  const exits = [];
  const handlers = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  vm.runInNewContext(source, {
    process: { on: (name, handler) => { handlers[name] = handler; }, exit: code => exits.push(code) },
    console: { error() {}, log() {} },
    require(name) {
      if (name === './config/environment') return { PORT: 0, DB_CONFIG: {} };
      return { app: { listen() { assert.fail('Must not listen after initialization fails'); } },
        initializeApp: async () => { throw new Error('Database unavailable'); }, isEmailConfigured: () => false };
    },
  });
  await new Promise(setImmediate);
  assert.deepEqual(exits, [1]);
  handlers.uncaughtException(new Error('fatal'));
  handlers.unhandledRejection(new Error('fatal'), Promise.resolve());
  assert.deepEqual(exits, [1, 1, 1]);
});
