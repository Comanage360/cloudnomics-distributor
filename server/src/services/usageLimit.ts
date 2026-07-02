import { getResellerLimits } from "../repositories/resellers.js";
import { resellerCostSince } from "../repositories/usage.js";
import type { Rates } from "../types.js";

export interface LimitStatus {
  blocked: boolean;
  period: "monthly" | null;
  used: number;   // USD spent in the rolling window
  limit: number;  // USD cap
}

/** Effective rolling monthly $ cap for a reseller: per-account override ?? global
 *  default. null override = inherit default; 0 (override or default) = unlimited. */
export async function effectiveLimit(email: string, rates: Rates): Promise<number> {
  const ov = await getResellerLimits(email).catch(() => null);
  return ov?.monthly_cost_limit != null ? Number(ov.monthly_cost_limit) : Number(rates.costLimitMonthly) || 0;
}

/** Whether the reseller is over their rolling 30-day $ cap right now. */
export async function evaluateLimit(email: string, rates: Rates): Promise<LimitStatus> {
  const monthly = await effectiveLimit(email, rates);
  if (monthly > 0) {
    const used = await resellerCostSince(email, 30).catch(() => 0);
    if (used >= monthly) return { blocked: true, period: "monthly", used, limit: monthly };
  }
  return { blocked: false, period: null, used: 0, limit: 0 };
}
