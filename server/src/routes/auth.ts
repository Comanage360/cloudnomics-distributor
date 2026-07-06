import { Router } from "express";
import type { Request } from "express";
import { config } from "../config.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import {
  createReseller, getResellerCredentials, setResellerRole,
  setResellerPassword, setEmailVerified, setApproved,
} from "../repositories/resellers.js";
import { hashPassword, verifyPassword } from "../services/password.js";
import { issueToken, consumeToken } from "../repositories/authTokens.js";
import { logAuthEvent } from "../repositories/authEvents.js";
import { sendWelcomeEmail, sendVerificationEmail, sendPasswordResetEmail, sendPendingApprovalEmail, sendNotification } from "../services/mailer.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { AuthUser } from "../types.js";

export const authRouter = Router();

const normalizeEmail = (v: unknown) => String(v || "").trim().toLowerCase();
const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const clientIp = (req: Request) => req.ip ?? null;
const ua = (req: Request) => (req.headers["user-agent"] as string) || null;

const VERIFY_TTL = 24 * 60 * 60 * 1000; // 24h
const RESET_TTL = 60 * 60 * 1000;       // 1h

/** Reject weak passwords (checked on both register and reset). */
function passwordError(pw: string): string | null {
  return pw.length < 8 ? "Password must be at least 8 characters." : null;
}

/** Admins are accounts marked admin, or any email listed in ADMIN_EMAILS. */
async function resolveRole(email: string, storedRole?: string): Promise<AuthUser["role"]> {
  if (config.adminEmails.includes(email)) {
    if (storedRole !== "admin") await setResellerRole(email, "admin"); // auto-promote + persist
    return "admin";
  }
  return storedRole === "admin" ? "admin" : "reseller";
}

const verifyUrl = (raw: string) => `${config.appUrl}/verify-email?token=${raw}`;
const resetUrl = (raw: string) => `${config.appUrl}/reset-password?token=${raw}`;

// ---- rate limiters ----
const loginLimiter = rateLimit({ name: "login", windowMs: 15 * 60 * 1000, max: 10, keyFn: (r) => `${r.ip}:${normalizeEmail(r.body?.email)}` });
const ipLimiter = (name: string, max = 12) => rateLimit({ name, windowMs: 60 * 60 * 1000, max, keyFn: (r) => r.ip || "unknown" });

/** Create a reseller account. Sends a branded welcome + verify email. */
authRouter.post("/register", ipLimiter("register"), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const confirm = String(req.body?.confirmPassword ?? "");
  const companyInput = String(req.body?.company || "").trim();

  if (!email || !isEmail(email)) return res.status(400).json({ error: "Valid email required" });
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (confirm && confirm !== password) return res.status(400).json({ error: "Passwords do not match" });
  if (await getResellerCredentials(email)) return res.status(409).json({ error: "An account with this email already exists" });

  const derived = email.split("@")[1]?.split(".")[0] || "reseller";
  const company = companyInput || derived.charAt(0).toUpperCase() + derived.slice(1);
  await createReseller(email, company, await hashPassword(password));
  logAuthEvent({ email, event: "signup", ip: clientIp(req), userAgent: ua(req) });

  // Admin emails self-approve and sign in immediately; everyone else is created
  // PENDING and gets no session until an admin approves them.
  if (config.adminEmails.includes(email)) {
    await setApproved(email, true);
    const raw = await issueToken(email, "verify", VERIFY_TTL);
    sendWelcomeEmail(email, company, verifyUrl(raw)).catch((e) => console.error("[mailer:welcome]", e));
    logAuthEvent({ email, event: "verify_sent", ip: clientIp(req), userAgent: ua(req) });
    const user: AuthUser = { email, company, role: await resolveRole(email) };
    return res.json({ token: signToken(user), user, emailVerified: false });
  }

  sendPendingApprovalEmail(email, company).catch((e) => console.error("[mailer:pending]", e));
  sendNotification(
    config.adminEmails,
    `New reseller awaiting approval: ${email}`,
    `${email} (${company}) has registered and is awaiting approval.\nApprove them in the Cloudnomics admin dashboard → Resellers.`
  ).catch((e) => console.error("[notify:pending]", e));
  res.json({ pending: true });
});

