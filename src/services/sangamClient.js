const logger = require('./logger');
const { db } = require('../db/database');

const SANGAM_URL = process.env.SANGAM_URL || 'https://care.sangamcrm.com';
const SANGAM_EMAIL = process.env.SANGAM_EMAIL || '';
const SANGAM_PASSWORD = process.env.SANGAM_PASSWORD || '';

let browser = null;
let sessionCookies = null;
let cookieExpiry = 0;

/**
 * Sangam CRM Scraper
 *
 * Sangam CRM (by Enjay IT Solutions) does NOT expose a standard REST API.
 * All data access is through session-authenticated web pages with CSRF tokens.
 * This module uses Puppeteer to:
 * 1. Login via the web form
 * 2. Navigate to the Placements list
 * 3. Extract basic data from the list view
 * 4. Visit each individual placement page for full details (address, council, dates)
 * 5. Upsert records into the local SQLite database
 */

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

/**
 * Scrape an individual placement detail page for full CRM data.
 * Visits /leads/{uuid} and extracts all available fields from the detail view.
 */
async function scrapeDetailPage(page, uuid) {
  try {
    await page.goto(`${SANGAM_URL}/leads/${uuid}`, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));

    const details = await page.evaluate(() => {
      const data = {};

      // Helper: find a label element and return the adjacent value
      function findFieldValue(labelTexts) {
        const allLabels = document.querySelectorAll('label, .field-label, th, dt, .label, span.key, div.label');
        for (const label of allLabels) {
          const text = label.textContent.trim().toLowerCase().replace(/[:\s]+$/, '');
          for (const target of labelTexts) {
            if (text === target.toLowerCase() || text.includes(target.toLowerCase())) {
              // Try sibling, next element, parent's next child, or dd element
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

      // Also try to extract from input/textarea fields with specific names or ids
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

      // Extract property address
      data.property_address = findFieldValue(['property address', 'address', 'property', 'accommodation address', 'unit address'])
        || findInputValue(['address', 'property_address', 'property']);

      // Extract council name
      data.council_name = findFieldValue(['council', 'council name', 'local authority', 'referring council', 'la name'])
        || findInputValue(['council', 'council_name', 'local_authority']);

      // Extract placement start date
      data.placement_start = findFieldValue(['placement start', 'start date', 'check-in date', 'check in date', 'move in', 'move-in date', 'placement date'])
        || findInputValue(['placement_start', 'start_date', 'checkin_date', 'move_in']);

      // Extract placement end date
      data.placement_end = findFieldValue(['placement end', 'end date', 'check-out date', 'check out date', 'move out', 'move-out date', 'expected end'])
        || findInputValue(['placement_end', 'end_date', 'checkout_date', 'move_out']);

      // Extract reference number (backup from detail page)
      data.reference_number = findFieldValue(['reference', 'ref', 'reference number', 'placement ref', 'booking ref'])
        || findInputValue(['reference', 'ref_number', 'reference_number']);

      // Extract risk profile
      data.risk_profile = findFieldValue(['risk', 'risk profile', 'risk level', 'risk assessment'])
        || findInputValue(['risk', 'risk_profile']);

      // Extract nightly rate
      data.nightly_rate = findFieldValue(['nightly rate', 'rate', 'night rate', 'per night', 'nightly'])
        || findInputValue(['nightly_rate', 'rate', 'night_rate']);

      // Extract phone (backup)
      data.phone = findFieldValue(['phone', 'mobile', 'telephone', 'contact number'])
        || findInputValue(['phone', 'mobile', 'telephone']);

      // Extract email (backup)
      data.email = findFieldValue(['email', 'email address', 'e-mail'])
        || findInputValue(['email', 'email_address']);

      // Extract first/last name from detail page (backup)
      data.first_name = findFieldValue(['first name', 'given name', 'forename'])
        || findInputValue(['first_name', 'firstname']);
      data.last_name = findFieldValue(['last name', 'surname', 'family name'])
        || findInputValue(['last_name', 'lastname', 'surname']);

      // Try extracting from page title or header as fallback for name
      const pageTitle = document.querySelector('h1, h2, .page-title, .lead-name, .record-title');
      if (pageTitle && !data.first_name) {
        const titleText = pageTitle.textContent.trim();
        // If title looks like a name (2+ words, no special chars)
        if (titleText && /^[A-Za-z\s\-']+$/.test(titleText) && titleText.includes(' ')) {
          const parts = titleText.split(/\s+/);
          data.detail_page_name = titleText;
        }
      }

      // Also try to get data from any visible detail panels/cards
      const detailPanels = document.querySelectorAll('.detail-panel, .info-card, .record-detail, .field-row, .form-group');
      detailPanels.forEach(panel => {
        const text = panel.textContent.toLowerCase();
        const valueEl = panel.querySelector('.value, .field-value, input, select, textarea, td:last-child, dd');
        if (!valueEl) return;
        const val = (valueEl.value || valueEl.textContent || '').trim();
        if (!val || val === '-' || val === 'N/A') return;

        if ((text.includes('address') || text.includes('property')) && !data.property_address) {
          data.property_address = val;
        }
        if ((text.includes('council') || text.includes('authority')) && !data.council_name) {
          data.council_name = val;
        }
        if (text.includes('start') && text.includes('date') && !data.placement_start) {
          data.placement_start = val;
        }
        if (text.includes('end') && text.includes('date') && !data.placement_end) {
          data.placement_end = val;
        }
      });

      return data;
    });

    logger.info(`Detail page scraped for ${uuid}`, {
      hasAddress: !!details.property_address,
      hasCouncil: !!details.council_name,
      hasStart: !!details.placement_start,
      hasEnd: !!details.placement_end
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

    // Try to show more entries using page.evaluate (Puppeteer compatible)
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

    if (clicked100) {
      await new Promise(r => setTimeout(r, 3000));
    }

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
        } catch(e) { /* ignore */ }

        let email = '';
        try {
          const emailCell = cells[13]?.textContent.trim();
          if (emailCell && emailCell.startsWith('[')) {
            const emailData = JSON.parse(emailCell);
            if (emailData[0]?.email_address) email = emailData[0].email_address;
          } else {
            email = emailCell || '';
          }
        } catch(e) { /* ignore */ }

        results.push({
          sangam_id: uuid,
          first_name: cells[3]?.textContent.trim() || '',
          last_name: cells[4]?.textContent.trim() || '',
          risk_profile: cells[5]?.textContent.trim() || '',
          reference_number: cells[10]?.textContent.trim() || '',
          phone: phone,
          email: email,
          nightly_rate: cells[14]?.textContent.trim() || '',
          created_at: cells[15]?.textContent.trim() || '',
          updated_at: cells[16]?.textContent.trim() || '',
          assigned_to: cells[18]?.textContent.trim() || ''
        });
      });

      return results;
    });

    // Check for pagination using page.evaluate (Puppeteer compatible)
    const hasNextPage = await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      for (const link of links) {
        const text = link.textContent.trim();
        if (text === 'Next' || text === 'Next \u00bb' || text === '\u203a' || text === '\u00bb') {
          const isDisabled = link.classList.contains('disabled') ||
            link.parentElement.classList.contains('disabled') ||
            link.getAttribute('aria-disabled') === 'true';
          if (!isDisabled) {
            link.click();
            return true;
          }
        }
      }
      return false;
    });

    if (hasNextPage) {
      await new Promise(r => setTimeout(r, 3000));

      await page.waitForFunction(() => {
        const links = document.querySelectorAll('table tbody a[href*="/leads/"]');
        return links.length > 0;
      }, { timeout: 10000 });

      const page2 = await page.evaluate(() => {
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

      placements.push(...page2);
    }

    logger.info(`Scraped ${placements.length} placements from CRM list view`);

    // Now visit each individual placement page to get full details
    logger.info('Starting individual placement detail scraping...');
    let detailCount = 0;
    let detailErrors = 0;

    for (const placement of placements) {
      if (!placement.sangam_id) continue;

      try {
        const details = await scrapeDetailPage(page, placement.sangam_id);

        // Merge detail page data into placement (detail page values override empty list values)
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
        detailErrors++;
      }
    }

    logger.info(`Detail scraping complete: ${detailCount} succeeded, ${detailErrors} failed`);
    logger.info(`Scraped ${placements.length} placements total from CRM`);
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
    logger.warn('Sangam CRM credentials not set (SANGAM_EMAIL / SANGAM_PASSWORD), skipping sync');
    return { synced: 0, errors: 0 };
  }

  let page = null;
  let synced = 0;
  let errors = 0;

  try {
    page = await loginAndGetPage();
    if (!page) {
      return { synced: 0, errors: 1, message: 'Login failed' };
    }

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

module.exports = { syncFromCRM, getModuleList, getFieldList, processEntries };
