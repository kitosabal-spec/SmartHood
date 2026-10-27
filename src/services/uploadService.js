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
    // Compatibility helper only: local originals require a separate verified
    // cleanup operation, even when a byte-identical private copy exists.
    if (!fs.existsSync(destination)) fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    else if (!fs.readFileSync(source).equals(fs.readFileSync(destination))) {
      console.warn('Upload migration skipped a filename collision. Both files were preserved.');
    }
  }
}

module.exports = { ensureUploadDirectories, moveLegacyPrivateUploads };
