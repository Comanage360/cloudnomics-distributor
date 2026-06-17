import PDFDocument from "pdfkit";
import type { QuoteTotals } from "../types.js";

const EMBER = "#FF5A36";
const EMBER_SOFT = "#FFF1ED";
const INK = "#131A2B";
const MUTED = "#5C6781";
const LINE = "#E2E6EF";

export interface QuotePdfInput {
  quoteNumber: number;
  totals: QuoteTotals;
  customerName: string;
  customerEmail?: string;
  resellerCompany: string;
  logoBuffer?: Buffer | null;
}

const fmt = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const fmtDate = (d: Date) => d.toLocaleDateString("en-US");

/** Render the customer-facing "SALES QUOTE" PDF and resolve a Buffer. */
export function renderQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  const { quoteNumber, totals, customerName, customerEmail, resellerCompany, logoBuffer } = input;
  const markupMult = 1 + totals.markup / 100;

  // Customer-facing rows (list price, effective discount off list, amount).
  const rows = totals.items.map((it) => {
    const onRequest = it.key === "fw" && it.reseller === 0;
    const amount = Math.round(it.reseller * markupMult);
    const showDisc = !onRequest && it.listTotal > 0 && it.listTotal >= amount;
    return {
      label: it.label,
      meta: it.meta,
      qty: it.qty ?? 1,
      onRequest,
      amount,
      listText: onRequest ? "—" : fmt(it.listTotal > 0 ? it.listTotal : amount),
      discText: showDisc ? `${Math.round((1 - amount / it.listTotal) * 100)}%` : "—",
      amountText: onRequest ? "On request" : fmt(amount),
    };
  });
  const subtotal = rows.reduce((s, r) => s + r.amount, 0);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // ---- Header ----
    // White-label: show the reseller's logo if they uploaded one; otherwise
    // brand the quote as Cloudnomics (the distributor), not a derived name.
    let logoOk = false;
    if (logoBuffer) {
      try { doc.image(logoBuffer, left, 50, { fit: [200, 50] }); logoOk = true; } catch { /* fall back to text */ }
    }
    if (!logoOk) {
      doc.font("Helvetica-Bold").fontSize(22).fillColor(INK).text("Cloudnomics", left, 52, { width: 260 });
    }

    doc.font("Helvetica-Bold").fontSize(20).fillColor(EMBER).text("SALES QUOTE", left, 50, { width, align: "right" });

    const meta: [string, string][] = [
      ["Quotation No.", String(quoteNumber)],
      ["Quotation Date", fmtDate(new Date())],
      ["Valid Until", fmtDate(new Date(Date.now() + 30 * 864e5))],
      ["Type of Sale", "New Quote"],
    ];
    let my = 78;
    for (const [k, v] of meta) {
      doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(k, left, my, { width: width - 120, align: "right" });
      doc.font("Helvetica-Bold").fontSize(9).fillColor(INK).text(v, left, my, { width, align: "right" });
      my += 13;
    }

    // ---- Parties + total band ----
    let y = 150;
    const colW = width / 3;
    doc.roundedRect(left, y, width, 56, 6).lineWidth(1).strokeColor(LINE).stroke();
    doc.rect(left + 2 * colW, y + 1, colW - 2, 54).fillColor(EMBER_SOFT).fill();

    const cell = (cx: number, head: string, name: string, info: string, accent = false) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED).text(head, cx + 12, y + 10, { width: colW - 20 });
      doc.font("Helvetica-Bold").fontSize(accent ? 14 : 11).fillColor(accent ? EMBER : INK)
        .text(name, cx + 12, y + 24, { width: colW - 20 });
      if (info) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(info, cx + 12, y + (accent ? 42 : 40), { width: colW - 20 });
    };
    cell(left, "BILL TO", customerName, customerEmail || "");
    cell(left + colW, "PREPARED BY", resellerCompany, "via Cloudnomics Distributor Console");
    cell(left + 2 * colW, "TOTAL", fmt(subtotal), "Taxes / shipping if applicable", true);
    for (let i = 1; i < 3; i++) doc.moveTo(left + i * colW, y).lineTo(left + i * colW, y + 56).lineWidth(1).strokeColor(LINE).stroke();

    // ---- Line items table ----
    y += 80;
    const cQty = left, cItem = left + 46, cList = left + 300, cDisc = left + 365, cAmt = left + 420;
    const wList = 60, wDisc = 50, wAmt = right - cAmt;
    const drawHead = () => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor(MUTED);
      doc.text("QTY", cQty, y, { width: 40, align: "center" });
      doc.text("ITEM & DESCRIPTION", cItem, y, { width: cList - cItem - 10 });
      doc.text("LIST PRICE", cList, y, { width: wList, align: "right" });
      doc.text("DISC.", cDisc, y, { width: wDisc, align: "right" });
      doc.text("AMOUNT", cAmt, y, { width: wAmt, align: "right" });
      y += 14;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(1.5).strokeColor(INK).stroke();
      y += 10;
    };
    drawHead();

    for (const r of rows) {
      const itemW = cList - cItem - 10;
      const hLabel = doc.font("Helvetica-Bold").fontSize(10).heightOfString(r.label, { width: itemW });
      const hMeta = r.meta ? doc.font("Helvetica").fontSize(8).heightOfString(r.meta, { width: itemW }) : 0;
      const rowH = Math.max(22, hLabel + hMeta + 8);

      if (y + rowH > doc.page.height - 90) {
        doc.addPage();
        y = 60;
        drawHead();
      }

      doc.font("Helvetica").fontSize(10).fillColor(INK).text(String(r.qty), cQty, y, { width: 40, align: "center" });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(r.label, cItem, y, { width: itemW });
      if (r.meta) doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(r.meta, cItem, y + hLabel + 1, { width: itemW });
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(r.listText, cList, y, { width: wList, align: "right" });
      doc.font("Helvetica").fontSize(9.5).fillColor(MUTED).text(r.discText, cDisc, y, { width: wDisc, align: "right" });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(r.amountText, cAmt, y, { width: wAmt, align: "right" });

      y += rowH;
      doc.moveTo(left, y - 5).lineTo(right, y - 5).lineWidth(0.5).strokeColor(LINE).stroke();
    }

    // ---- Totals ----
    y += 10;
    const tx = right - 260;
    const totRow = (label: string, value: string, muted = false) => {
      doc.font("Helvetica").fontSize(10).fillColor(muted ? MUTED : INK).text(label, tx, y, { width: 150 });
      doc.font("Helvetica").fontSize(10).fillColor(muted ? MUTED : INK).text(value, tx, y, { width: 260, align: "right" });
      y += 16;
    };
    totRow("Subtotal", fmt(subtotal));
    totRow("Tax", "—", true);
    doc.moveTo(tx, y).lineTo(right, y).lineWidth(2).strokeColor(INK).stroke();
    y += 8;
    doc.font("Helvetica-Bold").fontSize(12).fillColor(INK).text("Total Order Value", tx, y, { width: 150 });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(EMBER).text(fmt(subtotal), tx, y, { width: 260, align: "right" });

    // ---- Footer ----
    // Constrain every footer text (lineBreak:false / height) so wrapping can
    // never overflow the bottom margin and make PDFKit append blank pages.
    const fy = doc.page.height - 88;
    doc.moveTo(left, fy).lineTo(right, fy).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.font("Helvetica-Bold").fontSize(9).fillColor(INK)
      .text(resellerCompany, left, fy + 9, { width: width / 2, lineBreak: false });
    doc.font("Helvetica").fontSize(8).fillColor(MUTED)
      .text("Prepared via the Cloudnomics Distributor Console", left, fy + 22, { width: width / 2, lineBreak: false });
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(
      "Pricing valid 30 days from the quotation date. Palo Alto Networks products supplied through Cloudnomics, authorized distributor.",
      left + width / 2, fy + 9, { width: width / 2, align: "right", height: 60, ellipsis: true }
    );

    doc.end();
  });
}
