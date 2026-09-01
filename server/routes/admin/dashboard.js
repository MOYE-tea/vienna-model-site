import { Router } from 'express';
import { getDashboardStats } from '../../services/stats.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(getDashboardStats());
});

export default router;
