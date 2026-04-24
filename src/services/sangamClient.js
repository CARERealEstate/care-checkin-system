const logger = require('./logger');
const { db } = require('../db/database');

const SANGAM_URL = process.env.SANGAM_URL || 'https://care.sangamcrm.com';
const SANGAM_EMAIL = process.env.SANGAM_EMAIL || '';
const SANGAM_PASSWORD = process.env.SANGAM_PASSWORD || '';
const SANGAM_API_TOKEN = process.env.SANGAM_API_TOKEN || '';

let browser = null;

// ââââââââââââââââââââââââââââââââââââââââââââââ
// REST API Methods (Token-based)
// ââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Make an authenticated request to the Sangam CRM REST API.
 * Sangam's API uses /api/v1/ with POST requests and token auth.
 */
async function apiRequest(endpoint, body = {}) {
  if (!SANGAM_API_TOKEN) {
    logger.warn('SANGAM_API_TOKEN not configured');
    return null;
  }

  const url = `${SANGAM_URL}/api/v1/${endpoint}`;
  logger.info(`Sangam API request: ${url}`, { body: JSON.stringify(body) });

  // Try multiple auth header formats
  const authFormats = [
    `Token ${SANGAM_API_TOKEN}`,
    `Bearer ${SANGAM_API_TOKEN}`,
    SANGAM_API_TOKEN
  ];

  for (const authHeader of authFormats) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Accept': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (response.ok) {
        const data = await response.json();
        logger.info(`Sangam API success with auth format: ${authHeader.substring(0, 10)}...`, { status: response.status });
        return data;
      }

      if (response.status === 401 || response.status === 403) {
        logger.info(`Auth format rejected: ${authHeader.substring(0, 10)}..., trying next...`);
        continue;
      }

      // Non-auth error - log and return null
      const errorText = await response.text().catch(() => '');
      logger.error(`Sangam API error: ${response.status} ${response.statusText}`, { body: errorText.substring(0, 500) });
      return null;
    } catch (err) {
      if (err.name === 'AbortError' || err.name === 'TimeoutError') {
        logger.error(`Sangam API request timed out: ${url}`);
        return null;
      }
      logger.error(`Sangam API request failed: ${err.message}`);
      return null;
    }
  }

  logger.error('All auth formats rejected by Sangam API');
  return null;
}

/**
 * Search CRM bookings/placements via the REST API.
 * Tries multiple endpoint patterns for Sangam CRM.
 * Sangam CRM typically uses: get-list, get-data with module_name parameter.
 */
async function searchCRMBookings(query) {
  if (!SANGAM_API_TOKEN) return null;

  // Try different endpoint patterns that Sangam CRM uses
  // Based on research: Sangam uses module_name with endpoints like get-list, get-data, save-data
  const endpoints = [
    // Most likely Sangam CRM patterns (module_name based)
    { path: 'get-list', body: { module_name: 'Lead', search: query, limit: 50 } },
    { path: 'get-list', body: { module_name: 'Leads', search: query, limit: 50 } },
    { path: 'get-list', body: { module_name: 'Placement', search: query, limit: 50 } },
    { path: 'get-list', body: { module_name: 'Placements', search: query, limit: 50 } },
    { path: 'get-list', body: { module_name: 'Booking', search: query, limit: 50 } },
    { path: 'get-list', body: { module_name: 'Bookings', search: query, limit: 50 } },
    { path: 'get-data', body: { module_name: 'Lead', search: query } },
    { path: 'get-data', body: { module_name: 'Leads', search: query } },
    // Alternative search parameter formats
    { path: 'get-list', body: { module_name: 'Lead', search_text: query, limit: 50 } },
    { path: 'get-list', body: { module_name: 'Lead', query: query, limit: 50 } },
    // Generic search endpoint
    { path: 'search', body: { module: 'Lead', query: query, limit: 50 } },
    { path: 'search', body: { module: 'Leads', query: query, limit: 50 } },
    // Original patterns (leads-prefixed)
    { path: 'leads/search', body: { search: query } },
    { path: 'leads/list', body: { search: query, limit: 50 } },
    { path: 'leads', body: { search: query, limit: 50 } },
    { path: 'records/search', body: { module: 'Leads', search_text: query } }
  ];

  for (const ep of endpoints) {
    const result = await apiRequest(ep.path, ep.body);
    if (result && (result.data || result.records || result.leads || result.results || result.list || Array.isArray(result))) {
      const records = result.data || result.records || result.leads || result.results || result.list || result;
      if (Array.isArray(records) && records.length > 0) {
        logger.info(`Sangam API search succeeded via ${ep.path} with body ${JSON.stringify(ep.body)}: ${records.length} results`);
        return records;
      }
    }
  }

  logger.warn('Sangam API search: no working endpoint found');
  return null;
}

