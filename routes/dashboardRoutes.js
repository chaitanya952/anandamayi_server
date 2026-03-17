"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const { getAdminStats } = require("../controllers/dashboardController");

const router = express.Router();

router.get("/stats", auth, getAdminStats);

module.exports = router;
