import { Router } from "express";
import { loadPricelist } from "../db.js";
import { getRates } from "../services/rates.js";
import { advise, type ChatState, type ChatTurn } from "../services/chatAdvisor.js";
import { insertUsage } from "../repositories/usage.js";
import { evaluateLimit } from "../services/usageLimit.js";
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

  // Enforce the reseller's rolling AI spend limits (monthly = 30d, yearly = 365d;
  // per-reseller $ override else global default; 0 = unlimited). Once over, we stop
  // calling the model — no spend incurred — and the client offers a request-increase
  // flow. `used`/`limit`/`period` (USD) let the UI explain which window was hit.
  const status = await evaluateLimit(req.user!.email, rates);
  if (status.blocked) {
    const windowDays = status.period === "yearly" ? "365" : "30";
    const usd = (n: number) => `$${n.toFixed(2)}`;
    return res.json({
      reply:
        `You've reached your ${status.period} AI usage limit ` +
        `(${usd(status.used)} of ${usd(status.limit)} in the last ${windowDays} days). ` +
        `You can request a higher limit below, or contact your administrator.`,
      limited: true,
      period: status.period,
      used: status.used,
      limit: status.limit,
    });
  }

  const result = await advise(messages, state, pricelist, rates);

  // Record token usage + cost per turn (best-effort; never block the response).
  // Recorded immediately, so a half-finished/abandoned session still counts.
  if (result.usage) insertUsage(req.user!.email, result.usage, sessionId).catch((e) => console.error("[ai_usage]", e));

  res.json({ reply: result.reply, patch: result.patch, step: result.step, done: result.done });
});
