import { getResellerLimits } from "../repositories/resellers.js";
import { resellerCostSince } from "../repositories/usage.js";
import type { Rates } from "../types.js";

export interface LimitStatus {
  blocked: boolean;
  period: "monthly" | "yearly" | null;
  used: number;   // USD spent in the breached window
  limit: number;  // USD cap
}

/** Effective rolling $ caps for a reseller: per-account override ?? global default.
 *  null override = inherit default; 0 (override or default) = unlimited. */
export async function effectiveLimits(email: string, rates: Rates): Promise<{ monthly: number; yearly: number }> {
  const ov = await getResellerLimits(email).catch(() => null);
  const monthly = ov?.monthly_cost_limit != null ? Number(ov.monthly_cost_limit) : Number(rates.costLimitMonthly) || 0;
  const yearly = ov?.yearly_cost_limit != null ? Number(ov.yearly_cost_limit) : Number(rates.costLimitYearly) || 0;
  return { monthly, yearly };
}

/** Whether the reseller is over either rolling $ window right now (monthly first).
 *  Returns which window was breached plus the spent/limit for messaging. */
export async function evaluateLimit(email: string, rates: Rates): Promise<LimitStatus> {
  const { monthly, yearly } = await effectiveLimits(email, rates);
  if (monthly > 0) {
    const used = await resellerCostSince(email, 30).catch(() => 0);
    if (used >= monthly) return { blocked: true, period: "monthly", used, limit: monthly };
  }
  if (yearly > 0) {
    const used = await resellerCostSince(email, 365).catch(() => 0);
    if (used >= yearly) return { blocked: true, period: "yearly", used, limit: yearly };
  }
  return { blocked: false, period: null, used: 0, limit: 0 };
}
