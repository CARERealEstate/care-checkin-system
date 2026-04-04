const logger = require('./logger');

// Adobe Sign API integration
// Requires environment variables:
//   ADOBE_SIGN_CLIENT_ID - OAuth client ID
//   ADOBE_SIGN_CLIENT_SECRET - OAuth client secret
//   ADOBE_SIGN_REFRESH_TOKEN - OAuth refresh token
//   ADOBE_SIGN_API_BASE - API base URL (default: https://api.eu1.adobesign.com)

const API_BASE = process.env.ADOBE_SIGN_API_BASE || 'https://api.eu1.adobesign.com';

let cachedAccessToken = null;
let tokenExpiry = 0;

async function getAccessToken() {
  // Return cached token if still valid
  if (cachedAccessToken && Date.now() < tokenExpiry) {
    return cachedAccessToken;
  }

  const clientId = process.env.ADOBE_SIGN_CLIENT_ID;
  const clientSecret = process.env.ADOBE_SIGN_CLIENT_SECRET;
  const refreshToken = process.env.ADOBE_SIGN_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Adobe Sign credentials not configured. Set ADOBE_SIGN_CLIENT_ID, ADOBE_SIGN_CLIENT_SECRET, and ADOBE_SIGN_REFRESH_TOKEN environment variables.');
  }

  const res = await fetch(`${API_BASE}/oauth/v2/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Adobe Sign token refresh failed: ${err}`);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  // Expire 5 minutes before actual expiry
  tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
  return cachedAccessToken;
}

async function uploadTransientDocument(accessToken, htmlContent, fileName) {
  const formData = new FormData();
  const blob = new Blob([htmlContent], { type: 'text/html' });
  formData.append('File', blob, fileName);
  formData.append('Mime-Type', 'text/html');

  const res = await fetch(`${API_BASE}/api/rest/v6/transientDocuments`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: formData
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload document to Adobe Sign: ${err}`);
  }

  const data = await res.json();
  return data.transientDocumentId;
}

async function createAgreement(accessToken, transientDocumentId, signerEmail, signerName, documentName) {
  const agreement = {
    fileInfos: [{
      transientDocumentId
    }],
    name: documentName,
    participantSetsInfo: [{
      memberInfos: [{
        email: signerEmail,
        name: signerName
      }],
      order: 1,
      role: 'SIGNER'
    }],
    signatureType: 'ESIGN',
    state: 'IN_PROCESS',
    message: `Hi ${signerName},\n\nPlease review and sign your CARE Real Estate check-in documents.\n\nIf you have any questions, contact us at 0204 553 2233 or info@creativeappeal.co.uk.\n\nThank you,\nCARE Real Estate`
  };

  const res = await fetch(`${API_BASE}/api/rest/v6/agreements`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(agreement)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create Adobe Sign agreement: ${err}`);
  }

  return await res.json();
}

async function sendForSignature({ htmlContent, fileName, signerEmail, signerName, documentName }) {
  logger.info('Sending document for Adobe Sign', { signerEmail, signerName, documentName });

  const accessToken = await getAccessToken();
  const transientDocId = await uploadTransientDocument(accessToken, htmlContent, fileName);
  const agreement = await createAgreement(accessToken, transientDocId, signerEmail, signerName, documentName);

  logger.info('Adobe Sign agreement created', { agreementId: agreement.id });
  return {
    agreementId: agreement.id,
    status: 'SENT'
  };
}

function isConfigured() {
  return !!(process.env.ADOBE_SIGN_CLIENT_ID && process.env.ADOBE_SIGN_CLIENT_SECRET && process.env.ADOBE_SIGN_REFRESH_TOKEN);
}

module.exports = { sendForSignature, isConfigured };
