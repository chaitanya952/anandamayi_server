"use strict";

require("dotenv").config();

const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "anandamayi_jwt_secret_2024";

function auth(req, res, next) {
  const token = ((req.headers.authorization || "").replace("Bearer ", "") || req.query.token || "");
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { auth, JWT_SECRET };
