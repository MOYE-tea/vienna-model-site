import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import adminRouter from './routes/admin/index.js';
import publicRouter from './routes/public.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/', express.static(path.join(__dirname, '..', 'public')));

// mounted as one block so a future requireAuth middleware wraps the whole admin surface at once
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

app.get('/api/health', (req, res) => {
  const row = db.prepare('SELECT COUNT(*) AS count FROM settings').get();
  res.json({ ok: true, settingsCount: row.count });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server_error' });
});

app.listen(PORT, () => {
  console.log(`Vienna model site server running at http://localhost:${PORT}`);
});
