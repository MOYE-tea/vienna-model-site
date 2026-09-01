import { Router } from 'express';
import { db } from '../../db.js';
import { uploadWardrobe } from '../../middleware/upload.js';

const router = Router();

function withImages(item) {
  const images = db
    .prepare(`SELECT * FROM wardrobe_images WHERE wardrobe_item_id = ? ORDER BY sort_order`)
    .all(item.id);
  return { ...item, images };
}

router.get('/', (req, res) => {
  const items = db.prepare(`SELECT * FROM wardrobe_items ORDER BY created_at DESC`).all();
  res.json(items.map(withImages));
});

router.get('/:id', (req, res) => {
  const item = db.prepare(`SELECT * FROM wardrobe_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });
  res.json(withImages(item));
});

router.post('/', (req, res) => {
  const { item_no, name, category, is_available, notes } = req.body;
  if (!item_no || !name) return res.status(400).json({ error: 'missing_fields' });

  try {
    const result = db
      .prepare(`INSERT INTO wardrobe_items (item_no, name, category, is_available, notes) VALUES (?, ?, ?, ?, ?)`)
      .run(item_no, name, category ?? null, is_available === undefined ? 1 : Number(Boolean(is_available)), notes ?? null);
    res.status(201).json(withImages(db.prepare(`SELECT * FROM wardrobe_items WHERE id = ?`).get(result.lastInsertRowid)));
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) return res.status(409).json({ error: 'item_no_exists' });
    throw err;
  }
});

router.patch('/:id', (req, res) => {
  const item = db.prepare(`SELECT id FROM wardrobe_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const editable = ['item_no', 'name', 'category', 'is_available', 'notes'];
  const sets = [];
  const params = [];
  for (const key of editable) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(key === 'is_available' ? Number(Boolean(req.body[key])) : req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  params.push(item.id);
  db.prepare(`UPDATE wardrobe_items SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json(withImages(db.prepare(`SELECT * FROM wardrobe_items WHERE id = ?`).get(item.id)));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM wardrobe_items WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

router.post('/:id/images', uploadWardrobe.array('images', 8), (req, res) => {
  const item = db.prepare(`SELECT id FROM wardrobe_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const insert = db.prepare(`INSERT INTO wardrobe_images (wardrobe_item_id, file_path, sort_order) VALUES (?, ?, ?)`);
  const existingCount = db.prepare(`SELECT COUNT(*) AS c FROM wardrobe_images WHERE wardrobe_item_id = ?`).get(item.id).c;
  (req.files || []).forEach((file, i) => {
    insert.run(item.id, `wardrobe/${file.filename}`, existingCount + i);
  });
  res.status(201).json(withImages(db.prepare(`SELECT * FROM wardrobe_items WHERE id = ?`).get(item.id)));
});

router.delete('/:id/images/:imageId', (req, res) => {
  db.prepare(`DELETE FROM wardrobe_images WHERE id = ? AND wardrobe_item_id = ?`).run(req.params.imageId, req.params.id);
  res.status(204).end();
});

export default router;
