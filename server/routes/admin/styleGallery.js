import { Router } from 'express';
import { db } from '../../db.js';
import { uploadStyleGallery } from '../../middleware/upload.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(db.prepare(`SELECT * FROM style_gallery_items ORDER BY sort_order, created_at DESC`).all());
});

router.post('/', uploadStyleGallery.single('image'), (req, res) => {
  const { style_name, description } = req.body;
  if (!req.file || !style_name) return res.status(400).json({ error: 'missing_fields' });

  const maxSort = db.prepare(`SELECT COALESCE(MAX(sort_order), -1) AS m FROM style_gallery_items`).get().m;
  const result = db
    .prepare(`INSERT INTO style_gallery_items (file_path, style_name, description, sort_order) VALUES (?, ?, ?, ?)`)
    .run(`style-gallery/${req.file.filename}`, style_name, description ?? null, maxSort + 1);
  res.status(201).json(db.prepare(`SELECT * FROM style_gallery_items WHERE id = ?`).get(result.lastInsertRowid));
});

router.patch('/:id', (req, res) => {
  const item = db.prepare(`SELECT id FROM style_gallery_items WHERE id = ?`).get(req.params.id);
  if (!item) return res.status(404).json({ error: 'not_found' });

  const editable = ['style_name', 'description', 'sort_order'];
  const sets = [];
  const params = [];
  for (const key of editable) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  params.push(item.id);
  db.prepare(`UPDATE style_gallery_items SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare(`SELECT * FROM style_gallery_items WHERE id = ?`).get(item.id));
});

router.delete('/:id', (req, res) => {
  db.prepare(`DELETE FROM style_gallery_items WHERE id = ?`).run(req.params.id);
  res.status(204).end();
});

export default router;
