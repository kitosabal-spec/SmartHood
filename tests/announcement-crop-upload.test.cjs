'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const { auditFixture } = require('./helpers/audit-fixture.cjs');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const source = fs.readFileSync(path.join(__dirname, '../public/js/announcements.js'), 'utf8');

function crop(sourceName, sourceMime) {
  let result;
  const context = vm.createContext({
    File,
    document: {
      getElementById: () => null,
      createElement: () => ({
        getContext: () => ({ save() {}, translate() {}, rotate() {}, drawImage() {}, restore() {} }),
        toBlob: (callback, mime) => callback(new Blob([png], { type: mime })),
      }),
    },
    showToast: () => assert.fail('Cropping unexpectedly failed'),
    onApply: file => { result = file; },
    sourceName, sourceMime,
  });
  vm.runInContext(source, context);
  vm.runInContext(`Object.assign(activeCropper, {
    img: { naturalWidth: 1, naturalHeight: 1 },
    boxCoords: { x: 0, y: 0, w: 1, h: 1 }, stageSize: { w: 1, h: 1 },
    sourceName, sourceMime, rotation: 0, onApply,
  }); applyPhotoCrop();`, context);
  return result;
}

test('cropped PNG reaches the announcement API with matching filename and MIME', async t => {
  const site = await auditFixture(t);
  const file = crop('portweb.png', 'image/png');
  assert.equal(file.name, 'portweb-cropped.png');
  assert.equal(file.type, 'image/png');
  function form(attachment) {
    const data = new FormData();
    data.set('title', 'Crop regression');
    data.set('content', 'PNG upload');
    data.set('images', attachment);
    return data;
  }
  const rejected = await site.request('POST', '/api/announcements', form(new File([png], 'portweb-cropped.jpg', { type: 'image/png' })));
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /Unsupported file format/);
  const accepted = await site.request('POST', '/api/announcements', form(file));
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
  assert.match(accepted.body.image_path, /\.png$/);
});

test('announcement media can be posted and edited without title or content', async t => {
  const site = await auditFixture(t);
  const data = new FormData();
  data.set('images', new File([png], 'announcement.png', { type: 'image/png' }));
  const created = await site.request('POST', '/api/announcements', data);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.title, '');
  assert.equal(created.body.content, '');
  assert.match(created.body.image_path, /\.png$/);

  const edited = new FormData();
  edited.set('title', '');
  edited.set('content', '');
  const updated = await site.request('PUT', `/api/announcements/${created.body.id}`, edited);
  assert.equal(updated.status, 200, JSON.stringify(updated.body));
  assert.equal(updated.body.title, '');
  assert.equal(updated.body.content, '');
  assert.equal(updated.body.image_path, created.body.image_path);
});

test('JPEG and WebP crops keep the JPEG export filename', () => {
  for (const [name, mime] of [['photo.jpeg', 'image/jpeg'], ['photo.webp', 'image/webp']]) {
    const file = crop(name, mime);
    assert.equal(file.name, 'photo-cropped.jpg');
    assert.equal(file.type, 'image/jpeg');
  }
});
