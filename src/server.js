require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const logger = require('./services/logger');
const { initialize } = require('./db/database');
const { syncFromCRM } = require('./services/sangamClient');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './data';

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(session({
  secret: process.env.APP_SECRET || 'care-default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

app.use('/uploads', express.static(path.join(DATA_DIR, 'placements')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes (loaded after DB init)
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/forms', require('./routes/forms'));
app.use('/api/evidence', require('./routes/evidence'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/health', require('./routes/health'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// Background CRM sync
const SYNC_INTERVAL = (process.env.CRM_SYNC_INTERVAL || 2) * 60 * 1000; // Default 2 minutes
let syncInProgress = false;

async function backgroundSync() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const result = await syncFromCRM();
    if (result.synced > 0) {
      logger.info(`Background CRM sync: ${result.synced} records synced`);
    }
  } catch (err) {
    logger.error('Background CRM sync error', { error: err.message });
  } finally {
    syncInProgress = false;
  }
}

// Start
async function start() {
  await initialize();
  app.listen(PORT, '0.0.0.0', () => {
    logger.info(`CARE Check-In/Out System running on port ${PORT}`);
    logger.info(`Dashboard: http://localhost:${PORT}`);

    // Initial CRM sync on startup (non-blocking)
    logger.info('Running initial CRM sync...');
    backgroundSync();

    // Schedule recurring sync
    setInterval(backgroundSync, SYNC_INTERVAL);
    logger.info(`CRM auto-sync scheduled every ${SYNC_INTERVAL / 1000}s`);
  });
}

start().catch(err => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});

module.exports = app;
