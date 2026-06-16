import type { LineItem, Pricelist, QuoteTotals } from "./types";

// Mirror of the server pricing rules for instant, live preview as the reseller
// builds the quote. The server recomputes authoritatively on finalize.
const DISCOUNT = 0.3;
const COMPETITIVE = 0.1; // extra partner discount for a competitive upgrade
const IMPL = 0.15;
const MANAGED = 0.15;

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

export function computeTotals(sel: Selection, pricelist: Pricelist | null): QuoteTotals {
  const items: LineItem[] = [];
  const eff = Math.min(0.95, DISCOUNT + (sel.competitiveModel ? COMPETITIVE : 0));
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
