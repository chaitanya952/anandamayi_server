"use strict";

const express = require("express");
const multer = require("multer");
const { auth } = require("../middleware/auth");
const {
  previewImport,
  confirmImport,
  exportRecords,
} = require("../controllers/importExportController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/import/preview", auth, upload.single("file"), previewImport);
router.post("/import/confirm", auth, confirmImport);
router.get("/export/:type", auth, exportRecords);

module.exports = router;
