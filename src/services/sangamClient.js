/**
 * Sangam CRM API Client
 * Based on official Sangam CRM API documentation:
 * https://documenter.getpostman.com/view/25213259/2s93RNxuis
 *
 * Correct endpoints:
 *   /api/v1/modulelist       - List all modules
 *   /api/v1/fieldlist         - List fields for a module
 *   /api/v1/save-data         - Insert or update records
 *   /api/v1/getentry-list-new - Fetch/search records
 *   /api/v1/login             - Login API
 */

const SANGAM_API_TOKEN = process.env.SANGAM_API_TOKEN || process.env.SANGAM_API_KEY || '';
const SANGAM_API_URL = (process.env.SANGAM_API_URL || 'https://care.sangamcrm.com').replace(/\/+$/, '');

/**
 * Make an API request to Sangam CRM
 * Auth can be in header OR body per docs: {"authorization":"Bearer {{token}}"}
 */
async function apiRequest(endpoint, bodyParams = {}, options = {}) {
  if (!SANGAM_API_TOKEN) {
    console.error('Sangam CRM: No API token configured');
    return null;
  }

  const url = `${SANGAM_API_URL}/api/v1/${endpoint}`;

  // Include authorization in both header AND body for maximum compatibility
  const body = {
    authorization: `Bearer ${SANGAM_API_TOKEN}`,
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
        'Authorization': `Bearer ${SANGAM_API_TOKEN}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await response.json();

    if (!response.ok) {
      console.error(`Sangam CRM API error [${endpoint}]: ${response.status} ${response.statusText}`, data);
      return { error: true, status: response.status, statusText: response.statusText, data };
    }

    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error(`Sangam CRM API timeout [${endpoint}]`);
      return { error: true, message: 'Request timed out' };
    }
    console.error(`Sangam CRM API request failed [${endpoint}]:`, err.message);
    return null;
  }
}

/**
 * Get list of all available modules in Sangam CRM
 */
async function getModuleList() {
  return await apiRequest('modulelist');
}

/**
 * Get field list for a specific module
 */
async function getFieldList(moduleName) {
  return await apiRequest('fieldlist', {
    module_name: moduleName
  });
}

/**
 * Fetch records from a module with optional filters
 * Uses the correct endpoint: getentry-list-new
 */
async function fetchRecords(moduleName, filters = {}, limit = 50, offset = 0) {
  const body = {
    module_name: moduleName,
    limit: limit,
    offset: offset,
    ...filters
  };
  return await apiRequest('getentry-list-new', body);
}

/**
 * Search CRM bookings/records by name, email, phone, or reference
 * This is the main function used by the check-in form
 */
async function searchCRMBookings(query) {
  if (!query || query.length < 2) return [];
  if (!SANGAM_API_TOKEN) {
    console.log('Sangam CRM: No API token - cannot search');
    return [];
  }

  console.log(`Sangam CRM: Searching for "${query}"...`);
  const allResults = [];

  // Try multiple modules that might contain booking/lead data
  const modulesToSearch = ['Leads', 'Lead', 'Contacts', 'Contact', 'Bookings', 'Booking', 'Placements', 'Placement', 'Accounts', 'Account'];

  for (const moduleName of modulesToSearch) {
    try {
      // Use getentry-list-new with search/filter parameters
      const result = await apiRequest('getentry-list-new', {
        module_name: moduleName,
        search_text: query,
        limit: 20,
        offset: 0
      });

      if (result && !result.error && result.data && Array.isArray(result.data)) {
        console.log(`Sangam CRM: Found ${result.data.length} records in ${moduleName}`);
        for (const record of result.data) {
          allResults.push(normalizeCRMRecord(record, moduleName));
        }
      } else if (result && !result.error && Array.isArray(result)) {
        console.log(`Sangam CRM: Found ${result.length} records in ${moduleName} (array response)`);
        for (const record of result) {
          allResults.push(normalizeCRMRecord(record, moduleName));
        }
      } else if (result && !result.error && result.entry_list && Array.isArray(result.entry_list)) {
        console.log(`Sangam CRM: Found ${result.entry_list.length} records in ${moduleName} (entry_list)`);
        for (const record of result.entry_list) {
          allResults.push(normalizeCRMRecord(record, moduleName));
        }
      } else if (result && !result.error && result.records && Array.isArray(result.records)) {
        console.log(`Sangam CRM: Found ${result.records.length} records in ${moduleName} (records)`);
        for (const record of result.records) {
          allResults.push(normalizeCRMRecord(record, moduleName));
        }
      }
    } catch (err) {
      console.log(`Sangam CRM: Error searching ${moduleName}: ${err.message}`);
    }
  }

  // Also try a broader search without module filter if no results
  if (allResults.length === 0) {
    try {
      const result = await apiRequest('getentry-list-new', {
        search_text: query,
        limit: 20
      });
      if (result && !result.error) {
        const records = result.data || result.entry_list || result.records || (Array.isArray(result) ? result : []);
        for (const record of records) {
          allResults.push(normalizeCRMRecord(record, 'Unknown'));
        }
      }
    } catch (err) {
      console.log(`Sangam CRM: Broad search error: ${err.message}`);
    }
  }

  // Filter results that match the query
  const queryLower = query.toLowerCase();
  const filtered = allResults.filter(r => {
    const searchable = [r.name, r.email, r.phone, r.reference, r.company].filter(Boolean).join(' ').toLowerCase();
    return searchable.includes(queryLower);
  });

  console.log(`Sangam CRM: Returning ${filtered.length} filtered results (from ${allResults.length} total)`);
  return filtered.length > 0 ? filtered : allResults;
}

/**
 * Get a specific CRM booking by reference/ID
 */
async function getCRMBookingByRef(ref) {
  if (!ref || !SANGAM_API_TOKEN) return null;

  const modulesToSearch = ['Leads', 'Lead', 'Bookings', 'Booking', 'Placements', 'Placement'];

  for (const moduleName of modulesToSearch) {
    try {
      const result = await apiRequest('getentry-list-new', {
        module_name: moduleName,
        search_text: ref,
        limit: 5
      });

      const records = result?.data || result?.entry_list || result?.records || (Array.isArray(result) ? result : []);
      if (records.length > 0) {
        return normalizeCRMRecord(records[0], moduleName);
      }
    } catch (err) {
      console.log(`Sangam CRM: Error fetching ref ${ref} from ${moduleName}: ${err.message}`);
    }
  }
  return null;
}

/**
 * Normalize a CRM record into a standard format for the check-in form
 */
function normalizeCRMRecord(record, moduleName) {
  if (!record) return {};

  // Handle both flat objects and nested name_value_list format
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
 * Handles both flat format and SugarCRM-style name_value_list
 */
function extractField(record, fieldName) {
  if (!record || !fieldName) return '';

  // Direct property
  if (record[fieldName] !== undefined && record[fieldName] !== null) {
    return String(record[fieldName]);
  }

  // name_value_list format (SugarCRM style)
  if (record.name_value_list) {
    const nvl = record.name_value_list;
    if (nvl[fieldName] && nvl[fieldName].value !== undefined) {
      return String(nvl[fieldName].value);
    }
  }

  // Nested data object
  if (record.data && record.data[fieldName] !== undefined) {
    return String(record.data[fieldName]);
  }

  // attributes object
  if (record.attributes && record.attributes[fieldName] !== undefined) {
    return String(record.attributes[fieldName]);
  }

  return '';
}

/**
 * Insert or update a record in Sangam CRM
 */
async function saveData(moduleName, recordData, options = {}) {
  const body = {
    module_name: moduleName,
    ...recordData
  };

  if (options.checkDuplicate) {
    body.check_duplicate = true;
  }

  return await apiRequest('save-data', body);
}

/**
 * Test API connectivity and find valid modules
 * Returns diagnostic information
 */
async function testAPIEndpoints() {
  console.log('Running Sangam CRM API diagnostics...');
  console.log('SANGAM_API_TOKEN configured:', !!SANGAM_API_TOKEN, '(source:', process.env.SANGAM_API_TOKEN ? 'SANGAM_API_TOKEN' : process.env.SANGAM_API_KEY ? 'SANGAM_API_KEY' : 'none', ')');
  console.log('SANGAM_API_URL:', SANGAM_API_URL);

  const results = [];

  // Test 1: Module List (the most important - tells us what modules exist)
  const moduleListResult = await testEndpoint('modulelist', {});
  results.push({ endpoint: 'modulelist', ...moduleListResult });

  // Test 2: Field list for common modules
  for (const mod of ['Leads', 'Lead', 'Contacts', 'Bookings', 'Placements']) {
    const fieldResult = await testEndpoint('fieldlist', { module_name: mod });
    results.push({ endpoint: `fieldlist (${mod})`, ...fieldResult });
  }

  // Test 3: Fetch records
  for (const mod of ['Leads', 'Lead', 'Contacts', 'Bookings']) {
    const fetchResult = await testEndpoint('getentry-list-new', { module_name: mod, limit: 2, offset: 0 });
    results.push({ endpoint: `getentry-list-new (${mod})`, ...fetchResult });
  }

  // Test 4: Search
  const searchResult = await testEndpoint('getentry-list-new', { module_name: 'Leads', search_text: 'test', limit: 2 });
  results.push({ endpoint: 'getentry-list-new (search)', ...searchResult });

  const successful = results.filter(r => r.success).length;
  console.log(`Sangam CRM diagnostics complete: ${successful}/${results.length} successful`);

  return {
    configured: !!SANGAM_API_TOKEN,
    sangam_url: SANGAM_API_URL,
    token_preview: SANGAM_API_TOKEN ? SANGAM_API_TOKEN.substring(0, 8) + '...' : 'not set',
    total_tested: results.length,
    successful,
    results
  };
}

async function testEndpoint(endpoint, body) {
  const url = `${SANGAM_API_URL}/api/v1/${endpoint}`;
  const requestBody = {
    authorization: `Bearer ${SANGAM_API_TOKEN}`,
    ...body
  };

  try {
    const start = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${SANGAM_API_TOKEN}`
      },
      body: JSON.stringify(requestBody)
    });
    const elapsed = Date.now() - start;

    let data;
    try {
      data = await response.json();
    } catch (e) {
      data = { parseError: 'Could not parse JSON response' };
    }

    const recordCount = data?.data?.length || data?.entry_list?.length || data?.records?.length || (Array.isArray(data) ? data.length : null);

    return {
      body: body,
      status: response.status,
      statusText: response.statusText,
      elapsed: `${elapsed}ms`,
      success: response.ok,
      response: data,
      recordCount
    };
  } catch (err) {
    return {
      body: body,
      status: 0,
      statusText: err.message,
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
  normalizeCRMRecord,
  extractField
};
