"use strict";

const XLSX = require("xlsx");
const { pool, db } = require("../config/db");
const { getBatchNameColumn, hasTableColumn } = require("../services/dataAccessService");

function formatImportRecord(row) {
  return {
    name: row.name || "",
    phone: row.phone || "",
    email: row.email || "",
    course: row.course || "",
    batch: row.batch || row.batch_name || "",
    paymentStatus: row.paymentStatus || row.payment_status || "Pending",
    status: row.status || "Active",
  };
}

async function previewImport(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const preview = [];
    const errors = [];

    for (const sheetName of workbook.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });

      for (const row of rows) {
        const keys = Object.keys(row);
        const nameKey = keys.find((key) => /name/i.test(key));
        const phoneKey = keys.find((key) => /phone|mobile|contact/i.test(key));
        const courseKey = keys.find((key) => /^course$/i.test(key)) || keys.find((key) => /course/i.test(key));
        const batchKey = keys.find((key) => /^batch$/i.test(key)) || keys.find((key) => /batch/i.test(key));
        const paymentKey = keys.find((key) => /pay|status/i.test(key));
        const timingKey = keys.find((key) => /timing|time|slot/i.test(key));
        const monthKey = keys.find((key) => /month/i.test(key));

        if (!nameKey || !phoneKey) {
          continue;
        }

        const name = String(row[nameKey] || "").trim();
        const phone = String(row[phoneKey] || "").replace(/\s+/g, "").trim();

        if (!name) {
          errors.push("Row missing name");
          continue;
        }

        if (!phone) {
          errors.push(`${name}: missing phone`);
          continue;
        }

        preview.push({
          name,
          phone,
          course: courseKey ? String(row[courseKey]).trim() : "",
          batch_name: batchKey ? String(row[batchKey]).trim() : "Online Weekend",
          payment_status: String(row[paymentKey] || "").toLowerCase().includes("paid") ? "Paid" : "Pending",
          timing_preferred: timingKey ? String(row[timingKey]).trim() : "",
          month: monthKey ? String(row[monthKey]).trim() : "March",
          email: "",
          location: phone.startsWith("+") ? "Abroad" : "India",
        });
      }
    }

    res.json({
      success: true,
      records: preview.map(formatImportRecord),
      preview,
      errors,
      total: preview.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function confirmImport(req, res) {
  try {
    const { records } = req.body;

    if (!Array.isArray(records)) {
      return res.status(400).json({ error: "Invalid payload" });
    }

    let imported = 0;
    let skipped = 0;
    const batchNameColumn = await getBatchNameColumn();
    const hasActiveColumn = await hasTableColumn("batches", "active");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      for (const record of records) {
        const normalizedRecord = {
          name: record.name,
          phone: record.phone,
          email: record.email || "",
          course: record.course || "",
          batch_name: record.batch_name || record.batch || "",
          timing_preferred: record.timing_preferred || "",
          payment_status: record.payment_status || record.paymentStatus || "Pending",
          location: record.location || "India",
          month: record.month || "March",
        };

        if (!normalizedRecord.name || !normalizedRecord.phone) {
          skipped += 1;
          continue;
        }

        const existingStudent = await client.query(
          "SELECT id FROM students WHERE phone = $1 AND batch_name = $2",
          [normalizedRecord.phone, normalizedRecord.batch_name]
        );

        if (existingStudent.rows.length) {
          skipped += 1;
          continue;
        }

        const batch = batchNameColumn
          ? await client.query(
              `SELECT id
               FROM batches
               WHERE ${batchNameColumn} = $1${hasActiveColumn ? " AND active = TRUE" : ""}`,
              [normalizedRecord.batch_name]
            )
          : { rows: [] };

        const studentResult = await client.query(
          `INSERT INTO students
           (name, phone, email, course, batch_id, batch_name, timing_preferred, payment_status, location, month, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Active')
           RETURNING id, name, phone, course, batch_name`,
          [
            normalizedRecord.name,
            normalizedRecord.phone,
            normalizedRecord.email,
            normalizedRecord.course,
            batch.rows[0]?.id || null,
            normalizedRecord.batch_name,
            normalizedRecord.timing_preferred,
            normalizedRecord.payment_status,
            normalizedRecord.location,
            normalizedRecord.month,
          ]
        );

        const student = studentResult.rows[0];

        await client.query(
          `INSERT INTO bookings
           (student_id, student_name, phone, batch_name, timing_preferred, month, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            student.id,
            student.name,
            student.phone,
            student.batch_name,
            normalizedRecord.timing_preferred,
            normalizedRecord.month,
            normalizedRecord.payment_status === "Paid" ? "Confirmed" : "Pending",
          ]
        );

        imported += 1;
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    res.json({ success: true, imported, skipped, total: imported + skipped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function exportRecords(req, res) {
  try {
    const { type } = req.params;
    let rows;
    let filename;
    let sheetName;

    if (type === "students" || type === "admissions") {
      rows = await db.all(`
        SELECT sno AS "S.No", name AS "Name", phone AS "Phone", email AS "Email", course AS "Course", batch_name AS "Batch",
               timing_preferred AS "Timing Preferred", timing_scheduled AS "Timing Scheduled",
               payment_status AS "Payment Status", location AS "Location", month AS "Month",
               status AS "Status", TO_CHAR(created_at, 'DD/MM/YYYY') AS "Joined"
        FROM students
        ORDER BY id
      `);
      filename = "Anandamayi_Students.xlsx";
      sheetName = "Students";
    } else if (type === "payments") {
      rows = await db.all(`
        SELECT id AS "ID", student_name AS "Student", phone AS "Phone", batch_name AS "Batch",
               amount AS "Amount", mode AS "Mode", transaction_id AS "Transaction ID",
               TO_CHAR(payment_date, 'DD/MM/YYYY') AS "Date", status AS "Status"
        FROM payments
        ORDER BY id
      `);
      filename = "Anandamayi_Payments.xlsx";
      sheetName = "Payments";
    } else if (type === "bookings") {
      rows = await db.all(`
        SELECT id AS "ID", student_name AS "Student", phone AS "Phone", batch_name AS "Batch",
               timing_preferred AS "Timing Preferred", timing_scheduled AS "Timing Scheduled",
               month AS "Month", TO_CHAR(booking_date, 'DD/MM/YYYY') AS "Date", status AS "Status"
        FROM bookings
        ORDER BY id
      `);
      filename = "Anandamayi_Bookings.xlsx";
      sheetName = "Bookings";
    } else {
      return res.status(400).json({ error: "Invalid type" });
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet["!cols"] = Object.keys(rows[0] || {}).map((key) => ({ wch: Math.max(key.length, 16) }));
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  previewImport,
  confirmImport,
  exportRecords,
};
