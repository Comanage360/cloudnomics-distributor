import { Router } from "express";
import { signToken } from "../middleware/auth.js";
import { upsertReseller } from "../repositories/resellers.js";

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
  const company = (email.split("@")[1]?.split(".")[0] || "reseller");
  const pretty = company.charAt(0).toUpperCase() + company.slice(1);
  await upsertReseller(email, pretty);
  const user = { email, company: pretty };
  res.json({ token: signToken(user), user });
});
