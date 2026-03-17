"use strict";

const express = require("express");
const { registerStudent, studentLogin } = require("../controllers/publicController");

const router = express.Router();

router.post("/register", registerStudent);
router.post("/student/login", studentLogin);

module.exports = router;
