import { Router } from 'express';
import dashboard from './dashboard.js';
import bookings from './bookings.js';
import availability from './availability.js';
import wardrobe from './wardrobe.js';
import portfolio from './portfolio.js';
import styleGallery from './styleGallery.js';
import settings from './settings.js';
import photographers from './photographers.js';
import calendarRouter from './calendar.js';

const router = Router();

// Everything admin-facing is mounted here — a single point to wrap with
// auth middleware later (router.use(requireAuth)) without touching each file.
router.use('/dashboard', dashboard);
router.use('/bookings', bookings);
router.use('/availability', availability);
router.use('/wardrobe', wardrobe);
router.use('/portfolio', portfolio);
router.use('/style-gallery', styleGallery);
router.use('/settings', settings);
router.use('/photographers', photographers);
router.use('/calendar', calendarRouter);

export default router;
