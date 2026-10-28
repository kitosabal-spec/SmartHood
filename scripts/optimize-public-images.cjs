'use strict';

// Optional build-time tool. Uses sharp only when regenerating these assets;
// the running application has no new dependency. Originals are retained.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(__dirname, '..');

(async () => {
  const replacements = [];
  for (const [original, stem] of [['IMG Sat.png', 'entrance'], ['SH Logo.png', 'smarthood-logo']]) {
    const input = fs.readFileSync(path.join(root, 'public/images', original));
    // Keep the translucent logo as PNG: Chromium's WebP alpha rounding can
    // differ slightly when downscaling, even with identical decoded pixels.
    const extension = stem === 'smarthood-logo' ? 'png' : 'webp';
    const output = await (extension === 'png'
      ? sharp(input).png({ compressionLevel: 9, adaptiveFiltering: true })
      : sharp(input).webp({ lossless: true, effort: 6 })).toBuffer();
    const source = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = await sharp(output).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    if (source.info.width !== decoded.info.width || source.info.height !== decoded.info.height) throw new Error('Dimensions changed');
    // WebP discards invisible RGB values under fully transparent pixels. All
    // alpha and every visible color must match exactly, on any background.
    for (let i = 0; i < source.data.length; i += 4) {
      if (source.data[i + 3] !== decoded.data[i + 3] || (source.data[i + 3] &&
        !source.data.subarray(i, i + 3).equals(decoded.data.subarray(i, i + 3)))) {
        throw new Error(`Visible pixels changed in ${original}`);
      }
    }
    const hash = crypto.createHash('sha256').update(output).digest('hex').slice(0, 16);
    const filename = `${stem}.${hash}.${extension}`;
    fs.writeFileSync(path.join(root, 'public/images', filename), output);
    replacements.push([original, filename, stem]);
    console.log(JSON.stringify({ original, filename, beforeBytes: input.length, afterBytes: output.length,
      width: source.info.width, height: source.info.height, visiblePixelsIdentical: true }));
  }
  for (const relative of ['index.html', 'public/css/style.css']) {
    const file = path.join(root, relative);
    let source = fs.readFileSync(file, 'utf8');
    for (const [original, filename, stem] of replacements) {
      source = source.replaceAll(original, filename).replace(new RegExp(`${stem}\\.[a-f0-9]{16}\\.(?:webp|png)`, 'g'), filename);
    }
    if (relative === 'index.html') source = source.replace('rel="icon" type="image/webp"', 'rel="icon" type="image/png"');
    fs.writeFileSync(file, source);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
