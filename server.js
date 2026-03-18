/**
 * ═══════════════════════════════════════════════════════════════
 *  Anandamayi Dance Academy — Production Backend
 *  Node.js + Express + PostgreSQL (pg)
 *
 *  Database : PostgreSQL 16
 *  Auth     : JWT + bcrypt
 *  Port     : 5000
 *
 *  Run:  node server.js
 *  Env:  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS, JWT_SECRET
 * ═══════════════════════════════════════════════════════════════
 */

"use strict";

const express    = require("express");
const cors       = require("cors");
const { Pool }   = require("pg");
const multer     = require("multer");
const XLSX       = require("xlsx");
const jwt        = require("jsonwebtoken");
const bcrypt     = require("bcryptjs");

// ── Config ─────────────────────────────────────────────────────
const PORT       = process.env.PORT        || 5000;
const JWT_SECRET = process.env.JWT_SECRET  || "anandamayi_jwt_secret_2024";

const pool = new Pool({
  host     : process.env.DB_HOST || "localhost",
  port     : Number(process.env.DB_PORT) || 5432,
  database : process.env.DB_NAME || "dance_academy",
  user     : process.env.DB_USER || "postgres",
  password : process.env.DB_PASS || "postgres",
  max      : 10,
  idleTimeoutMillis     : 30000,
  connectionTimeoutMillis: 5000,
});

pool.connect((err, client, release) => {
  if (err) { console.error("PostgreSQL connection failed:", err.message); process.exit(1); }
  release();
  console.log("Connected to PostgreSQL");
});

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// ── DB helpers ─────────────────────────────────────────────────
const db = {
  one : async (text, params) => { const r = await pool.query(text, params); return r.rows[0] || null; },
  all : async (text, params) => { const r = await pool.query(text, params); return r.rows; },
  run : async (text, params) => pool.query(text, params),
};

function auth(req, res, next) {
  const token = ((req.headers.authorization || "").replace("Bearer ", "") || req.query.token || "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Invalid token" }); }
}

function paginate(page = 1, limit = 15) {
  const p = Math.max(1, parseInt(page)  || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit) || 15));
  return { limit: l, offset: (p - 1) * l, page: p };
}

// ─── AUTH ──────────────────────────────────────────────────────
app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await db.one("SELECT * FROM admins WHERE username = $1", [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password_hash))
      return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: admin.id, username: admin.username, role: "admin" }, JWT_SECRET, { expiresIn: "24h" });
    res.json({ token, username: admin.username });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── DASHBOARD ─────────────────────────────────────────────────
