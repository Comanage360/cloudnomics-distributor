import { config } from "../config.js";
import { orgCostSince } from "../repositories/usage.js";
import { sendNotification } from "./mailer.js";
import type { Rates } from "../types.js";

export interface OrgBudgetStatus { over: boolean; used: number; budget: number }

let lastAlertAt = 0;                       // ms — throttle admin alerts to ≤1/day
let lastLevel: "" | "warn" | "over" = "";
const DAY = 24 * 60 * 60 * 1000;

/** Org-wide AI spend vs the admin-set monthly budget (rolling 30 days). Fires a
 *  throttled admin alert at ≥80% (warning) and at 100% (blocked). budget 0 = off. */
export async function checkOrgBudget(rates: Rates): Promise<OrgBudgetStatus> {
  const budget = Number(rates.orgMonthlyAiBudget) || 0;
  if (budget <= 0) return { over: false, used: 0, budget: 0 };

  const used = await orgCostSince(30).catch(() => 0);
  const over = used >= budget;
  const level = over ? "over" : used >= budget * 0.8 ? "warn" : "";

  if (level && (Date.now() - lastAlertAt > DAY || level !== lastLevel)) {
    lastAlertAt = Date.now();
    lastLevel = level;
    const usd = (n: number) => `$${n.toFixed(2)}`;
    const subject = over
      ? `⚠ Cloudnomics AI budget REACHED (${usd(used)} of ${usd(budget)})`
      : `Cloudnomics AI budget at ${Math.round((used / budget) * 100)}% (${usd(used)} of ${usd(budget)})`;
    const body = over
      ? "The platform-wide monthly AI budget has been reached — the assistant is now blocked for all resellers until you raise the budget (admin dashboard → Usage limits) or spend rolls off the 30-day window."
      : `Heads up: platform-wide AI spend is at ${usd(used)} of the ${usd(budget)} monthly budget (last 30 days).`;
    sendNotification(config.adminEmails, subject, body).catch((e) => console.error("[orgBudget:alert]", e));
  }
  return { over, used, budget };
}
