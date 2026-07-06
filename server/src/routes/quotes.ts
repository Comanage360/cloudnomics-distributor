import { Router } from "express";
import { config } from "../config.js";
import { loadPricelist } from "../db.js";
import { buildQuote } from "../services/pricing.js";
import { renderQuotePdf } from "../services/pdf.js";
import { sendQuoteEmail } from "../services/mailer.js";
import { requireAuth } from "../middleware/auth.js";
import {
  nextNumber, saveQuote, getQuote, markSent, listQuotes, quoteNumberForSession,
} from "../repositories/quotes.js";
import { getReseller } from "../repositories/resellers.js";
import { linkUsageToQuote } from "../repositories/usage.js";
import { countEmailSendsSince, logEmailSend } from "../repositories/emailSends.js";
import { getRates } from "../services/rates.js";
import type { QuoteSelection } from "../types.js";

export const quotesRouter = Router();

/** Decode a base64 image data URL into a Buffer PDFKit can embed (PNG/JPEG). */
function logoToBuffer(dataUrl: string | null): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try { return Buffer.from(m[1], "base64"); } catch { return null; }
}

/** List the authenticated reseller's quotes (newest first). */
quotesRouter.get("/", requireAuth, async (req, res) => {
  res.json(await listQuotes(req.user!.email));
});

/** Build + persist a quote from the reseller's selections. */
quotesRouter.post("/", requireAuth, async (req, res) => {
  const body = req.body ?? {};
  const selection: QuoteSelection = {
    sku: String(body.sku || ""),
    users: Number(body.users || 0),
    fwImpl: !!body.fwImpl,
    xdr: !!body.xdr,
    xdrImpl: !!body.xdrImpl,
    managed: !!body.managed,
    markup: Number(body.markup || 0),
    competitiveModel: typeof body.competitiveModel === "string" ? body.competitiveModel.trim() : "",
  };
  if (!selection.sku || !selection.users) {
    return res.status(400).json({ error: "sku and users are required" });
  }
  // Guardrail: a sane, whole user count (huge values usually mean a typo/abuse
  // and would inflate per-user XDR pricing).
  selection.users = Math.floor(selection.users);
  if (!Number.isInteger(selection.users) || selection.users < 1 || selection.users > config.pricing.maxUsers) {
    return res.status(400).json({ error: `User count must be a whole number between 1 and ${config.pricing.maxUsers.toLocaleString()}.` });
  }

  const pricelist = await loadPricelist();
  const rates = await getRates();
  const totals = buildQuote(selection, pricelist, rates);
  selection.markup = totals.markup; // persist the enforced (clamped) markup, not the raw input

  // Guardrail: reject absurd totals (data-entry error / abuse) before persisting.
  if (totals.customerTotal > config.pricing.maxQuoteValue) {
    return res.status(400).json({ error: "This quote total is unusually large — please review the selection or contact your administrator." });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : "";

  // One quote per session: if this session already produced a quote, return it
  // instead of creating another (idempotent; enforces the 1 session ⇒ 1 quote rule).
  if (sessionId) {
    const existing = await quoteNumberForSession(sessionId);
    if (existing) return res.json({ number: existing, ...totals, alreadyExists: true });
  }

  const number = Number(body.number) || (await nextNumber());

  await saveQuote({
    number,
    resellerEmail: req.user!.email,
    customerName: String(body.customerName || ""),
    customerEmail: String(body.customerEmail || ""),
    selection,
    totals,
    // Snapshot the reseller's current branding logo onto the quote.
    logo: (await getReseller(req.user!.email))?.logo_url ?? null,
    sessionId: sessionId || null,
  });

  // Attribute this session's AI turns to the quote (powers per-quote token usage).
  if (sessionId) {
    linkUsageToQuote(req.user!.email, sessionId, number).catch((e) => console.error("[ai_usage link]", e));
  }

  res.json({ number, ...totals });
});

/** Stream the branded PDF. `?variant=partner` renders the Cloudnomics→reseller
 *  (base-cost, no-markup) quote; default is the customer-facing quote. */
quotesRouter.get("/:number/pdf", requireAuth, async (req, res) => {
  const number = Number(req.params.number);
  const quote = await getQuote(number, req.user!.email);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const variant = req.query.variant === "partner" ? "partner" : "customer";
  const pricelist = await loadPricelist();
  // Rebuild totals deterministically from the stored selection (source of truth)
  const totals = buildQuote(quote.selection, pricelist, await getRates());

  const pdf = await renderQuotePdf({
    quoteNumber: number,
    totals,
    customerName: quote.customer_name || "Customer",
    customerEmail: quote.customer_email || "",
    resellerCompany: (await getReseller(req.user!.email))?.company || req.user!.company,
    logoBuffer: logoToBuffer(quote.logo),
    variant,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="quote-${number}-${variant}.pdf"`);
  res.send(pdf);
});

/** Email the quote to the customer. */
quotesRouter.post("/:number/send", requireAuth, async (req, res) => {
  const number = Number(req.params.number);
  const quote = await getQuote(number, req.user!.email);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  // Optional custom email fields (custom-email composer): to / subject / body / cc.
  const b = req.body ?? {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const toCandidate = (typeof b.to === "string" && b.to.trim()) ? b.to.trim() : (quote.customer_email || "");
  // Guardrail: must have a valid recipient.
  if (!emailRe.test(toCandidate)) {
    return res.status(400).json({ error: "A valid recipient email address is required." });
  }
  const to = toCandidate;
  const subject = typeof b.subject === "string" && b.subject.trim() ? b.subject.trim() : undefined;
  const customBody = typeof b.body === "string" && b.body.trim() ? b.body : undefined;
  const ccRaw = Array.isArray(b.cc) ? b.cc : typeof b.cc === "string" ? b.cc.split(/[,;]/) : [];
  const cc = ccRaw.map((s: unknown) => String(s).trim()).filter((e: string) => emailRe.test(e));
  // Guardrail: cap CC recipients (anti-spam / domain-reputation protection).
  if (cc.length > config.emailCcMax) {
    return res.status(400).json({ error: `You can CC at most ${config.emailCcMax} recipients.` });
  }
  // Guardrail: per-reseller daily send cap.
  const sentToday = await countEmailSendsSince(req.user!.email, 24);
  if (sentToday >= config.emailDailyLimit) {
    return res.status(429).json({ error: `Daily email limit reached (${config.emailDailyLimit}/day). Please try again tomorrow.` });
  }

  const pricelist = await loadPricelist();
  const totals = buildQuote(quote.selection, pricelist, await getRates());
  const pdf = await renderQuotePdf({
    quoteNumber: number,
    totals,
    customerName: quote.customer_name || "Customer",
    customerEmail: quote.customer_email || "",
    resellerCompany: (await getReseller(req.user!.email))?.company || req.user!.company,
    logoBuffer: logoToBuffer(quote.logo),
  });

  const result = await sendQuoteEmail({
    to,
    customerName: quote.customer_name || "Customer",
    quoteNumber: number,
    pdf,
    subject,
    body: customBody,
    cc,
  });
  await markSent(number);
  logEmailSend(req.user!.email, to, cc.length).catch((e) => console.error("[email_sends]", e));
  res.json({ sent: true, ...result });
});
