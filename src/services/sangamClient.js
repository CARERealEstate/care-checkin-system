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
 * 3. Extract all placement data from the rendered DOM
 * 4. Upsert records into the local SQLite database
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
    // Navigate to login page
    await page.goto(`${SANGAM_URL}/login`, { waitUntil: 'networkidle2' });

    // Check if already logged in (redirected to dashboard)
    if (!page.url().includes('/login')) {
      logger.info('Already authenticated with Sangam CRM');
      return page;
    }

    // Fill login form - Sangam uses name="login" for the username/email field
    await page.waitForSelector('input[name="login"], input#email, input[name="username"]', { timeout: 15000 });

    // Try login field first (Sangam CRM uses name="login"), then fallback to id or name
    const emailField = await page.$('input[name="login"]') || await page.$('input#email') || await page.$('input[name="email"]');
    const passwordField = await page.$('input[name="password"]') || await page.$('input[type="password"]');

    if (!emailField || !passwordField) {
      logger.error('Could not find login form fields');
      return null;
    }

    await emailField.type(SANGAM_EMAIL, { delay: 50 });
    await passwordField.type(SANGAM_PASSWORD, { delay: 50 });

    // Submit form
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

    // Check if login succeeded
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

async function scrapePlacements(page) {
  try {
    // Navigate to placements list (internally mapped to /leads)
    await page.goto(`${SANGAM_URL}/leads`, { waitUntil: 'networkidle2' });

    // Wait for the data table to render with real data
    await page.waitForFunction(() => {
      const links = document.querySelectorAll('table tbody a[href*="/leads/"]');
      return links.length > 0;
    }, { timeout: 15000 });

    // Small delay for all rows to render
    await new Promise(r => setTimeout(r, 2000));

    // Check if we can show more entries (default might be limited)
    const show100 = await page.$('a:has-text("100")');
    if (show100) {
      await show100.click();
      await new Promise(r => setTimeout(r, 3000));
    }

    // Extract all placement data from the DOM
    const placements = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      const results = [];

      rows.forEach(row => {
        const link = row.querySelector('a[href*="/leads/"]');
        if (!link) return;

        const cells = row.querySelectorAll('td');
        if (cells.length < 10) return;

        const uuid = link.href.split('/leads/')[1];

        // Extract phone from JSON cell
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

        // Extract email from JSON cell
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

    // Check for page 2 (if more than 100 entries)
    const nextBtn = await page.$('a:has-text("Next")');
    if (nextBtn) {
      const isDisabled = await page.evaluate(el =>
        el.classList.contains('disabled') || el.parentElement.classList.contains('disabled'),
        nextBtn
      );

      if (!isDisabled) {
        await nextBtn.click();
        await new Promise(r => setTimeout(r, 3000));

        // Wait for data to load
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
    }

    logger.info(`Scraped ${placements.length} placements from CRM`);
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
      reference_number = CASE WHEN @reference_number != '' THEN @reference_number ELSE bookings.reference_number END,
      risk_profile = CASE WHEN @risk_profile != '' THEN @risk_profile ELSE bookings.risk_profile END,
      nightly_rate = CASE WHEN @nightly_rate != '' THEN @nightly_rate ELSE bookings.nightly_rate END,
      assigned_to = CASE WHEN @assigned_to != '' THEN @assigned_to ELSE bookings.assigned_to END,
      raw_data = @raw_data,
      synced_at = datetime('now'),
      updated_at = datetime('now')
  `);

  const transaction = db.transaction((records) => {
    for (const record of records) {
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
  });

  transaction(entries);
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

// Lightweight module/field list stubs (not available without REST API)
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
