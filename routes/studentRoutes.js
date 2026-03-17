"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
} = require("../controllers/studentController");

const router = express.Router();

router.get("/", auth, listStudents);
router.post("/", auth, createStudent);
router.put("/:id", auth, updateStudent);
router.delete("/:id", auth, deleteStudent);

module.exports = router;
