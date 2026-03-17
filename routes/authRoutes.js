"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const { createAdmin, adminLogin, updateAdminPassword } = require("../controllers/authController");

const router = express.Router();

router.post("/setup", createAdmin);
router.post("/login", adminLogin);
router.post("/password", auth, updateAdminPassword);

module.exports = router;
