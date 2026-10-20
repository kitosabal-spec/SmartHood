// Run node tests/serve-faq.cjs, then open http://localhost:3001/tests/faq-browser.html.
// Serves only the isolated fixture and its assets; no app data or credentials.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const allowed = new Set([
  '/tests/faq-browser.html',
  '/tests/faq-browser-checks.js',
  '/index.html',
  '/public/css/style.css',
  '/public/css/landing.css',
  '/public/css/faq.css',
  '/public/js/faq.js',
  '/public/js/search-sliding.js',
]);
http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (!allowed.has(pathname)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader('Content-Type', pathname.endsWith('.css') ? 'text/css'
    : pathname.endsWith('.js') ? 'text/javascript' : 'text/html');
  fs.createReadStream(path.join(__dirname, '..', pathname)).pipe(res);
}).listen(3001, 'localhost', () => console.log('FAQ browser checks: http://localhost:3001/tests/faq-browser.html'));
