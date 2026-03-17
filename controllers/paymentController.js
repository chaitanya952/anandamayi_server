"use strict";

const { db } = require("../config/db");
const { getTableColumns, paginate } = require("../services/dataAccessService");

async function listPayments(req, res) {
  try {
    const { search = "", status = "All", page = 1, limit = 15 } = req.query;
    const paging = paginate(page, limit);
    const conditions = [];
    const params = [];
    let parameterIndex = 1;

    if (search) {
      conditions.push(`(student_name ILIKE $${parameterIndex} OR transaction_id ILIKE $${parameterIndex} OR phone LIKE $${parameterIndex})`);
      params.push(`%${search}%`);
      parameterIndex += 1;
    }

    if (status !== "All") {
      conditions.push(`status = $${parameterIndex}`);
      params.push(status);
      parameterIndex += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = (
      await db.one(`SELECT COUNT(*)::int AS n FROM payments ${whereClause}`, params)
    ).n;
    const revenueRow = await db.one(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS t
       FROM payments
       WHERE status = 'Confirmed'${conditions.length ? ` AND ${conditions.join(" AND ")}` : ""}`,
      params
    );
    const data = await db.all(
      `SELECT *
       FROM payments
       ${whereClause}
       ORDER BY id DESC
       LIMIT $${parameterIndex} OFFSET $${parameterIndex + 1}`,
      [...params, paging.limit, paging.offset]
    );

    res.json({
      data,
      total,
      totalRevenue: parseFloat(revenueRow.t || 0),
      page: paging.page,
      limit: paging.limit,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createPayment(req, res) {
  try {
    const {
      student_id,
      student_name,
      phone,
      batch_name,
      amount,
      mode = "UPI",
      transaction_id = "",
      status = "Confirmed",
      notes = "",
    } = req.body;

    const payment = await db.one(
      `INSERT INTO payments
       (student_id, student_name, phone, batch_name, amount, mode, transaction_id, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [student_id || null, student_name, phone, batch_name, amount, mode, transaction_id, status, notes]
    );

    if (status === "Confirmed" && student_id) {
      await db.run("UPDATE students SET payment_status = 'Paid', updated_at = NOW() WHERE id = $1", [student_id]);
    }

    res.status(201).json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updatePayment(req, res) {
  try {
    const paymentId = Number(req.params.id);
    const { student_name, phone, batch_name, amount, mode, transaction_id, status, notes } = req.body;

    const payment = await db.one(
      `UPDATE payments
       SET student_name = COALESCE($1, student_name),
           phone = COALESCE($2, phone),
           batch_name = COALESCE($3, batch_name),
           amount = COALESCE($4, amount),
           mode = COALESCE($5, mode),
           transaction_id = COALESCE($6, transaction_id),
           status = COALESCE($7, status),
           notes = COALESCE($8, notes)
       WHERE id = $9
       RETURNING *`,
      [student_name, phone, batch_name, amount, mode, transaction_id, status, notes, paymentId]
    );

    if (!payment) {
      return res.status(404).json({ error: "Not found" });
    }

    if (status === "Confirmed" && payment.student_id) {
      await db.run("UPDATE students SET payment_status = 'Paid', updated_at = NOW() WHERE id = $1", [payment.student_id]);
    }

    res.json(payment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function confirmPublicPayment(req, res) {
  try {
    const { studentId, phone, amount, transactionId, mode = "UPI", batch_name } = req.body;
    const studentColumns = await getTableColumns("students");
    const paymentColumns = await getTableColumns("payments");
    const bookingColumns = await getTableColumns("bookings");
    const student = studentId
      ? await db.one("SELECT * FROM students WHERE id = $1", [studentId])
      : phone
        ? await db.one("SELECT * FROM students WHERE phone = $1 LIMIT 1", [phone])
        : null;

    const insertColumns = [];
    const insertValues = [];
    const params = [];

    const pushField = (columnName, value) => {
      insertColumns.push(columnName);
      params.push(value);
      insertValues.push(`$${params.length}`);
    };

    if (paymentColumns.has("student_id")) pushField("student_id", student?.id || null);
    if (paymentColumns.has("student_name")) pushField("student_name", student?.name || "Unknown");
    if (paymentColumns.has("phone")) pushField("phone", phone || student?.phone || "");
    if (paymentColumns.has("batch_name")) pushField("batch_name", batch_name || student?.batch_name || "");
    if (paymentColumns.has("amount")) pushField("amount", amount || 0);
    if (paymentColumns.has("mode")) pushField("mode", mode);
    if (paymentColumns.has("payment_method")) pushField("payment_method", mode);
    if (paymentColumns.has("transaction_id")) pushField("transaction_id", transactionId || "");
    if (paymentColumns.has("status")) pushField("status", "Confirmed");

    const payment = await db.one(
      `INSERT INTO payments (${insertColumns.join(",")})
       VALUES (${insertValues.join(",")})
       RETURNING *`,
      params
    );

    if (student && studentColumns.has("payment_status")) {
      await db.run("UPDATE students SET payment_status = 'Paid' WHERE id = $1", [student.id]);
    }

    if (student && bookingColumns.has("status") && bookingColumns.has("student_id")) {
      await db.run("UPDATE bookings SET status = 'Confirmed' WHERE student_id = $1", [student.id]);
    }

    res.json({ ok: true, payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listPayments,
  createPayment,
  updatePayment,
  confirmPublicPayment,
};
