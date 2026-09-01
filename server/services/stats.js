import { db } from '../db.js';

const SHOT_STAGES = "('shot','awaiting_delivery','delivered','done')";

export function getDashboardStats() {
  const shootsThisMonth = db
    .prepare(
      `SELECT COUNT(*) AS count FROM bookings
       WHERE pipeline_stage IN ${SHOT_STAGES}
         AND strftime('%Y-%m', shoot_date) = strftime('%Y-%m','now')`
    )
    .get().count;

  const typeSplit = db
    .prepare(
      `SELECT type, COUNT(*) AS count FROM bookings
       WHERE pipeline_stage IN ${SHOT_STAGES}
         AND strftime('%Y-%m', shoot_date) = strftime('%Y-%m','now')
       GROUP BY type`
    )
    .all();
  const commissionCount = typeSplit.find((r) => r.type === 'commission')?.count ?? 0;
  const mutualCount = typeSplit.find((r) => r.type === 'mutual')?.count ?? 0;

  const revenue = db
    .prepare(
      `SELECT COALESCE(SUM(quote_amount),0) AS total FROM bookings
       WHERE type = 'commission' AND pipeline_stage IN ${SHOT_STAGES}
         AND strftime('%Y-%m', shoot_date) = strftime('%Y-%m','now')`
    )
    .get().total;

  const totalHours = db
    .prepare(
      `SELECT COALESCE(SUM(shoot_hours),0) AS total FROM bookings
       WHERE pipeline_stage IN ${SHOT_STAGES}
         AND strftime('%Y-%m', shoot_date) = strftime('%Y-%m','now')`
    )
    .get().total;

  const commissionHours = db
    .prepare(
      `SELECT COALESCE(SUM(shoot_hours),0) AS total FROM bookings
       WHERE type = 'commission' AND pipeline_stage IN ${SHOT_STAGES}
         AND strftime('%Y-%m', shoot_date) = strftime('%Y-%m','now')`
    )
    .get().total;

  const avgHourlyRate = commissionHours > 0 ? Math.round((revenue / commissionHours) * 100) / 100 : 0;

  const pendingCount = db
    .prepare(`SELECT COUNT(*) AS count FROM bookings WHERE status = 'pending'`)
    .get().count;

  return {
    shootsThisMonth,
    commissionCount,
    mutualCount,
    revenue,
    totalHours,
    avgHourlyRate,
    pendingCount
  };
}
