"use strict";

require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || "dance_academy",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASS || "postgres",
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const db = {
  one: async (text, params) => {
    const result = await pool.query(text, params);
    return result.rows[0] || null;
  },
  all: async (text, params) => {
    const result = await pool.query(text, params);
    return result.rows;
  },
  run: async (text, params) => pool.query(text, params),
};

module.exports = { pool, db };
