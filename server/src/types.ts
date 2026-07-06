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

export interface Pricelist {
  currency: string;
  firewalls: Firewall[];
  xdr: Xdr;
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

export interface QuoteSelection {
  sku: string;
  users: number;
  fwImpl?: boolean;
  xdr?: boolean;
  xdrImpl?: boolean;
  managed?: boolean;
  markup?: number;
  competitiveModel?: string; // model being migrated from — triggers +10% partner discount
}

export interface LineItem {
  key: string;
  label: string;
  meta: string;
  qty: number;
  listTotal: number;
  reseller: number;
  service: boolean;
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
