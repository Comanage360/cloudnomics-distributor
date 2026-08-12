import { query } from "../db.js";
import { config } from "../config.js";
import type { Rates } from "../types.js";

const defaults = (): Rates => ({
  discount: config.pricing.discount,
  competitiveBonus: config.pricing.competitiveBonus,
  implRate: config.pricing.implRate,
  managedRate: config.pricing.managedRate,
  markupDefault: config.pricing.markupDefault,
  markupMin: config.pricing.markupMin,
  markupMax: config.pricing.markupMax,
  costLimitMonthly: config.pricing.costLimitMonthly,
  // Empty by default: every discount category falls back to `discount` (30%)
  // until an admin sets the real PANW per-category rates.
  catalogDiscounts: {},
});

let cache: Rates | null = null;

/** Current pricing rates — DB settings('rates') merged over config defaults. */
export async function getRates(): Promise<Rates> {
  if (cache) return cache;
  let stored: Partial<Rates> = {};
  try {
    const r = await query<{ value: Partial<Rates> }>("SELECT value FROM settings WHERE key = 'rates'");
    if (r.rows[0]?.value) stored = r.rows[0].value;
  } catch { /* table may not exist yet — fall back to defaults */ }
  cache = { ...defaults(), ...stored };
  return cache;
}

/** Persist rates (admin) and refresh the cache. */
export async function setRates(next: Partial<Rates>): Promise<Rates> {
  const merged = { ...(await getRates()), ...next };
  await query(
    `INSERT INTO settings (key, value) VALUES ('rates', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(merged)]
  );
  cache = merged;
  return merged;
}
