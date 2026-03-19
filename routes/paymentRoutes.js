"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const {
  listPayments,
  createPayment,
  updatePayment,
  confirmPublicPayment,
  createStripeCheckoutSession,
  confirmStripeCheckoutSession,
} = require("../controllers/paymentController");

const adminRouter = express.Router();
const publicRouter = express.Router();

adminRouter.get("/", auth, listPayments);
adminRouter.post("/", auth, createPayment);
adminRouter.put("/:id", auth, updatePayment);

publicRouter.post("/confirm", confirmPublicPayment);
publicRouter.post("/stripe/session", createStripeCheckoutSession);
publicRouter.post("/stripe/confirm", confirmStripeCheckoutSession);

module.exports = {
  adminPaymentRoutes: adminRouter,
  publicPaymentRoutes: publicRouter,
};