/**
 * Get a single CRM record by its reference number or ID.
 */
async function getCRMBookingByRef(ref) {
  if (!SANGAM_API_TOKEN) return null;

  const endpoints = [
    { path: 'get-list', body: { module_name: 'Lead', search: ref, limit: 5 } },
    { path: 'get-list', body: { module_name: 'Leads', search: ref, limit: 5 } },
    { path: 'get-data', body: { module_name: 'Lead', search: ref } },
    { path: 'get-data', body: { module_name: 'Lead', id: ref } },
    { path: 'leads/search', body: { search: ref } },
    { path: 'leads/list', body: { search: ref, limit: 5 } },
    { path: 'search', body: { module: 'Leads', query: ref } }
  ];

  for (const ep of endpoints) {
    const result = await apiRequest(ep.path, ep.body);
    if (result && (result.data || result.records || result.leads || result.results || result.list || Array.isArray(result))) {
      const records = result.data || result.records || result.leads || result.results || result.list || result;
      if (Array.isArray(records) && records.length > 0) {
        logger.info(`Sangam API ref lookup succeeded via ${ep.path}`);
        return records[0];
      }
    }
  }

  return null;
}

/**
 * Test all possible API endpoint patterns and return results.
 * Used for diagnostics to find the correct endpoint.
 */
async function testAPIEndpoints() {
  if (!SANGAM_API_TOKEN) {
    return { error: 'SANGAM_API_TOKEN not configured', configured: false };
  }

  const testEndpoints = [
    { path: 'get-list', body: { module_name: 'Lead', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Leads', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Placement', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Placements', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Booking', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Bookings', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Contact', limit: 5 } },
    { path: 'get-list', body: { module_name: 'Account', limit: 5 } },
    { path: 'get-data', body: { module_name: 'Lead' } },
    { path: 'get-data', body: { module_name: 'Leads' } },
    { path: 'leads/list', body: { limit: 5 } },
    { path: 'leads', body: { limit: 5 } },
    { path: 'search', body: { module: 'Lead', query: 'test' } },
    { path: 'modules', body: {} },
    { path: 'get-modules', body: {} },
    { path: 'module-list', body: {} }
  ];

  const results = [];

  for (const ep of testEndpoints) {
    const url = `${SANGAM_URL}/api/v1/${ep.path}`;
    const startTime = Date.now();

    try {
      // Try Token format first
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${SANGAM_API_TOKEN}`,
          'Accept': 'application/json'
        },
        body: JSON.stringify(ep.body),
        signal: AbortSignal.timeout(10000)
      });

      const elapsed = Date.now() - startTime;
      let responseBody = null;
      try {
        responseBody = await response.json();
      } catch (e) {
        try {
          responseBody = await response.text();
        } catch (e2) {
          responseBody = 'Could not read response';
        }
      }

      results.push({
        endpoint: ep.path,
        body: ep.body,
        status: response.status,
        statusText: response.statusText,
        elapsed: elapsed + 'ms',
        success: response.ok,
        response: typeof responseBody === 'object' ? responseBody : { raw: String(responseBody).substring(0, 500) },
        recordCount: response.ok && responseBody ?
          (Array.isArray(responseBody?.data) ? responseBody.data.length :
           Array.isArray(responseBody?.records) ? responseBody.records.length :
           Array.isArray(responseBody?.list) ? responseBody.list.length :
           Array.isArray(responseBody?.leads) ? responseBody.leads.length :
           Array.isArray(responseBody?.results) ? responseBody.results.length :
           Array.isArray(responseBody) ? responseBody.length : null) : null
      });

      // If Token format got 401/403, also try Bearer
      if (response.status === 401 || response.status === 403) {
        const response2 = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SANGAM_API_TOKEN}`,
            'Accept': 'application/json'
          },
          body: JSON.stringify(ep.body),
          signal: AbortSignal.timeout(10000)
        });

        let responseBody2 = null;
        try { responseBody2 = await response2.json(); } catch(e) {
          try { responseBody2 = await response2.text(); } catch(e2) { responseBody2 = 'Could not read'; }
        }

        if (response2.ok) {
          results.push({
            endpoint: ep.path,
            body: ep.body,
            authFormat: 'Bearer',
            status: response2.status,
            success: true,
            response: typeof responseBody2 === 'object' ? responseBody2 : { raw: String(responseBody2).substring(0, 500) }
          });
        }
      }
    } catch (err) {
      results.push({
        endpoint: ep.path,
        body: ep.body,
        error: err.message,
        success: false
      });
    }
  }

  return {
    configured: true,
    sangam_url: SANGAM_URL,
    token_preview: SANGAM_API_TOKEN.substring(0, 8) + '...',
    total_tested: results.length,
    successful: results.filter(r => r.success).length,
    results
  };
}


