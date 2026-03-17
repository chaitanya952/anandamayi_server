"use strict";

const { db } = require("../config/db");
const { findBatchByName, getTableColumns } = require("../services/dataAccessService");

async function registerStudent(req, res) {
  try {
    const { name, phone, batch_name, email = "", timing_preferred = "" } = req.body;

    if (!name || !phone || !batch_name) {
      return res.status(400).json({ error: "Name, phone and batch required" });
    }

    const studentColumns = await getTableColumns("students");
    const bookingColumns = await getTableColumns("bookings");
    const existingStudent = studentColumns.has("batch_name")
      ? await db.one("SELECT id FROM students WHERE phone = $1 AND batch_name = $2", [phone, batch_name])
      : await db.one("SELECT id FROM students WHERE phone = $1", [phone]);

    if (existingStudent) {
      return res.status(409).json({ error: "Student already registered" });
    }

    const batch = await findBatchByName(batch_name);
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

    if (studentColumns.has("name")) pushField("name", String(name).trim());
    if (studentColumns.has("phone")) pushField("phone", String(phone).trim());
    if (studentColumns.has("email")) pushField("email", email);
    if (studentColumns.has("batch_id")) pushField("batch_id", batch.id ?? null);
    if (studentColumns.has("batch_name")) pushField("batch_name", batch_name);
    if (studentColumns.has("timing_preferred")) pushField("timing_preferred", timing_preferred);
    if (studentColumns.has("payment_status")) pushField("payment_status", "Pending");
    if (studentColumns.has("status")) pushField("status", "Active");

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
      if (bookingColumns.has("student_name")) pushBookingField("student_name", student.name || String(name).trim());
      if (bookingColumns.has("phone")) pushBookingField("phone", student.phone || String(phone).trim());
      if (bookingColumns.has("batch_name")) pushBookingField("batch_name", batch_name);
      if (bookingColumns.has("timing_preferred")) pushBookingField("timing_preferred", timing_preferred);
      if (bookingColumns.has("month")) pushBookingField("month", "March");
      if (bookingColumns.has("status")) pushBookingField("status", "Pending");

      if (bookingInsertColumns.length) {
        await db.run(
          `INSERT INTO bookings (${bookingInsertColumns.join(",")})
           VALUES (${bookingInsertValues.join(",")})`,
          bookingParams
        );
      }
    }

    res.status(201).json({ ok: true, studentId: student.id, batch });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function studentLogin(req, res) {
  try {
    const { phone, batch_name } = req.body;

    if (!phone || !batch_name) {
      return res.status(400).json({ error: "Phone and batch are required" });
    }

    const studentColumns = await getTableColumns("students");
    const student = studentColumns.has("batch_name")
      ? await db.one(
          `SELECT *
           FROM students
           WHERE phone = $1 AND batch_name = $2
           ORDER BY id DESC
           LIMIT 1`,
          [String(phone).trim(), batch_name]
        )
      : await db.one(
          `SELECT *
           FROM students
           WHERE phone = $1
           ORDER BY id DESC
           LIMIT 1`,
          [String(phone).trim()]
        );

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
