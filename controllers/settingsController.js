"use strict";

const { pool, db } = require("../config/db");

async function getSettings(req, res) {
  try {
    const rows = await db.all("SELECT key, value FROM settings");
    res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateSettings(req, res) {
  try {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const [key, value] of Object.entries(req.body)) {
        await client.query(
          `INSERT INTO settings (key, value)
           VALUES ($1, $2)
           ON CONFLICT (key) DO UPDATE SET value = $2`,
          [key, String(value)]
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    const rows = await db.all("SELECT key, value FROM settings");
    res.json(Object.fromEntries(rows.map((row) => [row.key, row.value])));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getSettings,
  updateSettings,
};
