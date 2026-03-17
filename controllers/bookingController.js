"use strict";

const { db } = require("../config/db");
const { paginate } = require("../services/dataAccessService");

async function listBookings(req, res) {
  try {
    const { search = "", status = "All", month = "All", batch = "All", page = 1, limit = 15 } = req.query;
    const paging = paginate(page, limit);
    const conditions = [];
    const params = [];
    let parameterIndex = 1;

    if (search) {
      conditions.push(`(student_name ILIKE $${parameterIndex} OR phone LIKE $${parameterIndex})`);
      params.push(`%${search}%`);
      parameterIndex += 1;
    }

    if (status !== "All") {
      conditions.push(`status = $${parameterIndex}`);
      params.push(status);
      parameterIndex += 1;
    }

    if (month !== "All") {
      conditions.push(`month = $${parameterIndex}`);
      params.push(month);
      parameterIndex += 1;
    }

    if (batch !== "All") {
      conditions.push(`batch_name = $${parameterIndex}`);
      params.push(batch);
      parameterIndex += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = (
      await db.one(`SELECT COUNT(*)::int AS n FROM bookings ${whereClause}`, params)
    ).n;
    const data = await db.all(
      `SELECT *
       FROM bookings
       ${whereClause}
       ORDER BY id DESC
       LIMIT $${parameterIndex} OFFSET $${parameterIndex + 1}`,
      [...params, paging.limit, paging.offset]
    );

    res.json({ data, total, page: paging.page, limit: paging.limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateBooking(req, res) {
  try {
    const bookingId = Number(req.params.id);
    const { timing_scheduled, status, notes } = req.body;
    const booking = await db.one(
      `UPDATE bookings
       SET timing_scheduled = COALESCE($1, timing_scheduled),
           status = COALESCE($2, status),
           notes = COALESCE($3, notes)
       WHERE id = $4
       RETURNING *`,
      [timing_scheduled, status, notes, bookingId]
    );

    if (!booking) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listBookings,
  updateBooking,
};
