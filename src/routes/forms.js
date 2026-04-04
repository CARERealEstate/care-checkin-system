const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const logger = require('../services/logger');

// POST /api/forms
router.post('/', (req, res) => {
  try {
    const { booking_id, type, form_data, signing_method } = req.body;
    const booking = db.prepare(`SELECT * FROM bookings WHERE id = @id`).get({ id: Number(booking_id) });
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const existing = db.prepare(`SELECT id FROM forms WHERE booking_id = @bid AND type = @type`).get({ bid: Number(booking_id), type });
    if (existing) return res.status(409).json({ error: `A ${type} form already exists`, formId: existing.id });

    const result = db.prepare(`
      INSERT INTO forms (booking_id, type, status, signing_method, form_data)
      VALUES (@booking_id, @type, 'draft', @method, @data)
    `).run({
      booking_id: Number(booking_id),
      type,
      method: signing_method || 'in_person',
      data: JSON.stringify(form_data || {})
    });

    const form = db.prepare(`SELECT * FROM forms WHERE id = @id`).get({ id: result.lastInsertRowid });
    res.status(201).json(form || { id: result.lastInsertRowid, type, status: 'draft' });
  } catch (err) {
    logger.error('Error creating form', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/forms/:id
router.get('/:id', (req, res) => {
  try {
    const form = db.prepare(`SELECT * FROM forms WHERE id = @id`).get({ id: Number(req.params.id) });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const booking = db.prepare(`SELECT * FROM bookings WHERE id = @id`).get({ id: form.booking_id });
    const evidence = db.prepare(`SELECT * FROM evidence WHERE form_id = @id ORDER BY uploaded_at`).all({ id: form.id });

    res.json({ form, booking, evidence });
  } catch (err) {
    logger.error('Error fetching form', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/forms/:id
router.put('/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const form = db.prepare(`SELECT * FROM forms WHERE id = @id`).get({ id });
    if (!form) return res.status(404).json({ error: 'Form not found' });

    const { form_data, tenant_signature, agent_signature, agent_name, signing_method, status } = req.body;

    if (form_data !== undefined) {
      // form_data may arrive as string or object; store as string
      const fdStr = typeof form_data === 'string' ? form_data : JSON.stringify(form_data);
      db.prepare(`UPDATE forms SET form_data = @val WHERE id = @id`).run({ val: fdStr, id });
    }
    if (tenant_signature !== undefined) {
      db.prepare(`UPDATE forms SET tenant_signature = @val WHERE id = @id`).run({ val: tenant_signature, id });
    }
    if (agent_signature !== undefined) {
      db.prepare(`UPDATE forms SET agent_signature = @val WHERE id = @id`).run({ val: agent_signature, id });
    }
    if (agent_name !== undefined) {
      db.prepare(`UPDATE forms SET agent_name = @val WHERE id = @id`).run({ val: agent_name, id });
    }
    if (signing_method) {
      db.prepare(`UPDATE forms SET signing_method = @val WHERE id = @id`).run({ val: signing_method, id });
    }
    if (status) {
      db.prepare(`UPDATE forms SET status = @val WHERE id = @id`).run({ val: status, id });
      if (status === 'signed') {
        db.prepare(`UPDATE forms SET signed_at = datetime('now') WHERE id = @id`).run({ id });
      }
      if (status === 'completed') {
        db.prepare(`UPDATE forms SET completed_at = datetime('now') WHERE id = @id`).run({ id });
        const newStatus = form.type === 'check_in' ? 'checked_in' : 'checked_out';
        db.prepare(`UPDATE bookings SET status = @status WHERE id = @id`).run({ status: newStatus, id: form.booking_id });
      }
    }

    const updated = db.prepare(`SELECT * FROM forms WHERE id = @id`).get({ id });
    res.json(updated);
  } catch (err) {
    logger.error('Error updating form', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
