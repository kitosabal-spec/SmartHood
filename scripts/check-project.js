'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', '.local-backups', 'logs', 'private_uploads', 'uploads']);
let checked = 0;
const errors = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' && directory !== root) errors.push(`Nested Git repository: ${directory}`);
      if (!ignored.has(entry.name)) visit(filename);
    } else if (/\.(?:js|cjs|html|css|json|md)$/.test(entry.name)) {
      const source = fs.readFileSync(filename, 'utf8');
      if (/^(?:<<<<<<< |>>>>>>> |=======$)/m.test(source)) errors.push(`Unresolved merge: ${filename}`);
      if (/\.(?:js|cjs)$/.test(entry.name)) {
        const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
        if (result.status !== 0) errors.push(result.stderr || result.error?.message || `Syntax check failed: ${filename}`);
        checked++;
      }
    }
  }
}
visit(root);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)="([^"]+)"/g)) {
  const url = match[1].split('?')[0];
  if (/^(?:https?:|data:|#|\/\/)/.test(url)) continue;
  if (!fs.existsSync(path.join(root, decodeURIComponent(url)))) errors.push(`Missing page asset: ${url}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`PASS: ${checked} JavaScript files parse; page assets exist; no nested repositories or merge markers.`);
