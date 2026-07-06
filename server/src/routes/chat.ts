import { Router } from "express";
import { loadPricelist } from "../db.js";
import { getRates } from "../services/rates.js";
import { advise, type ChatState, type ChatTurn } from "../services/chatAdvisor.js";
import { insertUsage } from "../repositories/usage.js";
import { evaluateLimit } from "../services/usageLimit.js";
import { checkOrgBudget } from "../services/orgBudget.js";
import { requireAuth } from "../middleware/auth.js";

export const chatRouter = Router();

/** One advisor turn. Generates the next reply + a validated state patch, and
 *  records token usage for the full session (one row per turn). */
chatRouter.post("/", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const messages: ChatTurn[] = Array.isArray(body.messages)
    ? body.messages
        .filter((m: unknown): m is ChatTurn =>
          !!m && (((m as ChatTurn).role === "user") || ((m as ChatTurn).role === "assistant")) &&
          typeof (m as ChatTurn).text === "string")
        .map((m: ChatTurn) => ({ role: m.role, text: String(m.text).slice(0, 4000) }))
    : [];
  if (!messages.length) return res.status(400).json({ error: "messages are required" });

  const state: ChatState = (body.state && typeof body.state === "object") ? body.state : {};
  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : null;

  const pricelist = await loadPricelist();
  const rates = await getRates();

  // Enforce the reseller's rolling monthly AI spend limit (last 30 days;
  // per-reseller $ override else global default; 0 = unlimited). Once over, we stop
  // calling the model — no spend incurred — and the client offers a request-increase
  // flow. `used`/`limit` (USD) let the UI explain the cap.
  const status = await evaluateLimit(req.user!.email, rates);
  if (status.blocked) {
    const usd = (n: number) => `$${n.toFixed(2)}`;
    return res.json({
      reply:
        `You've reached your monthly usage limit — ${usd(status.used)} of ${usd(status.limit)} used in the last 30 days. ` +
        `Use the button to ask your admin to raise it, or contact them directly.`,
      limited: true,
      period: status.period,
      used: status.used,
      limit: status.limit,
    });
  }

  // Org-wide AI budget kill-switch: once total platform spend hits the admin-set
  // ceiling, block ALL AI (no model call) until it's raised or spend rolls off.
  const org = await checkOrgBudget(rates);
  if (org.over) {
    return res.json({
      reply: "The platform's monthly AI budget has been reached. Please contact your administrator — the assistant will be available again once it's raised.",
      limited: true,
      orgBudget: true,
    });
  }

  const result = await advise(messages, state, pricelist, rates);

  // Record token usage + cost per turn (best-effort; never block the response).
  // Recorded immediately, so a half-finished/abandoned session still counts.
  if (result.usage) insertUsage(req.user!.email, result.usage, sessionId).catch((e) => console.error("[ai_usage]", e));

  res.json({ reply: result.reply, patch: result.patch, step: result.step, done: result.done });
});
