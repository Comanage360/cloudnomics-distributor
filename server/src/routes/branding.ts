import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getReseller, setResellerLogo } from "../repositories/resellers.js";

export const brandingRouter = Router();

/** Current reseller branding (default white-label logo + company). */
brandingRouter.get("/", requireAuth, async (req, res) => {
  const r = await getReseller(req.user!.email);
  res.json({ logo: r?.logo_url ?? null, company: r?.company ?? req.user!.company });
});

/** Save or clear the reseller's default logo (base64 data URL, or null). */
brandingRouter.put("/", requireAuth, async (req, res) => {
  const logo = typeof req.body?.logo === "string" && req.body.logo ? req.body.logo : null;
  await setResellerLogo(req.user!.email, logo);
  res.json({ ok: true, logo });
});
