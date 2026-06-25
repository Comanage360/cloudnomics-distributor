import { query } from "../db.js";
import { config } from "../config.js";
import type { UsageInfo } from "../types.js";

/** USD cost of a usage record from the configured per-million token prices. */
export function usageCost(u: UsageInfo): number {
  const { inputPerM, outputPerM } = config.aiPricing;
  return (u.inputTokens / 1e6) * inputPerM + (u.outputTokens / 1e6) * outputPerM;
}

/** Record one Claude call's token usage + computed cost. */
export async function insertUsage(resellerEmail: string, u: UsageInfo): Promise<void> {
  await query(
    `INSERT INTO ai_usage (reseller_email, model, input_tokens, output_tokens, cost_usd)
     VALUES ($1, $2, $3, $4, $5)`,
    [resellerEmail, u.model, u.inputTokens, u.outputTokens, usageCost(u)]
  );
}

export interface UsageTotals {
  reseller_email: string;
  calls: number;
  input_tokens: string;
  output_tokens: string;
  cost_usd: string;
}

/** Per-reseller token + cost totals (admin reporting). */
export async function usageByReseller(): Promise<UsageTotals[]> {
  const r = await query<UsageTotals>(
    `SELECT reseller_email,
            COUNT(*)::int AS calls,
            COALESCE(SUM(input_tokens),0)  AS input_tokens,
            COALESCE(SUM(output_tokens),0) AS output_tokens,
            COALESCE(SUM(cost_usd),0)      AS cost_usd
       FROM ai_usage
      GROUP BY reseller_email
      ORDER BY cost_usd DESC`
  );
  return r.rows;
}

/** Overall totals across all resellers. */
export async function usageOverall(): Promise<{ calls: number; input_tokens: string; output_tokens: string; cost_usd: string }> {
  const r = await query<{ calls: number; input_tokens: string; output_tokens: string; cost_usd: string }>(
    `SELECT COUNT(*)::int AS calls,
            COALESCE(SUM(input_tokens),0)  AS input_tokens,
            COALESCE(SUM(output_tokens),0) AS output_tokens,
            COALESCE(SUM(cost_usd),0)      AS cost_usd
       FROM ai_usage`
  );
  return r.rows[0];
}
