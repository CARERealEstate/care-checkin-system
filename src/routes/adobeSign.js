const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const logger = require('../services/logger');
const pdfGenerator = require('../services/pdfGenerator');

// Adobe Sign configuration from environment variables
const ADOBE_CLIENT_ID = process.env.ADOBE_SIGN_CLIENT_ID || '';
const ADOBE_CLIENT_SECRET = process.env.ADOBE_SIGN_CLIENT_SECRET || '';
const ADOBE_REFRESH_TOKEN = process.env.ADOBE_SIGN_REFRESH_TOKEN || '';
const ADOBE_BASE_URI = process.env.ADOBE_SIGN_BASE_URI || 'https://api.eu1.adobesign.com';

// Cache for access token
let cachedToken = null;
let tokenExpiry = 0;

// Get a fresh access token
async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiry - 300000) return cachedToken;

  // Direct access token for testing
  if (process.env.ADOBE_SIGN_ACCESS_TOKEN) {
    cachedToken = process.env.ADOBE_SIGN_ACCESS_TOKEN;
    tokenExpiry = Date.now() + 86400000;
    return cachedToken;
  }

  // Server-to-Server OAuth (client_credentials)
  const tokenUrl = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: ADOBE_CLIENT_ID,
    client_secret: ADOBE_CLIENT_SECRET,
    scope: 'AdobeID,openid,agreement_write:account,agreement_send:account,agreement_read:account'
  });

  try {
    const resp = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });

    if (!resp.ok) {
      const errText = await resp.text();
      logger.error('Adobe token error: ' + resp.status + ' ' + errText);
      if (ADOBE_REFRESH_TOKEN) return await getTokenViaRefresh();
      throw new Error('Failed to get Adobe access token: ' + resp.status);
    }

    const data = await resp.json();
    cachedToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in || 86400) * 1000;
    logger.info('Adobe access token refreshed');
    return cachedToken;
  } catch (err) {
    logger.error('Adobe token fetch failed: ' + err.message);
    if (ADOBE_REFRESH_TOKEN) return await getTokenViaRefresh();
    throw err;
  }
}

// Fallback: get token via refresh_token
async function getTokenViaRefresh() {
  const tokenUrl = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: ADOBE_CLIENT_ID,
    client_secret: ADOBE_CLIENT_SECRET,
    refresh_token: ADOBE_REFRESH_TOKEN
  });
  const resp = await fetch(tokenUrl, { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString() });
  if (!resp.ok) { const e = await resp.text(); throw new Error('Adobe refresh token error: ' + resp.status + ' ' + e); }
  const data = await resp.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 86400) * 1000;
  return cachedToken;
}

// Discover Adobe Sign base URI
async function getBaseUri(token) {
  try {
    const resp = await fetch('https://api.adobesign.com/api/rest/v6/baseUris', {
      headers: { 'Authorization': 'Bearer ' + token } });
    if (resp.ok) { const data = await resp.json(); return data.apiAccessPoint || ADOBE_BASE_URI; }
  } catch (err) { logger.warn('Could not discover base URI: ' + err.message); }
  return ADOBE_BASE_URI;
}

// Upload HTML as transient document
async function uploadTransientDocument(token, baseUri, htmlContent, fileName) {
  const url = baseUri + 'api/rest/v6/transientDocuments';
  const boundary = '----FormBoundary' + Date.now();
  const body = ['--' + boundary,
    'Content-Disposition: form-data; name="File-Name"', '', fileName,
    '--' + boundary, 'Content-Disposition: form-data; name="Mime-Type"', '', 'text/html',
    '--' + boundary, 'Content-Disposition: form-data; name="File"; filename="' + fileName + '"',
    'Content-Type: text/html', '', htmlContent, '--' + boundary + '--'].join('\r\n');
  const resp = await fetch(url, { method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
    body: body });
  if (!resp.ok) { const e = await resp.text(); throw new Error('Upload failed: ' + resp.status + ' ' + e); }
  const data = await resp.json();
  return data.transientDocumentId;
}

// Create signing agreement
async function createAgreement(token, baseUri, transientDocId, recipientEmail, agreementName) {
  const url = baseUri + 'api/rest/v6/agreements';
  const agreementData = {
    fileInfos: [{ transientDocumentId: transientDocId }],
    name: agreementName,
    participantSetsInfo: [{ memberInfos: [{ email: recipientEmail }], order: 1, role: 'SIGNER' }],
    signatureType: 'ESIGN',
    state: 'IN_PROCESS',
    emailOption: { sendOptions: { completionEmails: 'ALL', inFlightEmails: 'ALL', initEmails: 'ALL' } }
  };
  const resp = await fetch(url, { method: 'POST',
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(agreementData) });
  if (!resp.ok) { const e = await resp.text(); throw new Error('Create agreement failed: ' + resp.status + ' ' + e); }
  return await resp.json();
}