/**
 * Normalize a Sangam CRM record into our standard booking format.
 * Handles different field naming conventions from Sangam.
 */
function normalizeCRMRecord(record) {
  if (!record) return null;

  // Sangam CRM may use various field naming conventions
  return {
    sangam_id: record.uuid || record.id || record._id || '',
    first_name: record.first_name || record.firstName || record.name?.split(' ')[0] || '',
    last_name: record.last_name || record.lastName || record.name?.split(' ').slice(1).join(' ') || '',
    email: extractField(record, ['email', 'email_address', 'emailAddress']),
    phone: extractField(record, ['phone', 'mobile', 'telephone', 'phone_number', 'phoneNumber']),
    property_address: extractField(record, ['property_address', 'propertyAddress', 'address', 'property', 'accommodation_address']),
    council_name: extractField(record, ['council_name', 'councilName', 'council', 'local_authority', 'localAuthority', 'la_name']),
    housing_officer: extractField(record, ['housing_officer', 'housingOfficer', 'officer']),
    unit_number: extractField(record, ['unit_number', 'unitNumber', 'unit', 'room_number', 'roomNumber']),
    nok_name: extractField(record, ['nok_name', 'nokName', 'next_of_kin', 'nextOfKin', 'nok']),
    nok_number: extractField(record, ['nok_number', 'nokNumber', 'nok_phone', 'nokPhone']),
    placement_start: extractField(record, ['placement_start', 'placementStart', 'start_date', 'startDate', 'check_in_date', 'checkinDate', 'move_in']),
    placement_end: extractField(record, ['placement_end', 'placementEnd', 'end_date', 'endDate', 'check_out_date', 'checkoutDate', 'move_out']),
    reference_number: extractField(record, ['reference_number', 'referenceNumber', 'reference', 'ref', 'placement_ref', 'booking_ref', 'file_reference']),
    risk_profile: extractField(record, ['risk_profile', 'riskProfile', 'risk', 'risk_level']),
    nightly_rate: extractField(record, ['nightly_rate', 'nightlyRate', 'rate', 'night_rate', 'per_night']),
    assigned_to: extractField(record, ['assigned_to', 'assignedTo', 'owner', 'agent']),
    raw_data: record
  };
}

function extractField(record, fieldNames) {
  for (const name of fieldNames) {
    let val = record[name];
    // Handle nested arrays (Sangam stores phone/email as arrays sometimes)
    if (Array.isArray(val)) {
      if (val.length > 0) {
        val = val[0]?.phone_number || val[0]?.email_address || val[0]?.value || val[0];
      } else {
        continue;
      }
    }
    if (val !== undefined && val !== null && String(val).trim() !== '' && String(val).trim() !== '-') {
      return String(val).trim();
    }
  }
  return '';
}

// ââââââââââââââââââââââââââââââââââââââââââââââ
// Local DB Search (for synced bookings)
// ââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Search local bookings DB by name, ref, address, or council.
 */
