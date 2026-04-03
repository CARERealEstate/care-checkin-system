const express = require('express');
const router = express.Router();
const { syncFromCRM, getModuleList, getFieldList } = require('../services/sangamClient');
const logger = require('../services/logger');

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

// GET /api/crm/modules - List available modules
router.get('/modules', async (req, res) => {
  try {
    const modules = await getModuleList();
    res.json(modules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/fields/:module - List fields for a module
router.get('/fields/:module', async (req, res) => {
  try {
    const fields = await getFieldList(req.params.module);
    res.json(fields);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
