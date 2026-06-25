import { Router } from "express";
import { loadPricelist } from "../db.js";
import { recommendFirewall } from "../services/claude.js";
import { insertUsage } from "../repositories/usage.js";
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
  const { recommendation, usage } = await recommendFirewall(requirement, pricelist);
  // Record token usage + cost (best-effort; never block the response).
  if (usage) insertUsage(req.user!.email, usage).catch((e) => console.error("[ai_usage]", e));
  res.json(recommendation);
});
