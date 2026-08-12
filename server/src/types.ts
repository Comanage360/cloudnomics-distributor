export type PriceUnit = "one_time" | "annual" | "on_request";

export interface Firewall {
  sku: string;
  name: string;
  maxUsers: number;
  list: number | null; // null for on-request products (CN-Series)
  series: string; // "PA-Series" | "VM-Series" | "CN-Series"
  unit: PriceUnit;
}

export interface Xdr {
  sku: string;
  name: string;
  listPerUser: number;
}

/** A non-firewall SKU from the PANW global list (MSSP subscriptions today).
 *  Keyed by part number: several share a `model`, so it is the only safe id. */
export interface CatalogItem {
  partNumber: string;
  name: string;
  model: string;
  category: string;          // Subscription | Support | ...
  description: string;
  list: number | null;       // null when quoted per PANW
  unit: PriceUnit;
  discountCategory: string;  // A | B | C | D | ... — selects the reseller discount
  tag: string;               // catalog grouping, e.g. 'mssp'
  updatedAt: string | null;  // last import — tells an admin how current this is
}

export interface Pricelist {
  currency: string;
  firewalls: Firewall[];
  xdr: Xdr;
  catalog: CatalogItem[];
}

export interface Rates {
  discount: number;          // base reseller discount (0.30)
  competitiveBonus: number;  // extra discount on a competitive upgrade (0.10)
  implRate: number;          // implementation = implRate × product
  managedRate: number;       // managed = managedRate × subtotal
  markupDefault: number;     // default customer markup % (15)
  markupMin: number;         // markup slider min %
  markupMax: number;         // markup slider max %
  costLimitMonthly: number;  // default AI spend cap (USD) per rolling 30 days; 0 = unlimited
  // Reseller discount per PANW discount category (A=Hardware, B=Subscriptions,
  // C=Frontline Support, D=Backline Support, ...). A category with no entry
  // falls back to `discount`, so everything starts at the standard 30% until an
  // admin sets the real per-category rates.
  catalogDiscounts: Record<string, number>;
}

/** Per-reseller AI spend cap in USD. null = inherit the global default; 0 = unlimited. */
export interface ResellerLimits {
  monthly: number | null;
}

export interface LimitRequest {
  id: number;
  reseller_email: string;
  period: "monthly" | null;
  used: string | null;        // USD
  limit_value: string | null; // USD
  reason: string | null;
  status: "pending" | "approved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
}

/** A catalog SKU added to a quote, with how many of it. */
export interface QuoteCatalogLine {
  partNumber: string;
  qty: number;
}

export interface QuoteSelection {
  sku: string;
  users: number;
  fwImpl?: boolean;
  xdr?: boolean;
  xdrImpl?: boolean;
  managed?: boolean;
  markup?: number;
  competitiveModel?: string; // model being migrated from — triggers +10% partner discount
  catalogItems?: QuoteCatalogLine[]; // MSSP / global-list SKUs on this quote
}

export interface LineItem {
  key: string;
  label: string;
  meta: string;
  qty: number;
  listTotal: number;
  reseller: number;
  service: boolean;
  /** No list price — quote it with the vendor. Rendered as "On request"
   *  rather than a zero amount, which would read as free on a customer PDF. */
  onRequest?: boolean;
}

export interface QuoteTotals {
  items: LineItem[];
  discount: number;
  markup: number;
  resellerTotal: number;
  customerTotal: number;
  margin: number;
  currency: string;
}

export interface UsageInfo {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface Recommendation {
  sku: string;
  users: number;
  message: string;
  series?: string;
  unit?: PriceUnit;
  source: "claude" | "fallback";
}

export interface AuthUser {
  email: string;
  company: string;
  role?: "admin" | "reseller";
}
