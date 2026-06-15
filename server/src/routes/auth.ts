import { Router } from "express";
import { signToken } from "../middleware/auth.js";
import { upsertReseller, getReseller } from "../repositories/resellers.js";

export const authRouter = Router();

/**
 * STUB login. Accepts any email and issues a 12h JWT. Replace with a managed
 * identity provider (Auth0 / Supabase) before production.
 */
authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Valid email required" });
  }
  const derived = (email.split("@")[1]?.split(".")[0] || "reseller");
  const pretty = derived.charAt(0).toUpperCase() + derived.slice(1);
  await upsertReseller(email, pretty); // seeds company only for a brand-new reseller
  const reseller = await getReseller(email);
  const user = { email, company: reseller?.company || pretty };
  res.json({ token: signToken(user), user });
});
