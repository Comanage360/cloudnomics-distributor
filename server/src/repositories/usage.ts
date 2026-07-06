import { query } from "../db.js";
import { config } from "../config.js";
import type { UsageInfo } from "../types.js";

/** USD cost of a usage record from the configured per-million token prices. */
export function usageCost(u: UsageInfo): number {
  const { inputPerM, outputPerM } = config.aiPricing;
  return (u.inputTokens / 1e6) * inputPerM + (u.outputTokens / 1e6) * outputPerM;
}

/** Record one Claude call's token usage + computed cost, tagged to its session. */
export async function insertUsage(resellerEmail: string, u: UsageInfo, sessionId?: string | null): Promise<void> {
  await query(
    `INSERT INTO ai_usage (reseller_email, model, input_tokens, output_tokens, cost_usd, session_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [resellerEmail, u.model, u.inputTokens, u.outputTokens, usageCost(u), sessionId ?? null]
  );
}

/** Attribute a session's AI turns to the quote it produced (called on finalize). */
export async function linkUsageToQuote(resellerEmail: string, sessionId: string, quoteNumber: number): Promise<void> {
  if (!sessionId) return;
  await query(
    `UPDATE ai_usage SET quote_number = $1
      WHERE reseller_email = $2 AND session_id = $3 AND quote_number IS NULL`,
    [quoteNumber, resellerEmail, sessionId]
  );
}

/** AI spend (USD) a reseller incurred within the last `days` — used to enforce
 *  the rolling monthly (30d) / yearly (365d) dollar spend limits. */
export async function resellerCostSince(resellerEmail: string, days: number): Promise<number> {
  const r = await query<{ total: string }>(
    `SELECT COALESCE(SUM(cost_usd), 0) AS total
       FROM ai_usage
      WHERE reseller_email = $1
        AND created_at >= now() - ($2 || ' days')::interval`,
    [resellerEmail, String(days)]
  );
  return Number(r.rows[0]?.total ?? 0);
}

export interface UsageTotals {
  reseller_email: string;
  company: string | null; // reseller display name
  calls: number;          // completed quotes (from the quotes table)
  incomplete: number;     // sessions that used AI but never produced a quote
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
}

/**
 * Per-reseller AI usage for admin reporting. Tokens + cost sum across every AI
 * turn in `ai_usage`; `calls` is the reseller's QUOTE count (one quote per
 * session); `incomplete` is the number of distinct sessions that used AI but
 * never produced a quote (abandoned / in-progress). Resellers with either
 * quotes or AI usage are included, with their company name.
 */
export async function usageByReseller(): Promise<UsageTotals[]> {
  const r = await query<UsageTotals>(
    `WITH u AS (
        SELECT reseller_email,
               SUM(input_tokens)  AS input_tokens,
               SUM(output_tokens) AS output_tokens,
               SUM(cost_usd)      AS cost_usd,
               COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL AND quote_number IS NULL) AS incomplete
          FROM ai_usage GROUP BY reseller_email
     ), q AS (
        SELECT reseller_email, COUNT(*) AS quote_count
          FROM quotes GROUP BY reseller_email
     )
     SELECT COALESCE(u.reseller_email, q.reseller_email) AS reseller_email,
            r.company AS company,
            COALESCE(q.quote_count, 0)::int AS calls,
            COALESCE(u.incomplete, 0)::int  AS incomplete,
            COALESCE(u.input_tokens, 0)     AS input_tokens,
            COALESCE(u.output_tokens, 0)    AS output_tokens,
            COALESCE(u.cost_usd, 0)         AS cost_usd
       FROM u FULL OUTER JOIN q ON u.reseller_email = q.reseller_email
       LEFT JOIN resellers r ON r.email = COALESCE(u.reseller_email, q.reseller_email)
      ORDER BY cost_usd DESC`
  );
  return r.rows;
}

/** Overall totals: tokens/cost across all AI turns; `calls` = quotes, `incomplete` = sessions with no quote. */
export async function usageOverall(): Promise<{ calls: number; incomplete: number; input_tokens: string; output_tokens: string; cost_usd: string }> {
  const r = await query<{ calls: number; incomplete: number; input_tokens: string; output_tokens: string; cost_usd: string }>(
    `SELECT (SELECT COUNT(*) FROM quotes)::int AS calls,
            (SELECT COUNT(DISTINCT session_id) FROM ai_usage WHERE session_id IS NOT NULL AND quote_number IS NULL)::int AS incomplete,
            COALESCE(SUM(input_tokens),0)  AS input_tokens,
            COALESCE(SUM(output_tokens),0) AS output_tokens,
            COALESCE(SUM(cost_usd),0)      AS cost_usd
       FROM ai_usage`
  );
  return r.rows[0];
}
