/**
 * Sangam CRM API Client
 * Based on official Sangam CRM API documentation
 *
 * Push API (uses API token): modulelist, fieldlist, save-data
 * Pull API (requires login session): getentry-list-new
 *
 * Endpoints:
 *   /api/v1/modulelist       - List all modules (Push)
 *   /api/v1/fieldlist         - List fields for a module (Push)
 *   /api/v1/save-data         - Insert or update records (Push)
 *   /api/v1/login             - Login to get session (Pull)
 *   /api/v1/getentry-list-new - Fetch/search records (Pull - needs session)
 */

const SANGAM_API_TOKEN = process.env.SANGAM_API_TOKEN || process.env.SANGAM_API_KEY || '';
const SANGAM_API_URL = (process.env.SANGAM_API_URL || 'https://care.sangamcrm.com').replace(/\/+$/, '').replace(/\/api\/v1\/?$/, '');
const SANGAM_USERNAME = process.env.SANGAM_USERNAME || '';
const SANGAM_PASSWORD = process.env.SANGAM_PASSWORD || '';

// Session cache
let sessionId = null;
let sessionExpiry = 0;

/**
 * Login to Sangam CRM and get a session ID for Pull API
 */
async function login() {
  if (sessionId && Date.now() < sessionExpiry) {
    return sessionId;
  }

  if (!SANGAM_USERNAME || !SANGAM_PASSWORD) {
    console.error('Sangam CRM: No login credentials configured (SANGAM_USERNAME/SANGAM_PASSWORD)');
    return null;
  }

  const url = `${SANGAM_API_URL}/api/v1/login`;
  console.log('Sangam CRM: Logging in as', SANGAM_USERNAME);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        user_name: SANGAM_USERNAME,
        password: SANGAM_PASSWORD,
        username: SANGAM_USERNAME,
        user_auth: {
          user_name: SANGAM_USERNAME,
          password: SANGAM_PASSWORD
        }
      })
    });

    const data = await response.json();
    console.log('Sangam CRM login response status:', response.status);

    if (response.ok && data) {
      console.log('Sangam CRM login response keys:', Object.keys(data).join(', '));

      // Try to extract session ID from various response formats
      // Sangam CRM returns {"status":200,"data":"session_id"} format
      let sid = data.session_id || data.sessionId || data.id || data.token || data.access_token || data.session;

      // Check data.data - Sangam CRM wraps session in {status, data} format
      if (!sid && data.data) {
        if (typeof data.data === 'string') {
          sid = data.data;
        } else if (typeof data.data === 'object') {
          sid = data.data.session_id || data.data.sessionId || data.data.id || data.data.token || data.data.session;
          if (!sid) {
            // If data.data is an object, stringify it as session
            sid = JSON.stringify(data.data);
          }
        }
      }

      if (sid && typeof sid === 'string' && !sid.startsWith('{')) {
        sessionId = sid;
        sessionExpiry = Date.now() + 3600000; // Cache for 1 hour
        console.log('Sangam CRM: Login successful, session obtained');
        return sessionId;
      }

      // If the response itself is the session
      if (typeof data === 'string') {
        sessionId = data;
        sessionExpiry = Date.now() + 3600000;
        return sessionId;
      }

      console.log('Sangam CRM: Login response structure:', JSON.stringify(data).substring(0, 200));
      // Store whatever we have as session - it might work
      sessionId = sid || JSON.stringify(data);
      sessionExpiry = Date.now() + 3600000;
      return sessionId;
    }

    console.error('Sangam CRM: Login failed:', data);
    return null;
  } catch (err) {
    console.error('Sangam CRM: Login error:', err.message);
    return null;
  }
}

/**
 * Make a Push API request (uses API token)
 */