// ============ ROUTES ============

// POST /api/adobe/send/:formId
router.post('/send/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: req.params.formId });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const recipientEmail = req.body.email || form.tenant_email;
    if (!recipientEmail || !recipientEmail.includes('@'))
      return res.status(400).json({ error: 'Valid email required for Adobe Sign' });

    if (!ADOBE_CLIENT_ID || !ADOBE_CLIENT_SECRET)
      return res.status(500).json({ error: 'Adobe Sign not configured. Set ADOBE_SIGN_CLIENT_ID and ADOBE_SIGN_CLIENT_SECRET env vars.' });

    logger.info('Sending form ' + form.id + ' to ' + recipientEmail + ' via Adobe Sign');

    const token = await getAccessToken();
    const baseUri = await getBaseUri(token);

    // Generate HTML check-in pack
    const booking = db.prepare('SELECT * FROM bookings WHERE id = @id').get({ id: form.booking_id });
    const evidence = db.prepare('SELECT * FROM evidence WHERE form_id = @id AND included_in_pdf = 1 ORDER BY uploaded_at').all({ id: form.id });
    let formData;
    try { formData = typeof form.form_data === 'string' ? JSON.parse(form.form_data) : (form.form_data || {}); }
    catch (e) { formData = {}; }

    const htmlContent = pdfGenerator.buildCheckInHTML(form, booking, evidence, formData);

    // Upload and create agreement
    const fileName = 'CARE-CheckIn-' + (form.reference_number || form.id) + '.html';
    const transientDocId = await uploadTransientDocument(token, baseUri, htmlContent, fileName);
    const agreementName = 'CARE Check-In - ' + (form.tenant_first_name || '') + ' ' + (form.tenant_last_name || '');
    const agreement = await createAgreement(token, baseUri, transientDocId, recipientEmail, agreementName);
    logger.info('Created Adobe Sign agreement: ' + agreement.id);

    // Update form record
    db.prepare('UPDATE forms SET signing_method = @method, adobe_agreement_id = @agId, adobe_sign_status = @status, adobe_sign_email = @email WHERE id = @id').run({
      method: 'pending_digital', agId: agreement.id, status: 'OUT_FOR_SIGNATURE', email: recipientEmail, id: form.id });

    res.json({ success: true, message: 'Document sent to ' + recipientEmail + ' for signing', agreementId: agreement.id });
  } catch (err) {
    logger.error('Adobe Sign send error: ' + err.message);
    res.status(500).json({ error: 'Failed to send via Adobe Sign: ' + err.message });
  }
});

// GET /api/adobe/status/:formId
router.get('/status/:formId', async (req, res) => {
  try {
    const form = db.prepare('SELECT * FROM forms WHERE id = @id').get({ id: req.params.formId });
    if (!form) return res.status(404).json({ error: 'Form not found' });
    if (!form.adobe_agreement_id) return res.json({ status: 'NOT_SENT', message: 'Not sent via Adobe Sign' });

    const token = await getAccessToken();
    const baseUri = await getBaseUri(token);
    const resp = await fetch(baseUri + 'api/rest/v6/agreements/' + form.adobe_agreement_id, {
      headers: { 'Authorization': 'Bearer ' + token } });

    if (!resp.ok) return res.json({ status: form.adobe_sign_status || 'UNKNOWN',
      message: 'Could not fetch live status', agreementId: form.adobe_agreement_id });

    const data = await resp.json();
    db.prepare('UPDATE forms SET adobe_sign_status = @status WHERE id = @id').run({ status: data.status, id: form.id });
    if (data.status === 'SIGNED') {
      db.prepare('UPDATE forms SET signing_method = @method WHERE id = @id').run({ method: 'digital_signed', id: form.id });
    }

    res.json({ status: data.status, agreementId: form.adobe_agreement_id,
      email: form.adobe_sign_email, name: data.name || '' });
  } catch (err) {
    logger.error('Adobe Sign status error: ' + err.message);
    res.status(500).json({ error: 'Failed to check status: ' + err.message });
  }
});

// GET /api/adobe/config
router.get('/config', (req, res) => {
  res.json({ configured: !!(ADOBE_CLIENT_ID && ADOBE_CLIENT_SECRET),
    hasRefreshToken: !!ADOBE_REFRESH_TOKEN, baseUri: ADOBE_BASE_URI });
});

module.exports = router;
