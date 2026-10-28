const fs = require('node:fs');

function createIndexController(indexFile, versionHtml) {
  return function indexController(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    if (!versionHtml) return res.sendFile(indexFile);
    fs.readFile(indexFile, 'utf8', (error, html) => {
      if (error) return next(error);
      try { res.type('html').send(versionHtml(html)); }
      catch (error) { next(error); }
    });
  };
}

module.exports = { createIndexController };