async function pushApiRequest(endpoint, bodyParams = {}, options = {}) {
  if (!SANGAM_API_TOKEN) {
    console.error('Sangam CRM: No API token configured');
    return null;
  }

  const url = `${SANGAM_API_URL}/api/v1/${endpoint}`;
  const body = {
    authorization: `Bearer ${SANGAM_API_TOKEN}`,
    token: SANGAM_API_TOKEN,
    ...bodyParams
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${SANGAM_API_TOKEN}`,
        'Token': SANGAM_API_TOKEN
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await response.json();

    if (!response.ok) {
      console.error(`Sangam CRM Push API error [${endpoint}]: ${response.status}`, data);
      return { error: true, status: response.status, data };
    }

    return data;
  } catch (err) {
    console.error(`Sangam CRM Push API failed [${endpoint}]:`, err.message);
    return null;
  }
}

/**
 * Make a Pull API request (uses login session)
 */
async function pullApiRequest(endpoint, bodyParams = {}, options = {}) {
  // First ensure we have a session
  const sid = await login();

  const url = `${SANGAM_API_URL}/api/v1/${endpoint}`;

  // Build body with all possible auth formats
  const body = {
    session: sid || '',
    session_id: sid || '',
    authorization: `Bearer ${SANGAM_API_TOKEN}`,
    token: SANGAM_API_TOKEN,
    ...bodyParams
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeout || 15000);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${SANGAM_API_TOKEN}`,
        'Token': SANGAM_API_TOKEN
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);
    const data = await response.json();

    if (!response.ok) {
      console.error(`Sangam CRM Pull API error [${endpoint}]: ${response.status}`, data);
      // If unauthorized, clear session and retry once
      if (response.status === 401 && sid) {
        console.log('Sangam CRM: Session expired, re-logging in...');
        sessionId = null;
        sessionExpiry = 0;
        const newSid = await login();
        if (newSid && newSid !== sid) {
          body.session = newSid;
          body.session_id = newSid;
          const retry = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${SANGAM_API_TOKEN}`,
              'Token': SANGAM_API_TOKEN
            },
            body: JSON.stringify(body)
          });
          const retryData = await retry.json();
          if (retry.ok) return retryData;
          return { error: true, status: retry.status, data: retryData };
        }
      }
      return { error: true, status: response.status, data };
    }

    return data;
  } catch (err) {
    console.error(`Sangam CRM Pull API failed [${endpoint}]:`, err.message);
    return null;
  }
}

/**
 * Get list of all available modules
 */
async function getModuleList() {
  return await pushApiRequest('modulelist');
}

/**
 * Get field list for a module
 */
async function getFieldList(moduleName) {
  return await pushApiRequest('fieldlist', { module_name: moduleName });
}

/**
 * Fetch records from a module (Pull API - requires login)
 */
async function fetchRecords(moduleName, filters = {}, limit = 50, offset = 0) {
  return await pullApiRequest('getentry-list-new', {
    module_name: moduleName,
    limit,
    offset,
    ...filters
  });
}

/**
 * Search CRM bookings/records by name, email, phone, or reference
 */
async function searchCRMBookings(query) {
  if (!query || query.length < 2) return [];
  if (!SANGAM_API_TOKEN && !SANGAM_USERNAME) {
    console.log('Sangam CRM: No credentials configured');
    return [];
  }

  console.log(`Sangam CRM: Searching for "${query}"...`);
  const allResults = [];

  // Try multiple modules
  const modulesToSearch = ['Leads', 'Lead', 'Contacts', 'Contact', 'Bookings', 'Booking', 'Placements', 'Placement', 'Accounts', 'Account'];

  for (const moduleName of modulesToSearch) {
    try {
      const result = await pullApiRequest('getentry-list-new', {
        module_name: moduleName,
        search_text: query,
        limit: 20,
        offset: 0
      });

      if (result && !result.error) {
        const records = result.data || result.entry_list || result.records || (Array.isArray(result) ? result : []);
        if (Array.isArray(records) && records.length > 0) {
          console.log(`Sangam CRM: Found ${records.length} records in ${moduleName}`);
          for (const record of records) {
            allResults.push(normalizeCRMRecord(record, moduleName));
          }
        }
      }
    } catch (err) {
      console.log(`Sangam CRM: Error searching ${moduleName}: ${err.message}`);
    }
  }

  // Filter results matching query
  if (allResults.length > 0) {
    const queryLower = query.toLowerCase();
    const filtered = allResults.filter(r => {
      const searchable = [r.name, r.email, r.phone, r.reference, r.company].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(queryLower);
    });
    console.log(`Sangam CRM: ${filtered.length} filtered results from ${allResults.length} total`);
    return filtered.length > 0 ? filtered : allResults;
  }

  return allResults;
}

/**
 * Get a specific CRM booking by reference
 */
async function getCRMBookingByRef(ref) {
  if (!ref) return null;

  const modulesToSearch = ['Leads', 'Lead', 'Bookings', 'Booking', 'Placements', 'Placement'];

  for (const moduleName of modulesToSearch) {
    try {
      const result = await pullApiRequest('getentry-list-new', {
        module_name: moduleName,
        search_text: ref,
        limit: 5
      });

      const records = result?.data || result?.entry_list || result?.records || (Array.isArray(result) ? result : []);
      if (records.length > 0) {
        return normalizeCRMRecord(records[0], moduleName);
      }
    } catch (err) {
      console.log(`Sangam CRM: Error fetching ref ${ref}: ${err.message}`);
    }
  }
  return null;
}

/**
 * Normalize a CRM record into standard format
 */
function normalizeCRMRecord(record, moduleName) {
  if (!record) return {};

  const get = (field) => extractField(record, field);

  return {
    id: get('id') || get('record_id') || '',
    module: moduleName,
    reference: get('reference') || get('booking_ref') || get('booking_reference') || get('ref_no') || get('id') || '',
    name: get('full_name') || get('name') || `${get('first_name') || ''} ${get('last_name') || ''}`.trim() || '',
    first_name: get('first_name') || '',
    last_name: get('last_name') || '',
    email: get('email') || get('email1') || get('email_address') || '',
    phone: get('phone') || get('phone_mobile') || get('mobile') || get('phone_number') || '',
    company: get('company') || get('account_name') || get('organization') || '',
    address: get('address') || get('primary_address_street') || get('street') || '',
    city: get('city') || get('primary_address_city') || '',
    state: get('state') || get('primary_address_state') || '',
    postcode: get('postcode') || get('postal_code') || get('primary_address_postalcode') || '',
    country: get('country') || get('primary_address_country') || '',
    property: get('property') || get('property_name') || get('project') || get('project_name') || '',
    unit: get('unit') || get('unit_number') || get('flat') || get('apartment') || '',
    check_in_date: get('check_in_date') || get('checkin_date') || get('start_date') || get('move_in_date') || '',
    check_out_date: get('check_out_date') || get('checkout_date') || get('end_date') || get('move_out_date') || '',
    status: get('status') || get('lead_status') || '',
    notes: get('description') || get('notes') || get('comments') || '',
    raw: record
  };
}

/**
 * Extract a field value from a CRM record
 */
function extractField(record, fieldName) {
  if (!record || !fieldName) return '';

  if (record[fieldName] !== undefined && record[fieldName] !== null) {
    return String(record[fieldName]);
  }

  if (record.name_value_list) {
    const nvl = record.name_value_list;
    if (nvl[fieldName] && nvl[fieldName].value !== undefined) {
      return String(nvl[fieldName].value);
    }
  }

  if (record.data && record.data[fieldName] !== undefined) {
    return String(record.data[fieldName]);
  }

  if (record.attributes && record.attributes[fieldName] !== undefined) {
    return String(record.attributes[fieldName]);
  }

  return '';
}

/**
 * Save/update a record
 */
async function saveData(moduleName, recordData, options = {}) {
  const body = { module_name: moduleName, ...recordData };
  if (options.checkDuplicate) body.check_duplicate = true;
  return await pushApiRequest('save-data', body);
}

/**
 * Test API connectivity - diagnostics
 */
async function testAPIEndpoints() {
  console.log('Running Sangam CRM API diagnostics...');
  console.log('Token configured:', !!SANGAM_API_TOKEN);
  console.log('Username configured:', !!SANGAM_USERNAME);
  console.log('API URL:', SANGAM_API_URL);

  const results = [];

  // Test 1: Login
  sessionId = null;
  sessionExpiry = 0;
  const loginStart = Date.now();
  const sid = await login();
  results.push({
    endpoint: 'login',
    status: sid ? 200 : 401,
    success: !!sid,
    elapsed: `${Date.now() - loginStart}ms`,
    response: sid ? { session_preview: String(sid).substring(0, 20) + '...' } : { error: 'Login failed' }
  });

  // Test 2: Module List (Push API)
  const modResult = await testEndpoint('modulelist', {}, 'push');
  results.push({ endpoint: 'modulelist (push)', ...modResult });

  // Test 3: getentry-list-new with session (Pull API)
  for (const mod of ['Leads', 'Contacts', 'Bookings']) {
    const pullResult = await testEndpoint('getentry-list-new', { module_name: mod, limit: 2 }, 'pull');
    results.push({ endpoint: `getentry-list-new ${mod} (pull)`, ...pullResult });
  }

  // Test 4: Search
  const searchResult = await testEndpoint('getentry-list-new', { module_name: 'Leads', search_text: 'test', limit: 2 }, 'pull');
  results.push({ endpoint: 'search Leads (pull)', ...searchResult });

  const successful = results.filter(r => r.success).length;
  console.log(`Diagnostics: ${successful}/${results.length} successful`);

  return {
    configured: !!SANGAM_API_TOKEN,
    login_configured: !!SANGAM_USERNAME,
    sangam_url: SANGAM_API_URL,
    token_preview: SANGAM_API_TOKEN ? SANGAM_API_TOKEN.substring(0, 8) + '...' : 'not set',
    total_tested: results.length,
    successful,
    results
  };
}

async function testEndpoint(endpoint, body, type) {
  const url = `${SANGAM_API_URL}/api/v1/${endpoint}`;
  const requestFn = type === 'pull' ? pullApiRequest : pushApiRequest;

  try {
    const start = Date.now();
    const result = await requestFn(endpoint, body);
    const elapsed = Date.now() - start;

    const isError = result && result.error;
    const status = isError ? (result.status || 500) : 200;
    const recordCount = result?.data?.length || result?.entry_list?.length || result?.records?.length || (Array.isArray(result) ? result.length : null);

    return {
      body,
      status,
      elapsed: `${elapsed}ms`,
      success: !isError,
      response: result,
      recordCount
    };
  } catch (err) {
    return {
      body,
      status: 0,
      elapsed: '0ms',
      success: false,
      response: { error: err.message },
      recordCount: null
    };
  }
}

module.exports = {
  searchCRMBookings,
  getCRMBookingByRef,
  testAPIEndpoints,
  getModuleList,
  getFieldList,
  fetchRecords,
  saveData,
  login,
  normalizeCRMRecord,
  extractField
};
