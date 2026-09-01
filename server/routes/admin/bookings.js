import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../../db.js';
import {
  assertSlotAcceptsBooking, onBookingAccepted, onBookingRejected, onDepositConfirmed,
  onBalancePaid, reopenPaymentWindow, expireIfNeeded, cancelBooking, markRefunded,
  requestReschedule, approveReschedule, rejectReschedule, getSlot
} from '../../services/bookingRules.js';
import { calcRefundAmount } from '../../services/depositPolicy.js';
import { pushBookingToCalendar, deleteBookingFromCalendar } from '../../services/calendarSync.js';

const router = Router();

const PIPELINE_STAGES = ['requested', 'confirmed', 'shot', 'awaiting_delivery', 'delivered', 'done'];
const STATUSES = ['pending', 'accepted', 'rejected'];

function withJoins(row) {
  return row;
}

function getFullBooking(id) {
  const booking = db
    .prepare(
      `SELECT b.*, s.date AS slot_date, s.start_time, s.end_time, w.item_no AS wardrobe_item_no, w.name AS wardrobe_item_name
       FROM bookings b
       LEFT JOIN availability_slots s ON s.id = b.slot_id
       LEFT JOIN wardrobe_items w ON w.id = b.wardrobe_item_id
       WHERE b.id = ?`
    )
    .get(id);
  return booking ? expireIfNeeded(booking) : null;
}

