"use strict";

const { db } = require("../config/db");

async function getHealth(req, res) {
  try {
    const dbInfo = await db.one("SELECT NOW() AS time, current_database() AS db, version() AS ver");
    res.json({
      status: "ok",
      database: "PostgreSQL",
      db: dbInfo.db,
      time: dbInfo.time,
      version: dbInfo.ver.split(" ").slice(0, 2).join(" "),
    });
  } catch (error) {
    res.status(500).json({ status: "error", error: error.message });
  }
}

module.exports = {
  getHealth,
};
