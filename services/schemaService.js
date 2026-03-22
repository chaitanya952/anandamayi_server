"use strict";

const bcrypt = require("bcryptjs");
const { db } = require("../config/db");

async function ensureStudentSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      sno SERIAL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT DEFAULT '',
      course TEXT DEFAULT '',
      batch_id INTEGER,
      batch_name TEXT DEFAULT '',
      timing_preferred TEXT DEFAULT '',
      timing_scheduled TEXT DEFAULT '',
      payment_status TEXT NOT NULL DEFAULT 'Pending',
      location TEXT DEFAULT 'India',
      month TEXT DEFAULT 'March',
      notes TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      join_date TIMESTAMP DEFAULT NOW(),
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS sno SERIAL`).catch(() => {});
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS name TEXT`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS phone TEXT`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS course TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS batch_id INTEGER`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS timing_preferred TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS timing_scheduled TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Pending'`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'India'`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS month TEXT DEFAULT 'March'`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active'`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS join_date TIMESTAMP DEFAULT NOW()`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.run(`ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);
}

async function ensureBatchSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id SERIAL PRIMARY KEY,
      batch_name TEXT NOT NULL,
      name TEXT,
      type TEXT NOT NULL DEFAULT 'POPULAR',
      days TEXT NOT NULL DEFAULT '',
      start_time TIME,
      end_time TIME,
      fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'ONLINE',
      timing TEXT DEFAULT '',
      trainer TEXT DEFAULT '',
      max_seats INTEGER NOT NULL DEFAULT 20,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      qr_code TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS batch_name TEXT`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS name TEXT`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'POPULAR'`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS days TEXT NOT NULL DEFAULT ''`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS start_time TIME`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS end_time TIME`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS fee NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ONLINE'`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS timing TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS trainer TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS max_seats INTEGER NOT NULL DEFAULT 20`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS qr_code TEXT`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()`);

  await db.run(`
    UPDATE batches
    SET batch_name = COALESCE(batch_name, name, 'Batch ' || id::text)
    WHERE batch_name IS NULL
  `).catch(() => {});

  await db.run(`
    UPDATE batches
    SET name = COALESCE(name, batch_name, 'Batch ' || id::text)
    WHERE name IS NULL
  `).catch(() => {});
}

async function ensureBookingSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      student_id INTEGER,
      student_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      batch_name TEXT DEFAULT '',
      timing_preferred TEXT DEFAULT '',
      timing_scheduled TEXT DEFAULT '',
      month TEXT DEFAULT 'March',
      booking_date TIMESTAMP NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Pending',
      notes TEXT DEFAULT ''
    )
  `);

  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS student_id INTEGER`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS student_name TEXT`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS timing_preferred TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS timing_scheduled TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS month TEXT DEFAULT 'March'`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_date TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Pending'`);
  await db.run(`ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`);
}

async function ensurePaymentSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      student_id INTEGER,
      student_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      batch_name TEXT DEFAULT '',
      amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      mode TEXT DEFAULT 'UPI',
      payment_method TEXT DEFAULT 'UPI',
      transaction_id TEXT DEFAULT '',
      payment_date TIMESTAMP NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'Confirmed',
      notes TEXT DEFAULT ''
    )
  `);

  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS student_id INTEGER`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS student_name TEXT`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS batch_name TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'UPI'`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'UPI'`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS transaction_id TEXT DEFAULT ''`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_date TIMESTAMP NOT NULL DEFAULT NOW()`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Confirmed'`);
  await db.run(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`);
}

async function ensureQrCodeSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS qrcodes (
      id SERIAL PRIMARY KEY,
      label TEXT NOT NULL,
      upi_id TEXT NOT NULL,
      batch_name TEXT NOT NULL DEFAULT 'All',
      amount NUMERIC(10,2),
      active BOOLEAN NOT NULL DEFAULT FALSE,
      audience TEXT NOT NULL DEFAULT 'all'
    )
  `);

  await db.run(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS label TEXT`);
  await db.run(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS upi_id TEXT`);
  await db.run(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS batch_name TEXT NOT NULL DEFAULT 'All'`);
  await db.run(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2)`);
  await db.run(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT FALSE`);
  await db.run(`ALTER TABLE qrcodes ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'all'`);
}

async function ensureSettingsSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    )
  `);

  await db.run(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS key TEXT`).catch(() => {});
  await db.run(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS value TEXT NOT NULL DEFAULT ''`);

  await db.run(`
    INSERT INTO settings (key, value)
    VALUES
      ('adminEmail', ''),
      ('smtpUser', ''),
      ('smtpPass', ''),
      ('instagramVerifyToken', 'ananadamayi_verify_token'),
      ('instagramPageAccessToken', ''),
      ('instagramGraphApiVersion', 'v22.0'),
      ('instagramPaymentLink', ''),
      ('instagramRegistrationFormUrl', ''),
      ('instagramPrivacyPolicyUrl', ''),
      ('instagramFollowupNote', '30th of this month')
    ON CONFLICT (key) DO NOTHING
  `);
}

async function ensureDashboardView() {
  await db.run(`DROP VIEW IF EXISTS dashboard_stats`);
  await db.run(`
    CREATE VIEW dashboard_stats AS
    SELECT
      (SELECT COUNT(*)::int FROM students) AS total_students,
      (SELECT COUNT(*)::int FROM students WHERE payment_status = 'Paid') AS paid_count,
      (SELECT COUNT(*)::int FROM students WHERE payment_status <> 'Paid' OR payment_status IS NULL) AS pending_count,
      (SELECT COALESCE(SUM(amount), 0)::numeric FROM payments WHERE status = 'Confirmed') AS total_revenue,
      (SELECT COUNT(*)::int FROM batches WHERE active = TRUE) AS active_batches,
      (SELECT COUNT(*)::int FROM bookings) AS total_bookings
  `);
}

async function ensureAdminSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    )
  `);

  await db.run(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS username TEXT`);
  await db.run(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  await db.run(`
    UPDATE admins
    SET password_hash = $1
    WHERE password_hash IS NULL AND username = $2
  `, [bcrypt.hashSync("anandamayi123", 12), "harshini"]).catch(() => {});
  await db.run(`
    SELECT setval(
      pg_get_serial_sequence('admins', 'id'),
      COALESCE((SELECT MAX(id) FROM admins), 1),
      true
    )
  `).catch(() => {});

  const admin = await db.one("SELECT id FROM admins WHERE username = $1", ["admin"]);
  if (!admin) {
    await db.run("INSERT INTO admins (username, password_hash) VALUES ($1, $2)", [
      "admin",
      bcrypt.hashSync("admin123", 12),
    ]);
  }

  const defaultAdmin = await db.one("SELECT id FROM admins WHERE username = $1", ["admin"]);
  if (defaultAdmin) {
    await db.run("UPDATE admins SET password_hash = COALESCE(password_hash, $1), username = COALESCE(username, $2) WHERE id = $3", [
      bcrypt.hashSync("admin123", 12),
      "admin",
      defaultAdmin.id,
    ]);
  }
}

async function ensureCoreSchema() {
  await ensureStudentSchema();
  await ensureBatchSchema();
  await ensureBookingSchema();
  await ensurePaymentSchema();
  await ensureQrCodeSchema();
  await ensureSettingsSchema();
  await ensureAdminSchema();
  await ensureDashboardView();
}

module.exports = { ensureCoreSchema };
