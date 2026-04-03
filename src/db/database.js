const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const logger = require('../services/logger');

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'care.db');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Module-level db reference
let _sqlDb = null;

function _save() {
  if (!_sqlDb) return;
  try {
    const data = _sqlDb.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch(e) {
    logger.error('DB save error', { error: e.message });
  }
}

// Simple wrapper matching better-sqlite3 API
const db = {
  prepare(sql) {
    return {
      run(...args) {
        if (!_sqlDb) throw new Error('Database not initialized');
        const params = resolveParams(sql, args);
        _sqlDb.run(sql.replace(/@(\w+)/g, ':$1'), params);
        const lastId = _sqlDb.exec("SELECT last_insert_rowid() as id");
        const changes = _sqlDb.getRowsModified();
        _save();
        return { lastInsertRowid: lastId[0]?.values[0]?.[0] || 0, changes };
      },
      get(...args) {
        if (!_sqlDb) throw new Error('Database not initialized');
        const params = resolveParams(sql, args);
        const fixedSql = sql.replace(/@(\w+)/g, ':$1');
        try {
          const stmt = _sqlDb.prepare(fixedSql);
          if (Object.keys(params).length > 0) stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            stmt.free();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            return row;
          }
          stmt.free();
        } catch(e) {
          logger.error('DB get error', { sql: fixedSql.substring(0,100), error: e.message });
        }
        return undefined;
      },
      all(...args) {
        if (!_sqlDb) throw new Error('Database not initialized');
        const params = resolveParams(sql, args);
        const fixedSql = sql.replace(/@(\w+)/g, ':$1');
        const results = [];
        try {
          const stmt = _sqlDb.prepare(fixedSql);
          if (Object.keys(params).length > 0) stmt.bind(params);
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            results.push(row);
          }
          stmt.free();
        } catch(e) {
          logger.error('DB all error', { sql: fixedSql.substring(0,100), error: e.message });
        }
        return results;
      }
    };
  },

  exec(sql) {
    if (!_sqlDb) throw new Error('Database not initialized');
    _sqlDb.exec(sql);
    _save();
  },

  transaction(fn) {
    return function(...args) {
      _sqlDb.exec('BEGIN TRANSACTION');
      try {
        const result = fn(...args);
        _sqlDb.exec('COMMIT');
        _save();
        return result;
      } catch(e) {
        try { _sqlDb.exec('ROLLBACK'); } catch(re) {}
        throw e;
      }
    };
  }
};

function resolveParams(sql, args) {
  if (args.length === 0) return {};
  const val = args[0];

  // If it's a plain object with named params
  if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
    const params = {};
    for (const [k, v] of Object.entries(val)) {
      params[`:${k}`] = v === undefined ? null : v;
    }
    return params;
  }

  // Positional params (for ? placeholders)
  if (Array.isArray(val)) {
    const params = {};
    val.forEach((v, i) => { params[i + 1] = v; });
    return params;
  }

  // Single positional
  if (args.length >= 1) {
    // Check if SQL uses ? placeholders
    const qCount = (sql.match(/\?/g) || []).length;
    if (qCount > 0) {
      const params = {};
      args.forEach((v, i) => { params[i + 1] = v === undefined ? null : v; });
      return params;
    }
  }

  return {};
}

async function initialize() {
  logger.info('Initializing database...');

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _sqlDb = new SQL.Database(buf);
  } else {
    _sqlDb = new SQL.Database();
  }

  _sqlDb.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sangam_id TEXT UNIQUE,
      tenant_first_name TEXT NOT NULL DEFAULT '',
      tenant_last_name TEXT NOT NULL DEFAULT '',
      tenant_email TEXT DEFAULT '',
      tenant_phone TEXT DEFAULT '',
      property_address TEXT DEFAULT '',
      council_name TEXT DEFAULT '',
      placement_start TEXT DEFAULT '',
      placement_end TEXT DEFAULT '',
      reference_number TEXT DEFAULT '',
      risk_profile TEXT DEFAULT '',
      nightly_rate TEXT DEFAULT '',
      assigned_to TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      raw_data TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS forms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      signing_method TEXT DEFAULT 'in_person',
      adobe_agreement_id TEXT,
      tenant_signature TEXT,
      agent_signature TEXT,
      agent_name TEXT DEFAULT '',
      form_data TEXT DEFAULT '{}',
      pdf_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      signed_at TEXT,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      form_id INTEGER NOT NULL,
      booking_id INTEGER NOT NULL,
      category TEXT DEFAULT 'general',
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      file_type TEXT DEFAULT 'image',
      original_filename TEXT NOT NULL,
      file_size_bytes INTEGER DEFAULT 0,
      note TEXT DEFAULT '',
      uploaded_by TEXT DEFAULT 'staff',
      included_in_pdf INTEGER DEFAULT 1,
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      form_id INTEGER,
      action TEXT NOT NULL,
      performed_by TEXT DEFAULT 'system',
      details TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  _save();
  logger.info('Database initialized successfully');
}

module.exports = { db, initialize };
