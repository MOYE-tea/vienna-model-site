import { Router } from 'express';
import { db } from '../../db.js';

const router = Router();

router.get('/', (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const obj = {};
  for (const row of rows) obj[row.key] = row.value;
  res.json(obj);
});

router.patch('/', (req, res) => {
  const entries = Object.entries(req.body || {});
  if (!entries.length) return res.status(400).json({ error: 'no_fields' });

  const upsert = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  for (const [key, value] of entries) {
    upsert.run(key, typeof value === 'string' ? value : JSON.stringify(value));
  }

  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const obj = {};
  for (const row of rows) obj[row.key] = row.value;
  res.json(obj);
});

export default router;
