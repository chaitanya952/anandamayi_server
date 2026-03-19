"use strict";

const { db } = require("../config/db");

async function getActiveQr(req, res) {
  try {
    const batch = req.query.batch || "";
    const audience = String(req.query.audience || "all").toLowerCase();
    const qrCode = await db.one(
      `SELECT *
       FROM qrcodes
       WHERE active = TRUE
         AND (batch_name = $1 OR batch_name = 'All')
         AND (LOWER(COALESCE(audience, 'all')) = $2 OR LOWER(COALESCE(audience, 'all')) = 'all')
       ORDER BY (batch_name = $1) DESC,
                (LOWER(COALESCE(audience, 'all')) = $2) DESC
       LIMIT 1`,
      [batch, audience]
    );

    res.json(qrCode || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function listQrCodes(req, res) {
  try {
    res.json(await db.all("SELECT * FROM qrcodes ORDER BY id"));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function createQrCode(req, res) {
  try {
    const { label, upi_id, batch_name = "All", amount, audience = "all" } = req.body;

    if (!label || !upi_id) {
      return res.status(400).json({ error: "Label and UPI ID required" });
    }

    const normalizedAudience = ["all", "new", "existing"].includes(String(audience).toLowerCase())
      ? String(audience).toLowerCase()
      : "all";

    const qrCode = await db.one(
      `INSERT INTO qrcodes (label, upi_id, batch_name, amount, active, audience)
       VALUES ($1, $2, $3, $4, FALSE, $5)
       RETURNING *`,
      [label, upi_id, batch_name, amount || null, normalizedAudience]
    );

    res.status(201).json(qrCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateQrCode(req, res) {
  try {
    const qrCodeId = Number(req.params.id);
    const { label, upi_id, batch_name, amount, active, audience } = req.body;
    const normalizedAudience = audience === undefined
      ? undefined
      : (["all", "new", "existing"].includes(String(audience).toLowerCase())
          ? String(audience).toLowerCase()
          : "all");

    if (active === true) {
      const currentQrCode = await db.one("SELECT batch_name, audience FROM qrcodes WHERE id = $1", [qrCodeId]);
      if (currentQrCode) {
        await db.run(
          "UPDATE qrcodes SET active = FALSE WHERE batch_name = $1 AND LOWER(COALESCE(audience, 'all')) = LOWER(COALESCE($2, 'all'))",
          [currentQrCode.batch_name, currentQrCode.audience || "all"]
        );
      }
    }

    const qrCode = await db.one(
      `UPDATE qrcodes
       SET label = COALESCE($1, label),
           upi_id = COALESCE($2, upi_id),
           batch_name = COALESCE($3, batch_name),
           amount = COALESCE($4, amount),
           active = COALESCE($5, active),
           audience = COALESCE($6, audience)
       WHERE id = $7
       RETURNING *`,
      [label, upi_id, batch_name, amount, active, normalizedAudience, qrCodeId]
    );

    if (!qrCode) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(qrCode);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function deleteQrCode(req, res) {
  try {
    await db.run("DELETE FROM qrcodes WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  getActiveQr,
  listQrCodes,
  createQrCode,
  updateQrCode,
  deleteQrCode,
};
