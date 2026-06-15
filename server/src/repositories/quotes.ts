import { query } from "../db.js";
import { config } from "../config.js";
import type { QuoteSelection, QuoteTotals } from "../types.js";

export async function highestQuoteNumber(): Promise<number | null> {
  const r = await query<{ max: string | null }>("SELECT MAX(number)::bigint AS max FROM quotes");
  const max = r.rows[0]?.max;
  return max == null ? null : Number(max);
}

export async function nextNumber(): Promise<number> {
  const highest = await highestQuoteNumber();
  return highest == null ? config.pricing.quoteStart : highest + 1;
}

export interface SaveQuoteInput {
  number: number;
  resellerEmail: string;
  customerName: string;
  customerEmail: string;
  selection: QuoteSelection;
  totals: QuoteTotals;
}

export async function saveQuote(input: SaveQuoteInput): Promise<void> {
  const { number, resellerEmail, customerName, customerEmail, selection, totals } = input;
  const client = await (await import("../db.js")).pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO quotes
         (number, reseller_email, customer_name, customer_email, currency,
          discount, markup, reseller_total, customer_total, margin, selection, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft')
       ON CONFLICT (number) DO UPDATE SET
         customer_name = EXCLUDED.customer_name,
         customer_email = EXCLUDED.customer_email,
         markup = EXCLUDED.markup,
         reseller_total = EXCLUDED.reseller_total,
         customer_total = EXCLUDED.customer_total,
         margin = EXCLUDED.margin,
         selection = EXCLUDED.selection`,
      [
        number, resellerEmail, customerName, customerEmail, totals.currency,
        totals.discount, totals.markup, totals.resellerTotal,
        totals.customerTotal, totals.margin, JSON.stringify(selection),
      ]
    );
    await client.query("DELETE FROM quote_items WHERE quote_number = $1", [number]);
    for (const it of totals.items) {
      await client.query(
        `INSERT INTO quote_items
           (quote_number, item_key, label, meta, list_total, reseller_price, service)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [number, it.key, it.label, it.meta, it.listTotal, it.reseller, it.service]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export interface QuoteRow {
  number: number;
  customer_name: string;
  customer_email: string;
  reseller_email: string;
  markup: string;
  status: string;
}

export interface QuoteListRow {
  number: number;
  customer_name: string;
  customer_email: string;
  customer_total: string;
  reseller_total: string;
  markup: string;
  status: string;
  created_at: string;
  sku: string | null;
}

/** All quotes for a reseller, newest first — powers My Quotes + Recent Quotes. */
export async function listQuotes(resellerEmail: string): Promise<QuoteListRow[]> {
  const r = await query<QuoteListRow>(
    `SELECT number, customer_name, customer_email, customer_total, reseller_total,
            markup, status, created_at, selection->>'sku' AS sku
       FROM quotes
      WHERE reseller_email = $1
      ORDER BY number DESC`,
    [resellerEmail]
  );
  return r.rows;
}

export async function getQuote(number: number): Promise<QuoteRow | null> {
  const r = await query<QuoteRow>("SELECT * FROM quotes WHERE number = $1", [number]);
  return r.rows[0] || null;
}

export async function markSent(number: number): Promise<void> {
  await query("UPDATE quotes SET status = 'sent' WHERE number = $1", [number]);
}
