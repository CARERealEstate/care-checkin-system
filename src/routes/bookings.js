const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const logger = require('../services/logger');

// GET /api/bookings
router.get('/', (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Build query - sql.js needs simpler queries
    let bookings;
    if (search && status && status !== 'all') {
      bookings = db.prepare(`SELECT * FROM bookings WHERE status = @status AND (tenant_first_name LIKE @search OR tenant_last_name LIKE @search OR property_address LIKE @search OR council_name LIKE @search) ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
        .all({ status, search: `%${search}%`, limit: Number(limit), offset: Number(offset) });
    } else if (search) {
      bookings = db.prepare(`SELECT * FROM bookings WHERE tenant_first_name LIKE @search OR tenant_last_name LIKE @search OR property_address LIKE @search OR council_name LIKE @search ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
        .all({ search: `%${search}%`, limit: Number(limit), offset: Number(offset) });
    } else if (status && status !== 'all') {
      bookings = db.prepare(`SELECT * FROM bookings WHERE status = @status ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
        .all({ status, limit: Number(limit), offset: Number(offset) });
    } else {
      bookings = db.prepare(`SELECT * FROM bookings ORDER BY created_at DESC LIMIT @limit OFFSET @offset`)
        .all({ limit: Number(limit), offset: Number(offset) });
    }

    bookings = bookings.map(b => {
      const ciCount = db.prepare(`SELECT COUNT(*) as c FROM forms WHERE booking_id = @id AND type = 'check_in'`).get({ id: b.id });
      const coCount = db.prepare(`SELECT COUNT(*) as c FROM forms WHERE booking_id = @id AND type = 'check_out'`).get({ id: b.id });
      const evCount = db.prepare(`SELECT COUNT(*) as c FROM evidence WHERE booking_id = @id`).get({ id: b.id });
      return { ...b, has_checkin: ciCount?.c || 0, has_checkout: coCount?.c || 0, evidence_count: evCount?.c || 0 };
    });

    const totalRow = db.prepare(`SELECT COUNT(*) as c FROM bookings`).get();
    const total = totalRow?.c || 0;
    res.json({ bookings, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) || 1 } });
  } catch (err) {
    logger.error('Error fetching bookings', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = @id`).get({ id: Number(req.params.id) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    const forms = db.prepare(`SELECT * FROM forms WHERE booking_id = @id ORDER BY created_at DESC`).all({ id: booking.id });
    const evidence = db.prepare(`SELECT * FROM evidence WHERE booking_id = @id ORDER BY uploaded_at DESC`).all({ id: booking.id });
    const auditLog = db.prepare(`SELECT * FROM audit_log WHERE booking_id = @id ORDER BY created_at DESC`).all({ id: booking.id });
    res.json({ booking, forms, evidence, auditLog });
  } catch (err) {
    logger.error('Error fetching booking', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const b = req.body;
    const result = db.prepare(`INSERT INTO bookings (sangam_id, tenant_first_name, tenant_last_name, tenant_email, tenant_phone, property_address, council_name, placement_start, placement_end, reference_number, risk_profile, nightly_rate) VALUES (@sangam_id, @first, @last, @email, @phone, @property, @council, @start, @end, @ref, @risk, @rate)`).run({
      sangam_id: `manual-${Date.now()}`, first: b.tenant_first_name || '', last: b.tenant_last_name || '',
      email: b.tenant_email || '', phone: b.tenant_phone || '', property: b.property_address || '',
      council: b.council_name || '', start: b.placement_start || '', end: b.placement_end || '',
      ref: b.reference_number || '', risk: b.risk_profile || '', rate: b.nightly_rate || ''
    });
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = @id`).get({ id: result.lastInsertRowid });
    res.status(201).json(booking || { id: result.lastInsertRowid });
  } catch (err) {
    logger.error('Error creating booking', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const fields = req.body;
    const id = Number(req.params.id);
    const allowed = ['tenant_first_name', 'tenant_last_name', 'tenant_email', 'tenant_phone',
      'property_address', 'council_name', 'placement_start', 'placement_end', 'reference_number', 'nightly_rate', 'status'];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        db.prepare(`UPDATE bookings SET ${key} = @val WHERE id = @id`).run({ val: fields[key], id });
      }
    }
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = @id`).get({ id });
    res.json(booking);
  } catch (err) {
    logger.error('Error updating booking', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;