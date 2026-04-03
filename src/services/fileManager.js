const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const DATA_DIR = process.env.DATA_DIR || './data';

function sanitizePath(str) {
  return str.replace(/[^a-zA-Z0-9\s\-_.]/g, '').replace(/\s+/g, '-').toLowerCase().substring(0, 80);
}

function getPlacementDir(booking, subdir = '') {
  const council = sanitizePath(booking.council_name || 'unknown-council');
  const property = sanitizePath(booking.property_address || 'unknown-property');
  const tenant = sanitizePath(`${booking.tenant_first_name}-${booking.tenant_last_name}` || 'unknown-tenant');
  const parts = [DATA_DIR, 'placements', council, property, tenant];
  if (subdir) parts.push(subdir);
  const dir = path.join(...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getEvidenceDir(booking, formType) {
  return getPlacementDir(booking, path.join(formType === 'check_in' ? 'check-in' : 'check-out', 'evidence'));
}

async function processUpload(file, booking, formType) {
  const evidenceDir = getEvidenceDir(booking, formType);
  const thumbDir = path.join(evidenceDir, 'thumbs');
  fs.mkdirSync(thumbDir, { recursive: true });

  const ext = path.extname(file.originalname).toLowerCase();
  const baseName = `evidence-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.heic'].includes(ext);

  const finalExt = isImage ? (ext === '.heic' ? '.jpg' : ext) : ext;
  const finalPath = path.join(evidenceDir, `${baseName}${finalExt}`);
  const thumbPath = isImage ? path.join(thumbDir, `${baseName}_thumb${finalExt}`) : null;

  // Move file from temp to permanent location
  fs.copyFileSync(file.path, finalPath);
  if (isImage) {
    // Copy as thumbnail placeholder (sharp would resize in production)
    fs.copyFileSync(file.path, thumbPath);
  }

  try { fs.unlinkSync(file.path); } catch (e) {}

  return {
    filePath: finalPath,
    thumbnailPath: thumbPath,
    fileType: isImage ? 'image' : 'document',
    fileSize: fs.statSync(finalPath).size
  };
}

function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    logger.error('File deletion failed', { error: err.message, path: filePath });
  }
  return false;
}

module.exports = { sanitizePath, getPlacementDir, getEvidenceDir, processUpload, deleteFile };
