const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const fs = require('fs');

router.get('/', (req, res) => {
  const DATA_DIR = process.env.DATA_DIR || './data';
  try {
    const bc = db.prepare('SELECT COUNT(*) as c FROM bookings').get();
    const fc = db.prepare('SELECT COUNT(*) as c FROM forms').get();
    const ec = db.prepare('SELECT COUNT(*) as c FROM evidence').get();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      counts: { bookings: bc?.c || 0, forms: fc?.c || 0, evidence: ec?.c || 0 },
      dataDir: DATA_DIR,
      dataDirExists: fs.existsSync(DATA_DIR)
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
