import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getRates } from "../services/rates.js";

export const ratesRouter = Router();

/** Current pricing rates — used by the client preview engine. */
ratesRouter.get("/", requireAuth, async (_req, res) => {
  res.json(await getRates());
});
