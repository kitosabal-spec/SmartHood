const fs = require('fs');
const path = require('path');

function ensureUploadDirectories(directories) {
  for (const directory of directories) {
    fs.mkdirSync(directory, { recursive: true });
  }
}

function moveLegacyPrivateUploads(legacyDirectory, privateDirectory) {
  if (!fs.existsSync(legacyDirectory)) return;
  for (const entry of fs.readdirSync(legacyDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === '.gitkeep') continue;
    const source = path.join(legacyDirectory, entry.name);
    const destination = path.join(privateDirectory, path.basename(entry.name));
    if (!fs.existsSync(destination)) fs.renameSync(source, destination);
    else fs.unlinkSync(source);
  }
}

module.exports = { ensureUploadDirectories, moveLegacyPrivateUploads };
