import { Router } from "express";
import { buildReminder } from "../services/calendar.js";
import { requireAuth } from "../middleware/auth.js";

export const calendarRouter = Router();

calendarRouter.post("/reminder", requireAuth, (req, res) => {
  const customerName = String(req.body?.customerName || "Customer");
  const customerEmail = String(req.body?.customerEmail || "");
  const daysOut = Number(req.body?.daysOut || 3);
  res.json(buildReminder({ customerName, customerEmail, daysOut }));
});
