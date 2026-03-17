"use strict";

const { db } = require("../config/db");

const TYPE_OPTIONS = ["POPULAR", "FLEXIBLE", "PREMIUM", "INTENSIVE", "BEGINNER", "ADVANCED"];
const MODE_OPTIONS = ["ONLINE", "OFFLINE", "HYBRID"];

function normalizeBatch(input = {}) {
  return {
    batch_name: String(input.batch_name || "").trim(),
    type: String(input.type || "POPULAR").trim().toUpperCase(),
    trainer: String(input.trainer || "").trim(),
    days: String(input.days || "").trim(),
    start_time: input.start_time || null,
    end_time: input.end_time || null,
    fee: Number(input.fee || 0),
    mode: String(input.mode || "ONLINE").trim().toUpperCase(),
  };
}

function validateBatch(batch) {
  const errors = [];
  if (!batch.batch_name) errors.push("batch_name is required");
  if (!batch.days) errors.push("days is required");
  if (!batch.start_time) errors.push("start_time is required");
  if (!batch.end_time) errors.push("end_time is required");
  if (!Number.isFinite(batch.fee) || batch.fee < 0) errors.push("fee must be a valid non-negative number");
  if (!TYPE_OPTIONS.includes(batch.type)) errors.push(`type must be one of ${TYPE_OPTIONS.join(", ")}`);
  if (!MODE_OPTIONS.includes(batch.mode)) errors.push(`mode must be one of ${MODE_OPTIONS.join(", ")}`);
  return errors;
}

async function listBatches(req, res) {
  try {
    const rows = await db.all(`
      SELECT id, batch_name, type, trainer, days, start_time, end_time, fee, mode
      FROM batches
      ORDER BY id ASC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function createBatch(req, res) {
  try {
    const batch = normalizeBatch(req.body);
    const errors = validateBatch(batch);
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });

    const created = await db.one(
      `INSERT INTO batches (batch_name, type, trainer, days, start_time, end_time, fee, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, batch_name, type, trainer, days, start_time, end_time, fee, mode`,
      [batch.batch_name, batch.type, batch.trainer, batch.days, batch.start_time, batch.end_time, batch.fee, batch.mode]
    );
    res.status(201).json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function updateBatch(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid batch id" });

    const batch = normalizeBatch(req.body);
    const errors = validateBatch(batch);
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });

    const updated = await db.one(
      `UPDATE batches
       SET batch_name=$1, type=$2, trainer=$3, days=$4, start_time=$5, end_time=$6, fee=$7, mode=$8
       WHERE id=$9
       RETURNING id, batch_name, type, trainer, days, start_time, end_time, fee, mode`,
      [batch.batch_name, batch.type, batch.trainer, batch.days, batch.start_time, batch.end_time, batch.fee, batch.mode, id]
    );

    if (!updated) return res.status(404).json({ error: "Batch not found" });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

async function deleteBatch(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid batch id" });

    const deleted = await db.one("DELETE FROM batches WHERE id=$1 RETURNING id", [id]);
    if (!deleted) return res.status(404).json({ error: "Batch not found" });
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

module.exports = {
  TYPE_OPTIONS,
  MODE_OPTIONS,
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
};
