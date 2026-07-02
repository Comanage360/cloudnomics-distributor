import { getResellerLimits } from "../repositories/resellers.js";
import { resellerTokenUsedSince } from "../repositories/usage.js";
import type { Rates } from "../types.js";

export interface LimitStatus {
  blocked: boolean;
  period: "monthly" | "yearly" | null;
  used: number;
  limit: number;
}

/** Effective rolling caps for a reseller: per-account override ?? global default.
 *  null override = inherit default; 0 (override or default) = unlimited. */
export async function effectiveLimits(email: string, rates: Rates): Promise<{ monthly: number; yearly: number }> {
  const ov = await getResellerLimits(email).catch(() => null);
  const monthly = ov?.monthly_token_limit != null ? Number(ov.monthly_token_limit) : Number(rates.tokenLimitMonthly) || 0;
  const yearly = ov?.yearly_token_limit != null ? Number(ov.yearly_token_limit) : Number(rates.tokenLimitYearly) || 0;
  return { monthly, yearly };
}

/** Whether the reseller is over either rolling window right now (monthly checked
 *  first). Returns which window was breached plus the used/limit for messaging. */
export async function evaluateLimit(email: string, rates: Rates): Promise<LimitStatus> {
  const { monthly, yearly } = await effectiveLimits(email, rates);
  if (monthly > 0) {
    const used = await resellerTokenUsedSince(email, 30).catch(() => 0);
    if (used >= monthly) return { blocked: true, period: "monthly", used, limit: monthly };
  }
  if (yearly > 0) {
    const used = await resellerTokenUsedSince(email, 365).catch(() => 0);
    if (used >= yearly) return { blocked: true, period: "yearly", used, limit: yearly };
  }
  return { blocked: false, period: null, used: 0, limit: 0 };
}
