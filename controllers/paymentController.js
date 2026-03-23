"use strict";

const crypto = require("crypto");
const { db } = require("../config/db");
const { getTableColumns, paginate } = require("../services/dataAccessService");
const Stripe = require("stripe");

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

function getFrontendUrl() {
  return process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173";
}

async function getSettingsMap(keys = []) {
  if (!keys.length) return {};
  const rows = await db.all(
    `SELECT key, value
     FROM settings
     WHERE key = ANY($1)`,
    [keys]
  ).catch(() => []);
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

async function getRazorpayConfig() {
  const settings = await getSettingsMap([
    "razorpayKeyId",
    "razorpayKeySecret",
    "razorpayWebhookSecret",
  ]);

  return {
    keyId: settings.razorpayKeyId || process.env.RAZORPAY_KEY_ID || "",
    keySecret: settings.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET || "",
    webhookSecret: settings.razorpayWebhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET || "",
  };
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function verifyRazorpaySignature({ orderId, paymentId, signature, secret }) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  return expected === signature;
}

function verifyRazorpayWebhookSignature({ rawBody, signature, secret }) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  return expected === signature;
}

async function persistConfirmedPayment({ studentId, phone, amount, transactionId, mode = "Stripe", batch_name, notes = "" }) {
  const normalizedTransactionId = String(transactionId || "").trim() || null;
  const normalizedPhone = String(phone || "").trim();
  const normalizedBatchName = String(batch_name || "").trim();
  const studentColumns = await getTableColumns("students");
  const paymentColumns = await getTableColumns("payments");
  const bookingColumns = await getTableColumns("bookings");
  const student = studentId
    ? await db.one("SELECT * FROM students WHERE id = $1", [studentId])
    : normalizedPhone && normalizedBatchName
      ? await db.one(
          `SELECT *
           FROM students
           WHERE phone = $1
             AND LOWER(TRIM(COALESCE(batch_name, ''))) = LOWER(TRIM($2))
           ORDER BY id DESC
           LIMIT 1`,
          [normalizedPhone, normalizedBatchName]
        )
      : normalizedPhone
        ? await db.one("SELECT * FROM students WHERE phone = $1 ORDER BY id DESC LIMIT 1", [normalizedPhone])
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
  if (paymentColumns.has("phone")) pushField("phone", normalizedPhone || student?.phone || "");
  if (paymentColumns.has("batch_name")) pushField("batch_name", normalizedBatchName || student?.batch_name || "");
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
  } else if (studentColumns.has("payment_status") && normalizedPhone && normalizedBatchName) {
    await db.run(
      `UPDATE students
       SET payment_status = 'Paid'
       WHERE phone = $1
         AND LOWER(TRIM(COALESCE(batch_name, ''))) = LOWER(TRIM($2))`,
      [normalizedPhone, normalizedBatchName]
    );
  }

  if (student && bookingColumns.has("status") && bookingColumns.has("student_id")) {
    await db.run("UPDATE bookings SET status = 'Confirmed' WHERE student_id = $1", [student.id]);
  } else if (bookingColumns.has("status") && bookingColumns.has("phone") && bookingColumns.has("batch_name") && normalizedPhone && normalizedBatchName) {
    await db.run(
      `UPDATE bookings
       SET status = 'Confirmed'
       WHERE phone = $1
         AND LOWER(TRIM(COALESCE(batch_name, ''))) = LOWER(TRIM($2))`,
      [normalizedPhone, normalizedBatchName]
    );
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
    const normalizedTransactionId = String(transactionId || "").trim();

    if (!normalizedTransactionId) {
      return res.status(400).json({ error: "Transaction ID is required for UPI payment confirmation." });
    }

    const result = await persistConfirmedPayment({
      studentId,
      phone,
      amount,
      transactionId: normalizedTransactionId,
      mode,
      batch_name,
    });

    res.json({ ok: true, payment: result.payment, message: "Payment confirmed successfully." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createRazorpayOrder(req, res) {
  try {
    const { keyId, keySecret } = await getRazorpayConfig();
    if (!keyId || !keySecret) {
      return res.status(500).json({ error: "Razorpay is not configured on the server." });
    }

    const { studentId, phone, amount, batch_name, studentName, email } = req.body;
    const numericAmount = Number(amount);

    if (!batch_name || !numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: "Batch name and amount are required." });
    }

    const receipt = `adm_${Date.now()}`.slice(0, 40);
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: buildBasicAuthHeader(keyId, keySecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: Math.round(numericAmount * 100),
        currency: "INR",
        receipt,
        notes: {
          studentId: String(studentId || ""),
          phone: String(phone || ""),
          batch_name: String(batch_name || ""),
          amount: String(numericAmount),
          studentName: String(studentName || ""),
          email: String(email || ""),
        },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(response.status).json({ error: payload.error?.description || "Unable to create Razorpay order." });
    }

    res.json({
      ok: true,
      keyId,
      order: payload,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function verifyRazorpayPayment(req, res) {
  try {
    const { keySecret } = await getRazorpayConfig();
    if (!keySecret) {
      return res.status(500).json({ error: "Razorpay is not configured on the server." });
    }

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      studentId,
      phone,
      amount,
      batch_name,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Razorpay payment details are required." });
    }

    const valid = verifyRazorpaySignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      secret: keySecret,
    });

    if (!valid) {
      return res.status(400).json({ error: "Invalid Razorpay payment signature." });
    }

    const result = await persistConfirmedPayment({
      studentId,
      phone,
      amount,
      transactionId: razorpay_payment_id,
      mode: "Razorpay",
      batch_name,
      notes: `Razorpay order ${razorpay_order_id}`,
    });

    res.json({ ok: true, payment: result.payment, message: "Razorpay payment verified." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function handleRazorpayWebhook(req, res) {
  try {
    const { webhookSecret } = await getRazorpayConfig();
    if (!webhookSecret) {
      return res.status(500).json({ error: "Razorpay webhook secret is not configured." });
    }

    const signature = req.headers["x-razorpay-signature"];
    const rawBody = req.rawBody || "";
    if (!signature || !rawBody) {
      return res.status(400).json({ error: "Missing Razorpay webhook signature." });
    }

    const valid = verifyRazorpayWebhookSignature({
      rawBody,
      signature: String(signature),
      secret: webhookSecret,
    });

    if (!valid) {
      return res.status(400).json({ error: "Invalid Razorpay webhook signature." });
    }

    const event = req.body || {};
    if (event.event === "payment.captured") {
      const entity = event.payload?.payment?.entity || {};
      const notes = entity.notes || {};
      await persistConfirmedPayment({
        studentId: notes.studentId ? Number(notes.studentId) : null,
        phone: notes.phone || entity.contact || "",
        amount: notes.amount ? Number(notes.amount) : Number(entity.amount || 0) / 100,
        transactionId: entity.id,
        mode: "Razorpay",
        batch_name: notes.batch_name || "",
        notes: `Razorpay webhook payment.captured for order ${entity.order_id || ""}`.trim(),
      });
    }

    res.json({ ok: true });
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
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
  createStripeCheckoutSession,
  confirmStripeCheckoutSession,
};
