import { Router } from "express";
import { config } from "../config.js";
import { signToken } from "../middleware/auth.js";
import { createReseller, getResellerCredentials, setResellerRole } from "../repositories/resellers.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import type { AuthUser } from "../types.js";

export const authRouter = Router();

const normalizeEmail = (v: unknown) => String(v || "").trim().toLowerCase();

/** Admins are accounts marked admin, or any email listed in ADMIN_EMAILS. */
async function resolveRole(email: string, storedRole?: string): Promise<AuthUser["role"]> {
  if (config.adminEmails.includes(email)) {
    if (storedRole !== "admin") await setResellerRole(email, "admin"); // auto-promote + persist
    return "admin";
  }
  return storedRole === "admin" ? "admin" : "reseller";
}

/** Create a reseller account (email + password). Returns a JWT. */
authRouter.post("/register", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const companyInput = String(req.body?.company || "").trim();

  if (!email || !email.includes("@")) return res.status(400).json({ error: "Valid email required" });
  if (!password) return res.status(400).json({ error: "Password required" });
  if (await getResellerCredentials(email)) {
    return res.status(409).json({ error: "An account with this email already exists" });
  }

  const derived = email.split("@")[1]?.split(".")[0] || "reseller";
  const company = companyInput || derived.charAt(0).toUpperCase() + derived.slice(1);
  await createReseller(email, company, await hashPassword(password));

  const user: AuthUser = { email, company, role: await resolveRole(email) };
  res.json({ token: signToken(user), user });
});

/** Verify email + password and return a JWT. */
authRouter.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const cred = await getResellerCredentials(email);
  if (!cred || !cred.passwordHash || !(await verifyPassword(password, cred.passwordHash))) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const user: AuthUser = {
    email,
    company: cred.company || "Reseller",
    role: await resolveRole(email, cred.role),
  };
  res.json({ token: signToken(user), user });
});