function searchLocalBookings(query, limit = 20) {
  const searchTerm = `%${query}%`;
  return db.prepare(`
    SELECT * FROM bookings
    WHERE tenant_first_name LIKE @q
       OR tenant_last_name LIKE @q
       OR reference_number LIKE @q
       OR property_address LIKE @q
       OR council_name LIKE @q
       OR sangam_id LIKE @q
    ORDER BY updated_at DESC
    LIMIT @limit
  `).all({ q: searchTerm, limit });
}

/**
 * Get recent bookings from local DB.
 */
function getRecentBookings(limit = 30) {
  return db.prepare(`
    SELECT * FROM bookings
    ORDER BY updated_at DESC
    LIMIT @limit
  `).all({ limit });
}

/**
 * Get a single local booking by reference number.
 */
function getLocalBookingByRef(ref) {
  return db.prepare(`
    SELECT * FROM bookings
    WHERE reference_number = @ref
    LIMIT 1
  `).get({ ref });
}

// ââââââââââââââââââââââââââââââââââââââââââââââ
// Puppeteer Scraper (for bulk sync)
// ââââââââââââââââââââââââââââââââââââââââââââââ

async function getPuppeteer() {
  try {
    return require('puppeteer-core');
  } catch (e) {
    try {
      return require('puppeteer');
    } catch (e2) {
      logger.error('Neither puppeteer-core nor puppeteer is installed');
      return null;
    }
  }
}

async function launchBrowser() {
  const puppeteer = await getPuppeteer();
  if (!puppeteer) return null;

  try {
    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ],
      timeout: 30000
    });
    logger.info('Puppeteer browser launched');
    return browser;
  } catch (err) {
    logger.error('Failed to launch browser', { error: err.message });
    return null;
  }
}

async function closeBrowser() {
  if (browser) {
    try { await browser.close(); } catch (e) { /* ignore */ }
    browser = null;
  }
}

async function loginAndGetPage() {
  if (!SANGAM_EMAIL || !SANGAM_PASSWORD) {
    logger.warn('Sangam CRM credentials not configured (SANGAM_EMAIL / SANGAM_PASSWORD)');
    return null;
  }

  const b = await launchBrowser();
  if (!b) return null;

  const page = await b.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(30000);

  try {
    await page.goto(`${SANGAM_URL}/login`, { waitUntil: 'networkidle2' });

    if (!page.url().includes('/login')) {
      logger.info('Already authenticated with Sangam CRM');
      return page;
    }

    await page.waitForSelector('input[name="login"], input#email, input[name="username"]', { timeout: 15000 });

    const emailField = await page.$('input[name="login"]') || await page.$('input#email') || await page.$('input[name="email"]');
    const passwordField = await page.$('input[name="password"]') || await page.$('input[type="password"]');

    if (!emailField || !passwordField) {
      logger.error('Could not find login form fields');
      return null;
    }

    await emailField.type(SANGAM_EMAIL, { delay: 50 });
    await passwordField.type(SANGAM_PASSWORD, { delay: 50 });

    const submitBtn = await page.$('button[type="submit"]') || await page.$('input[type="submit"]');
    if (submitBtn) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        submitBtn.click()
      ]);
    } else {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }),
        page.keyboard.press('Enter')
      ]);
    }

    if (page.url().includes('/login')) {
      logger.error('Sangam CRM login failed - still on login page');
      return null;
    }

    logger.info('Sangam CRM login successful', { url: page.url() });
    return page;
  } catch (err) {
    logger.error('Sangam CRM login error', { error: err.message });
    return null;
  }
}

