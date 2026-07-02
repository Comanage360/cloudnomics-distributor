import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getRates } from "../services/rates.js";
import { evaluateLimit } from "../services/tokenLimit.js";
import { insertLimitRequest } from "../repositories/limitRequests.js";
import { sendNotification } from "../services/mailer.js";
import { config } from "../config.js";

export const limitsRouter = Router();

/** A reseller asks their admin to raise their AI token limit. The breached
 *  window / usage / cap are recomputed server-side (client isn't trusted); the
 *  request is queued for the admin dashboard and emailed to the admins. */
limitsRouter.post("/request-increase", requireAuth, async (req, res) => {
  const email = req.user!.email;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : null;

  const status = await evaluateLimit(email, await getRates());
  const request = await insertLimitRequest({
    resellerEmail: email,
    period: status.period,
    used: status.blocked ? status.used : null,
    limitValue: status.blocked ? status.limit : null,
    reason: reason || null,
  });

  // Notify admins (best-effort — never fail the request if email is down).
  const windowDays = status.period === "yearly" ? "365" : "30";
  const lines = [
    `${email} has requested a higher AI token limit.`,
    status.blocked
      ? `They hit their ${status.period} cap: ${status.used.toLocaleString()} of ${status.limit.toLocaleString()} tokens in the last ${windowDays} days.`
      : `They are not currently over a limit.`,
    reason ? `\nReason: ${reason}` : "",
    `\nReview it in the Cloudnomics admin dashboard → Token limits.`,
  ].filter(Boolean);
  sendNotification(config.adminEmails, `AI token limit increase requested by ${email}`, lines.join("\n"))
    .catch((e) => console.error("[limit-request:notify]", e));

  res.json({ ok: true, id: request.id });
});
