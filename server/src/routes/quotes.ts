import { Router } from "express";
import { loadPricelist, query } from "../db.js";
import { buildQuote } from "../services/pricing.js";
import { renderQuotePdf } from "../services/pdf.js";
import { sendQuoteEmail } from "../services/mailer.js";
import { requireAuth } from "../middleware/auth.js";
import {
  nextNumber, saveQuote, getQuote, markSent, listQuotes,
} from "../repositories/quotes.js";
import { getReseller } from "../repositories/resellers.js";
import type { QuoteSelection } from "../types.js";

export const quotesRouter = Router();

/** Decode a base64 image data URL into a Buffer PDFKit can embed (PNG/JPEG). */
function logoToBuffer(dataUrl: string | null): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try { return Buffer.from(m[1], "base64"); } catch { return null; }
}

quotesRouter.get("/next-number", requireAuth, async (_req, res) => {
  res.json({ number: await nextNumber() });
});

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
  };
  if (!selection.sku || !selection.users) {
    return res.status(400).json({ error: "sku and users are required" });
  }

  const pricelist = await loadPricelist();
  const totals = buildQuote(selection, pricelist);
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
  });

  res.json({ number, ...totals });
});

/** Stream the branded customer PDF. */
quotesRouter.get("/:number/pdf", requireAuth, async (req, res) => {
  const number = Number(req.params.number);
  const quote = await getQuote(number);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const pricelist = await loadPricelist();
  // Rebuild totals deterministically from the stored selection (source of truth)
  const stored = await query<{ selection: QuoteSelection }>(
    "SELECT selection FROM quotes WHERE number = $1",
    [number]
  );
  const totals = buildQuote(stored.rows[0].selection, pricelist);

  const pdf = await renderQuotePdf({
    quoteNumber: number,
    totals,
    customerName: quote.customer_name || "Customer",
    customerEmail: quote.customer_email || "",
    resellerCompany: req.user!.company,
    logoBuffer: logoToBuffer(quote.logo),
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="quote-${number}.pdf"`);
  res.send(pdf);
});

/** Email the quote to the customer. */
quotesRouter.post("/:number/send", requireAuth, async (req, res) => {
  const number = Number(req.params.number);
  const quote = await getQuote(number);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

  const pricelist = await loadPricelist();
  const stored = await query<{ selection: QuoteSelection }>(
    "SELECT selection FROM quotes WHERE number = $1",
    [number]
  );
  const totals = buildQuote(stored.rows[0].selection, pricelist);

  const pdf = await renderQuotePdf({
    quoteNumber: number,
    totals,
    customerName: quote.customer_name || "Customer",
    customerEmail: quote.customer_email || "",
    resellerCompany: req.user!.company,
    logoBuffer: logoToBuffer(quote.logo),
  });

  const result = await sendQuoteEmail({
    to: quote.customer_email,
    customerName: quote.customer_name || "Customer",
    quoteNumber: number,
    pdf,
  });
  await markSent(number);
  res.json({ sent: true, ...result });
});
