import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getReseller, setResellerLogo, setResellerCompany } from "../repositories/resellers.js";

export const brandingRouter = Router();

/** Current reseller branding (default white-label logo + company). */
brandingRouter.get("/", requireAuth, async (req, res) => {
  const r = await getReseller(req.user!.email);
  res.json({ logo: r?.logo_url ?? null, company: r?.company ?? req.user!.company });
});

/** Save the reseller's default logo and/or company display name. */
brandingRouter.put("/", requireAuth, async (req, res) => {
  const email = req.user!.email;
  const body = req.body ?? {};
  if ("logo" in body) {
    await setResellerLogo(email, typeof body.logo === "string" && body.logo ? body.logo : null);
  }
  if (typeof body.company === "string" && body.company.trim()) {
    await setResellerCompany(email, body.company.trim());
  }
  const r = await getReseller(email);
  res.json({ logo: r?.logo_url ?? null, company: r?.company ?? "" });
});
