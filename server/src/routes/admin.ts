import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { loadPricelist } from "../db.js";
import { listResellers, getReseller } from "../repositories/resellers.js";
import { listAllQuotes, getQuoteAny } from "../repositories/quotes.js";
import { usageByReseller, usageOverall } from "../repositories/usage.js";
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
  const keys: (keyof Rates)[] = ["discount", "competitiveBonus", "implRate", "managedRate", "markupDefault", "markupMin", "markupMax"];
  const next: Partial<Rates> = {};
  for (const k of keys) if (body[k] !== undefined && !Number.isNaN(Number(body[k]))) next[k] = Number(body[k]);
  res.json(await setRates(next));
});

/** Any quote's branded PDF (admin bypass of per-reseller scope). */
adminRouter.get("/quotes/:number/pdf", async (req, res) => {
  const number = Number(req.params.number);
  const quote = await getQuoteAny(number);
  if (!quote) return res.status(404).json({ error: "Quote not found" });

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
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="quote-${number}.pdf"`);
  res.send(pdf);
});
