import { Router } from 'express';
import { db } from '../../db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, COUNT(b.id) AS booking_count
       FROM photographers p
       LEFT JOIN bookings b ON b.photographer_id = p.id
       GROUP BY p.id
       ORDER BY p.created_at DESC`
    )
    .all();
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const photographer = db.prepare(`SELECT * FROM photographers WHERE id = ?`).get(req.params.id);
  if (!photographer) return res.status(404).json({ error: 'not_found' });

  const bookings = db
    .prepare(`SELECT * FROM bookings WHERE photographer_id = ? ORDER BY created_at DESC`)
    .all(req.params.id);

  res.json({ ...photographer, bookings });
});

router.patch('/:id', (req, res) => {
  const photographer = db.prepare(`SELECT id FROM photographers WHERE id = ?`).get(req.params.id);
  if (!photographer) return res.status(404).json({ error: 'not_found' });

  const editable = ['name', 'instagram_handle', 'email', 'phone', 'portfolio_url', 'notes'];
  const sets = [];
  const params = [];
  for (const key of editable) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  params.push(photographer.id);
  db.prepare(`UPDATE photographers SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare(`SELECT * FROM photographers WHERE id = ?`).get(photographer.id));
});

export default router;
