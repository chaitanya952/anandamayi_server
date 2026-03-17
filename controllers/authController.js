"use strict";

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { db } = require("../config/db");
const { JWT_SECRET } = require("../middleware/auth");

async function adminLogin(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const admin = await db.one("SELECT * FROM admins WHERE username = $1", [username]);
    const validPassword = admin && (
      (admin.password_hash && bcrypt.compareSync(password, admin.password_hash)) ||
      (admin.password && password === admin.password)
    );

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: "admin" },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token, username: admin.username });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function updateAdminPassword(req, res) {
  try {
    const { current, newPassword } = req.body;

    if (!current || !newPassword) {
      return res.status(400).json({ error: "Current and new password are required" });
    }

    const admin = await db.one("SELECT * FROM admins WHERE id = $1", [req.user.id]);
    const currentPasswordMatches = admin && (
      (admin.password_hash && bcrypt.compareSync(current, admin.password_hash)) ||
      (admin.password && current === admin.password)
    );

    if (!currentPasswordMatches) {
      return res.status(400).json({ error: "Current password incorrect" });
    }

    await db.run("UPDATE admins SET password_hash = $1 WHERE id = $2", [
      bcrypt.hashSync(newPassword, 12),
      req.user.id,
    ]);

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

module.exports = {
  adminLogin,
  updateAdminPassword,
};