async function scrapeDetailPage(page, uuid) {
  try {
    await page.goto(`${SANGAM_URL}/leads/${uuid}`, {
      waitUntil: 'networkidle2',
      timeout: 25000
    });

    await new Promise(r => setTimeout(r, 1500));

    const details = await page.evaluate(() => {
      const data = {};

      function findFieldValue(labelTexts) {
        const allLabels = document.querySelectorAll('label, .field-label, th, dt, .label, span.key, div.label');
        for (const label of allLabels) {
          const text = label.textContent.trim().toLowerCase().replace(/[:\s]+$/, '');
          for (const target of labelTexts) {
            if (text === target.toLowerCase() || text.includes(target.toLowerCase())) {
              const candidates = [
                label.nextElementSibling,
                label.parentElement && label.parentElement.nextElementSibling,
                label.closest('tr') && label.closest('tr').querySelector('td:last-child'),
                label.closest('dt') && label.closest('dt').nextElementSibling,
                label.closest('.field-group') && label.closest('.field-group').querySelector('.field-value, .value, input, select, textarea')
              ];
              for (const el of candidates) {
                if (!el) continue;
                const val = el.value || el.textContent;
                if (val && val.trim() && val.trim() !== '-' && val.trim() !== 'N/A') {
                  return val.trim();
                }
              }
            }
          }
        }
        return '';
      }

      function findInputValue(namePatterns) {
        for (const pattern of namePatterns) {
          const el = document.querySelector(
            `input[name*="${pattern}"], textarea[name*="${pattern}"], select[name*="${pattern}"],
             input[id*="${pattern}"], textarea[id*="${pattern}"], select[id*="${pattern}"]`
          );
          if (el) {
            const val = el.value || el.textContent;
            if (val && val.trim()) return val.trim();
          }
        }
        return '';
      }

      data.property_address = findFieldValue(['property address', 'address', 'property', 'accommodation address', 'unit address'])
        || findInputValue(['address', 'property_address', 'property']);
      data.council_name = findFieldValue(['council', 'council name', 'local authority', 'referring council', 'la name'])
        || findInputValue(['council', 'council_name', 'local_authority']);
      data.placement_start = findFieldValue(['placement start', 'start date', 'check-in date', 'check in date', 'move in', 'move-in date', 'placement date'])
        || findInputValue(['placement_start', 'start_date', 'checkin_date', 'move_in']);
      data.placement_end = findFieldValue(['placement end', 'end date', 'check-out date', 'check out date', 'move out', 'move-out date', 'expected end'])
        || findInputValue(['placement_end', 'end_date', 'checkout_date', 'move_out']);
      data.reference_number = findFieldValue(['reference', 'ref', 'reference number', 'placement ref', 'booking ref'])
        || findInputValue(['reference', 'ref_number', 'reference_number']);
      data.risk_profile = findFieldValue(['risk', 'risk profile', 'risk level', 'risk assessment'])
        || findInputValue(['risk', 'risk_profile']);
      data.nightly_rate = findFieldValue(['nightly rate', 'rate', 'night rate', 'per night', 'nightly'])
        || findInputValue(['nightly_rate', 'rate', 'night_rate']);
      data.phone = findFieldValue(['phone', 'mobile', 'telephone', 'contact number'])
        || findInputValue(['phone', 'mobile', 'telephone']);
      data.email = findFieldValue(['email', 'email address', 'e-mail'])
        || findInputValue(['email', 'email_address']);
      data.first_name = findFieldValue(['first name', 'given name', 'forename'])
        || findInputValue(['first_name', 'firstname']);
      data.last_name = findFieldValue(['last name', 'surname', 'family name'])
        || findInputValue(['last_name', 'lastname', 'surname']);

      const pageTitle = document.querySelector('h1, h2, .page-title, .lead-name, .record-title');
      if (pageTitle && !data.first_name) {
        const titleText = pageTitle.textContent.trim();
        if (titleText && /^[A-Za-z\s\-']+$/.test(titleText) && titleText.includes(' ')) {
          data.detail_page_name = titleText;
        }
      }

      const detailPanels = document.querySelectorAll('.detail-panel, .info-card, .record-detail, .field-row, .form-group');
      detailPanels.forEach(panel => {
        const text = panel.textContent.toLowerCase();
        const valueEl = panel.querySelector('.value, .field-value, input, select, textarea, td:last-child, dd');
        if (!valueEl) return;
        const val = (valueEl.value || valueEl.textContent || '').trim();
        if (!val || val === '-' || val === 'N/A') return;

        if ((text.includes('address') || text.includes('property')) && !data.property_address) data.property_address = val;
        if ((text.includes('council') || text.includes('authority')) && !data.council_name) data.council_name = val;
        if (text.includes('start') && text.includes('date') && !data.placement_start) data.placement_start = val;
        if (text.includes('end') && text.includes('date') && !data.placement_end) data.placement_end = val;
      });

      return data;
    });

    logger.info(`Detail page scraped for ${uuid}`, {
      hasAddress: !!details.property_address,
      hasCouncil: !!details.council_name
    });
    return details;
  } catch (err) {
    logger.error(`Failed to scrape detail page for ${uuid}`, { error: err.message });
    return {};
  }
}

async function scrapePlacements(page) {
  try {
    await page.goto(`${SANGAM_URL}/leads`, { waitUntil: 'networkidle2' });

    await page.waitForFunction(() => {
      const links = document.querySelectorAll('table tbody a[href*="/leads/"]');
      return links.length > 0;
    }, { timeout: 15000 });

    await new Promise(r => setTimeout(r, 2000));

    const clicked100 = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        if (link.textContent.trim() === '100') {
          link.click();
          return true;
        }
      }
      const select = document.querySelector('select[name*="length"], .dataTables_length select');
      if (select) {
        select.value = '100';
        select.dispatchEvent(new Event('change'));
        return true;
      }
      return false;
    });

    if (clicked100) await new Promise(r => setTimeout(r, 3000));

    const placements = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const results = [];

      rows.forEach(row => {
        const link = row.querySelector('a[href*="/leads/"]');
        if (!link) return;
        const cells = row.querySelectorAll('td');
        if (cells.length < 10) return;

        const uuid = link.href.split('/leads/')[1];

        let phone = '';
        try {
          const phoneCell = cells[11]?.textContent.trim();
          if (phoneCell && phoneCell.startsWith('[')) {
            const phoneData = JSON.parse(phoneCell);
            if (phoneData[0]?.phone_number) phone = phoneData[0].phone_number;
          } else {
            phone = phoneCell || '';
          }
        } catch(e) {}

        let email = '';
        try {
          const emailCell = cells[13]?.textContent.trim();
          if (emailCell && emailCell.startsWith('[')) {
            const emailData = JSON.parse(emailCell);
            if (emailData[0]?.email_address) email = emailData[0].email_address;
          } else {
            email = emailCell || '';
          }
        } catch(e) {}

        results.push({
          sangam_id: uuid,
          first_name: cells[3]?.textContent.trim() || '',
          last_name: cells[4]?.textContent.trim() || '',
          risk_profile: cells[5]?.textContent.trim() || '',
          reference_number: cells[10]?.textContent.trim() || '',
          phone,
          email,
          nightly_rate: cells[14]?.textContent.trim() || '',
          created_at: cells[15]?.textContent.trim() || '',
          updated_at: cells[16]?.textContent.trim() || '',
          assigned_to: cells[18]?.textContent.trim() || ''
        });
      });

      return results;
    });

    // Scrape detail pages
    logger.info('Starting individual placement detail scraping...');
    let detailCount = 0;

    for (const placement of placements) {
      if (!placement.sangam_id) continue;
      try {
        const details = await scrapeDetailPage(page, placement.sangam_id);
        if (details.property_address) placement.property_address = details.property_address;
        if (details.council_name) placement.council_name = details.council_name;
        if (details.placement_start) placement.placement_start = details.placement_start;
        if (details.placement_end) placement.placement_end = details.placement_end;
        if (details.reference_number && !placement.reference_number) placement.reference_number = details.reference_number;
        if (details.risk_profile && !placement.risk_profile) placement.risk_profile = details.risk_profile;
        if (details.nightly_rate && !placement.nightly_rate) placement.nightly_rate = details.nightly_rate;
        if (details.phone && !placement.phone) placement.phone = details.phone;
        if (details.email && !placement.email) placement.email = details.email;
        if (details.first_name && !placement.first_name) placement.first_name = details.first_name;
        if (details.last_name && !placement.last_name) placement.last_name = details.last_name;
        detailCount++;
      } catch (err) {
        logger.error(`Error scraping detail for ${placement.sangam_id}`, { error: err.message });
      }
    }

    logger.info(`Scraped ${placements.length} placements total (${detailCount} detail pages)`);
    return placements;
  } catch (err) {
    logger.error('Failed to scrape placements', { error: err.message });
    return [];
  }
}