router.get('/', (req, res) => {
  const { status, type, pipeline_stage } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('b.status = ?'); params.push(status); }
  if (type) { clauses.push('b.type = ?'); params.push(type); }
  if (pipeline_stage) { clauses.push('b.pipeline_stage = ?'); params.push(pipeline_stage); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT b.*, s.date AS slot_date, s.start_time, s.end_time, w.item_no AS wardrobe_item_no, w.name AS wardrobe_item_name
       FROM bookings b
       LEFT JOIN availability_slots s ON s.id = b.slot_id
       LEFT JOIN wardrobe_items w ON w.id = b.wardrobe_item_id
       ${where}
       ORDER BY b.created_at DESC`
    )
    .all(...params)
    .map((row) => expireIfNeeded(withJoins(row)));
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  const attachments = db.prepare(`SELECT * FROM booking_attachments WHERE booking_id = ?`).all(req.params.id);
  const rescheduleSlot = booking.reschedule_requested_slot_id ? getSlot(booking.reschedule_requested_slot_id) : null;

  res.json({ ...booking, attachments, reschedule_requested_slot: rescheduleSlot });
});

// Admin-created booking (also used to backfill test data before the public form is wired up).
router.post('/', (req, res) => {
  const {
    type, slot_id, shoot_type, location, style_category, wardrobe_item_id, purpose,
    quote_amount, shoot_hours, photographer_name, photographer_contact, admin_notes
  } = req.body;

  if (!type || !['commission', 'mutual'].includes(type)) {
    return res.status(400).json({ error: 'invalid_type' });
  }
  if (!slot_id || !photographer_name) {
    return res.status(400).json({ error: 'missing_fields' });
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
  } else if (photographer_name) {
    const insert = db
      .prepare(`INSERT INTO photographers (name, instagram_handle) VALUES (?, ?)`)
      .run(photographer_name, photographer_contact ?? null);
    photographerId = Number(insert.lastInsertRowid);
  }

  const accessToken = crypto.randomUUID().replace(/-/g, '');
  const result = db
    .prepare(
      `INSERT INTO bookings
        (photographer_id, type, slot_id, shoot_date, shoot_type, location, style_category, wardrobe_item_id,
         purpose, quote_amount, shoot_hours, photographer_name, photographer_contact, admin_notes, access_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      photographerId, type, slot_id, slot.date, shoot_type ?? null, location ?? null, style_category ?? null,
      wardrobe_item_id ?? null, purpose ?? null, quote_amount ?? null, shoot_hours ?? null,
      photographer_name, photographer_contact ?? null, admin_notes ?? null, accessToken
    );

  res.status(201).json(getFullBooking(result.lastInsertRowid));
});

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'invalid_status' });

  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  let calendarSync;
  if (status === 'accepted') {
    try {
      onBookingAccepted(booking);
    } catch (err) {
      return res.status(409).json({ error: err.code || 'accept_failed' });
    }
    db.prepare(`UPDATE bookings SET status = 'accepted', updated_at = datetime('now') WHERE id = ?`).run(booking.id);

    if (booking.type === 'mutual') {
      const slot = getSlot(booking.slot_id);
      calendarSync = await pushBookingToCalendar(booking, slot);
      if (calendarSync.synced) {
        db.prepare(`UPDATE availability_slots SET calendar_event_id = ? WHERE id = ?`).run(calendarSync.uid, slot.id);
      }
    }
  } else if (status === 'rejected') {
    onBookingRejected(booking);
    db.prepare(`UPDATE bookings SET status = 'rejected', updated_at = datetime('now') WHERE id = ?`).run(booking.id);
  } else {
    db.prepare(`UPDATE bookings SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, booking.id);
  }

  res.json({ ...getFullBooking(booking.id), calendarSync });
});

// Admin confirms the deposit was actually received — this is what locks the
// slot for a commission booking and (for commission) is when the calendar
// event is created.
router.post('/:id/confirm-deposit', async (req, res) => {
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  if (booking.payment_status !== 'awaiting_deposit') return res.status(409).json({ error: 'not_awaiting_deposit' });

  try {
    onDepositConfirmed(booking);
  } catch (err) {
    return res.status(409).json({ error: err.code || 'confirm_failed' });
  }

  const updated = getFullBooking(booking.id);
  const slot = getSlot(updated.slot_id);
  const calendarSync = await pushBookingToCalendar(updated, slot);
  if (calendarSync.synced) {
    db.prepare(`UPDATE availability_slots SET calendar_event_id = ? WHERE id = ?`).run(calendarSync.uid, slot.id);
  }

  res.json({ ...getFullBooking(booking.id), calendarSync });
});

router.post('/:id/reopen-payment', (req, res) => {
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  if (booking.payment_status !== 'payment_expired' && booking.payment_status !== 'awaiting_deposit') {
    return res.status(409).json({ error: 'not_reopenable' });
  }
  try {
    reopenPaymentWindow(booking);
  } catch (err) {
    return res.status(409).json({ error: err.code || 'reopen_failed' });
  }
  res.json(getFullBooking(booking.id));
});

router.post('/:id/balance-paid', (req, res) => {
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  onBalancePaid(booking);
  res.json(getFullBooking(booking.id));
});

// { cancelled_by: 'model' | 'photographer', reason?: string }
router.post('/:id/cancel', async (req, res) => {
  const { cancelled_by, reason } = req.body;
  if (!['model', 'photographer'].includes(cancelled_by)) return res.status(400).json({ error: 'invalid_cancelled_by' });

  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  const refundAmount = calcRefundAmount(booking, cancelled_by);
  const wasLocked = getSlot(booking.slot_id)?.lock_status === 'locked';
  cancelBooking(booking, refundAmount, cancelled_by, reason);

  let calendarSync;
  if (wasLocked) {
    calendarSync = await deleteBookingFromCalendar(booking.id);
    db.prepare(`UPDATE availability_slots SET calendar_event_id = NULL WHERE id = ?`).run(booking.slot_id);
  }

  res.json({ ...getFullBooking(booking.id), calendarSync });
});

router.post('/:id/mark-refunded', (req, res) => {
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  markRefunded(booking);
  res.json(getFullBooking(booking.id));
});

router.post('/:id/reschedule/request', (req, res) => {
  const { new_slot_id } = req.body;
  if (!new_slot_id) return res.status(400).json({ error: 'missing_slot' });

  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  try {
    requestReschedule(booking, new_slot_id);
  } catch (err) {
    return res.status(409).json({ error: err.code || 'reschedule_request_failed' });
  }
  res.json(getFullBooking(booking.id));
});

router.post('/:id/reschedule/approve', async (req, res) => {
  const { force_majeure } = req.body;
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  const oldSlotId = booking.slot_id;
  const hadCalendarEvent = Boolean(getSlot(oldSlotId)?.calendar_event_id);
  try {
    approveReschedule(booking, Boolean(force_majeure));
  } catch (err) {
    return res.status(409).json({ error: err.code || 'reschedule_approve_failed' });
  }
  db.prepare(`UPDATE availability_slots SET calendar_event_id = NULL WHERE id = ?`).run(oldSlotId);

  const updated = getFullBooking(booking.id);
  let calendarSync;
  if (hadCalendarEvent) {
    await deleteBookingFromCalendar(booking.id);
    const newSlot = getSlot(updated.slot_id);
    calendarSync = await pushBookingToCalendar(updated, newSlot);
    if (calendarSync.synced) {
      db.prepare(`UPDATE availability_slots SET calendar_event_id = ? WHERE id = ?`).run(calendarSync.uid, newSlot.id);
    }
  }

  res.json({ ...getFullBooking(booking.id), calendarSync });
});

router.post('/:id/reschedule/reject', (req, res) => {
  const booking = getFullBooking(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  rejectReschedule(booking);
  res.json(getFullBooking(booking.id));
});

router.patch('/:id/pipeline', (req, res) => {
  const { pipeline_stage } = req.body;
  if (!PIPELINE_STAGES.includes(pipeline_stage)) return res.status(400).json({ error: 'invalid_stage' });

  const booking = db.prepare(`SELECT id FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  db.prepare(`UPDATE bookings SET pipeline_stage = ?, updated_at = datetime('now') WHERE id = ?`).run(pipeline_stage, booking.id);
  res.json(getFullBooking(booking.id));
});

router.patch('/:id', (req, res) => {
  const booking = db.prepare(`SELECT id FROM bookings WHERE id = ?`).get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  const editable = ['quote_amount', 'shoot_hours', 'admin_notes', 'wardrobe_item_id', 'is_public_experience', 'location', 'style_category', 'purpose', 'shoot_type'];
  const sets = [];
  const params = [];
  for (const key of editable) {
    if (key in req.body) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'no_fields' });

  params.push(booking.id);
  db.prepare(`UPDATE bookings SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
  res.json(getFullBooking(booking.id));
});

export default router;