/** Verify email + password, return a JWT. */
authRouter.post("/login", loginLimiter, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const cred = await getResellerCredentials(email);
  if (!cred || !cred.passwordHash || !(await verifyPassword(password, cred.passwordHash))) {
    logAuthEvent({ email, event: "login_failed", ip: clientIp(req), userAgent: ua(req) });
    return res.status(401).json({ error: "Invalid email or password" });
  }
  // Hard gate: no portal access until an admin approves the account.
  if (!cred.approved) {
    logAuthEvent({ email, event: "login_failed", ip: clientIp(req), userAgent: ua(req), detail: "pending" });
    return res.status(403).json({ error: "Your account is awaiting admin approval. We'll email you once it's approved.", pending: true });
  }

  const user: AuthUser = { email, company: cred.company || "Reseller", role: await resolveRole(email, cred.role) };
  logAuthEvent({ email, event: "login", ip: clientIp(req), userAgent: ua(req) });
  res.json({ token: signToken(user), user, emailVerified: cred.emailVerified });
});

/** Confirm an email address from the link's token. */
authRouter.post("/verify-email", async (req, res) => {
  const token = String(req.body?.token || "");
  const email = token ? await consumeToken(token, "verify") : null;
  if (!email) return res.status(400).json({ error: "This verification link is invalid or has expired." });
  await setEmailVerified(email);
  logAuthEvent({ email, event: "verify_ok", ip: clientIp(req), userAgent: ua(req) });
  res.json({ ok: true, emailVerified: true, email });
});

/** Start a password reset. Always returns ok (never reveals if the email exists). */
authRouter.post("/request-reset", ipLimiter("request_reset"), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (email && isEmail(email) && (await getResellerCredentials(email))) {
    const raw = await issueToken(email, "reset", RESET_TTL);
    sendPasswordResetEmail(email, resetUrl(raw)).catch((e) => console.error("[mailer:reset]", e));
    logAuthEvent({ email, event: "reset_requested", ip: clientIp(req), userAgent: ua(req) });
  }
  res.json({ ok: true });
});

/** Complete a password reset from the link's token; auto-logs-in on success. */
authRouter.post("/reset-password", ipLimiter("reset_password"), async (req, res) => {
  const token = String(req.body?.token || "");
  const password = String(req.body?.password || "");
  const confirm = String(req.body?.confirmPassword ?? "");
  const pwErr = passwordError(password);
  if (pwErr) return res.status(400).json({ error: pwErr });
  if (confirm && confirm !== password) return res.status(400).json({ error: "Passwords do not match" });

  const email = token ? await consumeToken(token, "reset") : null;
  if (!email) return res.status(400).json({ error: "This reset link is invalid or has expired." });

  const cred = await getResellerCredentials(email);
  await setResellerPassword(email, cred?.company || "Reseller", await hashPassword(password));
  logAuthEvent({ email, event: "reset_ok", ip: clientIp(req), userAgent: ua(req) });

  const user: AuthUser = { email, company: cred?.company || "Reseller", role: await resolveRole(email, cred?.role) };
  res.json({ token: signToken(user), user, emailVerified: cred?.emailVerified ?? false });
});

/** Resend the verification email for the signed-in user. */
authRouter.post("/resend-verification", requireAuth, ipLimiter("resend", 6), async (req, res) => {
  const email = req.user!.email;
  const cred = await getResellerCredentials(email);
  if (cred && !cred.emailVerified) {
    const raw = await issueToken(email, "verify", VERIFY_TTL);
    sendVerificationEmail(email, verifyUrl(raw)).catch((e) => console.error("[mailer:verify]", e));
    logAuthEvent({ email, event: "verify_sent", ip: clientIp(req), userAgent: ua(req) });
  }
  res.json({ ok: true });
});

/** Current user + verified status (for the verify banner / refresh after verify). */
authRouter.get("/me", requireAuth, async (req, res) => {
  const cred = await getResellerCredentials(req.user!.email);
  res.json({ user: req.user, emailVerified: cred?.emailVerified ?? true });
});
