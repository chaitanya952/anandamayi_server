"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const {
  getActiveQr,
  listQrCodes,
  createQrCode,
  updateQrCode,
  deleteQrCode,
} = require("../controllers/qrCodeController");

const adminRouter = express.Router();
const publicRouter = express.Router();

publicRouter.get("/active", getActiveQr);

adminRouter.get("/", auth, listQrCodes);
adminRouter.post("/", auth, createQrCode);
adminRouter.put("/:id", auth, updateQrCode);
adminRouter.delete("/:id", auth, deleteQrCode);

module.exports = {
  adminQrCodeRoutes: adminRouter,
  publicQrCodeRoutes: publicRouter,
};
