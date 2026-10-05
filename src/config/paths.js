const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const PUBLIC_UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const PRIVATE_UPLOAD_DIR = path.join(ROOT_DIR, 'private_uploads');

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR,
  INDEX_FILE: path.join(ROOT_DIR, 'index.html'),
  DATA_DIR: path.join(ROOT_DIR, 'data'),
  PUBLIC_UPLOAD_DIR,
  ANNOUNCEMENT_UPLOAD_DIR: path.join(PUBLIC_UPLOAD_DIR, 'announcements'),
  BOARD_UPLOAD_DIR: path.join(PUBLIC_UPLOAD_DIR, 'board'),
  LOSTFOUND_UPLOAD_DIR: path.join(PUBLIC_UPLOAD_DIR, 'lostfound'),
  PRIVATE_UPLOAD_DIR,
  PRIVATE_RECEIPT_UPLOAD_DIR: path.join(PRIVATE_UPLOAD_DIR, 'receipts'),
  PRIVATE_COMPLAINT_UPLOAD_DIR: path.join(PRIVATE_UPLOAD_DIR, 'complaints'),
  PRIVATE_RESIDENT_DOCUMENT_UPLOAD_DIR: path.join(PRIVATE_UPLOAD_DIR, 'resident-documents'),
  PRIVATE_PROFILE_UPLOAD_DIR: path.join(PRIVATE_UPLOAD_DIR, 'profile-photos'),
  PRIVATE_QRCODE_UPLOAD_DIR: path.join(PRIVATE_UPLOAD_DIR, 'payment-qrcodes'),
};
