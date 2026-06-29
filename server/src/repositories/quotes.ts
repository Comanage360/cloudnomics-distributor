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
  logo?: string | null;
}

export async function saveQuote(input: SaveQuoteInput): Promise<void> {
  const { number, resellerEmail, customerName, customerEmail, selection, totals, logo = null } = input;
  const client = await (await import("../db.js")).pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO quotes
         (number, reseller_email, customer_name, customer_email, currency,
          discount, markup, reseller_total, customer_total, margin, selection, logo, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'draft')
       ON CONFLICT (number) DO UPDATE SET
         customer_name = EXCLUDED.customer_name,
         customer_email = EXCLUDED.customer_email,
         markup = EXCLUDED.markup,
         reseller_total = EXCLUDED.reseller_total,
         customer_total = EXCLUDED.customer_total,
         margin = EXCLUDED.margin,
         selection = EXCLUDED.selection,
         logo = EXCLUDED.logo`,
      [
        number, resellerEmail, customerName, customerEmail, totals.currency,
        totals.discount, totals.markup, totals.resellerTotal,
        totals.customerTotal, totals.margin, JSON.stringify(selection), logo,
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
  logo: string | null;
  selection: QuoteSelection;
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

export interface AdminQuoteRow extends QuoteListRow {
  reseller_email: string;
  ai_input_tokens: string;
  ai_output_tokens: string;
  ai_cost: string;
  ai_turns: number;
}

/** All quotes across resellers (admin), optionally filtered to one reseller.
 *  Includes per-quote AI token usage + cost (summed from ai_usage by quote). */
export async function listAllQuotes(resellerEmail?: string): Promise<AdminQuoteRow[]> {
  const r = await query<AdminQuoteRow>(
    `SELECT q.number, q.reseller_email, q.customer_name, q.customer_email, q.customer_total,
            q.reseller_total, q.markup, q.status, q.created_at, q.selection->>'sku' AS sku,
            COALESCE(u.input_tokens, 0)  AS ai_input_tokens,
            COALESCE(u.output_tokens, 0) AS ai_output_tokens,
            COALESCE(u.cost_usd, 0)      AS ai_cost,
            COALESCE(u.turns, 0)::int    AS ai_turns
       FROM quotes q
       LEFT JOIN (
         SELECT quote_number,
                SUM(input_tokens)  AS input_tokens,
                SUM(output_tokens) AS output_tokens,
                SUM(cost_usd)      AS cost_usd,
                COUNT(*)           AS turns
           FROM ai_usage WHERE quote_number IS NOT NULL
          GROUP BY quote_number
       ) u ON u.quote_number = q.number
      ${resellerEmail ? "WHERE q.reseller_email = $1" : ""}
      ORDER BY q.number DESC`,
    resellerEmail ? [resellerEmail] : []
  );
  return r.rows;
}

/** Fetch any quote regardless of owner (admin only). */
export async function getQuoteAny(number: number): Promise<QuoteRow | null> {
  const r = await query<QuoteRow>("SELECT * FROM quotes WHERE number = $1", [number]);
  return r.rows[0] || null;
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

/** Fetch a quote, scoped to its owning reseller (cross-reseller access returns null). */
export async function getQuote(number: number, resellerEmail: string): Promise<QuoteRow | null> {
  const r = await query<QuoteRow>(
    "SELECT * FROM quotes WHERE number = $1 AND reseller_email = $2",
    [number, resellerEmail]
  );
  return r.rows[0] || null;
}

export async function markSent(number: number): Promise<void> {
  await query("UPDATE quotes SET status = 'sent' WHERE number = $1", [number]);
}
