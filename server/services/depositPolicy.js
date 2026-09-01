const DEPOSIT_RATE = 0.3;
const DEPOSIT_MIN = 500;
const DEPOSIT_DUE_HOURS = 24;
const FULL_REFUND_HOURS = 24 * 7; // 7 days
const HALF_REFUND_HOURS = 72; // 3 days

// 拍攝總額 -> 預約金／尾款（30%，四捨五入至百位，最低 NT$500）
export function calcDeposit(totalAmount) {
  if (totalAmount === null || totalAmount === undefined || totalAmount === '') {
    return { deposit: null, balance: null };
  }
  const total = Number(totalAmount);
  const raw = total * DEPOSIT_RATE;
  const roundedToHundred = Math.round(raw / 100) * 100;
  const deposit = Math.min(Math.max(roundedToHundred, DEPOSIT_MIN), total);
  return { deposit, balance: total - deposit };
}

export function depositDueAt(from = new Date()) {
  return new Date(from.getTime() + DEPOSIT_DUE_HOURS * 60 * 60 * 1000).toISOString();
}

export function isDepositExpired(booking, now = new Date()) {
  if (booking.payment_status !== 'awaiting_deposit' || !booking.deposit_due_at) return false;
  return now.getTime() > new Date(booking.deposit_due_at).getTime();
}

function hoursUntilShoot(booking, now = new Date()) {
  const slotStart = new Date(`${booking.shoot_date}T00:00:00+08:00`);
  return (slotStart.getTime() - now.getTime()) / (60 * 60 * 1000);
}

// 依「誰取消」與距拍攝日的時間，計算應退金額（只在已收到預約金時才有金額可退）
export function calcRefundAmount(booking, cancelledBy, now = new Date()) {
  const paid = booking.payment_status === 'deposit_paid' || booking.payment_status === 'balance_paid';
  if (!paid) return 0;
  const deposit = booking.deposit_amount || 0;

  if (cancelledBy === 'model') return deposit; // 本人取消一律全額退還

  const hoursLeft = hoursUntilShoot(booking, now);
  if (hoursLeft >= FULL_REFUND_HOURS) return deposit;
  if (hoursLeft >= HALF_REFUND_HOURS) return Math.round(deposit * 0.5 / 100) * 100;
  return 0; // 72 小時內／當日／未到場
}

// 是否符合「免費改期」資格（拍攝日前 72 小時以上，且尚未用過一次）
export function isFreeRescheduleEligible(booking, now = new Date()) {
  if (booking.reschedule_count > 0) return false;
  return hoursUntilShoot(booking, now) >= HALF_REFUND_HOURS;
}

export { DEPOSIT_RATE, DEPOSIT_MIN, DEPOSIT_DUE_HOURS, FULL_REFUND_HOURS, HALF_REFUND_HOURS };
