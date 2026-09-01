import { Router } from 'express';
import { db } from '../../db.js';
import { uploadPortfolio } from '../../middleware/upload.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT * FROM portfolio_items ORDER BY sort_order, created_at DESC`).all());
});

router.post('/', uploadPortfolio.single('image'), (req, res) => {
  const { category, caption, is_public, source_booking_id } = req.body;
  if (!req.file) return res.status(400).json({ error: 'missing_image' });

  const maxSort = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM portfolio_items`).get().m;
  const result = db
    .prepare(
      `INSERT INTO portfolio_items (file_path, category, caption, is_public, sort_order, source_booking_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      `portfolio/${req.file.filename}`,
      category ?? null,
      caption ?? null,
      is_public === undefined ? 0 : Number(Boolean(is_public)),
      maxSort + 1,
      source_booking_id ?? null
    );
  res.status(201).json(db.prepare(`SELECT * FROM portfolio_items WHERE id = ?`).get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const item = db.prepare(`SELECT id FROM portfolio_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const editable = ['category', 'caption', 'is_public', 'sort_order'];
  const sets = [];
  const params = [];
  for (const key of editable) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(key === 'is_public' ? Number(Boolean(req.body[key])) : req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  params.push(item.id);
  db.prepare(`UPDATE portfolio_items SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare(`SELECT * FROM portfolio_items WHERE id = ?`).get(item.id));
});

router.patch('/:id/toggle-public', (req, res) => {
  const item = db.prepare(`SELECT * FROM portfolio_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  db.prepare(`UPDATE portfolio_items SET is_public = ? WHERE id = ?`).run(item.is_public ? 0 : 1, item.id);
  res.json(db.prepare(`SELECT * FROM portfolio_items WHERE id = ?`).get(item.id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM portfolio_items WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

export default router;
