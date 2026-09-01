import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'data', 'vienna.db');

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS photographers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  instagram_handle TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  portfolio_url TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1,
  lock_status TEXT NOT NULL DEFAULT 'open' CHECK (lock_status IN ('open','locked')),
  calendar_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, start_time, end_time)
);

CREATE TABLE IF NOT EXISTS wardrobe_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT,
  is_available INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wardrobe_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wardrobe_item_id INTEGER NOT NULL REFERENCES wardrobe_items(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photographer_id INTEGER REFERENCES photographers(id),
  type TEXT NOT NULL CHECK (type IN ('commission','mutual')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected')),
  pipeline_stage TEXT NOT NULL DEFAULT 'requested'
    CHECK (pipeline_stage IN ('requested','confirmed','shot','awaiting_delivery','delivered','done')),
  slot_id INTEGER NOT NULL REFERENCES availability_slots(id),
  shoot_date TEXT NOT NULL,
  shoot_type TEXT CHECK (shoot_type IN ('outdoor','commercial','event','other')),
  location TEXT,
  style_category TEXT,
  wardrobe_item_id INTEGER REFERENCES wardrobe_items(id),
  purpose TEXT,
  quote_amount INTEGER,
  shoot_hours REAL,
  photographer_name TEXT NOT NULL,
  photographer_contact TEXT,
  admin_notes TEXT,
  is_public_experience INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS booking_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reference_image','portfolio_sample')),
  file_path TEXT,
  external_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  category TEXT,
  caption TEXT,
  is_public INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_booking_id INTEGER REFERENCES bookings(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS style_gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  style_name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// migration: an earlier schema version named this column for Google Calendar before
// the user chose iCloud sync — rename it in place if an existing db.file still has it.
const slotColumns = db.prepare(`PRAGMA table_info(availability_slots)`).all();
if (slotColumns.some((c) => c.name === 'google_calendar_event_id')) {
  db.exec(`ALTER TABLE availability_slots RENAME COLUMN google_calendar_event_id TO calendar_event_id`);
}

// migration: deposit / cancellation / reschedule state, kept as separate columns
// (not folded into `status`) so payment, booking-approval and calendar-lock stay
// independently trackable, per the deposit & cancellation policy feature.
const bookingColumns = db.prepare(`PRAGMA table_info(bookings)`).all().map((c) => c.name);
const bookingColumnsToAdd = [
  ["payment_status", `TEXT NOT NULL DEFAULT 'not_required'`],
  ["deposit_amount", "INTEGER"],
  ["balance_amount", "INTEGER"],
  ["deposit_due_at", "TEXT"],
  ["deposit_paid_at", "TEXT"],
  ["balance_paid_at", "TEXT"],
  ["cancellation_status", `TEXT NOT NULL DEFAULT 'none'`],
  ["cancelled_at", "TEXT"],
  ["cancellation_reason", "TEXT"],
  ["refund_amount", "INTEGER"],
  ["reschedule_count", "INTEGER NOT NULL DEFAULT 0"],
  ["reschedule_requested_slot_id", "INTEGER"],
  ["access_token", "TEXT"]
];
for (const [name, def] of bookingColumnsToAdd) {
  if (!bookingColumns.includes(name)) {
    db.exec(`ALTER TABLE bookings ADD COLUMN ${name} ${def}`);
  }
}
// backfill access_token for any rows created before this column existed
const untokened = db.prepare(`SELECT id FROM bookings WHERE access_token IS NULL`).all();
if (untokened.length) {
  const setToken = db.prepare(`UPDATE bookings SET access_token = ? WHERE id = ?`);
  for (const row of untokened) {
    setToken.run(crypto.randomUUID().replace(/-/g, ''), row.id);
  }
}

const settingDefaults = {
  collaboration_rules_text:
    '互惠合作需先提供您的作品集與拍攝企劃，經審核通過後才會確認；委託拍攝只需符合下方拍攝規範並議定報價即可送出邀約。',
  content_disclaimer_text: '僅接一般時裝／人像拍攝，不接受尺度、裸露或性暗示相關內容之委託或合作。',
  pricing_card: '[]',
  cancellation_policy_text:
    '拍攝日前 7 天以上取消：預約金全額退還\n拍攝日前 3～6 天取消：退還預約金 50%\n拍攝日前 72 小時內取消／當日取消或未到場：預約金不退\n由本人取消：預約金全額退還\n天災、極端天候或重大不可抗力：雙方協議改期，預約金保留至新的拍攝日期',
  reschedule_policy_text:
    '拍攝日前 72 小時以上提出，可免費改期一次，原預約金直接轉移至新日期，不需重新支付。第二次改期申請需經本人另行同意。'
};

const insertSetting = db.prepare(
  `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
);
for (const [key, value] of Object.entries(settingDefaults)) {
  insertSetting.run(key, value);
}
