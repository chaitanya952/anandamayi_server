"use strict";

require("dotenv").config();

const { Pool } = require("pg");

function isConnectionString(value) {
  return typeof value === "string" && /^(postgres|postgresql):\/\//i.test(value);
}

function shouldUseSsl() {
  const value = String(process.env.DB_SSL || process.env.PGSSLMODE || "").toLowerCase();
  return value === "true" || value === "require" || Boolean(process.env.DATABASE_URL) || isConnectionString(process.env.DB_HOST);
}

function buildPoolConfig() {
  const ssl = shouldUseSsl() ? { rejectUnauthorized: false } : undefined;
  const connectionString = process.env.DATABASE_URL || (isConnectionString(process.env.DB_HOST) ? process.env.DB_HOST : "");

  if (connectionString) {
    return {
      connectionString,
      ssl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
  }

  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || "dance_academy",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASS || "postgres",
    ssl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

const pool = new Pool(buildPoolConfig());

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
