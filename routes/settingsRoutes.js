"use strict";

const express = require("express");
const { auth } = require("../middleware/auth");
const { getSettings, updateSettings } = require("../controllers/settingsController");

const publicRouter = express.Router();
const adminRouter = express.Router();

publicRouter.get("/", getSettings);
adminRouter.put("/", auth, updateSettings);

module.exports = {
  publicSettingsRoutes: publicRouter,
  adminSettingsRoutes: adminRouter,
};
