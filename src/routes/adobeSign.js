const express = require('express');
const router = express.Router();
const fs = require('fs');
const { db } = require('../db/database');
const { generateCheckInPDF } = require('../services/pdfGenerator');
const { getPlacementDir } = require('../services/fileManager');
const adobeSign = require('../services/adobeSign');
const logger = require('../services/logger');
const path = require('path');

// GET /api/adobe-sign/status - check if Adobe Sign is configured
router.get('/status', (req, res) => {
  res.json({ configured: adobeSign.isConfigured() });
});

// POST /api/adobe-sign/send/:formId - send document for Adobe Sign
router.post('/send/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: Number(req.params.formId) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    if (!booking.tenant_email || !booking.tenant_email.includes('@')) {
      return res.status(400).json({ error: 'Tenant does not have a valid email address' });
    }

    if (!adobeSign.isConfigured()) {
      return res.status(503).json({ error: 'Adobe Sign is not configured. Please set the ADOBE_SIGN_CLIENT_ID, ADOBE_SIGN_CLIENT_SECRET, and ADOBE_SIGN_REFRESH_TOKEN environment variables on Railway.' });
    }

    // Generate the HTML content first
    const evidence = db.prepare('SELECT * FROM evidence WHERE form_id = @id AND included_in_pdf = 1 ORDER BY uploaded_at').all({ id: form.id });
    const dir = getPlacementDir(booking, 'check-in');
    const filename = `check-in-${new Date().toISOString().split('T')[0]}.html`;
    const htmlPath = path.join(dir, filename);

    await generateCheckInPDF(booking, form, evidence, path.join(dir, `check-in-${new Date().toISOString().split('T')[0]}.pdf`));

    // Read the generated HTML
    const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
    const tenantName = `${booking.tenant_first_name} ${booking.tenant_last_name}`;
    const docName = `CARE Check-In Pack - ${tenantName}`;

    const result = await adobeSign.sendForSignature({
      htmlContent,
      fileName: `CARE-CheckIn-${tenantName.replace(/\s+/g, '-')}.html`,
      signerEmail: booking.tenant_email,
      signerName: tenantName,
      documentName: docName
    });

    // Store the agreement ID in form data
    let formData = {};
    try { formData = JSON.parse(form.form_data || '{}'); } catch(e) {}
    formData.adobe_sign_agreement_id = result.agreementId;
    formData.adobe_sign_sent_at = new Date().toISOString();
    formData.adobe_sign_sent_to = booking.tenant_email;

    db.prepare('UPDATE forms SET form_data = @data, signing_method = @method WHERE id = @id').run({
      data: JSON.stringify(formData),
      method: 'adobe_sign',
      id: form.id
    });

    res.json({
      success: true,
      agreementId: result.agreementId,
      sentTo: booking.tenant_email,
      message: `Document sent to ${booking.tenant_email} for signing via Adobe Sign`
    });

  } catch (err) {
    logger.error('Adobe Sign send error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