function processEntries(entries) {
  if (!entries || entries.length === 0) return;

  const upsert = db.prepare(`
    INSERT INTO bookings (sangam_id, tenant_first_name, tenant_last_name, tenant_email, tenant_phone,
      property_address, council_name, placement_start, placement_end, reference_number,
      risk_profile, nightly_rate, assigned_to, raw_data, synced_at, updated_at)
    VALUES (@sangam_id, @first_name, @last_name, @email, @phone,
      @property_address, @council_name, @placement_start, @placement_end, @reference_number,
      @risk_profile, @nightly_rate, @assigned_to, @raw_data, datetime('now'), datetime('now'))
    ON CONFLICT(sangam_id) DO UPDATE SET
      tenant_first_name = @first_name,
      tenant_last_name = @last_name,
      tenant_email = CASE WHEN @email != '' THEN @email ELSE bookings.tenant_email END,
      tenant_phone = CASE WHEN @phone != '' THEN @phone ELSE bookings.tenant_phone END,
      property_address = CASE WHEN @property_address != '' THEN @property_address ELSE bookings.property_address END,
      council_name = CASE WHEN @council_name != '' THEN @council_name ELSE bookings.council_name END,
      placement_start = CASE WHEN @placement_start != '' THEN @placement_start ELSE bookings.placement_start END,
      placement_end = CASE WHEN @placement_end != '' THEN @placement_end ELSE bookings.placement_end END,
      reference_number = CASE WHEN @reference_number != '' THEN @reference_number ELSE bookings.reference_number END,
      risk_profile = CASE WHEN @risk_profile != '' THEN @risk_profile ELSE bookings.risk_profile END,
      nightly_rate = CASE WHEN @nightly_rate != '' THEN @nightly_rate ELSE bookings.nightly_rate END,
      assigned_to = CASE WHEN @assigned_to != '' THEN @assigned_to ELSE bookings.assigned_to END,
      raw_data = @raw_data,
      synced_at = datetime('now'),
      updated_at = datetime('now')
  `);

  for (const record of entries) {
    try {
      if (!record.sangam_id) continue;
      const mapped = {
        sangam_id: record.sangam_id,
        first_name: record.first_name || '',
        last_name: record.last_name || '',
        email: record.email || '',
        phone: record.phone || '',
        property_address: record.property_address || '',
        council_name: record.council_name || '',
        placement_start: record.placement_start || record.created_at || '',
        placement_end: record.placement_end || '',
        reference_number: record.reference_number || '',
        risk_profile: record.risk_profile || '',
        nightly_rate: record.nightly_rate || '',
        assigned_to: record.assigned_to || '',
        raw_data: JSON.stringify(record)
      };
      upsert.run(mapped);
    } catch (err) {
      logger.error('Error processing CRM record', { error: err.message, record: record.sangam_id });
    }
  }
}

