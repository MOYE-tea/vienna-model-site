import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { assertSlotAcceptsBooking, expireIfNeeded, requestReschedule, getSlot } from '../services/bookingRules.js';
import { calcDeposit, isFreeRescheduleEligible } from '../services/depositPolicy.js';
import { uploadBookingAttachments } from '../middleware/upload.js';

const router = Router();

router.get('/availability', (req, res) => {
  const { month } = req.query;
  let rows;
  if (month) {
    rows = db.prepare(`SELECT * FROM availability_slots WHERE date LIKE ? AND is_open = 1 ORDER BY date, start_time`).all(`${month}%`);
  } else {
    rows = db.prepare(`SELECT * FROM availability_slots WHERE is_open = 1 ORDER BY date, start_time`).all();
  }
  // public callers only need to know open vs. taken, not internal booking detail
  res.json(rows.map((s) => ({ id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, available: s.lock_status === 'open' })));
});

router.get('/style-gallery', (req, res) => {
  const rows = db.prepare(`SELECT id, style_name, description FROM style_gallery_items ORDER BY sort_order, created_at DESC`).all();
  res.json(rows);
});

router.get('/wardrobe', (req, res) => {
  const rows = db.prepare(`SELECT id, item_no, name, category FROM wardrobe_items WHERE is_available = 1 ORDER BY created_at DESC`).all();
  res.json(rows);
});

router.get('/rules', (req, res) => {
  const rows = db.prepare(`SELECT key, value FROM settings`).all();
  const obj = {};
  for (const row of rows) obj[row.key] = row.value;
  res.json(obj);
});

// Photographer submits a booking request. Never locks the slot — see
// server/services/bookingRules.js for why (deposit / mutual-accept do that).
router.post('/bookings', uploadBookingAttachments.fields([
  { name: 'reference_images', maxCount: 6 },
  { name: 'portfolio_samples', maxCount: 6 }
]), (req, res) => {
  const {
    type, slot_id, location, style_category, wardrobe_item_id, purpose, quote_amount,
    photographer_name, photographer_contact, portfolio_url
  } = req.body;

  if (!type || !['commission', 'mutual'].includes(type)) return res.status(400).json({ error: 'invalid_type' });
  if (!slot_id || !photographer_name) return res.status(400).json({ error: 'missing_fields' });
  if (type === 'mutual' && !req.files?.portfolio_samples?.length && !portfolio_url) {
    return res.status(400).json({ error: 'portfolio_required_for_mutual' });
  }

  const slot = db.prepare(`SELECT * FROM availability_slots WHERE id = ?`).get(slot_id);
  if (!slot) return res.status(404).json({ error: 'slot_not_found' });

  try {
    assertSlotAcceptsBooking(slot_id, type);
  } catch (err) {
    return res.status(409).json({ error: err.code || 'slot_unavailable' });
  }

  let photographerId = null;
  const existing = db.prepare(`SELECT id FROM photographers WHERE instagram_handle = ?`).get(photographer_contact ?? null);
  if (existing) {
    photographerId = existing.id;
  } else {
    const insert = db.prepare(`INSERT INTO photographers (name, instagram_handle, portfolio_url) VALUES (?, ?, ?)`).run(photographer_name, photographer_contact ?? null, portfolio_url ?? null);
    photographerId = Number(insert.lastInsertRowid);
  }

  const accessToken = crypto.randomUUID().replace(/-/g, '');
  const result = db
    .prepare(
      `INSERT INTO bookings
        (photographer_id, type, slot_id, shoot_date, location, style_category, wardrobe_item_id,
         purpose, quote_amount, photographer_name, photographer_contact, access_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      photographerId, type, slot_id, slot.date, location ?? null, style_category ?? null,
      wardrobe_item_id || null, purpose ?? null, quote_amount ? Number(quote_amount) : null,
      photographer_name, photographer_contact ?? null, accessToken
    );

  const bookingId = result.lastInsertRowid;
  const insertAttachment = db.prepare(`INSERT INTO booking_attachments (booking_id, kind, file_path) VALUES (?, ?, ?)`);
  for (const f of req.files?.reference_images ?? []) insertAttachment.run(bookingId, 'reference_image', `bookings/${f.filename}`);
  for (const f of req.files?.portfolio_samples ?? []) insertAttachment.run(bookingId, 'portfolio_sample', `bookings/${f.filename}`);

  res.status(201).json({ access_token: accessToken });
});

function serializeStatusForPhotographer(booking, slot) {
  const { deposit, balance } = booking.quote_amount ? calcDeposit(booking.quote_amount) : { deposit: booking.deposit_amount, balance: booking.balance_amount };
  return {
    type: booking.type,
    status: booking.status,
    payment_status: booking.payment_status,
    cancellation_status: booking.cancellation_status,
    refund_amount: booking.refund_amount,
    pipeline_stage: booking.pipeline_stage,
    shoot_date: booking.shoot_date,
    start_time: slot?.start_time,
    end_time: slot?.end_time,
    location: booking.location,
    style_category: booking.style_category,
    photographer_name: booking.photographer_name,
    wardrobe_item_name: booking.wardrobe_item_name,
    quote_amount: booking.quote_amount,
    deposit_amount: booking.deposit_amount ?? deposit,
    balance_amount: booking.balance_amount ?? balance,
    deposit_due_at: booking.deposit_due_at,
    reschedule_eligible_free: booking.type === 'commission' && booking.payment_status === 'deposit_paid' && isFreeRescheduleEligible(booking),
    reschedule_requested: Boolean(booking.reschedule_requested_slot_id)
  };
}

router.get('/booking-status/:token', (req, res) => {
  let booking = db
    .prepare(
      `SELECT b.*, w.name AS wardrobe_item_name FROM bookings b
       LEFT JOIN wardrobe_items w ON w.id = b.wardrobe_item_id
       WHERE b.access_token = ?`
    )
    .get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  booking = expireIfNeeded(booking);
  const slot = getSlot(booking.slot_id);
  res.json(serializeStatusForPhotographer(booking, slot));
});

router.post('/booking-status/:token/reschedule-request', (req, res) => {
  const { new_slot_id } = req.body;
  if (!new_slot_id) return res.status(400).json({ error: 'missing_slot' });

  let booking = db.prepare(`SELECT * FROM bookings WHERE access_token = ?`).get(req.params.token);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  booking = expireIfNeeded(booking);

  if (booking.payment_status !== 'deposit_paid' && !(booking.type === 'mutual' && booking.status === 'accepted')) {
    return res.status(409).json({ error: 'not_confirmed' });
  }

  try {
    requestReschedule(booking, new_slot_id);
  } catch (err) {
    return res.status(409).json({ error: err.code || 'reschedule_request_failed' });
  }
  res.json({ ok: true });
});

export default router;
