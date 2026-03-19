"use strict";

const { db } = require("../config/db");
const { getBatchNameColumn, paginate } = require("../services/dataAccessService");

function formatAdmissionRecord(row) {
  if (!row) return row;

  const admissionDate = row.created_at
    ? new Date(row.created_at).toISOString().slice(0, 10)
    : "";

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email || "",
    course: row.course || "",
    batch: row.batch_name || "",
    admissionDate,
    paymentStatus: row.payment_status || "Pending",
    status: row.status || "Active",
    notes: row.notes || "",
  };
}

async function listStudents(req, res) {
  try {
    const {
      search = "",
      status = "All",
      batch = "All",
      month = "All",
      page = 1,
      limit = 15,
      sortBy = "id",
      sortDir = "ASC",
    } = req.query;

    const sortAliases = {
      batch: "batch_name",
      paymentStatus: "payment_status",
      admissionDate: "created_at",
      course: "course",
    };
    const normalizedSortBy = sortAliases[sortBy] || sortBy;
    const safeColumns = ["id", "name", "phone", "email", "course", "batch_name", "payment_status", "month", "created_at"];
    const column = safeColumns.includes(normalizedSortBy) ? normalizedSortBy : "id";
    const direction = String(sortDir).toUpperCase() === "DESC" ? "DESC" : "ASC";
    const paging = paginate(page, limit);
    const conditions = [];
    const params = [];
    let parameterIndex = 1;

    if (search) {
      conditions.push(`(name ILIKE $${parameterIndex} OR phone LIKE $${parameterIndex} OR email ILIKE $${parameterIndex})`);
      params.push(`%${search}%`);
      parameterIndex += 1;
    }

    if (status !== "All") {
      conditions.push(`payment_status = $${parameterIndex}`);
      params.push(status);
      parameterIndex += 1;
    }

    if (batch !== "All") {
      conditions.push(`batch_name = $${parameterIndex}`);
      params.push(batch);
      parameterIndex += 1;
    }

    if (month !== "All") {
      conditions.push(`month = $${parameterIndex}`);
      params.push(month);
      parameterIndex += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const total = (
      await db.one(`SELECT COUNT(*)::int AS n FROM students ${whereClause}`, params)
    ).n;
    const data = await db.all(
      `SELECT *
       FROM students
       ${whereClause}
       ORDER BY ${column} ${direction}
       LIMIT $${parameterIndex} OFFSET $${parameterIndex + 1}`,
      [...params, paging.limit, paging.offset]
    );

    const records = data.map(formatAdmissionRecord);

    res.json({ success: true, records, data, total, page: paging.page, limit: paging.limit });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createStudent(req, res) {
  try {
    const {
      name,
      phone,
      email = "",
      course = "",
      batch_name,
      batch,
      timing_preferred = "",
      timing_scheduled = "",
      payment_status = "Pending",
      paymentStatus,
      location = "India",
      month = "March",
      notes = "",
    } = req.body;

    const normalizedCourse = course || "";
    const normalizedBatch = batch_name || batch || "";
    const normalizedPaymentStatus = paymentStatus || payment_status || "Pending";

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone required" });
    }

    const batchNameColumn = await getBatchNameColumn();
    const matchedBatch = batchNameColumn
      ? await db.one(`SELECT id FROM batches WHERE ${batchNameColumn} = $1`, [normalizedBatch])
      : null;
    const student = await db.one(
      `INSERT INTO students
       (name, phone, email, course, batch_id, batch_name, timing_preferred, timing_scheduled, payment_status, location, month, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'Active')
       RETURNING *`,
      [
        String(name).trim(),
        String(phone).trim(),
        email,
        normalizedCourse,
        matchedBatch?.id || null,
        normalizedBatch,
        timing_preferred,
        timing_scheduled,
        normalizedPaymentStatus,
        location,
        month,
        notes,
      ]
    );

    await db.run(
      `INSERT INTO bookings
       (student_id, student_name, phone, batch_name, timing_preferred, timing_scheduled, month, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        student.id,
        student.name,
        student.phone,
        student.batch_name,
        timing_preferred,
        timing_scheduled,
        month,
        normalizedPaymentStatus === "Paid" ? "Confirmed" : "Pending",
      ]
    );

    res.status(201).json({ success: true, record: formatAdmissionRecord(student), student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateStudent(req, res) {
  try {
    const studentId = Number(req.params.id);
    const {
      name,
      phone,
      email,
      course,
      batch_name,
      batch,
      timing_preferred,
      timing_scheduled,
      payment_status,
      paymentStatus,
      location,
      month,
      status,
      notes,
    } = req.body;
    const normalizedCourse = course;
    const normalizedBatch = batch_name || batch;
    const normalizedPaymentStatus = paymentStatus || payment_status;

    const student = await db.one(
      `UPDATE students
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           course = COALESCE($4, course),
           batch_name = COALESCE($5, batch_name),
           timing_preferred = COALESCE($6, timing_preferred),
           timing_scheduled = COALESCE($7, timing_scheduled),
           payment_status = COALESCE($8, payment_status),
           location = COALESCE($9, location),
           month = COALESCE($10, month),
           status = COALESCE($11, status),
           notes = COALESCE($12, notes),
           updated_at = NOW()
       WHERE id = $13
       RETURNING *`,
      [
        name,
        phone,
        email,
        normalizedCourse,
        normalizedBatch,
        timing_preferred,
        timing_scheduled,
        normalizedPaymentStatus,
        location,
        month,
        status,
        notes,
        studentId,
      ]
    );

    if (!student) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ success: true, record: formatAdmissionRecord(student), student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteStudent(req, res) {
  try {
    await db.run("DELETE FROM students WHERE id = $1", [Number(req.params.id)]);
    res.json({ success: true, ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
};
