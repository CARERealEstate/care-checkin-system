const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { db } = require('../db/database');
const { generateCheckInPDF, generateCheckOutPDF } = require('../services/pdfGenerator');
const { getPlacementDir } = require('../services/fileManager');
const logger = require('../services/logger');
const puppeteer = require('puppeteer-core');

// Launch browser once and reuse
let browserInstance = null;
async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  browserInstance = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
    headless: 'new'
  });
  return browserInstance;
}

// POST /api/pdf/generate/:formId - generates HTML on disk
router.post('/generate/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: Number(req.params.formId) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const evidence = db.prepare('SELECT * FROM evidence WHERE form_id = @id AND included_in_pdf = 1 ORDER BY uploaded_at').all({ id: form.id });

    const subdir = form.type === 'check_in' ? 'check-in' : 'check-out';
    const dir = getPlacementDir(booking, subdir);
    const filename = subdir + '-' + new Date().toISOString().split('T')[0] + '.html';
    const htmlPath = path.join(dir, filename);

    if (form.type === 'check_in') {
      await generateCheckInPDF(booking, form, evidence, htmlPath);
    } else {
      await generateCheckOutPDF(booking, form, evidence, htmlPath);
    }

    db.prepare("UPDATE forms SET pdf_path = @path, status = @status, completed_at = datetime('now') WHERE id = @id")
      .run({ path: htmlPath, status: 'completed', id: form.id });

    const newStatus = form.type === 'check_in' ? 'checked_in' : 'checked_out';
    db.prepare('UPDATE bookings SET status = @status WHERE id = @id')
      .run({ status: newStatus, id: booking.id });

    res.json({ success: true, filename });
  } catch (err) {
    logger.error('PDF generation error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

// Helper: get HTML content for a form (from disk or regenerate)
async function getHtmlContent(form, booking) {
  let htmlContent = null;

  if (form.pdf_path && fs.existsSync(form.pdf_path)) {
    try {
      htmlContent = fs.readFileSync(form.pdf_path, 'utf-8');
    } catch (e) {
      logger.warn('Could not read file, will regenerate', { error: e.message });
    }
  }

  if (!htmlContent) {
    logger.info('HTML file missing, regenerating inline', { formId: form.id });
    const evidence = db.prepare('SELECT * FROM evidence WHERE form_id = @id AND included_in_pdf = 1 ORDER BY uploaded_at').all({ id: form.id });
    const tmpPath = '/tmp/care-' + form.type + '-' + form.id + '-' + Date.now() + '.html';

    try {
      if (form.type === 'check_in') await generateCheckInPDF(booking, form, evidence, tmpPath);
      else await generateCheckOutPDF(booking, form, evidence, tmpPath);
      htmlContent = fs.readFileSync(tmpPath, 'utf-8');
      try { fs.unlinkSync(tmpPath); } catch(e) {}
    } catch (genErr) {
      logger.error('HTML generation failed', { error: genErr.message });
    }
  }

  return htmlContent;
}

// Helper: convert HTML to PDF buffer via Puppeteer
async function htmlToPdfBuffer(htmlContent) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      preferCSSPageSize: false
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await page.close();
  }
}

// GET /api/pdf/view/:formId - view PDF inline in browser
router.get('/view/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: Number(req.params.formId) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const htmlContent = await getHtmlContent(form, booking);
    if (!htmlContent) return res.status(500).json({ error: 'Could not generate content' });

    const pdfBuffer = await htmlToPdfBuffer(htmlContent);
    const filename = 'CARE-CheckIn-' + form.id + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error('PDF view error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pdf/download/:formId - download PDF as attachment
router.get('/download/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: Number(req.params.formId) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const htmlContent = await getHtmlContent(form, booking);
    if (!htmlContent) return res.status(500).json({ error: 'Could not generate content' });

    const pdfBuffer = await htmlToPdfBuffer(htmlContent);
    const filename = 'CARE-CheckIn-' + form.id + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error('PDF download error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
