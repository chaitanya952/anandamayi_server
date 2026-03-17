"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const { listBookings, updateBooking } = require("../controllers/bookingController");

const router = express.Router();

router.get("/", auth, listBookings);
router.put("/:id", auth, updateBooking);

module.exports = router;
