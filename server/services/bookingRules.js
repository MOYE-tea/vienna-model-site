import { db } from '../db.js';
import { calcDeposit, depositDueAt, isDepositExpired } from './depositPolicy.js';

export function getSlot(slotId) {
  return db.prepare(`SELECT * FROM availability_slots WHERE id = ?`).get(slotId);
}

export function lockSlot(slotId) {
  db.prepare(`UPDATE availability_slots SET lock_status = 'locked' WHERE id = ?`).run(slotId);
}

export function unlockSlot(slotId) {
  db.prepare(`UPDATE availability_slots SET lock_status = 'open' WHERE id = ? AND is_open = 1`).run(slotId);
}

// A slot is "occupied" once some booking on it has been accepted and hasn't
// since expired/been cancelled — this is what actually blocks new submissions
// and further accepts, independently of availability_slots.lock_status (which
// only flips once payment is confirmed / a mutual booking is accepted).
export function isSlotOccupied(slotId, excludeBookingId = null) {
  const holder = db
    .prepare(
      `SELECT id FROM bookings
       WHERE slot_id = ? AND status = 'accepted' AND cancellation_status = 'none'
         AND payment_status != 'payment_expired'
         AND id != ?`
    )
    .get(slotId, excludeBookingId ?? -1);
  return Boolean(holder);
}

// Called on every new booking submission (public or admin-created).
export function assertSlotAcceptsBooking(slotId, type) {
  const slot = getSlot(slotId);
  if (!slot || !slot.is_open) {
    const err = new Error('Slot is not open');
    err.code = 'slot_unavailable';
    throw err;
  }
  if (isSlotOccupied(slotId)) {
    const err = new Error('Slot already has an accepted booking');
    err.code = 'slot_locked';
    throw err;
  }
}

// Called when the model accepts a booking. Branches by type:
// - mutual: this IS the final confirmation — lock the slot now, no payment step.
// - commission: opens the 24h deposit payment window; the slot is NOT locked
//   until the deposit is actually confirmed (see onDepositConfirmed).
export function onBookingAccepted(booking) {
  if (isSlotOccupied(booking.slot_id, booking.id)) {
    const err = new Error('Another booking already holds this slot');
    err.code = 'slot_already_held';
    throw err;
  }

  if (booking.type === 'mutual') {
    lockSlot(booking.slot_id);
  } else {
    const { deposit, balance } = calcDeposit(booking.quote_amount);
    db.prepare(
      `UPDATE bookings SET payment_status = 'awaiting_deposit', deposit_amount = ?, balance_amount = ?, deposit_due_at = ?
       WHERE id = ?`
    ).run(deposit, balance, depositDueAt(), booking.id);
  }

  // one accepted holder per slot — anything else still pending on it is moot now
  db.prepare(
    `UPDATE bookings SET status = 'rejected', updated_at = datetime('now')
     WHERE slot_id = ? AND id != ? AND status = 'pending'`
  ).run(booking.slot_id, booking.id);
}

export function onBookingRejected(booking) {
  // nothing was ever locked for a merely-pending/rejected booking; no-op kept
  // for symmetry with onBookingAccepted and in case a rejected-after-accept
  // path is added later.
  void booking;
}

// Admin confirms the deposit was actually received (bank transfer, manually
// verified) — THIS is what locks the slot for a commission booking.
export function onDepositConfirmed(booking) {
  const slot = getSlot(booking.slot_id);
  if (slot.lock_status === 'locked') {
    const err = new Error('Slot is already locked');
    err.code = 'slot_locked';
    throw err;
  }
  lockSlot(booking.slot_id);
  db.prepare(
    `UPDATE bookings SET payment_status = 'deposit_paid', deposit_paid_at = datetime('now'),
       pipeline_stage = CASE WHEN pipeline_stage = 'requested' THEN 'confirmed' ELSE pipeline_stage END
     WHERE id = ?`
  ).run(booking.id);
}