async function syncFromCRM() {
  if (!SANGAM_EMAIL || !SANGAM_PASSWORD) {
    logger.warn('Sangam CRM credentials not set, skipping sync');
    return { synced: 0, errors: 0 };
  }

  let page = null;
  let synced = 0;
  let errors = 0;

  try {
    page = await loginAndGetPage();
    if (!page) return { synced: 0, errors: 1, message: 'Login failed' };

    const placements = await scrapePlacements(page);
    if (placements.length > 0) {
      processEntries(placements);
      synced = placements.length;
      logger.info(`CRM sync completed: ${synced} placements synced`);
    } else {
      logger.warn('CRM sync: No placements found');
    }
  } catch (err) {
    logger.error('CRM sync failed', { error: err.message });
    errors++;
  } finally {
    await closeBrowser();
  }

  return { synced, errors };
}

async function getModuleList() {
  return {
    modules: ['Placements', 'Bookings', 'Properties', 'Councils', 'Maintenance Jobs', 'Landlords/Agents']
  };
}

async function getFieldList(moduleName) {
  return {
    module: moduleName,
    fields: ['First Name', 'Last Name', 'Email', 'Phone', 'Risk Profile', 'Reference Number', 'Nightly Rate', 'Assigned To']
  };
}

module.exports = {
  syncFromCRM,
  getModuleList,
  getFieldList,
  processEntries,
  searchCRMBookings,
  getCRMBookingByRef,
  normalizeCRMRecord,
  searchLocalBookings,
  getRecentBookings,
  getLocalBookingByRef,
  testAPIEndpoints
};
