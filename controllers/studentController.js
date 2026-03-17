"use strict";

const { db } = require("../config/db");
const { getBatchNameColumn, paginate } = require("../services/dataAccessService");

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

    const safeColumns = ["id", "name", "phone", "batch_name", "payment_status", "month", "created_at"];
    const column = safeColumns.includes(sortBy) ? sortBy : "id";
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

    res.json({ data, total, page: paging.page, limit: paging.limit });
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
      batch_name,
      timing_preferred = "",
      timing_scheduled = "",
      payment_status = "Pending",
      location = "India",
      month = "March",
      notes = "",
    } = req.body;

    if (!name || !phone) {
      return res.status(400).json({ error: "Name and phone required" });
    }

    const batchNameColumn = await getBatchNameColumn();
    const batch = batchNameColumn
      ? await db.one(`SELECT id FROM batches WHERE ${batchNameColumn} = $1`, [batch_name])
      : null;
    const student = await db.one(
      `INSERT INTO students
       (name, phone, email, batch_id, batch_name, timing_preferred, timing_scheduled, payment_status, location, month, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Active')
       RETURNING *`,
      [
        String(name).trim(),
        String(phone).trim(),
        email,
        batch?.id || null,
        batch_name,
        timing_preferred,
        timing_scheduled,
        payment_status,
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
        payment_status === "Paid" ? "Confirmed" : "Pending",
      ]
    );

    res.status(201).json(student);
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
      batch_name,
      timing_preferred,
      timing_scheduled,
      payment_status,
      location,
      month,
      status,
      notes,
    } = req.body;

    const student = await db.one(
      `UPDATE students
       SET name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email),
           batch_name = COALESCE($4, batch_name),
           timing_preferred = COALESCE($5, timing_preferred),
           timing_scheduled = COALESCE($6, timing_scheduled),
           payment_status = COALESCE($7, payment_status),
           location = COALESCE($8, location),
           month = COALESCE($9, month),
           status = COALESCE($10, status),
           notes = COALESCE($11, notes),
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        name,
        phone,
        email,
        batch_name,
        timing_preferred,
        timing_scheduled,
        payment_status,
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

    res.json(student);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteStudent(req, res) {
  try {
    await db.run("DELETE FROM students WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
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
