import type { Pricelist, Recommendation } from "../types.js";

/** Heuristic: does the requirement describe a virtual/cloud deployment? */
function wantsVirtual(requirement: string): boolean {
  return /\b(virtual|vm|cloud|aws|azure|gcp|google cloud|data ?cent(er|re)|hypervisor|vmware|kvm|esxi)\b/i.test(
    requirement
  );
}

/** Local fallback: size by detected user count + inferred type, no API needed.
 *  Used by the chat advisor (chatAdvisor.ts) to seed an initial firewall pick. */
export function fallbackRecommendation(
  requirement: string,
  pricelist: Pricelist
): Recommendation {
  const m = requirement.replace(/,/g, "").match(/(\d{2,6})/);
  const users = m ? parseInt(m[1], 10) : 200;
  const series = wantsVirtual(requirement) ? "VM-Series" : "PA-Series";
  // Only price-able rows in the inferred series; fall back to any priceable row.
  const inSeries = pricelist.firewalls.filter((f) => f.list != null && f.series === series);
  const pool = inSeries.length
    ? inSeries
    : pricelist.firewalls.filter((f) => f.list != null);
  const fw = pool.find((f) => users <= f.maxUsers) || pool[pool.length - 1];
  const kind = fw.series === "VM-Series" ? "virtual firewall" : "firewall";
  return {
    sku: fw.sku,
    users,
    series: fw.series,
    unit: fw.unit,
    message: `For around ${users} users, the ${fw.sku} is the right fit — it's a ${kind} sized for up to ${fw.maxUsers} seats with room to grow.`,
    source: "fallback",
  };
}
