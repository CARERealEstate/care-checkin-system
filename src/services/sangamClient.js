const logger = require('./logger');
const { db } = require('../db/database');

const SANGAM_API_URL = process.env.SANGAM_API_URL || 'https://care.sangamcrm.com/api/v1';
const SANGAM_API_KEY = process.env.SANGAM_API_KEY || '';

let sessionToken = null;
let tokenExpiry = 0;

async function login() {
  try {
    const res = await fetch(`${SANGAM_API_URL}/common/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: SANGAM_API_KEY })
    });
    const data = await res.json();
    if (data.success && data.token) {
      sessionToken = data.token;
      tokenExpiry = Date.now() + 55 * 60 * 1000; // Refresh before 1hr
      logger.info('Sangam CRM login successful');
      return sessionToken;
    }
    // Some Sangam APIs return token in different field
    if (data.sessionId || data.session_id) {
      sessionToken = data.sessionId || data.session_id;
      tokenExpiry = Date.now() + 55 * 60 * 1000;
      logger.info('Sangam CRM login successful (session)');
      return sessionToken;
    }
    logger.error('Sangam CRM login failed', { response: data });
    return null;
  } catch (err) {
    logger.error('Sangam CRM login error', { error: err.message });
    return null;
  }
}

async function getToken() {
  if (!sessionToken || Date.now() > tokenExpiry) {
    await login();
  }
  return sessionToken;
}

async function apiCall(endpoint, method = 'GET', body = null) {
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated with Sangam CRM');
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'token': token,
      'apiKey': SANGAM_API_KEY
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(`${SANGAM_API_URL}${endpoint}`, options);
  return res.json();
}

async function getModuleList() {
  try {
    return await apiCall('/common/moduleList', 'POST', { apiKey: SANGAM_API_KEY });
  } catch (err) {
    logger.error('Failed to get module list', { error: err.message });
    return null;
  }
}

async function getFieldList(moduleName) {
  try {
    return await apiCall('/common/fieldList', 'POST', {
      apiKey: SANGAM_API_KEY,
      module: moduleName
    });
  } catch (err) {
    logger.error(`Failed to get field list for ${moduleName}`, { error: err.message });
    return null;
  }
}

async function getEntryList(moduleName, options = {}) {
  try {
    const payload = {
      apiKey: SANGAM_API_KEY,
      module: moduleName,
      sortOrder: options.sortOrder || 'asc',
      limit: options.limit || 100,
      offset: options.offset || 0
    };

    if (options.fields) {
      payload.fields = options.fields;
    }
    if (options.filters) {
      payload.filters = options.filters;
    }

    return await apiCall('/common/getEntryList', 'POST', payload);
  } catch (err) {
    logger.error(`Failed to get entries for ${moduleName}`, { error: err.message });
    return null;
  }
}

async function syncFromCRM() {
  if (!SANGAM_API_KEY) {
    logger.warn('Sangam API key not set, skipping sync');
    return { synced: 0, errors: 0 };
  }

  let synced = 0;
  let errors = 0;

  try {
    const data = await getEntryList('Placements', {
      limit: 200,
      sortOrder: 'desc'
    });

    if (!data || !data.data) {
      // Try alternate response format
      const entries = data?.entries || data?.records || data?.result || [];
      if (!Array.isArray(entries) || entries.length === 0) {
        logger.warn('No placement data returned from CRM', { response: JSON.stringify(data).substring(0, 500) });
        return { synced: 0, errors: 0, message: 'No data returned' };
      }
      processEntries(entries);
      return { synced: entries.length, errors: 0 };
    }

    const entries = Array.isArray(data.data) ? data.data : [];
    processEntries(entries);
    synced = entries.length;

    logger.info(`CRM sync: ${synced} placements synced, ${errors} errors`);
  } catch (err) {
    logger.error('CRM sync failed', { error: err.message });
    errors++;
  }

  return { synced, errors };
}

function processEntries(entries) {
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
      tenant_email = @email,
      tenant_phone = @phone,
      property_address = @property_address,
      council_name = @council_name,
      placement_start = @placement_start,
      placement_end = @placement_end,
      reference_number = @reference_number,
      risk_profile = @risk_profile,
      nightly_rate = @nightly_rate,
      assigned_to = @assigned_to,
      raw_data = @raw_data,
      synced_at = datetime('now'),
      updated_at = datetime('now')
  `);

  const transaction = db.transaction((records) => {
    for (const record of records) {
      try {
        // Map Sangam fields - adapt these based on actual API response field names
        const mapped = {
          sangam_id: String(record.id || record.Id || record.record_id || ''),
          first_name: record['First Name'] || record.first_name || record.FirstName || '',
          last_name: record['Last Name'] || record.last_name || record.LastName || '',
          email: record['Email'] || record.email || record.Email || '',
          phone: record['Phone'] || record.phone || record.Phone || '',
          property_address: record['Property Address'] || record.property_address || record.PropertyAddress || record['Address'] || '',
          council_name: record['Council Name'] || record.council_name || record.Council || record['Account Name'] || '',
          placement_start: record['Placement Start Date'] || record.placement_start || record['Start Date'] || '',
          placement_end: record['Placement End Date'] || record.placement_end || record['End Date'] || '',
          reference_number: record['Reference Number'] || record.reference_number || record.ReferenceNumber || '',
          risk_profile: record['Risk Profile'] || record.risk_profile || '',
          nightly_rate: record['Nightly Rate'] || record.nightly_rate || '',
          assigned_to: record['Assigned To'] || record.assigned_to || '',
          raw_data: JSON.stringify(record)
        };

        if (mapped.sangam_id) {
          upsert.run(mapped);
        }
      } catch (err) {
        logger.error('Error processing CRM record', { error: err.message, record: JSON.stringify(record).substring(0, 200) });
      }
    }
  });

  transaction(entries);
}

module.exports = {
  login,
  getModuleList,
  getFieldList,
  getEntryList,
  syncFromCRM,
  processEntries
};
