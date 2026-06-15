import PDFDocument from "pdfkit";
import type { QuoteTotals } from "../types.js";

const EMBER = "#FF5A36";
const INK = "#131A2B";
const MUTED = "#5C6781";
const LINE = "#E2E6EF";

export interface QuotePdfInput {
  quoteNumber: number;
  totals: QuoteTotals;
  customerName: string;
  resellerCompany: string;
  logoBuffer?: Buffer | null;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** Render the customer-facing quote PDF and resolve a Buffer. */
export function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  const { quoteNumber, totals, customerName, resellerCompany, logoBuffer } = input;
  const markupMult = 1 + totals.markup / 100;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header
    if (logoBuffer) {
      try { doc.image(logoBuffer, left, 50, { fit: [180, 50] }); } catch { /* ignore bad logo */ }
    } else {
      doc.font("Helvetica-Bold").fontSize(20).fillColor(INK).text(resellerCompany, left, 52);
    }
    doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text("QUOTE", left, 50, { width, align: "right" });
    doc.font("Helvetica").fontSize(10).fillColor(MUTED)
      .text(`#${quoteNumber}`, left, 72, { width, align: "right" })
      .text(new Date().toLocaleDateString(), left, 86, { width, align: "right" });

    doc.font("Helvetica").fontSize(10).fillColor(MUTED).text(`Prepared for ${customerName}`, left, 92);

    // Accent rule
    doc.moveTo(left, 118).lineTo(right, 118).lineWidth(2).strokeColor(EMBER).stroke();

    // Table header
    let y = 140;
    doc.font("Helvetica-Bold").fontSize(10).fillColor(MUTED);
    doc.text("ITEM", left, y);
    doc.text("AMOUNT", left, y, { width, align: "right" });
    y += 18;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(LINE).stroke();
    y += 10;

    // Rows (customer prices = reseller price * markup multiplier)
    for (const it of totals.items) {
      const cust = Math.round(it.reseller * markupMult);
      // On-request products (e.g. CN-Series) carry no price — show "On request".
      const amount = it.key === "fw" && it.reseller === 0 ? "On request" : fmt(cust);
      doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(it.label, left, y, { width: width - 110 });
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(it.meta, left, y + 14, { width: width - 110 });
      doc.font("Helvetica").fontSize(11).fillColor(INK).text(amount, left, y, { width, align: "right" });
      y += 34;
      doc.moveTo(left, y - 6).lineTo(right, y - 6).lineWidth(0.5).strokeColor(LINE).stroke();
    }

    // Total
    y += 8;
    const total = totals.markup > 0 ? totals.customerTotal : totals.resellerTotal;
    doc.moveTo(left + width / 2, y).lineTo(right, y).lineWidth(2).strokeColor(INK).stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text("Total", left + width / 2, y);
    doc.font("Helvetica-Bold").fontSize(13).fillColor(EMBER).text(fmt(total), left, y, { width, align: "right" });

    // Footer
    doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
      "Prepared via the Cloudnomics Distributor Console. Pricing valid 30 days. " +
        "Palo Alto Networks products supplied through Cloudnomics, authorized distributor.",
      left, doc.page.height - 80, { width }
    );

    doc.end();
  });
}
