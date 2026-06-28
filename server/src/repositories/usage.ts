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

export interface UsageTotals {
  reseller_email: string;
  calls: number;    // completed quotes (from the quotes table)
  sessions: number; // distinct AI sessions started (incl. abandoned)
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
}

/**
 * Per-reseller AI usage for admin reporting. Tokens + cost sum across every AI
 * turn in `ai_usage`; `calls` reports the reseller's actual QUOTE count (from
 * the quotes table) since one quote session now spans many AI turns. Resellers
 * who have either quotes or AI usage are included.
 */
export async function usageByReseller(): Promise<UsageTotals[]> {
  const r = await query<UsageTotals>(
    `WITH u AS (
        SELECT reseller_email,
               SUM(input_tokens)  AS input_tokens,
               SUM(output_tokens) AS output_tokens,
               SUM(cost_usd)      AS cost_usd,
               COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS sessions
          FROM ai_usage GROUP BY reseller_email
     ), q AS (
        SELECT reseller_email, COUNT(*) AS quote_count
          FROM quotes GROUP BY reseller_email
     )
     SELECT COALESCE(u.reseller_email, q.reseller_email) AS reseller_email,
            COALESCE(q.quote_count, 0)::int AS calls,
            COALESCE(u.sessions, 0)::int    AS sessions,
            COALESCE(u.input_tokens, 0)     AS input_tokens,
            COALESCE(u.output_tokens, 0)    AS output_tokens,
            COALESCE(u.cost_usd, 0)         AS cost_usd
       FROM u FULL OUTER JOIN q ON u.reseller_email = q.reseller_email
      ORDER BY cost_usd DESC`
  );
  return r.rows;
}

/** Overall totals: tokens/cost across all AI turns; `calls` = quotes, `sessions` = AI sessions. */
export async function usageOverall(): Promise<{ calls: number; sessions: number; input_tokens: string; output_tokens: string; cost_usd: string }> {
  const r = await query<{ calls: number; sessions: number; input_tokens: string; output_tokens: string; cost_usd: string }>(
    `SELECT (SELECT COUNT(*) FROM quotes)::int AS calls,
            (SELECT COUNT(DISTINCT session_id) FROM ai_usage WHERE session_id IS NOT NULL)::int AS sessions,
            COALESCE(SUM(input_tokens),0)  AS input_tokens,
            COALESCE(SUM(output_tokens),0) AS output_tokens,
            COALESCE(SUM(cost_usd),0)      AS cost_usd
       FROM ai_usage`
  );
  return r.rows[0];
}