app.get("/api/admin/stats", auth, async (req, res) => {
  try {
    const stats = await db.one("SELECT * FROM dashboard_stats");
    const batchBreakdown = await db.all(`
      SELECT b.name, b.max_seats, b.fee, b.mode, COUNT(s.id)::int AS enrolled
      FROM batches b LEFT JOIN students s ON s.batch_name = b.name
      WHERE b.active = TRUE GROUP BY b.id ORDER BY enrolled DESC`);
    const recentStudents = await db.all(
      "SELECT id, name, phone, batch_name, payment_status, month, created_at FROM students ORDER BY id DESC LIMIT 8");
    res.json({
      totalStudents : parseInt(stats.total_students),
      paid          : parseInt(stats.paid_count),
      pending       : parseInt(stats.pending_count),
      revenue       : parseFloat(stats.total_revenue),
      activeBatches : parseInt(stats.active_batches),
      totalBookings : parseInt(stats.total_bookings),
      batchBreakdown, recentStudents,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── STUDENTS ──────────────────────────────────────────────────
app.get("/api/admin/students", auth, async (req, res) => {
  try {
    const { search="", status="All", batch="All", month="All",
            page=1, limit=15, sortBy="id", sortDir="ASC" } = req.query;
    const SAFE = ["id","name","phone","batch_name","payment_status","month","created_at"];
    const col  = SAFE.includes(sortBy) ? sortBy : "id";
    const dir  = sortDir.toUpperCase() === "DESC" ? "DESC" : "ASC";
    const { limit: lim, offset, page: pg } = paginate(page, limit);
    const conds = []; const params = []; let pi = 1;
    if (search) { conds.push(`(name ILIKE $${pi} OR phone LIKE $${pi} OR email ILIKE $${pi})`); params.push(`%${search}%`); pi++; }
    if (status !== "All") { conds.push(`payment_status = $${pi}`); params.push(status); pi++; }
    if (batch  !== "All") { conds.push(`batch_name = $${pi}`);     params.push(batch);  pi++; }
    if (month  !== "All") { conds.push(`month = $${pi}`);          params.push(month);  pi++; }
    const where  = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const total  = (await db.one(`SELECT COUNT(*)::int AS n FROM students ${where}`, params)).n;
    const data   = await db.all(`SELECT * FROM students ${where} ORDER BY ${col} ${dir} LIMIT $${pi} OFFSET $${pi+1}`, [...params, lim, offset]);
    res.json({ data, total, page: pg, limit: lim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/students", auth, async (req, res) => {
  try {
    const { name, phone, email="", batch_name, timing_preferred="", timing_scheduled="",
            payment_status="Pending", location="India", month="March", notes="" } = req.body;
    if (!name || !phone) return res.status(400).json({ error: "Name and phone required" });
    const batch = await db.one("SELECT id FROM batches WHERE name = $1", [batch_name]);
    const s = await db.one(`
      INSERT INTO students (name,phone,email,batch_id,batch_name,timing_preferred,timing_scheduled,payment_status,location,month,notes,status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Active') RETURNING *`,
      [name.trim(), phone.trim(), email, batch?.id||null, batch_name, timing_preferred, timing_scheduled, payment_status, location, month, notes]);
    await db.run(`INSERT INTO bookings (student_id,student_name,phone,batch_name,timing_preferred,timing_scheduled,month,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [s.id, s.name, s.phone, s.batch_name, timing_preferred, timing_scheduled, month, payment_status==="Paid"?"Confirmed":"Pending"]);
    res.status(201).json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/students/:id", auth, async (req, res) => {
  try {
    const { name,phone,email,batch_name,timing_preferred,timing_scheduled,payment_status,location,month,status,notes } = req.body;
    const s = await db.one(`
      UPDATE students SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
        batch_name=COALESCE($4,batch_name), timing_preferred=COALESCE($5,timing_preferred),
        timing_scheduled=COALESCE($6,timing_scheduled), payment_status=COALESCE($7,payment_status),
        location=COALESCE($8,location), month=COALESCE($9,month), status=COALESCE($10,status),
        notes=COALESCE($11,notes), updated_at=NOW() WHERE id=$12 RETURNING *`,
      [name,phone,email,batch_name,timing_preferred,timing_scheduled,payment_status,location,month,status,notes, parseInt(req.params.id)]);
    if (!s) return res.status(404).json({ error: "Not found" });
    res.json(s);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/students/:id", auth, async (req, res) => {
  try {
    await db.run("DELETE FROM students WHERE id=$1", [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BATCHES ───────────────────────────────────────────────────
app.get("/api/batches", async (req, res) => {
  try {
    res.json(await db.all(`SELECT b.*, COUNT(s.id)::int AS enrolled FROM batches b LEFT JOIN students s ON s.batch_name=b.name WHERE b.active=TRUE GROUP BY b.id ORDER BY b.id`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/admin/batches", auth, async (req, res) => {
  try {
    res.json(await db.all(`SELECT b.*, COUNT(s.id)::int AS enrolled FROM batches b LEFT JOIN students s ON s.batch_name=b.name GROUP BY b.id ORDER BY b.id`));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/batches", auth, async (req, res) => {
  try {
    const { name, timing, trainer, max_seats=20, fee=0, mode="Online" } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    res.status(201).json(await db.one(`INSERT INTO batches (name,timing,trainer,max_seats,fee,mode,active) VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING *`, [name,timing,trainer,max_seats,fee,mode]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/batches/:id", auth, async (req, res) => {
  try {
    const { name,timing,trainer,max_seats,fee,mode,active } = req.body;
    const b = await db.one(`UPDATE batches SET name=COALESCE($1,name), timing=COALESCE($2,timing), trainer=COALESCE($3,trainer), max_seats=COALESCE($4,max_seats), fee=COALESCE($5,fee), mode=COALESCE($6,mode), active=COALESCE($7,active), updated_at=NOW() WHERE id=$8 RETURNING *`,
      [name,timing,trainer,max_seats,fee,mode,active, parseInt(req.params.id)]);
    if (!b) return res.status(404).json({ error: "Not found" });
    res.json(b);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/batches/:id", auth, async (req, res) => {
  try {
    await db.run("UPDATE batches SET active=FALSE, updated_at=NOW() WHERE id=$1", [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PAYMENTS ──────────────────────────────────────────────────
app.get("/api/admin/payments", auth, async (req, res) => {
  try {
    const { search="", status="All", page=1, limit=15 } = req.query;
    const { limit: lim, offset, page: pg } = paginate(page, limit);
    const conds=[]; const params=[]; let pi=1;
    if (search) { conds.push(`(student_name ILIKE $${pi} OR transaction_id ILIKE $${pi} OR phone LIKE $${pi})`); params.push(`%${search}%`); pi++; }
    if (status !== "All") { conds.push(`status=$${pi}`); params.push(status); pi++; }
    const where  = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const total  = (await db.one(`SELECT COUNT(*)::int AS n FROM payments ${where}`, params)).n;
    const revRow = await db.one(`SELECT COALESCE(SUM(amount),0)::numeric AS t FROM payments WHERE status='Confirmed'${conds.length?" AND "+conds.join(" AND "):""}`, params);
    const data   = await db.all(`SELECT * FROM payments ${where} ORDER BY id DESC LIMIT $${pi} OFFSET $${pi+1}`, [...params, lim, offset]);
    res.json({ data, total, totalRevenue: parseFloat(revRow.t||0), page: pg, limit: lim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/payments", auth, async (req, res) => {
  try {
    const { student_id, student_name, phone, batch_name, amount, mode="UPI", transaction_id="", status="Confirmed", notes="" } = req.body;
    const p = await db.one(`INSERT INTO payments (student_id,student_name,phone,batch_name,amount,mode,transaction_id,status,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [student_id||null, student_name, phone, batch_name, amount, mode, transaction_id, status, notes]);
    if (status==="Confirmed" && student_id)
      await db.run("UPDATE students SET payment_status='Paid', updated_at=NOW() WHERE id=$1", [student_id]);
    res.status(201).json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/payments/:id", auth, async (req, res) => {
  try {
    const { student_name,phone,batch_name,amount,mode,transaction_id,status,notes } = req.body;
    const p = await db.one(`UPDATE payments SET student_name=COALESCE($1,student_name), phone=COALESCE($2,phone), batch_name=COALESCE($3,batch_name), amount=COALESCE($4,amount), mode=COALESCE($5,mode), transaction_id=COALESCE($6,transaction_id), status=COALESCE($7,status), notes=COALESCE($8,notes) WHERE id=$9 RETURNING *`,
      [student_name,phone,batch_name,amount,mode,transaction_id,status,notes, parseInt(req.params.id)]);
    if (!p) return res.status(404).json({ error: "Not found" });
    if (status==="Confirmed" && p.student_id)
      await db.run("UPDATE students SET payment_status='Paid', updated_at=NOW() WHERE id=$1", [p.student_id]);
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── BOOKINGS ──────────────────────────────────────────────────
app.get("/api/admin/bookings", auth, async (req, res) => {
  try {
    const { search="", status="All", month="All", batch="All", page=1, limit=15 } = req.query;
    const { limit: lim, offset, page: pg } = paginate(page, limit);
    const conds=[]; const params=[]; let pi=1;
    if (search) { conds.push(`(student_name ILIKE $${pi} OR phone LIKE $${pi})`); params.push(`%${search}%`); pi++; }
    if (status !== "All") { conds.push(`status=$${pi}`); params.push(status); pi++; }
    if (month  !== "All") { conds.push(`month=$${pi}`);  params.push(month);  pi++; }
    if (batch  !== "All") { conds.push(`batch_name=$${pi}`); params.push(batch); pi++; }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const total = (await db.one(`SELECT COUNT(*)::int AS n FROM bookings ${where}`, params)).n;
    const data  = await db.all(`SELECT * FROM bookings ${where} ORDER BY id DESC LIMIT $${pi} OFFSET $${pi+1}`, [...params, lim, offset]);
    res.json({ data, total, page: pg, limit: lim });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/bookings/:id", auth, async (req, res) => {
  try {
    const { timing_scheduled, status, notes } = req.body;
    const b = await db.one(`UPDATE bookings SET timing_scheduled=COALESCE($1,timing_scheduled), status=COALESCE($2,status), notes=COALESCE($3,notes) WHERE id=$4 RETURNING *`,
      [timing_scheduled, status, notes, parseInt(req.params.id)]);
    if (!b) return res.status(404).json({ error: "Not found" });
    res.json(b);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── QR CODES ──────────────────────────────────────────────────
app.get("/api/qr/active", async (req, res) => {
  try {
    const { batch="" } = req.query;
    const qr = await db.one(`SELECT * FROM qrcodes WHERE active=TRUE AND (batch_name=$1 OR batch_name='All') ORDER BY (batch_name=$1) DESC LIMIT 1`, [batch]);
    res.json(qr || null);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/admin/qrcodes", auth, async (req, res) => {
  try { res.json(await db.all("SELECT * FROM qrcodes ORDER BY id")); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/qrcodes", auth, async (req, res) => {
  try {
    const { label, upi_id, batch_name="All", amount } = req.body;
    if (!label || !upi_id) return res.status(400).json({ error: "Label and UPI ID required" });
    res.status(201).json(await db.one(`INSERT INTO qrcodes (label,upi_id,batch_name,amount,active) VALUES ($1,$2,$3,$4,FALSE) RETURNING *`, [label, upi_id, batch_name, amount||null]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/qrcodes/:id", auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { label, upi_id, batch_name, amount, active } = req.body;
    if (active === true) {
      const qr = await db.one("SELECT batch_name FROM qrcodes WHERE id=$1", [id]);
      if (qr) await db.run("UPDATE qrcodes SET active=FALSE WHERE batch_name=$1", [qr.batch_name]);
    }
    const updated = await db.one(`UPDATE qrcodes SET label=COALESCE($1,label), upi_id=COALESCE($2,upi_id), batch_name=COALESCE($3,batch_name), amount=COALESCE($4,amount), active=COALESCE($5,active) WHERE id=$6 RETURNING *`,
      [label, upi_id, batch_name, amount, active, id]);
    if (!updated) return res.status(404).json({ error: "Not found" });
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete("/api/admin/qrcodes/:id", auth, async (req, res) => {
  try {
    await db.run("DELETE FROM qrcodes WHERE id=$1", [parseInt(req.params.id)]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── IMPORT ────────────────────────────────────────────────────
app.post("/api/admin/import/preview", auth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const results=[]; const errors=[];
    for (const sheetName of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
      for (const row of rows) {
        const nameKey  = Object.keys(row).find(k => /name/i.test(k));
        const phoneKey = Object.keys(row).find(k => /phone|mobile|contact/i.test(k));
        const batchKey = Object.keys(row).find(k => /batch|type|course/i.test(k));
        const payKey   = Object.keys(row).find(k => /pay|status/i.test(k));
        const timingKey= Object.keys(row).find(k => /timing|time|slot/i.test(k));
        const monthKey = Object.keys(row).find(k => /month/i.test(k));
        if (!nameKey || !phoneKey) continue;
        const name  = String(row[nameKey] ||"").trim();
        const phone = String(row[phoneKey]||"").replace(/\s+/g,"").trim();
        if (!name)  { errors.push("Row missing name"); continue; }
        if (!phone) { errors.push(`${name}: missing phone`); continue; }
        results.push({
          name, phone,
          batch_name       : batchKey  ? String(row[batchKey]).trim()  : "Online Weekend",
          payment_status   : String(row[payKey]||"").toLowerCase().includes("paid") ? "Paid" : "Pending",
          timing_preferred : timingKey ? String(row[timingKey]).trim() : "",
          month            : monthKey  ? String(row[monthKey]).trim()  : "March",
          email            : "",
          location         : phone.startsWith("+") ? "Abroad" : "India",
        });
      }
    }
    res.json({ preview: results, errors, total: results.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/import/confirm", auth, async (req, res) => {
  try {
    const { records } = req.body;
    if (!Array.isArray(records)) return res.status(400).json({ error: "Invalid payload" });
    let imported=0, skipped=0;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const r of records) {
        if (!r.name || !r.phone) { skipped++; continue; }
        const exists = await client.query("SELECT id FROM students WHERE phone=$1 AND batch_name=$2", [r.phone, r.batch_name]);
        if (exists.rows.length) { skipped++; continue; }
        const batch = await client.query("SELECT id FROM batches WHERE name=$1 AND active=TRUE", [r.batch_name]);
        const s = await client.query(`INSERT INTO students (name,phone,email,batch_id,batch_name,timing_preferred,payment_status,location,month,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'Active') RETURNING id,name,phone,batch_name`,
          [r.name, r.phone, r.email||"", batch.rows[0]?.id||null, r.batch_name, r.timing_preferred||"", r.payment_status||"Pending", r.location||"India", r.month||"March"]);
        const st = s.rows[0];
        await client.query(`INSERT INTO bookings (student_id,student_name,phone,batch_name,timing_preferred,month,status) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [st.id, st.name, st.phone, st.batch_name, r.timing_preferred||"", r.month||"March", r.payment_status==="Paid"?"Confirmed":"Pending"]);
        imported++;
      }
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
    res.json({ imported, skipped, total: imported+skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── EXPORT ────────────────────────────────────────────────────
app.get("/api/admin/export/:type", auth, async (req, res) => {
  try {
    const { type } = req.params;
    let rows, filename, sheetName;
    if (type === "students") {
      rows = await db.all(`SELECT sno AS "S.No", name AS "Name", phone AS "Phone", email AS "Email", batch_name AS "Batch", timing_preferred AS "Timing Preferred", timing_scheduled AS "Timing Scheduled", payment_status AS "Payment Status", location AS "Location", month AS "Month", status AS "Status", TO_CHAR(created_at,'DD/MM/YYYY') AS "Joined" FROM students ORDER BY id`);
      filename="Anandamayi_Students.xlsx"; sheetName="Students";
    } else if (type === "payments") {
      rows = await db.all(`SELECT id AS "ID", student_name AS "Student", phone AS "Phone", batch_name AS "Batch", amount AS "Amount", mode AS "Mode", transaction_id AS "Transaction ID", TO_CHAR(payment_date,'DD/MM/YYYY') AS "Date", status AS "Status" FROM payments ORDER BY id`);
      filename="Anandamayi_Payments.xlsx"; sheetName="Payments";
    } else if (type === "bookings") {
      rows = await db.all(`SELECT id AS "ID", student_name AS "Student", phone AS "Phone", batch_name AS "Batch", timing_preferred AS "Timing Preferred", timing_scheduled AS "Timing Scheduled", month AS "Month", TO_CHAR(booking_date,'DD/MM/YYYY') AS "Date", status AS "Status" FROM bookings ORDER BY id`);
      filename="Anandamayi_Bookings.xlsx"; sheetName="Bookings";
    } else return res.status(400).json({ error: "Invalid type" });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = Object.keys(rows[0]||{}).map(k=>({ wch: Math.max(k.length, 16) }));
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── SETTINGS ──────────────────────────────────────────────────
app.get("/api/settings", async (req, res) => {
  try {
    const rows = await db.all("SELECT key, value FROM settings");
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put("/api/admin/settings", auth, async (req, res) => {
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [k, v] of Object.entries(req.body))
        await client.query("INSERT INTO settings (key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=$2", [k, String(v)]);
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
    const rows = await db.all("SELECT key, value FROM settings");
    res.json(Object.fromEntries(rows.map(r => [r.key, r.value])));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/admin/password", auth, async (req, res) => {
  try {
    const { current, newPassword } = req.body;
    const admin = await db.one("SELECT * FROM admins WHERE id=$1", [req.user.id]);
    if (!bcrypt.compareSync(current, admin.password_hash))
      return res.status(400).json({ error: "Current password incorrect" });
    await db.run("UPDATE admins SET password_hash=$1 WHERE id=$2", [bcrypt.hashSync(newPassword, 12), req.user.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── PUBLIC REGISTRATION & PAYMENT ────────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { name, phone, batch_name, email="", timing_preferred="" } = req.body;
    if (!name || !phone || !batch_name) return res.status(400).json({ error: "Name, phone and batch required" });
    const exists = await db.one("SELECT id FROM students WHERE phone=$1 AND batch_name=$2", [phone, batch_name]);
    if (exists) return res.status(409).json({ error: "Already registered for this batch" });
    const batch = await db.one("SELECT * FROM batches WHERE name=$1 AND active=TRUE", [batch_name]);
    if (!batch) return res.status(404).json({ error: "Batch not found" });
    const s = await db.one(`INSERT INTO students (name,phone,email,batch_id,batch_name,timing_preferred,payment_status,status) VALUES ($1,$2,$3,$4,$5,$6,'Pending','Active') RETURNING *`,
      [name.trim(), phone.trim(), email, batch.id, batch_name, timing_preferred]);
    await db.run(`INSERT INTO bookings (student_id,student_name,phone,batch_name,timing_preferred,month,status) VALUES ($1,$2,$3,$4,$5,'March','Pending')`,
      [s.id, s.name, s.phone, s.batch_name, timing_preferred]);
    res.status(201).json({ ok: true, studentId: s.id, batch });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/student/login", async (req, res) => {
  try {
    const { phone, batch_name } = req.body;
    if (!phone || !batch_name) return res.status(400).json({ error: "Phone and batch are required" });
    const student = await db.one(
      "SELECT id, name, phone, email, batch_name, payment_status FROM students WHERE phone=$1 AND batch_name=$2 ORDER BY id DESC LIMIT 1",
      [phone.trim(), batch_name]
    );
    if (!student) return res.status(404).json({ error: "Student not found for this batch" });
    res.json({ ok: true, student });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/payment/confirm", async (req, res) => {
  try {
    const { studentId, phone, amount, transactionId, mode="UPI", batch_name } = req.body;
    let student = studentId ? await db.one("SELECT * FROM students WHERE id=$1", [studentId])
                            : phone ? await db.one("SELECT * FROM students WHERE phone=$1 LIMIT 1", [phone]) : null;
    const p = await db.one(`INSERT INTO payments (student_id,student_name,phone,batch_name,amount,mode,transaction_id,status) VALUES ($1,$2,$3,$4,$5,$6,$7,'Confirmed') RETURNING *`,
      [student?.id||null, student?.name||"Unknown", phone||student?.phone||"", batch_name||student?.batch_name||"", amount||0, mode, transactionId||""]);
    if (student) {
      await db.run("UPDATE students SET payment_status='Paid', updated_at=NOW() WHERE id=$1", [student.id]);
      await db.run("UPDATE bookings SET status='Confirmed' WHERE student_id=$1", [student.id]);
    }
    res.json({ ok: true, payment: p });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── HEALTH ────────────────────────────────────────────────────
app.get("/api/health", async (req, res) => {
  try {
    const dbInfo = await db.one("SELECT NOW() AS time, current_database() AS db, version() AS ver");
    res.json({ status: "ok", database: "PostgreSQL", db: dbInfo.db, time: dbInfo.time, version: dbInfo.ver.split(" ").slice(0,2).join(" ") });
  } catch (e) { res.status(500).json({ status: "error", error: e.message }); }
});

// ─── START ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Anandamayi Backend   → http://localhost:${PORT}`);
  console.log(`  Database            → PostgreSQL (anandamayi)`);
  console.log(`  Admin login          → admin / admin123`);
  console.log("═══════════════════════════════════════════════════");
});

module.exports = app;
