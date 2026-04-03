const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../db/database');
const { processUpload, deleteFile } = require('../services/fileManager');
const logger = require('../services/logger');

const DATA_DIR = process.env.DATA_DIR || './data';
const TEMP_DIR = path.join(DATA_DIR, 'temp');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  dest: TEMP_DIR,
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// POST /api/evidence/upload
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { form_id, booking_id, category, notes } = req.body;
    if (!form_id || !booking_id) return res.status(400).json({ error: 'form_id and booking_id required' });

    const booking = db.prepare(`SELECT * FROM bookings WHERE id = @id`).get({ id: Number(booking_id) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const form = db.prepare(`SELECT * FROM forms WHERE id = @id`).get({ id: Number(form_id) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const notesList = notes ? (typeof notes === 'string' ? JSON.parse(notes) : notes) : [];
    const results = [];

    for (let i = 0; i < (req.files || []).length; i++) {
      const file = req.files[i];
      const note = Array.isArray(notesList) ? (notesList[i] || '') : '';

      const processed = await processUpload(file, booking, form.type);

      const result = db.prepare(`
        INSERT INTO evidence (form_id, booking_id, category, file_path, thumbnail_path, file_type,
          original_filename, file_size_bytes, note, uploaded_by)
        VALUES (@form_id, @booking_id, @category, @file_path, @thumb_path, @file_type, @filename, @size, @note, @uploaded_by)
      `).run({
        form_id: Number(form_id),
        booking_id: Number(booking_id),
        category: category || (form.type === 'check_in' ? 'check_in' : 'check_out'),
        file_path: processed.filePath,
        thumb_path: processed.thumbnailPath || '',
        file_type: processed.fileType,
        filename: file.originalname,
        size: processed.fileSize,
        note,
        uploaded_by: req.body.uploaded_by || 'staff'
      });

      results.push({ id: result.lastInsertRowid, filename: file.originalname, note });
    }

    res.status(201).json({ uploaded: results.length, files: results });
  } catch (err) {
    logger.error('Evidence upload error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/evidence/:id/file
router.get('/:id/file', (req, res) => {
  try {
    const evidence = db.prepare(`SELECT * FROM evidence WHERE id = @id`).get({ id: Number(req.params.id) });
    if (!evidence) return res.status(404).json({ error: 'Not found' });
    if (!fs.existsSync(evidence.file_path)) return res.status(404).json({ error: 'File missing' });
    res.sendFile(path.resolve(evidence.file_path));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/evidence/:id/thumb
router.get('/:id/thumb', (req, res) => {
  try {
    const evidence = db.prepare(`SELECT * FROM evidence WHERE id = @id`).get({ id: Number(req.params.id) });
    if (!evidence || !evidence.thumbnail_path) return res.status(404).json({ error: 'Not found' });
    if (!fs.existsSync(evidence.thumbnail_path)) return res.status(404).json({ error: 'Thumb missing' });
    res.sendFile(path.resolve(evidence.thumbnail_path));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/evidence/:id
router.delete('/:id', (req, res) => {
  try {
    const evidence = db.prepare(`SELECT * FROM evidence WHERE id = @id`).get({ id: Number(req.params.id) });
    if (!evidence) return res.status(404).json({ error: 'Not found' });

    deleteFile(evidence.file_path);
    if (evidence.thumbnail_path) deleteFile(evidence.thumbnail_path);
    db.prepare(`DELETE FROM evidence WHERE id = @id`).run({ id: Number(req.params.id) });

    res.json({ deleted: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
