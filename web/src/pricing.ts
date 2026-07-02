import type { LineItem, Pricelist, QuoteTotals, Rates } from "./types";

// Mirror of the server pricing rules for instant, live preview as the reseller
// builds the quote. The server recomputes authoritatively on finalize, using
// the same rates (fetched from /api/rates).
export const DEFAULT_RATES: Rates = {
  discount: 0.3, competitiveBonus: 0.1, implRate: 0.15, managedRate: 0.15,
  markupDefault: 15, markupMin: 10, markupMax: 20, costLimitMonthly: 0,
};

const round = (n: number) => Math.round(n);
const pct = (r: number) => `${Math.round(r * 100)}%`;

function unitLabel(unit: Pricelist["firewalls"][number]["unit"]): string {
  if (unit === "annual") return "per year";
  if (unit === "on_request") return "on request";
  return "one-time";
}

export interface Selection {
  firewall: Pricelist["firewalls"][number] | null;
  users: number;
  fwImpl: boolean;
  xdr: boolean;
  xdrImpl: boolean;
  managed: boolean;
  markup: number;
  competitiveModel: string;
}

export function computeTotals(sel: Selection, pricelist: Pricelist | null, rates: Rates = DEFAULT_RATES): QuoteTotals {
  const items: LineItem[] = [];
  const IMPL = rates.implRate, MANAGED = rates.managedRate;
  const eff = Math.min(0.95, rates.discount + (sel.competitiveModel ? rates.competitiveBonus : 0));
  if (sel.firewall) {
    const fw = sel.firewall;
    if (fw.list == null || fw.unit === "on_request") {
      items.push({ key: "fw", label: `${fw.sku} · ${fw.name}`, meta: `Sized to ${sel.users} users · Contact for pricing`, qty: 1, listTotal: 0, reseller: 0, service: false });
    } else {
      const r = round(fw.list * (1 - eff));
      items.push({ key: "fw", label: `${fw.sku} · ${fw.name}`, meta: `Sized to ${sel.users} users · ${unitLabel(fw.unit)}`, qty: 1, listTotal: fw.list, reseller: r, service: false });
      if (sel.fwImpl) items.push({ key: "fwimpl", label: "Implementation — Firewall", meta: `${pct(IMPL)} of hardware`, qty: 1, listTotal: round(r * IMPL), reseller: round(r * IMPL), service: true });
    }
  }
  if (sel.xdr && pricelist) {
    const xList = pricelist.xdr.listPerUser * sel.users;
    const xRes = round(xList * (1 - eff));
    items.push({ key: "xdr", label: `${pricelist.xdr.sku} · ${pricelist.xdr.name}`, meta: `${sel.users} users × $${pricelist.xdr.listPerUser}/yr`, qty: sel.users, listTotal: xList, reseller: xRes, service: false });
    if (sel.xdrImpl) items.push({ key: "xdrimpl", label: "Implementation — XDR", meta: `${pct(IMPL)} of XDR`, qty: 1, listTotal: round(xRes * IMPL), reseller: round(xRes * IMPL), service: true });
  }
  const subtotal = items.reduce((s, i) => s + i.reseller, 0);
  if (sel.managed && subtotal > 0) {
    const v = round(subtotal * MANAGED);
    items.push({ key: "managed", label: "Managed Service", meta: `${pct(MANAGED)} of subtotal`, qty: 1, listTotal: v, reseller: v, service: true });
  }
  const resellerTotal = round(items.reduce((s, i) => s + i.reseller, 0));
  const customerTotal = round(resellerTotal * (1 + sel.markup / 100));
  return {
    items, discount: eff, markup: sel.markup,
    resellerTotal, customerTotal, margin: round(customerTotal - resellerTotal),
    currency: pricelist?.currency || "USD",
  };
}
