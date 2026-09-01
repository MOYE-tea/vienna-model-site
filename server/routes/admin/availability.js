import { Router } from 'express';
import { db } from '../../db.js';

const router = Router();

router.get('/', (req, res) => {
  const { month } = req.query; // YYYY-MM
  let rows;
  if (month) {
    rows = db
      .prepare(`SELECT * FROM availability_slots WHERE date LIKE ? ORDER BY date, start_time`)
      .all(`${month}%`);
  } else {
    rows = db.prepare(`SELECT * FROM availability_slots ORDER BY date, start_time`).all();
  }
  res.json(rows);
});

router.post('/', (req, res) => {
  const { date, start_time, end_time } = req.body;
  if (!date || !start_time || !end_time) return res.status(400).json({ error: 'missing_fields' });

  try {
    const result = db
      .prepare(`INSERT INTO availability_slots (date, start_time, end_time) VALUES (?, ?, ?)`)
      .run(date, start_time, end_time);
    res.status(201).json(db.prepare(`SELECT * FROM availability_slots WHERE id = ?`).get(result.lastInsertRowid));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'slot_exists' });
    throw err;
  }
});

// Bulk-create the same time slots across a date range (e.g. every day this week).
router.post('/bulk', (req, res) => {
  const { dates, slots } = req.body; // dates: ["2026-09-01", ...], slots: [{start_time,end_time}, ...]
  if (!Array.isArray(dates) || !Array.isArray(slots) || !dates.length || !slots.length) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  const insert = db.prepare(`INSERT OR IGNORE INTO availability_slots (date, start_time, end_time) VALUES (?, ?, ?)`);
  let created = 0;
  for (const date of dates) {
    for (const slot of slots) {
      const result = insert.run(date, slot.start_time, slot.end_time);
      if (result.changes) created += 1;
    }
  }
  res.status(201).json({ created });
});

router.patch('/:id', (req, res) => {
  const slot = db.prepare(`SELECT * FROM availability_slots WHERE id = ?`).get(req.params.id);
  if (!slot) return res.status(404).json({ error: 'not_found' });

  const editable = ['is_open', 'start_time', 'end_time', 'date'];
  const sets = [];
  const params = [];
  for (const key of editable) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  params.push(slot.id);
  db.prepare(`UPDATE availability_slots SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare(`SELECT * FROM availability_slots WHERE id = ?`).get(slot.id));
});

router.delete('/:id', (req, res) => {
  const inUse = db
    .prepare(`SELECT COUNT(*) AS count FROM bookings WHERE slot_id = ? AND status IN ('pending','accepted')`)
    .get(req.params.id);
  if (inUse.count > 0) return res.status(409).json({ error: 'slot_in_use' });

  db.prepare(`DELETE FROM availability_slots WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

export default router;