export function onBalancePaid(booking) {
  db.prepare(`UPDATE bookings SET payment_status = 'balance_paid', balance_paid_at = datetime('now') WHERE id = ?`).run(booking.id);
}

// Re-opens a fresh 24h payment window after a previous one expired.
export function reopenPaymentWindow(booking) {
  if (isSlotOccupied(booking.slot_id, booking.id)) {
    const err = new Error('Another booking already holds this slot');
    err.code = 'slot_already_held';
    throw err;
  }
  db.prepare(`UPDATE bookings SET payment_status = 'awaiting_deposit', deposit_due_at = ? WHERE id = ?`).run(depositDueAt(), booking.id);
}

// Lazy expiry: call before reading/listing a commission booking so a missed
// 24h deadline is reflected without needing a background job.
export function expireIfNeeded(booking) {
  if (isDepositExpired(booking)) {
    db.prepare(`UPDATE bookings SET payment_status = 'payment_expired', updated_at = datetime('now') WHERE id = ?`).run(booking.id);
    return { ...booking, payment_status: 'payment_expired' };
  }
  return booking;
}

export function cancelBooking(booking, refundAmount, cancelledBy, reason) {
  const cancellationStatus = refundAmount > 0 ? 'refund_pending' : (cancelledBy === 'model' ? 'cancelled_by_model' : 'cancelled_by_photographer');
  db.prepare(
    `UPDATE bookings SET cancellation_status = ?, cancelled_at = datetime('now'), cancellation_reason = ?, refund_amount = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(cancellationStatus, reason ?? null, refundAmount, booking.id);

  const slot = getSlot(booking.slot_id);
  if (slot?.lock_status === 'locked') unlockSlot(booking.slot_id);
}

export function markRefunded(booking) {
  db.prepare(`UPDATE bookings SET cancellation_status = 'refunded', updated_at = datetime('now') WHERE id = ?`).run(booking.id);
}

export function requestReschedule(booking, newSlotId) {
  if (isSlotOccupied(newSlotId)) {
    const err = new Error('New slot already has an accepted booking');
    err.code = 'slot_locked';
    throw err;
  }
  const newSlot = getSlot(newSlotId);
  if (!newSlot || !newSlot.is_open) {
    const err = new Error('New slot is not open');
    err.code = 'slot_unavailable';
    throw err;
  }
  db.prepare(`UPDATE bookings SET reschedule_requested_slot_id = ?, updated_at = datetime('now') WHERE id = ?`).run(newSlotId, booking.id);
}

export function rejectReschedule(booking) {
  db.prepare(`UPDATE bookings SET reschedule_requested_slot_id = NULL, updated_at = datetime('now') WHERE id = ?`).run(booking.id);
}

// Approve a pending reschedule: release the old slot, lock the new one, move
// the booking onto it. `forceMajeure` skips the reschedule_count increment
// (unlimited weather/force-majeure reschedules don't use up the one free one).
export function approveReschedule(booking, forceMajeure = false) {
  const newSlotId = booking.reschedule_requested_slot_id;
  if (!newSlotId) {
    const err = new Error('No reschedule request pending');
    err.code = 'no_reschedule_request';
    throw err;
  }
  if (isSlotOccupied(newSlotId)) {
    const err = new Error('New slot already has an accepted booking');
    err.code = 'slot_locked';
    throw err;
  }
  const newSlot = getSlot(newSlotId);
  const oldSlot = getSlot(booking.slot_id);

  if (oldSlot?.lock_status === 'locked') unlockSlot(booking.slot_id);
  lockSlot(newSlotId);

  db.prepare(
    `UPDATE bookings SET slot_id = ?, shoot_date = ?, reschedule_requested_slot_id = NULL,
       reschedule_count = reschedule_count + ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(newSlotId, newSlot.date, forceMajeure ? 0 : 1, booking.id);
}
