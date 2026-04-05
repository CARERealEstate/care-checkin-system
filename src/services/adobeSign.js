const logger = require('./logger');

// Adobe Sign API integration (Server-to-Server OAuth)
// Requires environment variables:
// ADOBE_SIGN_CLIENT_ID - OAuth client ID from Adobe Developer Console
// ADOBE_SIGN_CLIENT_SECRET - OAuth client secret
// ADOBE_SIGN_API_BASE - API base URL (default: https://api.eu1.adobesign.com)

const IMS_TOKEN_URL = 'https://ims-na1.adobelogin.com/ims/token/v3';
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

  if (!clientId || !clientSecret) {
    throw new Error('Adobe Sign credentials not configured. Set ADOBE_SIGN_CLIENT_ID and ADOBE_SIGN_CLIENT_SECRET environment variables.');
  }

  // Server-to-Server OAuth: client_credentials grant
  const res = await fetch(IMS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'AdobeID,openid,DCAPI,additional_info.projectedProductContext'
    })
  });

  if (!res.ok) {
    const err = await res.text();
    logger.error('Adobe IMS token request failed', { status: res.status, error: err });
    throw new Error('Adobe Sign token request failed (' + res.status + '): ' + err);
  }

  const data = await res.json();
  cachedAccessToken = data.access_token;
  // Expire 5 minutes before actual expiry
  tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);
  logger.info('Adobe Sign access token obtained', { expiresIn: data.expires_in });
  return cachedAccessToken;
}

async function discoverBaseUri(accessToken) {
  // Discover the correct API base URI for this account
  const res = await fetch('https://api.adobesign.com/api/rest/v6/baseUris', {
    headers: { 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.ok) {
    const data = await res.json();
    return data.apiAccessPoint || API_BASE;
  }
  // Fall back to configured base
  return API_BASE;
}

async function uploadTransientDocument(accessToken, baseUri, htmlContent, fileName) {
  // Node.js does not have browser FormData, use manual multipart
  const boundary = '----AdobeSignBoundary' + Date.now();
  const body = [
    '--' + boundary,
    'Content-Disposition: form-data; name="Mime-Type"',
    '',
    'text/html',
    '--' + boundary,
    'Content-Disposition: form-data; name="File"; filename="' + fileName + '"',
    'Content-Type: text/html',
    '',
    htmlContent,
    '--' + boundary + '--'
  ].join('\r\n');

  const res = await fetch(baseUri + 'api/rest/v6/transientDocuments', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'multipart/form-data; boundary=' + boundary
    },
    body: body
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Failed to upload document to Adobe Sign: ' + err);
  }

  const data = await res.json();
  return data.transientDocumentId;
}

async function createAgreement(accessToken, baseUri, transientDocumentId, signerEmail, signerName, documentName) {
  const agreement = {
    fileInfos: [{ transientDocumentId: transientDocumentId }],
    name: documentName,
    participantSetsInfo: [{
      memberInfos: [{ email: signerEmail, name: signerName || signerEmail }],
      order: 1,
      role: 'SIGNER'
    }],
    signatureType: 'ESIGN',
    state: 'IN_PROCESS',
    message: 'Hi ' + (signerName || '') + ',\n\nPlease review and sign your CARE Real Estate check-in documents.\n\nIf you have any questions, contact us at 0204 553 2233 or info@creativeappeal.co.uk.\n\nThank you,\nCARE Real Estate'
  };

  const res = await fetch(baseUri + 'api/rest/v6/agreements', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(agreement)
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Failed to create Adobe Sign agreement: ' + err);
  }

  return await res.json();
}

async function sendForSignature({ htmlContent, fileName, signerEmail, signerName, documentName }) {
  logger.info('Sending document for Adobe Sign', { signerEmail, signerName, documentName });

  const accessToken = await getAccessToken();
  const baseUri = await discoverBaseUri(accessToken);
  const apiBase = baseUri.endsWith('/') ? baseUri : baseUri + '/';

  const transientDocId = await uploadTransientDocument(accessToken, apiBase, htmlContent, fileName);
  const agreement = await createAgreement(accessToken, apiBase, transientDocId, signerEmail, signerName, documentName);

  logger.info('Adobe Sign agreement created', { agreementId: agreement.id });
  return { agreementId: agreement.id, status: 'SENT' };
}

function isConfigured() {
  return !!(process.env.ADOBE_SIGN_CLIENT_ID && process.env.ADOBE_SIGN_CLIENT_SECRET);
}

module.exports = { sendForSignature, isConfigured };
