import { Router } from "express";
import { config } from "../config.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { loadPricelist } from "../db.js";
import { listResellers, getReseller, setResellerLimits, setApproved, deleteReseller, getResellerCredentials } from "../repositories/resellers.js";
import { listAllQuotes, getQuoteAny } from "../repositories/quotes.js";
import { usageByReseller, usageOverall } from "../repositories/usage.js";
import { listLimitRequests, resolveLimitRequest } from "../repositories/limitRequests.js";
import { listAuthEvents, logAuthEvent } from "../repositories/authEvents.js";
import { sendApprovalEmail } from "../services/mailer.js";
import { getRates, setRates } from "../services/rates.js";
import { buildQuote } from "../services/pricing.js";
import { renderQuotePdf } from "../services/pdf.js";
import type { Rates } from "../types.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

function logoToBuffer(dataUrl: string | null): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try { return Buffer.from(m[1], "base64"); } catch { return null; }
}

/** All resellers with quote aggregates. */
adminRouter.get("/resellers", async (_req, res) => {
  res.json(await listResellers());
});

/** All quotes across resellers (optionally ?reseller=email). */
adminRouter.get("/quotes", async (req, res) => {
  const reseller = req.query.reseller ? String(req.query.reseller) : undefined;
  res.json(await listAllQuotes(reseller));
});

/** Token usage + cost: overall and per reseller. */
adminRouter.get("/usage", async (_req, res) => {
  res.json({ overall: await usageOverall(), byReseller: await usageByReseller() });
});

/** Read / update the dynamic pricing rates. */
adminRouter.get("/rates", async (_req, res) => res.json(await getRates()));
adminRouter.put("/rates", async (req, res) => {
  const body = req.body ?? {};
  type NumericRateKey = Exclude<keyof Rates, "catalogDiscounts">;
  const keys: NumericRateKey[] = ["discount", "competitiveBonus", "implRate", "managedRate", "markupDefault", "markupMin", "markupMax", "costLimitMonthly"];
  const next: Partial<Rates> = {};
  for (const k of keys) if (body[k] !== undefined && !Number.isNaN(Number(body[k]))) next[k] = Number(body[k]);

  // Per-category reseller discounts, e.g. { "B": 0.35, "D": 0.2 }. Values are
  // fractions in [0, 0.95]; anything unparseable is dropped rather than stored,
  // and a category left out simply falls back to the base discount.
  if (body.catalogDiscounts && typeof body.catalogDiscounts === "object") {
    const clean: Record<string, number> = {};
    for (const [cat, raw] of Object.entries(body.catalogDiscounts as Record<string, unknown>)) {
      const code = String(cat).trim().toUpperCase().slice(0, 4);
      const v = Number(raw);
      // Reject rather than clamp anything outside [0, 0.95]: silently turning a
      // mistyped "5" (meaning 5%) into 0.95 would give away 95% of the margin.
      if (!code || !Number.isFinite(v) || v < 0 || v > 0.95) continue;
      clean[code] = v;
    }
    next.catalogDiscounts = clean;
  }
  res.json(await setRates(next));
});

/** Set a reseller's per-account $ override. Empty/absent value ("" or null)
 *  clears the override so the reseller inherits the global default. */
adminRouter.put("/resellers/:email/limits", async (req, res) => {
  const email = String(req.params.email);
  const parse = (v: unknown): number | null => {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null; // 2-dp dollars
  };
  await setResellerLimits(email, parse(req.body?.monthly));
  res.json({ ok: true });
});

/** Approve a pending reseller so they can sign in; emails them the good news. */
adminRouter.post("/resellers/:email/approve", async (req, res) => {
  const email = String(req.params.email).trim().toLowerCase();
  await setApproved(email, true);
  const url = `${config.appUrl}/login`;
  sendApprovalEmail(email, url).catch((e) => console.error("[mailer:approval]", e));
  logAuthEvent({ email, event: "approved", ip: req.ip ?? null, userAgent: (req.headers["user-agent"] as string) || null });
  res.json({ ok: true });
});

/** Reject (delete) a still-pending reseller account. Refuses if already approved. */
adminRouter.post("/resellers/:email/reject", async (req, res) => {
  const email = String(req.params.email).trim().toLowerCase();
  const cred = await getResellerCredentials(email);
  if (cred?.approved) return res.status(409).json({ error: "Account is already approved" });
  await deleteReseller(email);
  logAuthEvent({ email, event: "rejected", ip: req.ip ?? null, userAgent: (req.headers["user-agent"] as string) || null });
  res.json({ ok: true });
});

/** Pending + resolved reseller limit-increase requests (admin queue). */
adminRouter.get("/limit-requests", async (_req, res) => {
  res.json(await listLimitRequests());
});

/** Approve or dismiss a limit-increase request. */
adminRouter.post("/limit-requests/:id/resolve", async (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status === "approved" ? "approved" : "dismissed";
  if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid request id" });
  await resolveLimitRequest(id, status);
  res.json({ ok: true });
});

/** Recent authentication / account events (audit log). */
adminRouter.get("/auth-events", async (req, res) => {
  const limit = Number(req.query.limit) || 200;
  const email = req.query.email ? String(req.query.email) : undefined;
  res.json(await listAuthEvents(limit, email));
});

/** Any quote's branded PDF (admin bypass of per-reseller scope).
 *  `?variant=partner` renders the Cloudnomics→reseller base-cost quote. */
adminRouter.get("/quotes/:number/pdf", async (req, res) => {
  const number = Number(req.params.number);
  const quote = await getQuoteAny(number);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const variant = req.query.variant === "partner" ? "partner" : "customer";
  const pricelist = await loadPricelist();
  const totals = buildQuote(quote.selection, pricelist, await getRates());
  const reseller = await getReseller(quote.reseller_email);

  const pdf = await renderQuotePdf({
    quoteNumber: number,
    totals,
    customerName: quote.customer_name || "Customer",
    customerEmail: quote.customer_email || "",
    resellerCompany: reseller?.company || "Cloudnomics",
    logoBuffer: logoToBuffer(quote.logo),
    variant,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="quote-${number}-${variant}.pdf"`);
  res.send(pdf);
});
