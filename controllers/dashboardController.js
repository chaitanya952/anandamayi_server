"use strict";

const { db } = require("../config/db");
const { getBatchNameColumn, hasTableColumn } = require("../services/dataAccessService");

async function getAdminStats(req, res) {
  try {
    const stats = await db.one("SELECT * FROM dashboard_stats");
    const batchNameColumn = await getBatchNameColumn();
    const hasActiveColumn = await hasTableColumn("batches", "active");
    const batchBreakdown = batchNameColumn
      ? await db.all(`
          SELECT b.${batchNameColumn} AS name,
                 b.max_seats,
                 b.fee,
                 b.mode,
                 COUNT(s.id)::int AS enrolled
          FROM batches b
          LEFT JOIN students s ON s.batch_name = b.${batchNameColumn}
          ${hasActiveColumn ? "WHERE b.active = TRUE" : ""}
          GROUP BY b.id
          ORDER BY enrolled DESC
        `)
      : [];
    const recentStudents = await db.all(`
      SELECT id, name, phone, batch_name, payment_status, month, created_at
      FROM students
      ORDER BY id DESC
      LIMIT 8
    `);

    res.json({
      totalStudents: parseInt(stats.total_students, 10),
      paid: parseInt(stats.paid_count, 10),
      pending: parseInt(stats.pending_count, 10),
      revenue: parseFloat(stats.total_revenue),
      activeBatches: parseInt(stats.active_batches, 10),
      totalBookings: parseInt(stats.total_bookings, 10),
      batchBreakdown,
      recentStudents,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getAdminStats,
};
