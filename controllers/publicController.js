"use strict";

const { db } = require("../config/db");
const { findBatchByName, getTableColumns } = require("../services/dataAccessService");

async function registerStudent(req, res) {
  try {
    const { name, phone, batch_name, email = "", timing_preferred = "" } = req.body;
    const normalizedName = String(name || "").trim();
    const normalizedPhone = String(phone || "").trim();
    const normalizedEmail = String(email || "").trim();
    const normalizedBatchName = String(batch_name || "").trim();

    if (!normalizedName || !normalizedPhone || !normalizedBatchName) {
      return res.status(400).json({ error: "Name, phone and batch required" });
    }

    const studentColumns = await getTableColumns("students");
    const bookingColumns = await getTableColumns("bookings");
    const existingStudent = studentColumns.has("batch_name")
      ? await db.one(
          `SELECT *
           FROM students
           WHERE phone = $1
             AND LOWER(TRIM(COALESCE(batch_name, ''))) = LOWER(TRIM($2))
           ORDER BY id DESC
           LIMIT 1`,
          [normalizedPhone, normalizedBatchName]
        )
      : await db.one("SELECT * FROM students WHERE phone = $1 ORDER BY id DESC LIMIT 1", [normalizedPhone]);

    if (existingStudent) {
      return res.status(200).json({ ok: true, studentId: existingStudent.id, student: existingStudent, alreadyRegistered: true });
    }

    const batch = await findBatchByName(normalizedBatchName);
    if (!batch) {
      return res.status(404).json({ error: "Batch not found" });
    }

    const insertColumns = [];
    const insertValues = [];
    const params = [];

    const pushField = (columnName, value) => {
      insertColumns.push(columnName);
      params.push(value);
      insertValues.push(`$${params.length}`);
    };

    if (studentColumns.has("name")) pushField("name", normalizedName);
    if (studentColumns.has("phone")) pushField("phone", normalizedPhone);
    if (studentColumns.has("email")) pushField("email", normalizedEmail);
    if (studentColumns.has("batch_id")) pushField("batch_id", batch.id ?? null);
    if (studentColumns.has("batch_name")) pushField("batch_name", normalizedBatchName);
    if (studentColumns.has("timing_preferred")) pushField("timing_preferred", timing_preferred);
    if (studentColumns.has("month")) pushField("month", new Date().toLocaleString("en-US", { month: "long" }));
    if (studentColumns.has("payment_status")) pushField("payment_status", "Pending");
    if (studentColumns.has("status")) pushField("status", "Active");
    if (studentColumns.has("join_date")) pushField("join_date", new Date());

    const student = await db.one(
      `INSERT INTO students (${insertColumns.join(",")})
       VALUES (${insertValues.join(",")})
       RETURNING *`,
      params
    );

    if (bookingColumns.size) {
      const bookingInsertColumns = [];
      const bookingInsertValues = [];
      const bookingParams = [];

      const pushBookingField = (columnName, value) => {
        bookingInsertColumns.push(columnName);
        bookingParams.push(value);
        bookingInsertValues.push(`$${bookingParams.length}`);
      };

      if (bookingColumns.has("student_id")) pushBookingField("student_id", student.id);
      if (bookingColumns.has("student_name")) pushBookingField("student_name", student.name || normalizedName);
      if (bookingColumns.has("phone")) pushBookingField("phone", student.phone || normalizedPhone);
      if (bookingColumns.has("batch_name")) pushBookingField("batch_name", normalizedBatchName);
      if (bookingColumns.has("timing_preferred")) pushBookingField("timing_preferred", timing_preferred);
      if (bookingColumns.has("month")) pushBookingField("month", new Date().toLocaleString("en-US", { month: "long" }));
      if (bookingColumns.has("status")) pushBookingField("status", "Pending");

      if (bookingInsertColumns.length) {
        await db.run(
          `INSERT INTO bookings (${bookingInsertColumns.join(",")})
           VALUES (${bookingInsertValues.join(",")})`,
          bookingParams
        );
      }
    }

    res.status(201).json({ ok: true, studentId: student.id, student, batch });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function studentLogin(req, res) {
  try {
    const { phone, batch_name } = req.body;
    const normalizedPhone = String(phone || "").trim();
    const normalizedBatchName = String(batch_name || "").trim();

    if (!normalizedPhone || !normalizedBatchName) {
      return res.status(400).json({ error: "Phone and batch are required" });
    }

    const studentColumns = await getTableColumns("students");
    let student = studentColumns.has("batch_name")
      ? await db.one(
          `SELECT *
           FROM students
           WHERE phone = $1
             AND LOWER(TRIM(COALESCE(batch_name, ''))) = LOWER(TRIM($2))
           ORDER BY id DESC
           LIMIT 1`,
          [normalizedPhone, normalizedBatchName]
        )
      : await db.one(
          `SELECT *
           FROM students
           WHERE phone = $1
           ORDER BY id DESC
           LIMIT 1`,
          [normalizedPhone]
        );

    if (!student) {
      student = await db.one(
        `SELECT *
         FROM students
         WHERE phone = $1
         ORDER BY id DESC
         LIMIT 1`,
        [normalizedPhone]
      );
    }

    if (!student) {
      return res.status(404).json({ error: "Student not found for this batch" });
    }

    res.json({ ok: true, student });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  registerStudent,
  studentLogin,
};
