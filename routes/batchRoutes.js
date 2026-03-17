"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const {
  listBatches,
  createBatch,
  updateBatch,
  deleteBatch,
} = require("../controllers/batchController");

const router = express.Router();

router.get("/", listBatches);
router.post("/", auth, createBatch);
router.put("/:id", auth, updateBatch);
router.delete("/:id", auth, deleteBatch);

module.exports = router;
