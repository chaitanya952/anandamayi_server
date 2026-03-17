"use strict";

const bcrypt = require("bcryptjs");
const { db } = require("../config/db");

async function ensureBatchSchema() {
  await db.run(`
    CREATE TABLE IF NOT EXISTS batches (
      id SERIAL PRIMARY KEY,
      batch_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'POPULAR',
      days TEXT NOT NULL DEFAULT '',
      start_time TIME,
      end_time TIME,
      fee NUMERIC(10,2) NOT NULL DEFAULT 0,
      mode TEXT NOT NULL DEFAULT 'ONLINE'
    )
  `);

  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS batch_name TEXT`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'POPULAR'`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS days TEXT NOT NULL DEFAULT ''`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS start_time TIME`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS end_time TIME`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS fee NUMERIC(10,2) NOT NULL DEFAULT 0`);
  await db.run(`ALTER TABLE batches ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ONLINE'`);

  await db.run(`
    UPDATE batches
    SET batch_name = COALESCE(batch_name, name, 'Batch ' || id::text)
    WHERE batch_name IS NULL
  `).catch(() => {});
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
  await ensureBatchSchema();
  await ensureAdminSchema();
}

module.exports = { ensureCoreSchema };
