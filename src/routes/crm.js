const express = require('express');
const router = express.Router();
const {
  syncFromCRM,
  getModuleList,
  getFieldList,
  searchCRMBookings,
  getCRMBookingByRef,
  normalizeCRMRecord,
  searchLocalBookings,
  getRecentBookings,
  getLocalBookingByRef,
  testAPIEndpoints
} = require('../services/sangamClient');
const logger = require('../services/logger');

// GET /api/crm/search?q=searchterm
// Searches CRM bookings - tries Sangam API first, falls back to local DB
router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q || '').trim();
    if (!query) {
      return res.json({ results: [], source: 'none', message: 'No search query provided' });
    }

    logger.info(`CRM search: "${query}"`);

    // Try Sangam REST API first
    let apiResults = await searchCRMBookings(query);

    if (apiResults && apiResults.length > 0) {
      const normalized = apiResults.map(normalizeCRMRecord).filter(r => r);
      return res.json({
        results: normalized,
        source: 'sangam_api',
        count: normalized.length
      });
    }

    // Fall back to local DB
    const localResults = searchLocalBookings(query);
    const mapped = localResults.map(b => ({
      sangam_id: b.sangam_id || '',
      first_name: b.tenant_first_name || '',
      last_name: b.tenant_last_name || '',
      email: b.tenant_email || '',
      phone: b.tenant_phone || '',
      property_address: b.property_address || '',
      council_name: b.council_name || '',
      housing_officer: '',
      unit_number: '',
      nok_name: '',
      nok_number: '',
      placement_start: b.placement_start || '',
      placement_end: b.placement_end || '',
      reference_number: b.reference_number || '',
      risk_profile: b.risk_profile || '',
      nightly_rate: b.nightly_rate || '',
      assigned_to: b.assigned_to || ''
    }));

    res.json({
      results: mapped,
      source: 'local_db',
      count: mapped.length
    });
  } catch (err) {
    logger.error('CRM search error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/bookings/recent
// Returns recent bookings for the dropdown browser
router.get('/bookings/recent', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const bookings = getRecentBookings(limit);
    const mapped = bookings.map(b => ({
      id: b.id,
      sangam_id: b.sangam_id || '',
      first_name: b.tenant_first_name || '',
      last_name: b.tenant_last_name || '',
      email: b.tenant_email || '',
      phone: b.tenant_phone || '',
      property_address: b.property_address || '',
      council_name: b.council_name || '',
      housing_officer: '',
      unit_number: '',
      nok_name: '',
      nok_number: '',
      placement_start: b.placement_start || '',
      placement_end: b.placement_end || '',
      reference_number: b.reference_number || '',
      risk_profile: b.risk_profile || '',
      nightly_rate: b.nightly_rate || '',
      assigned_to: b.assigned_to || '',
      synced_at: b.synced_at || '',
      updated_at: b.updated_at || ''
    }));

    res.json({
      bookings: mapped,
      count: mapped.length
    });
  } catch (err) {
    logger.error('Error fetching recent CRM bookings', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/bookings/:ref
// Lookup a specific booking by reference number
router.get('/bookings/:ref', async (req, res) => {
  try {
    const ref = req.params.ref;
    logger.info(`CRM lookup by ref: "${ref}"`);

    // Try Sangam API first
    const apiResult = await getCRMBookingByRef(ref);
    if (apiResult) {
      const normalized = normalizeCRMRecord(apiResult);
      return res.json({
        booking: normalized,
        source: 'sangam_api'
      });
    }

    // Fall back to local DB
    const local = getLocalBookingByRef(ref);
    if (local) {
      return res.json({
        booking: {
          sangam_id: local.sangam_id || '',
          first_name: local.tenant_first_name || '',
          last_name: local.tenant_last_name || '',
          email: local.tenant_email || '',
          phone: local.tenant_phone || '',
          property_address: local.property_address || '',
          council_name: local.council_name || '',
          housing_officer: '',
          unit_number: '',
          nok_name: '',
          nok_number: '',
          placement_start: local.placement_start || '',
          placement_end: local.placement_end || '',
          reference_number: local.reference_number || '',
          risk_profile: local.risk_profile || '',
          nightly_rate: local.nightly_rate || '',
          assigned_to: local.assigned_to || ''
        },
        source: 'local_db'
      });
    }

    res.status(404).json({ error: 'Booking not found', ref });
  } catch (err) {
    logger.error('CRM booking lookup error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/status
// Check CRM connection status
router.get('/status', async (req, res) => {
  const hasApiToken = !!(process.env.SANGAM_API_TOKEN);
  const hasCredentials = !!(process.env.SANGAM_EMAIL && process.env.SANGAM_PASSWORD);
  const sangamUrl = process.env.SANGAM_URL || 'https://care.sangamcrm.com';

  res.json({
    configured: hasApiToken || hasCredentials,
    api_token: hasApiToken,
    scraper_credentials: hasCredentials,
    sangam_url: sangamUrl,
    methods: [
      ...(hasApiToken ? ['REST API'] : []),
      ...(hasCredentials ? ['Web Scraper'] : []),
      'Local DB Search'
    ]
  });
});

// GET /api/crm/test-api
// Diagnostic: Test all possible API endpoints to find the right one
router.get('/test-api', async (req, res) => {
  try {
    logger.info('Running Sangam CRM API diagnostics...');
    const results = await testAPIEndpoints();
    res.json(results);
  } catch (err) {
    logger.error('API test failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/crm/sync - Manual CRM sync trigger
router.post('/sync', async (req, res) => {
  try {
    logger.info('Manual CRM sync triggered');
    const result = await syncFromCRM();
    res.json({ success: true, ...result });
  } catch (err) {
    logger.error('Manual CRM sync failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/modules
router.get('/modules', async (req, res) => {
  try {
    const modules = await getModuleList();
    res.json(modules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/fields/:module
router.get('/fields/:module', async (req, res) => {
  try {
    const fields = await getFieldList(req.params.module);
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
