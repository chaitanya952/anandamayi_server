"use strict";

const { db } = require("../config/db");

const tableColumnsCache = new Map();

async function getTableColumns(tableName) {
  if (tableColumnsCache.has(tableName)) {
    return tableColumnsCache.get(tableName);
  }

  const rows = await db.all(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name = $1
     ORDER BY ordinal_position`,
    [tableName]
  );
  const columns = new Set(rows.map((row) => row.column_name));
  tableColumnsCache.set(tableName, columns);
  return columns;
}

async function findBatchByName(batchName) {
  const batchColumns = await getTableColumns("batches");

  if (batchColumns.has("name")) {
    return db.one(
      `SELECT *
       FROM batches
       WHERE name = $1${batchColumns.has("active") ? " AND active = TRUE" : ""}`,
      [batchName]
    );
  }

  if (batchColumns.has("batch_name")) {
    return db.one("SELECT * FROM batches WHERE batch_name = $1", [batchName]);
  }

  return null;
}

async function getBatchNameColumn() {
  const batchColumns = await getTableColumns("batches");
  if (batchColumns.has("name")) return "name";
  if (batchColumns.has("batch_name")) return "batch_name";
  return null;
}

async function hasTableColumn(tableName, columnName) {
  const columns = await getTableColumns(tableName);
  return columns.has(columnName);
}

function paginate(page = 1, limit = 15) {
  const normalizedPage = Math.max(1, parseInt(page, 10) || 1);
  const normalizedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));

  return {
    page: normalizedPage,
    limit: normalizedLimit,
    offset: (normalizedPage - 1) * normalizedLimit,
  };
}

module.exports = {
  findBatchByName,
  getBatchNameColumn,
  getTableColumns,
  hasTableColumn,
  paginate,
};
