'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Only bundled application assets qualify. Runtime uploads and API responses
// must never inherit these public cache headers.
function createPublicAssetCache(publicDir) {
  const versions = new Map();
  function version(file, stat = fs.statSync(file)) {
    const relative = path.relative(publicDir, file).split(path.sep).join('/');
    if (!/^(?:css|js|images)\//.test(relative) || relative.includes('../')) return null;
    const previous = versions.get(file);
    if (previous?.mtime === stat.mtimeMs && previous.size === stat.size) return previous.hash;
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
    versions.set(file, { hash, mtime: stat.mtimeMs, size: stat.size });
    return hash;
  }
  return {
    versionHtml(html) {
      return html.replace(/((?:src|href)=")(public\/(?:css|js|images)\/[^"?]+)(?:\?[^"\s]*)?"/g,
        (match, attribute, url) => {
          const file = path.join(publicDir, decodeURIComponent(url.slice(7)));
          const hash = version(file);
          // Fingerprinted images are also used by CSS. Keep the very same URL
          // so HTML and CSS share one browser cache entry and one download.
          return `${attribute}${url}${path.basename(file).includes(`.${hash}.`) ? '' : `?v=${hash}`}"`;
        });
    },
    setHeaders(res, file, stat) {
      const hash = version(file, stat);
      const fingerprinted = hash && path.basename(file).includes(`.${hash}.`);
      const currentVersion = hash && res.req.query.v === hash;
      res.setHeader('Cache-Control', fingerprinted || currentVersion
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=0, must-revalidate');
    },
  };
}

module.exports = { createPublicAssetCache };
