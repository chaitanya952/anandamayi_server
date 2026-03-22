"use strict";

const { db } = require("../config/db");
const { getTableColumns, paginate } = require("../services/dataAccessService");
const Stripe = require("stripe");

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function getFrontendUrl() {
  return process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
}

async function persistConfirmedPayment({ studentId, phone, amount, transactionId, mode = "Stripe", batch_name, notes = "" }) {
  const normalizedTransactionId = String(transactionId || "").trim() || null;
  const studentColumns = await getTableColumns("students");
  const paymentColumns = await getTableColumns("payments");
  const bookingColumns = await getTableColumns("bookings");
  const student = studentId
    ? await db.one("SELECT * FROM students WHERE id = $1", [studentId])
    : phone
      ? await db.one("SELECT * FROM students WHERE phone = $1 LIMIT 1", [phone])
      : null;

  if (normalizedTransactionId && paymentColumns.has("transaction_id")) {
    const existingPayment = await db.one("SELECT * FROM payments WHERE transaction_id = $1 LIMIT 1", [normalizedTransactionId]);
    if (existingPayment) {
      return { ok: true, payment: existingPayment, student };
    }
  }

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
  if (paymentColumns.has("transaction_id")) pushField("transaction_id", normalizedTransactionId);
  if (paymentColumns.has("status")) pushField("status", "Confirmed");
  if (paymentColumns.has("notes")) pushField("notes", notes);

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

  return { ok: true, payment, student };
}

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
    const normalizedTransactionId = String(transaction_id || "").trim() || null;

    const payment = await db.one(
      `INSERT INTO payments
       (student_id, student_name, phone, batch_name, amount, mode, transaction_id, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [student_id || null, student_name, phone, batch_name, amount, mode, normalizedTransactionId, status, notes]
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
    const normalizedTransactionId = typeof transaction_id === "undefined"
      ? undefined
      : (String(transaction_id || "").trim() || null);

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
      [student_name, phone, batch_name, amount, mode, normalizedTransactionId, status, notes, paymentId]
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
    const result = await persistConfirmedPayment({
      studentId,
      phone,
      amount,
      transactionId: String(transactionId || "").trim(),
      mode,
      batch_name,
    });

    res.json({ ok: true, payment: result.payment, message: "Payment confirmed successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createStripeCheckoutSession(req, res) {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured on the server." });
    }

    const { studentId, phone, amount, batch_name, studentName } = req.body;
    const numericAmount = Number(amount);

    if (!batch_name || !numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: "Batch name and amount are required." });
    }

    const frontendUrl = getFrontendUrl().replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: `${frontendUrl}/?stripe_status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/?stripe_status=cancelled&tab=Payment`,
      payment_method_types: ["card"],
      customer_email: req.body.email || undefined,
      metadata: {
        studentId: String(studentId || ""),
        phone: String(phone || ""),
        batch_name: String(batch_name || ""),
        amount: String(numericAmount),
        studentName: String(studentName || ""),
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "inr",
            unit_amount: Math.round(numericAmount * 100),
            product_data: {
              name: `${batch_name} Admission`,
              description: "Anandamayi Nrutyalaya Stripe payment",
            },
          },
        },
      ],
    });

    res.json({ ok: true, url: session.url, sessionId: session.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function confirmStripeCheckoutSession(req, res) {
  try {
    if (!stripe) {
      return res.status(500).json({ error: "Stripe is not configured on the server." });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required." });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({ error: "Stripe payment has not been completed." });
    }

    const metadata = session.metadata || {};
    const result = await persistConfirmedPayment({
      studentId: metadata.studentId ? Number(metadata.studentId) : null,
      phone: metadata.phone || "",
      amount: metadata.amount ? Number(metadata.amount) : (session.amount_total || 0) / 100,
      transactionId: String(session.payment_intent || session.id),
      mode: "Stripe",
      batch_name: metadata.batch_name || "",
      notes: `Stripe checkout session ${session.id}`,
    });

    res.json({
      ok: true,
      payment: result.payment,
      student: result.student,
      batch_name: metadata.batch_name || result.payment?.batch_name || "",
      amount: metadata.amount ? Number(metadata.amount) : (session.amount_total || 0) / 100,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listPayments,
  createPayment,
  updatePayment,
  confirmPublicPayment,
  createStripeCheckoutSession,
  confirmStripeCheckoutSession,
};
