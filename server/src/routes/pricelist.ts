import { Router } from "express";
import { loadPricelist } from "../db.js";
import { recommendFirewall } from "../services/claude.js";
import { requireAuth } from "../middleware/auth.js";

export const pricelistRouter = Router();
export const recommendRouter = Router();

pricelistRouter.get("/", async (_req, res) => {
  const pricelist = await loadPricelist();
  res.json(pricelist);
});

recommendRouter.post("/", requireAuth, async (req, res) => {
  const requirement = String(req.body?.requirement || "").trim();
  if (!requirement) return res.status(400).json({ error: "requirement is required" });
  const pricelist = await loadPricelist();
  const rec = await recommendFirewall(requirement, pricelist);
  res.json(rec);
});
