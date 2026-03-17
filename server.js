"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { pool } = require("./config/db");
const { ensureCoreSchema } = require("./services/schemaService");
const batchRoutes = require("./routes/batchRoutes");
const authRoutes = require("./routes/authRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const studentRoutes = require("./routes/studentRoutes");
const { adminPaymentRoutes, publicPaymentRoutes } = require("./routes/paymentRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const { adminQrCodeRoutes, publicQrCodeRoutes } = require("./routes/qrCodeRoutes");
const importExportRoutes = require("./routes/importExportRoutes");
const { publicSettingsRoutes, adminSettingsRoutes } = require("./routes/settingsRoutes");
const publicRoutes = require("./routes/publicRoutes");
const healthRoutes = require("./routes/healthRoutes");

const PORT = process.env.PORT || 5000;

pool.connect((error, client, release) => {
  if (error) {
    console.error("PostgreSQL connection failed:", error.message);
    process.exit(1);
  }

  release();
  console.log("Connected to PostgreSQL");
});

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

app.use("/api/admin", authRoutes);
app.use("/api/admin", dashboardRoutes);
app.use("/api/admin", importExportRoutes);
app.use("/api/admin/students", studentRoutes);
app.use("/api/admin/payments", adminPaymentRoutes);
app.use("/api/admin/bookings", bookingRoutes);
app.use("/api/admin/qrcodes", adminQrCodeRoutes);
app.use("/api/admin/settings", adminSettingsRoutes);
app.use("/api/batches", batchRoutes);
app.use("/api/qr", publicQrCodeRoutes);
app.use("/api/settings", publicSettingsRoutes);
app.use("/api/payment", publicPaymentRoutes);
app.use("/api", publicRoutes);
app.use("/api", healthRoutes);

ensureCoreSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log("===================================================");
      console.log(`  Anandamayi Backend   -> http://localhost:${PORT}`);
      console.log("  Database             -> PostgreSQL (anandamayi)");
      console.log("  Admin login          -> admin / admin123");
      console.log("===================================================");
    });
  })
  .catch((error) => {
    console.error("Schema initialization failed:", error.message);
    process.exit(1);
  });

module.exports = app;
