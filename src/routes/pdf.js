const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../db/database');
const { generateCheckInPDF, generateCheckOutPDF } = require('../services/pdfGenerator');
const { getPlacementDir } = require('../services/fileManager');
const logger = require('../services/logger');

// POST /api/pdf/generate/:formId
router.post('/generate/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: Number(req.params.formId) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const evidence = db.prepare('SELECT * FROM evidence WHERE form_id = @id AND included_in_pdf = 1 ORDER BY uploaded_at').all({ id: form.id });

    const subdir = form.type === 'check_in' ? 'check-in' : 'check-out';
    const dir = getPlacementDir(booking, subdir);
    const filename = `${subdir}-${new Date().toISOString().split('T')[0]}.pdf`;
    const pdfPath = path.join(dir, filename);

    if (form.type === 'check_in') {
      await generateCheckInPDF(booking, form, evidence, pdfPath);
    } else {
      await generateCheckOutPDF(booking, form, evidence, pdfPath);
    }

    db.prepare('UPDATE forms SET pdf_path = @path, status = @status, completed_at = datetime(\'now\') WHERE id = @id')
      .run({ path: pdfPath, status: 'completed', id: form.id });

    const newStatus = form.type === 'check_in' ? 'checked_in' : 'checked_out';
    db.prepare('UPDATE bookings SET status = @status WHERE id = @id')
      .run({ status: newStatus, id: booking.id });

    res.json({ success: true, pdfPath, filename });
  } catch (err) {
    logger.error('PDF generation error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pdf/download/:formId
router.get('/download/:formId', (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: Number(req.params.formId) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    if (!form.pdf_path || !fs.existsSync(form.pdf_path)) {
      return res.status(404).json({ error: 'PDF not yet generated' });
    }

    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    const content = fs.readFileSync(form.pdf_path, 'utf-8');

    if (content.startsWith('<!DOCTYPE') || content.startsWith('<html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline');
      return res.send(Buffer.from(content, 'utf-8'));
    }

    const tenantName = `${booking.tenant_first_name}-${booking.tenant_last_name}`.replace(/\s+/g, '-');
    res.download(form.pdf_path, `CARE-${form.type === 'check_in' ? 'CheckIn' : 'CheckOut'}-${tenantName}.pdf`);
  } catch (err) {
    logger.error('PDF download error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
