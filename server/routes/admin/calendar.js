import { Router } from 'express';
import { testCalendarConnection } from '../../services/calendarSync.js';

const router = Router();

router.get('/test', async (req, res) => {
  const result = await testCalendarConnection();
  res.json(result);
});

export default router;
