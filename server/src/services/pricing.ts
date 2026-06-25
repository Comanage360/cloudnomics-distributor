import { config } from "../config.js";
import type {
  Pricelist,
  QuoteSelection,
  QuoteTotals,
  LineItem,
  Firewall,
  Rates,
} from "../types.js";

const { quoteStart } = config.pricing;

const round = (n: number) => Math.round(n);
const pct = (r: number) => `${Math.round(r * 100)}%`;

/** Human-readable suffix for a product's price unit. */
function unitLabel(unit: Firewall["unit"]): string {
  if (unit === "annual") return "per year";
  if (unit === "on_request") return "on request";
  return "one-time";
}

function line(
  key: string,
  label: string,
  meta: string,
  qty: number,
  listTotal: number,
  reseller: number,
  service: boolean
): LineItem {
  return { key, label, meta, qty, listTotal: round(listTotal), reseller: round(reseller), service };
}

/** Smallest priceable firewall that covers the user count, optionally by type. */
export function pickFirewall(
  users: number,
  pricelist: Pricelist,
  type?: "hardware" | "virtual"
) {
  const series = type === "virtual" ? "VM-Series" : type === "hardware" ? "PA-Series" : null;
  // Only consider rows we can actually price (CN-Series is on-request).
  const candidates = pricelist.firewalls.filter(
    (f) => f.list != null && (series ? f.series === series : true)
  );
  const pool = candidates.length ? candidates : pricelist.firewalls;
  return pool.find((f) => users <= f.maxUsers) || pool[pool.length - 1];
}

/**
 * Deterministic quote math — the single source of truth.
 *   product reseller price = list * (1 - discount)
 *   implementation         = implRate * its product reseller price
 *   managed service        = managedRate * subtotal (products + implementations)
 *   customer price         = reseller total * (1 + markup/100)
 */
export function buildQuote(selection: QuoteSelection, pricelist: Pricelist, rates: Rates): QuoteTotals {
  const {
    sku, users, fwImpl = false, xdr = false,
    xdrImpl = false, managed = false, markup = 0, competitiveModel = "",
  } = selection;
  const { implRate, managedRate } = rates;

  // Base reseller discount, plus a competitive-upgrade bonus when migrating
  // from another vendor's product (e.g. Fortinet).
  const effDiscount = Math.min(0.95, rates.discount + (competitiveModel ? rates.competitiveBonus : 0));

  const fw: Firewall =
    pricelist.firewalls.find((f) => f.sku === sku) || pickFirewall(users, pricelist);
  const items: LineItem[] = [];

  // On-request products (CN-Series) have no list price — quote them as a
  // "contact for pricing" line so totals stay valid and no implementation/
  // markup math is applied to a non-existent number.
  if (fw.list == null || fw.unit === "on_request") {
    items.push(line("fw", `${fw.sku} · ${fw.name}`, `Sized to ${users} users · Contact for pricing`, 1, 0, 0, false));
  } else {
    const fwReseller = round(fw.list * (1 - effDiscount));
    items.push(
      line("fw", `${fw.sku} · ${fw.name}`, `Sized to ${users} users · ${unitLabel(fw.unit)}`, 1, fw.list, fwReseller, false)
    );

    if (fwImpl) {
      const v = round(fwReseller * implRate);
      items.push(line("fwimpl", "Implementation — Firewall", `${pct(implRate)} of hardware`, 1, v, v, true));
    }
  }

  if (xdr) {
    const xdrList = pricelist.xdr.listPerUser * users;
    const xdrReseller = round(xdrList * (1 - effDiscount));
    items.push(
      line("xdr", `${pricelist.xdr.sku} · ${pricelist.xdr.name}`,
        `${users} users × $${pricelist.xdr.listPerUser}/yr`, users, xdrList, xdrReseller, false)
    );
    if (xdrImpl) {
      const v = round(xdrReseller * implRate);
      items.push(line("xdrimpl", "Implementation — XDR", `${pct(implRate)} of XDR`, 1, v, v, true));
    }
  }

  const subtotal = items.reduce((s, i) => s + i.reseller, 0);
  if (managed && subtotal > 0) {
    const v = round(subtotal * managedRate);
    items.push(line("managed", "Managed Service", `${pct(managedRate)} of subtotal`, 1, v, v, true));
  }

  const resellerTotal = round(items.reduce((s, i) => s + i.reseller, 0));
  const customerTotal = round(resellerTotal * (1 + markup / 100));

  return {
    items,
    discount: effDiscount,
    markup,
    resellerTotal,
    customerTotal,
    margin: round(customerTotal - resellerTotal),
    currency: pricelist.currency,
  };
}

export function nextQuoteNumber(highest: number | null): number {
  return highest == null ? quoteStart : highest + 1;
}
